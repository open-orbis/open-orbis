"""LaTeX CV compilation service.

Provides three public async helpers:

- render_tex_with_jinja  – Jinja2 rendering with LaTeX-safe escaping
- download_bundle_to_dir – download a GCS prefix into a local directory
- compile_tex            – run Tectonic to produce PDF bytes
"""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

from jinja2 import Environment

from app.config import settings

# ---------------------------------------------------------------------------
# Jinja2 environment — custom delimiters avoid clashes with LaTeX braces
# ---------------------------------------------------------------------------

_jinja_env = Environment(
    variable_start_string="<<",
    variable_end_string=">>",
    block_start_string="<%",
    block_end_string="%>",
    comment_start_string="<#",
    comment_end_string="#>",
    autoescape=False,
)

# ---------------------------------------------------------------------------
# LaTeX escaping
# ---------------------------------------------------------------------------

# Characters to escape in order. Backslash must come first so we don't
# double-escape the backslashes we introduce for the other characters.
# The replacements for ~ and ^ contain {} which would be re-escaped if we
# used a simple sequential replace; we therefore use a placeholder strategy:
# replace each source character with a unique placeholder, then swap all
# placeholders for their final LaTeX forms in one final pass.
_LATEX_ESCAPE_MAP: list[tuple[str, str, str]] = [
    # (source_char, placeholder, latex_output)
    ("\\", "\x00BS\x00", r"\textbackslash{}"),
    ("&", "\x00AMP\x00", r"\&"),
    ("%", "\x00PCT\x00", r"\%"),
    ("$", "\x00DOL\x00", r"\$"),
    ("#", "\x00HSH\x00", r"\#"),
    ("_", "\x00UND\x00", r"\_"),
    ("{", "\x00LBR\x00", r"\{"),
    ("}", "\x00RBR\x00", r"\}"),
    ("~", "\x00TLD\x00", r"\textasciitilde{}"),
    ("^", "\x00CAR\x00", r"\textasciicircum{}"),
]


def _escape_latex(value: object) -> object:
    """Escape LaTeX special characters in *string* values; pass others through."""
    if not isinstance(value, str):
        return value
    # Pass 1: replace each source character with a unique placeholder
    for char, placeholder, _ in _LATEX_ESCAPE_MAP:
        value = value.replace(char, placeholder)
    # Pass 2: swap placeholders for final LaTeX sequences
    for _, placeholder, latex in _LATEX_ESCAPE_MAP:
        value = value.replace(placeholder, latex)
    return value


def _escape_dict(d: dict) -> dict:
    """Return a shallow copy of *d* with all string values LaTeX-escaped."""
    return {k: _escape_latex(v) for k, v in d.items()}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def render_tex_with_jinja(
    tex_template: str,
    person: dict,
    nodes: list[dict],
) -> str:
    """Render *tex_template* with Jinja2, auto-escaping LaTeX special chars.

    Args:
        tex_template: Raw Jinja2 template string (uses << >>, <% %>, <# #>
                      delimiters).
        person: Flat dict of person-level fields (name, headline, email, …).
        nodes: List of node dicts, each with a ``_type`` key plus type-specific
               fields.

    Returns:
        Rendered LaTeX string ready for compilation.
    """
    escaped_person = _escape_dict(person)
    escaped_nodes = [_escape_dict(node) for node in nodes]

    template = _jinja_env.from_string(tex_template)
    return template.render(person=escaped_person, nodes=escaped_nodes)


def download_bundle_to_dir(
    bucket_name: str,
    prefix: str,
    dest_dir: Path,
) -> None:
    """Download all objects under *prefix* in *bucket_name* to *dest_dir*.

    This is a **synchronous** helper — call it inside ``asyncio.to_thread()``
    from async code.

    Args:
        bucket_name: GCS bucket name.
        prefix: Object prefix (e.g. ``"templates/modern/"``).
        dest_dir: Local directory to write files into (created if absent).
    """
    from google.cloud import storage  # type: ignore[import-untyped]

    dest_dir.mkdir(parents=True, exist_ok=True)
    client = storage.Client()
    blobs = client.list_blobs(bucket_name, prefix=prefix)
    for blob in blobs:
        # Derive a relative filename by stripping the prefix
        rel = blob.name[len(prefix) :].lstrip("/")
        if not rel:
            continue  # skip the prefix "directory" object itself
        target = dest_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(target))


async def compile_tex(
    work_dir: Path,
    tex_filename: str,
    engine: str = "xelatex",
) -> bytes:
    """Compile *tex_filename* inside *work_dir* using Tectonic.

    Args:
        work_dir: Directory containing the .tex file and any assets.
        tex_filename: Basename of the .tex file (e.g. ``"cv.tex"``).
        engine: TeX engine to pass to Tectonic (default ``"xelatex"``).

    Returns:
        PDF file contents as bytes.

    Raises:
        RuntimeError: If Tectonic exits with a non-zero code or times out.
    """
    tex_path = work_dir / tex_filename

    def _run() -> bytes:
        import subprocess

        result = subprocess.run(
            ["tectonic", str(tex_path)],
            cwd=str(work_dir),
            capture_output=True,
            text=True,
            timeout=settings.tectonic_timeout_seconds,
        )
        if result.returncode != 0:
            output = (result.stdout + "\n" + result.stderr).strip()
            # Keep only the last 2000 chars to avoid huge error messages
            raise RuntimeError(
                f"Tectonic failed (exit {result.returncode}) "
                f"compiling {tex_filename}:\n{output[-2000:]}"
            )
        pdf_path = tex_path.with_suffix(".pdf")
        return pdf_path.read_bytes()

    try:
        return await asyncio.to_thread(_run)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"Tectonic timed out after {settings.tectonic_timeout_seconds}s "
            f"compiling {tex_filename}"
        ) from exc

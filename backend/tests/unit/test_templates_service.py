"""Unit tests for app.cv.templates.service."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.cv.templates.service import (
    compile_tex,
    download_bundle_to_dir,
    render_tex_with_jinja,
)

# ---------------------------------------------------------------------------
# render_tex_with_jinja
# ---------------------------------------------------------------------------


class TestRenderTexWithJinja:
    """Jinja2 rendering with LaTeX escaping."""

    def test_renders_person_variables(self):
        template = r"Name: << person.name >>"
        result = render_tex_with_jinja(template, {"name": "Alice"}, [])
        assert result == "Name: Alice"

    def test_renders_person_headline(self):
        template = r"<< person.headline >>"
        result = render_tex_with_jinja(template, {"headline": "Engineer"}, [])
        assert result == "Engineer"

    def test_renders_node_loop_with_type_filter(self):
        template = (
            "<% for node in nodes if node._type == 'Skill' %>"
            "<< node.name >>"
            "<% endfor %>"
        )
        nodes = [
            {"_type": "Skill", "name": "Python"},
            {"_type": "WorkExperience", "name": "ACME"},
            {"_type": "Skill", "name": "Docker"},
        ]
        result = render_tex_with_jinja(template, {}, nodes)
        assert "Python" in result
        assert "Docker" in result
        assert "ACME" not in result

    def test_jinja_default_filter(self):
        template = r"<< person.missing | default('N/A') >>"
        result = render_tex_with_jinja(template, {}, [])
        assert result == "N/A"

    def test_latex_ampersand_escaped(self):
        template = r"<< person.name >>"
        result = render_tex_with_jinja(template, {"name": "Foo & Bar"}, [])
        assert r"\&" in result
        assert "&" not in result.replace(r"\&", "")

    def test_latex_percent_escaped(self):
        template = r"<< person.summary >>"
        result = render_tex_with_jinja(template, {"summary": "50% done"}, [])
        assert r"\%" in result

    def test_latex_dollar_escaped(self):
        template = r"<< person.summary >>"
        result = render_tex_with_jinja(template, {"summary": "$100k salary"}, [])
        assert r"\$" in result

    def test_latex_hash_escaped(self):
        template = r"<< person.summary >>"
        result = render_tex_with_jinja(template, {"summary": "Issue #42"}, [])
        assert r"\#" in result

    def test_latex_underscore_escaped(self):
        template = r"<< person.name >>"
        result = render_tex_with_jinja(template, {"name": "snake_case"}, [])
        assert r"\_" in result

    def test_latex_braces_escaped(self):
        template = r"<< person.name >>"
        result = render_tex_with_jinja(template, {"name": "{hello}"}, [])
        assert r"\{" in result
        assert r"\}" in result

    def test_latex_tilde_escaped(self):
        template = r"<< person.name >>"
        result = render_tex_with_jinja(template, {"name": "a~b"}, [])
        assert r"\textasciitilde{}" in result

    def test_latex_caret_escaped(self):
        template = r"<< person.name >>"
        result = render_tex_with_jinja(template, {"name": "x^2"}, [])
        assert r"\textasciicircum{}" in result

    def test_latex_backslash_escaped(self):
        template = r"<< person.name >>"
        result = render_tex_with_jinja(template, {"name": r"a\b"}, [])
        assert r"\textbackslash{}" in result

    def test_backslash_not_double_escaped(self):
        """Ensure we don't turn \\textbackslash{} into \\\\textbackslash{}."""
        template = r"<< person.name >>"
        result = render_tex_with_jinja(template, {"name": "\\"}, [])
        # Should contain exactly one \textbackslash{} without further escaping
        assert result.count(r"\textbackslash{}") == 1

    def test_non_string_node_fields_pass_through(self):
        """Numeric / None values should not be altered by escape logic."""
        template = "<% for node in nodes %><< node.year >><% endfor %>"
        nodes = [{"_type": "WorkExperience", "year": 2024}]
        result = render_tex_with_jinja(template, {}, nodes)
        assert "2024" in result

    def test_jinja_comment_delimiter(self):
        template = "<# This is a comment #>hello"
        result = render_tex_with_jinja(template, {}, [])
        assert result == "hello"

    def test_block_delimiter_if(self):
        template = "<% if person.name %>yes<% endif %>"
        result = render_tex_with_jinja(template, {"name": "Alice"}, [])
        assert result == "yes"


# ---------------------------------------------------------------------------
# download_bundle_to_dir
# ---------------------------------------------------------------------------


class TestDownloadBundleToDir:
    """GCS download helper."""

    def test_calls_gcs_and_downloads_blobs(self, tmp_path):
        blob1 = MagicMock()
        blob1.name = "templates/modern/cv.tex"
        blob2 = MagicMock()
        blob2.name = "templates/modern/logo.png"

        mock_client = MagicMock()
        mock_client.bucket.return_value = MagicMock()
        mock_client.list_blobs.return_value = [blob1, blob2]

        with patch(
            "google.cloud.storage.Client",
            return_value=mock_client,
        ):
            download_bundle_to_dir(
                bucket_name="my-bucket",
                prefix="templates/modern/",
                dest_dir=tmp_path,
            )

        mock_client.list_blobs.assert_called_once_with(
            "my-bucket", prefix="templates/modern/"
        )
        blob1.download_to_filename.assert_called_once_with(str(tmp_path / "cv.tex"))
        blob2.download_to_filename.assert_called_once_with(str(tmp_path / "logo.png"))

    def test_creates_dest_dir_if_absent(self, tmp_path):
        dest = tmp_path / "new_dir"

        mock_client = MagicMock()
        mock_client.list_blobs.return_value = []

        with patch(
            "google.cloud.storage.Client",
            return_value=mock_client,
        ):
            download_bundle_to_dir("bucket", "prefix/", dest)

        assert dest.is_dir()

    def test_skips_prefix_directory_object(self, tmp_path):
        """Blob whose name equals the prefix (no rel path) must be skipped."""
        blob = MagicMock()
        blob.name = "templates/modern/"  # same as prefix → rel == ""

        mock_client = MagicMock()
        mock_client.list_blobs.return_value = [blob]

        with patch(
            "google.cloud.storage.Client",
            return_value=mock_client,
        ):
            download_bundle_to_dir("bucket", "templates/modern/", tmp_path)

        blob.download_to_filename.assert_not_called()


# ---------------------------------------------------------------------------
# compile_tex
# ---------------------------------------------------------------------------


class TestCompileTex:
    """Tectonic subprocess compilation."""

    @pytest.mark.asyncio
    async def test_returns_pdf_bytes_on_success(self, tmp_path):
        fake_pdf = b"%PDF-1.4 fake"
        tex_file = tmp_path / "cv.tex"
        tex_file.write_text(r"\documentclass{article}\begin{document}Hi\end{document}")

        pdf_file = tmp_path / "cv.pdf"
        pdf_file.write_bytes(fake_pdf)

        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"", b""))

        with patch(
            "asyncio.create_subprocess_exec",
            return_value=mock_proc,
        ):
            result = await compile_tex(tmp_path, "cv.tex")

        assert result == fake_pdf

    @pytest.mark.asyncio
    async def test_raises_runtime_error_on_nonzero_exit(self, tmp_path):
        tex_file = tmp_path / "cv.tex"
        tex_file.write_text("")

        mock_proc = AsyncMock()
        mock_proc.returncode = 1
        mock_proc.communicate = AsyncMock(return_value=(b"", b"some latex error"))

        with (
            patch("asyncio.create_subprocess_exec", return_value=mock_proc),
            pytest.raises(RuntimeError, match="Tectonic failed"),
        ):
            await compile_tex(tmp_path, "cv.tex")

    @pytest.mark.asyncio
    async def test_raises_runtime_error_on_timeout(self, tmp_path):
        tex_file = tmp_path / "cv.tex"
        tex_file.write_text("")

        mock_proc = AsyncMock()
        mock_proc.returncode = None
        mock_proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError)
        mock_proc.kill = MagicMock()

        with (
            patch("asyncio.create_subprocess_exec", return_value=mock_proc),
            patch("asyncio.wait_for", side_effect=asyncio.TimeoutError),
            pytest.raises(RuntimeError, match="timed out"),
        ):
            await compile_tex(tmp_path, "cv.tex")

    @pytest.mark.asyncio
    async def test_passes_engine_argument(self, tmp_path):
        fake_pdf = b"%PDF-1.4"
        tex_file = tmp_path / "cv.tex"
        tex_file.write_text("")
        (tmp_path / "cv.pdf").write_bytes(fake_pdf)

        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"", b""))

        with patch(
            "asyncio.create_subprocess_exec", return_value=mock_proc
        ) as mock_exec:
            await compile_tex(tmp_path, "cv.tex", engine="pdflatex")

        args = mock_exec.call_args[0]
        assert "pdflatex" in args

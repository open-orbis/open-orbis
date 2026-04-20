"""LaTeX template security validation.

Blocks dangerous TeX primitives before handing content to the compiler.
Tectonic disables shell-escape by default, but we add defense-in-depth so
that no potentially harmful command ever reaches the compilation sandbox.
"""

import re
from dataclasses import dataclass


@dataclass
class _Rule:
    pattern: re.Pattern[str]
    message: str


# Each rule maps a compiled regex to a human-readable error message.
_RULES: list[_Rule] = [
    _Rule(
        pattern=re.compile(r"\\write18\b", re.IGNORECASE),
        message="Blocked pattern: \\write18 (shell escape) is not allowed.",
    ),
    _Rule(
        pattern=re.compile(r"\\immediate\s*\\write\b", re.IGNORECASE),
        message=(
            "Blocked pattern: \\immediate\\write (deferred shell escape) is not allowed."
        ),
    ),
    _Rule(
        pattern=re.compile(r"\\openin(?:\b|(?=\d))", re.IGNORECASE),
        message="Blocked pattern: \\openin (file read) is not allowed.",
    ),
    _Rule(
        pattern=re.compile(r"\\openout(?:\b|(?=\d))", re.IGNORECASE),
        message="Blocked pattern: \\openout (file write) is not allowed.",
    ),
    _Rule(
        # Match \input{ or \include{ followed immediately by /
        pattern=re.compile(r"\\(?:input|include)\s*\{/", re.IGNORECASE),
        message=(
            "Blocked pattern: \\input or \\include with an absolute path is not allowed."
        ),
    ),
    _Rule(
        pattern=re.compile(r"\\catcode\b", re.IGNORECASE),
        message="Blocked pattern: \\catcode (category code manipulation) is not allowed.",
    ),
]


def validate_tex_content(content: str) -> list[str]:
    """Validate a LaTeX string against the security rule set.

    Args:
        content: Raw .tex source to inspect.

    Returns:
        A list of error messages for every rule that matched.
        An empty list means the content is considered safe.
    """
    errors: list[str] = []
    for rule in _RULES:
        if rule.pattern.search(content):
            errors.append(rule.message)
    return errors

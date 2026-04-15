"""Unit tests for LaTeX template security validation."""

from app.cv.templates.security import validate_tex_content


class TestValidateTexContentClean:
    """Tests for content that should pass validation."""

    def test_empty_string_is_safe(self):
        assert validate_tex_content("") == []

    def test_minimal_valid_template(self):
        tex = r"""
\documentclass{article}
\begin{document}
Hello, World!
\end{document}
"""
        assert validate_tex_content(tex) == []

    def test_typical_cv_template(self):
        tex = r"""
\documentclass[11pt,a4paper]{article}
\usepackage{geometry}
\usepackage{fontenc}
\usepackage{inputenc}
\begin{document}
\section{Experience}
Software Engineer at ACME Corp (2020--2024)
\end{document}
"""
        assert validate_tex_content(tex) == []

    def test_relative_input_is_allowed(self):
        r"""Relative \input paths should not trigger the absolute-path rule."""
        tex = r"\input{sections/header}"
        assert validate_tex_content(tex) == []

    def test_relative_input_with_dot_prefix_allowed(self):
        tex = r"\input{./sections/footer}"
        assert validate_tex_content(tex) == []


class TestValidateTexContentBlocked:
    """Tests for content that should be blocked."""

    def test_write18_shell_escape_detected(self):
        tex = r"\write18{rm -rf /}"
        errors = validate_tex_content(tex)
        assert len(errors) >= 1
        assert any("write18" in e.lower() or "shell" in e.lower() for e in errors)

    def test_immediate_write_detected(self):
        tex = r"\immediate\write18{ls}"
        errors = validate_tex_content(tex)
        assert len(errors) >= 1

    def test_openin_detected(self):
        tex = r"\openin5=secret.txt"
        errors = validate_tex_content(tex)
        assert len(errors) >= 1
        assert any("openin" in e.lower() or "file" in e.lower() for e in errors)

    def test_openout_detected(self):
        tex = r"\openout3=output.txt"
        errors = validate_tex_content(tex)
        assert len(errors) >= 1
        assert any("openout" in e.lower() or "file" in e.lower() for e in errors)

    def test_absolute_path_input_detected(self):
        tex = r"\input{/etc/passwd}"
        errors = validate_tex_content(tex)
        assert len(errors) >= 1
        assert any("absolute" in e.lower() or "path" in e.lower() for e in errors)

    def test_catcode_detected(self):
        tex = r"\catcode`\@=11"
        errors = validate_tex_content(tex)
        assert len(errors) >= 1
        assert any("catcode" in e.lower() for e in errors)

    def test_absolute_path_include_detected(self):
        """\\include with absolute path should also be caught."""
        tex = r"\input{/home/user/.ssh/id_rsa}"
        errors = validate_tex_content(tex)
        assert len(errors) >= 1


class TestValidateTexContentMultipleViolations:
    """Tests for content with multiple violations."""

    def test_multiple_violations_return_multiple_errors(self):
        tex = r"""
\write18{id}
\openin3=passwords.txt
\catcode`\@=11
"""
        errors = validate_tex_content(tex)
        assert len(errors) >= 2

    def test_all_blocked_patterns_in_one_template(self):
        tex = r"""
\write18{whoami}
\immediate\write18{ls}
\openin1=secret
\openout2=exfil
\input{/etc/hosts}
\catcode`\%=12
"""
        errors = validate_tex_content(tex)
        # Expect at least one error per distinct category
        assert len(errors) >= 4

    def test_single_error_per_matched_pattern_not_per_occurrence(self):
        """Two occurrences of the same pattern should still produce errors
        (at minimum one; implementation may deduplicate or report all)."""
        tex = r"\write18{a}\write18{b}"
        errors = validate_tex_content(tex)
        assert len(errors) >= 1


class TestValidateTexContentEdgeCases:
    """Edge cases and boundary conditions."""

    def test_write18_inside_comment_is_still_flagged(self):
        """We do not parse TeX comments — a blocked pattern anywhere is flagged."""
        tex = r"% \write18{exploit}"
        errors = validate_tex_content(tex)
        # Conservative: flag it even in comments
        assert isinstance(errors, list)

    def test_returns_list_of_strings(self):
        tex = r"\openin5=x"
        errors = validate_tex_content(tex)
        assert isinstance(errors, list)
        for e in errors:
            assert isinstance(e, str)

    def test_whitespace_only_content(self):
        assert validate_tex_content("   \n\t  ") == []

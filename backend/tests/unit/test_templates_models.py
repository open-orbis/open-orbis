from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.cv.templates.models import CompileRequest, TemplateDetail, TemplateListItem


class TestTemplateListItem:
    def test_constructs_with_all_fields(self):
        item = TemplateListItem(
            id="tmpl-001",
            name="Classic CV",
            description="A clean classic template",
            engine="pdflatex",
            thumbnail_url="https://example.com/thumb.png",
            is_preloaded=True,
        )
        assert item.id == "tmpl-001"
        assert item.name == "Classic CV"
        assert item.description == "A clean classic template"
        assert item.engine == "pdflatex"
        assert item.thumbnail_url == "https://example.com/thumb.png"
        assert item.is_preloaded is True

    def test_optional_fields_default_to_none(self):
        item = TemplateListItem(
            id="tmpl-002",
            name="Minimal CV",
            engine="xelatex",
            is_preloaded=False,
        )
        assert item.description is None
        assert item.thumbnail_url is None

    def test_requires_id(self):
        with pytest.raises(ValidationError):
            TemplateListItem(name="No ID", engine="pdflatex", is_preloaded=False)

    def test_requires_name(self):
        with pytest.raises(ValidationError):
            TemplateListItem(id="tmpl-003", engine="pdflatex", is_preloaded=False)

    def test_requires_engine(self):
        with pytest.raises(ValidationError):
            TemplateListItem(id="tmpl-004", name="No Engine", is_preloaded=False)

    def test_requires_is_preloaded(self):
        with pytest.raises(ValidationError):
            TemplateListItem(id="tmpl-005", name="No Flag", engine="pdflatex")


class TestTemplateDetail:
    def test_constructs_with_all_fields(self):
        detail = TemplateDetail(
            id="tmpl-001",
            name="Classic CV",
            description="A clean classic template",
            engine="pdflatex",
            license="MIT",
            thumbnail_url="https://example.com/thumb.png",
            is_preloaded=True,
            tex_content="\\documentclass{article}\\begin{document}Hello\\end{document}",
        )
        assert detail.id == "tmpl-001"
        assert detail.tex_content == (
            "\\documentclass{article}\\begin{document}Hello\\end{document}"
        )
        assert detail.license == "MIT"

    def test_includes_tex_content(self):
        detail = TemplateDetail(
            id="tmpl-002",
            name="Minimal",
            engine="xelatex",
            is_preloaded=False,
            tex_content="\\documentclass{article}",
        )
        assert detail.tex_content == "\\documentclass{article}"

    def test_optional_fields_default_to_none(self):
        detail = TemplateDetail(
            id="tmpl-003",
            name="No Optionals",
            engine="lualatex",
            is_preloaded=True,
            tex_content="content",
        )
        assert detail.description is None
        assert detail.license is None
        assert detail.thumbnail_url is None

    def test_requires_tex_content(self):
        with pytest.raises(ValidationError):
            TemplateDetail(
                id="tmpl-004",
                name="Missing tex",
                engine="pdflatex",
                is_preloaded=False,
            )


class TestCompileRequest:
    def test_requires_template_id(self):
        with pytest.raises(ValidationError):
            CompileRequest()

    def test_constructs_with_template_id_only(self):
        req = CompileRequest(template_id="tmpl-001")
        assert req.template_id == "tmpl-001"
        assert req.tex_content is None

    def test_accepts_optional_tex_content(self):
        req = CompileRequest(
            template_id="tmpl-001",
            tex_content="\\documentclass{article}",
        )
        assert req.template_id == "tmpl-001"
        assert req.tex_content == "\\documentclass{article}"

    def test_tex_content_defaults_to_none(self):
        req = CompileRequest(template_id="tmpl-002")
        assert req.tex_content is None

    def test_without_template_id_raises_validation_error(self):
        with pytest.raises(ValidationError) as exc_info:
            CompileRequest(tex_content="some content")
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("template_id",) for e in errors)

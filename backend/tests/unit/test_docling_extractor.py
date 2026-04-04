"""Unit tests for app.cv.docling_extractor module."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.cv.docling_extractor import (
    _docling_sync,
    _extract_with_pymupdf,
    extract_text,
)

FAKE_PDF_BYTES = b"%PDF-1.4 fake content"


# ── extract_text (async entry point) ──


class TestExtractText:
    @pytest.mark.asyncio
    async def test_returns_docling_text_when_successful(self):
        with patch(
            "app.cv.docling_extractor._extract_with_docling",
            return_value="# John Smith\n\n## Experience\n...",
        ):
            result = await extract_text(FAKE_PDF_BYTES)
            assert "John Smith" in result

    @pytest.mark.asyncio
    async def test_falls_back_to_pymupdf_when_docling_fails(self):
        with (
            patch(
                "app.cv.docling_extractor._extract_with_docling",
                side_effect=RuntimeError("Docling crash"),
            ),
            patch(
                "app.cv.docling_extractor._extract_with_pymupdf",
                return_value="PyMuPDF extracted text",
            ),
        ):
            result = await extract_text(FAKE_PDF_BYTES)
            assert result == "PyMuPDF extracted text"

    @pytest.mark.asyncio
    async def test_raises_when_both_fail(self):
        with (
            patch(
                "app.cv.docling_extractor._extract_with_docling",
                side_effect=RuntimeError("Docling crash"),
            ),
            patch(
                "app.cv.docling_extractor._extract_with_pymupdf",
                return_value="",
            ),
            pytest.raises(RuntimeError, match="Both Docling and PyMuPDF failed"),
        ):
            await extract_text(FAKE_PDF_BYTES)

    @pytest.mark.asyncio
    async def test_raises_when_docling_returns_empty_and_pymupdf_returns_empty(self):
        with (
            patch(
                "app.cv.docling_extractor._extract_with_docling",
                return_value="   ",
            ),
            patch(
                "app.cv.docling_extractor._extract_with_pymupdf",
                return_value="",
            ),
            pytest.raises(RuntimeError, match="Both Docling and PyMuPDF failed"),
        ):
            await extract_text(FAKE_PDF_BYTES)

    @pytest.mark.asyncio
    async def test_cleans_up_temp_file(self):
        """Verify temp file is deleted after extraction."""
        import tempfile

        created_files: list[str] = []
        original_ntf = tempfile.NamedTemporaryFile

        def tracking_ntf(**kwargs):
            f = original_ntf(**kwargs)
            created_files.append(f.name)
            return f

        with (
            patch("app.cv.docling_extractor.tempfile.NamedTemporaryFile", tracking_ntf),
            patch(
                "app.cv.docling_extractor._extract_with_docling",
                return_value="some text",
            ),
        ):
            await extract_text(FAKE_PDF_BYTES)

        for path in created_files:
            assert not Path(path).exists(), f"Temp file was not cleaned up: {path}"


# ── _docling_sync ──


class TestDoclingSyncUnit:
    def test_calls_document_converter(self):
        mock_doc = MagicMock()
        mock_doc.export_to_markdown.return_value = "# CV Content\nSome text"

        mock_result = MagicMock()
        mock_result.document = mock_doc

        mock_converter = MagicMock()
        mock_converter.convert.return_value = mock_result

        mock_module = MagicMock()
        mock_module.DocumentConverter.return_value = mock_converter

        with patch.dict("sys.modules", {"docling.document_converter": mock_module}):
            result = _docling_sync("/tmp/fake.pdf")

        assert result == "# CV Content\nSome text"

    def test_raises_on_empty_output(self):
        mock_doc = MagicMock()
        mock_doc.export_to_markdown.return_value = ""

        mock_result = MagicMock()
        mock_result.document = mock_doc

        mock_converter = MagicMock()
        mock_converter.convert.return_value = mock_result

        mock_module = MagicMock()
        mock_module.DocumentConverter.return_value = mock_converter

        with (
            patch.dict("sys.modules", {"docling.document_converter": mock_module}),
            pytest.raises(RuntimeError, match="Docling returned empty text"),
        ):
            _docling_sync("/tmp/fake.pdf")


# ── _extract_with_pymupdf ──


class TestExtractWithPyMuPDF:
    def test_extracts_text_from_pages(self):
        mock_page1 = MagicMock()
        mock_page1.get_text.return_value = "Page 1 text. "

        mock_page2 = MagicMock()
        mock_page2.get_text.return_value = "Page 2 text."

        mock_doc = MagicMock()
        mock_doc.__iter__ = lambda _self: iter([mock_page1, mock_page2])

        with patch.dict("sys.modules", {"fitz": MagicMock()}):
            import fitz

            fitz.open = MagicMock(return_value=mock_doc)
            with patch("app.cv.docling_extractor.fitz", fitz, create=True):
                result = _extract_with_pymupdf("/tmp/fake.pdf")

        assert result == "Page 1 text. Page 2 text."
        mock_doc.close.assert_called_once()

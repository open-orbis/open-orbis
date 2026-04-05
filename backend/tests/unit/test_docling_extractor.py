"""Unit tests for app.cv.docling_extractor module (PyMuPDF-based)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.cv.docling_extractor import extract_text

FAKE_PDF_BYTES = b"%PDF-1.4 fake content"


class TestExtractText:
    @pytest.mark.asyncio
    async def test_returns_extracted_text(self):
        mock_page = MagicMock()
        mock_page.get_text.return_value = "Eugenio Paluello\nSenior Engineer\n"
        mock_doc = MagicMock()
        mock_doc.__iter__ = lambda _self: iter([mock_page])

        with patch("app.cv.docling_extractor.fitz") as mock_fitz:
            mock_fitz.open.return_value = mock_doc
            result = await extract_text(FAKE_PDF_BYTES)

        assert "Eugenio Paluello" in result

    @pytest.mark.asyncio
    async def test_raises_on_empty_output(self):
        mock_page = MagicMock()
        mock_page.get_text.return_value = "   "
        mock_doc = MagicMock()
        mock_doc.__iter__ = lambda _self: iter([mock_page])

        with (
            patch("app.cv.docling_extractor.fitz") as mock_fitz,
            pytest.raises(RuntimeError, match="PyMuPDF failed"),
        ):
            mock_fitz.open.return_value = mock_doc
            await extract_text(FAKE_PDF_BYTES)

    @pytest.mark.asyncio
    async def test_cleans_up_temp_file(self):
        import tempfile

        created_files: list[str] = []
        original_ntf = tempfile.NamedTemporaryFile

        def tracking_ntf(**kwargs):
            f = original_ntf(**kwargs)
            created_files.append(f.name)
            return f

        mock_page = MagicMock()
        mock_page.get_text.return_value = "some text"
        mock_doc = MagicMock()
        mock_doc.__iter__ = lambda _self: iter([mock_page])

        with (
            patch("app.cv.docling_extractor.tempfile.NamedTemporaryFile", tracking_ntf),
            patch("app.cv.docling_extractor.fitz") as mock_fitz,
        ):
            mock_fitz.open.return_value = mock_doc
            await extract_text(FAKE_PDF_BYTES)

        for path in created_files:
            assert not Path(path).exists(), f"Temp file was not cleaned up: {path}"

    @pytest.mark.asyncio
    async def test_concatenates_multiple_pages(self):
        mock_page1 = MagicMock()
        mock_page1.get_text.return_value = "Page 1. "
        mock_page2 = MagicMock()
        mock_page2.get_text.return_value = "Page 2."
        mock_doc = MagicMock()
        mock_doc.__iter__ = lambda _self: iter([mock_page1, mock_page2])

        with patch("app.cv.docling_extractor.fitz") as mock_fitz:
            mock_fitz.open.return_value = mock_doc
            result = await extract_text(FAKE_PDF_BYTES)

        assert "Page 1." in result
        assert "Page 2." in result

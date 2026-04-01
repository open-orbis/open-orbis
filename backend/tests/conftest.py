"""Shared pytest configuration and fixtures."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
def cv_text() -> str:
    """Load the synthetic Alessandro Berti CV text."""
    return (FIXTURES_DIR / "alessandro_berti_cv.txt").read_text(encoding="utf-8")


@pytest.fixture()
def golden_nodes() -> list[dict]:
    """Load the golden expected nodes for Alessandro Berti."""
    data = json.loads(
        (FIXTURES_DIR / "alessandro_berti_golden.json").read_text(encoding="utf-8")
    )
    return data["nodes"]

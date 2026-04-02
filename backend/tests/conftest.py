"""Shared pytest configuration and fixtures."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# Auto-discover CV fixtures: every *_cv.txt file defines a test case.
CV_NAMES = sorted(p.stem.removesuffix("_cv") for p in FIXTURES_DIR.glob("*_cv.txt"))


@pytest.fixture(params=CV_NAMES)
def cv_fixture(request) -> tuple[str, list[dict], str]:
    """Yield (cv_text, baseline_nodes, cv_name) for each CV fixture.

    In CI ``KG_BASELINE_DIR`` points to a directory of JSON files generated
    from the **main** branch (one per CV).  Locally it falls back to the
    static golden reference so the test can run without extra setup.
    """
    name: str = request.param

    cv_text = (FIXTURES_DIR / f"{name}_cv.txt").read_text(encoding="utf-8")

    baseline_dir = os.environ.get("KG_BASELINE_DIR")
    if baseline_dir:
        path = Path(baseline_dir) / f"{name}_baseline.json"
    else:
        path = FIXTURES_DIR / f"{name}_golden.json"

    if not path.exists():
        pytest.skip(f"No baseline for {name} at {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    return cv_text, data["nodes"], name

"""Per-user CV processing progress tracker."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from enum import Enum


class CVStep(str, Enum):
    READING_PDF = "reading_pdf"
    EXTRACTING_TEXT = "extracting_text"
    CLASSIFYING = "classifying"
    PARSING_RESPONSE = "parsing_response"
    DONE = "done"
    FAILED = "failed"


STEP_PERCENT: dict[CVStep, int] = {
    CVStep.READING_PDF: 5,
    CVStep.EXTRACTING_TEXT: 20,
    CVStep.CLASSIFYING: 35,
    CVStep.PARSING_RESPONSE: 90,
    CVStep.DONE: 100,
    CVStep.FAILED: 0,
}

STEP_MESSAGE: dict[CVStep, str] = {
    CVStep.READING_PDF: "Reading your PDF...",
    CVStep.EXTRACTING_TEXT: "Extracting text...",
    CVStep.CLASSIFYING: "Classifying entries...",
    CVStep.PARSING_RESPONSE: "Building your knowledge graph...",
    CVStep.DONE: "Done!",
    CVStep.FAILED: "Processing failed.",
}


@dataclass
class CVProgress:
    step: CVStep
    percent: int
    message: str
    detail: str = ""
    started_at: float = field(default_factory=time.time)
    text_chars: int = 0  # character count of text being classified


_lock = threading.Lock()
_progress: dict[str, CVProgress] = {}


def set_progress(
    user_id: str,
    step: CVStep,
    detail: str = "",
    text_chars: int = 0,
) -> None:
    with _lock:
        existing = _progress.get(user_id)
        started_at = existing.started_at if existing else time.time()
        chars = text_chars or (existing.text_chars if existing else 0)
        _progress[user_id] = CVProgress(
            step=step,
            percent=STEP_PERCENT[step],
            message=STEP_MESSAGE[step],
            detail=detail,
            started_at=started_at,
            text_chars=chars,
        )


def get_progress(user_id: str) -> CVProgress | None:
    with _lock:
        p = _progress.get(user_id)
        if p is None:
            return None
        # Simulate progress during classification (the long step)
        if p.step == CVStep.CLASSIFYING:
            elapsed = time.time() - p.started_at
            # Estimate expected duration based on text size:
            # ~15s for short CVs (2k chars), ~60s for medium (8k), ~120s for long (15k+)
            # Baseline 15s + ~7ms per character
            chars = max(p.text_chars, 2000)
            estimated_duration = min(15 + chars * 0.007, 180)
            # Progress from 35% to 88% over the estimated duration
            # Uses ease-out so early progress feels faster
            fraction = min(elapsed / estimated_duration, 1.0)
            eased = 1 - (1 - fraction) ** 2  # quadratic ease-out
            simulated = 35 + int(53 * eased)
            # Rotate substep labels based on estimated progress sections
            substeps = [
                "Identifying work experiences...",
                "Extracting education entries...",
                "Recognizing skills and technologies...",
                "Parsing publications and projects...",
                "Detecting certifications and awards...",
                "Mapping skill relationships...",
                "Validating extracted entries...",
            ]
            # Advance substep labels proportionally to progress
            substep_idx = min(int(fraction * len(substeps)), len(substeps) - 1)
            detail = substeps[substep_idx]
            return CVProgress(
                step=p.step,
                percent=simulated,
                message=p.message,
                detail=detail,
                started_at=p.started_at,
            )
        return p


def clear_progress(user_id: str) -> None:
    with _lock:
        _progress.pop(user_id, None)

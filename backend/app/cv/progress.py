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
    CVStep.EXTRACTING_TEXT: 15,
    CVStep.CLASSIFYING: 25,
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


_lock = threading.Lock()
_progress: dict[str, CVProgress] = {}


def set_progress(
    user_id: str,
    step: CVStep,
    detail: str = "",
) -> None:
    with _lock:
        existing = _progress.get(user_id)
        started_at = existing.started_at if existing else time.time()
        _progress[user_id] = CVProgress(
            step=step,
            percent=STEP_PERCENT[step],
            message=STEP_MESSAGE[step],
            detail=detail,
            started_at=started_at,
        )


def get_progress(user_id: str) -> CVProgress | None:
    with _lock:
        p = _progress.get(user_id)
        if p is None:
            return None
        # Simulate progress during classification (the long step)
        if p.step == CVStep.CLASSIFYING:
            elapsed = time.time() - p.started_at
            # Gradually increase from 25% to 85% over ~5 minutes
            fraction = min(elapsed / 300, 0.95)
            simulated = 25 + int(60 * fraction)
            # Rotate through processing descriptions
            substeps = [
                "Identifying work experiences...",
                "Extracting education entries...",
                "Recognizing skills and technologies...",
                "Parsing publications and projects...",
                "Detecting certifications and awards...",
                "Mapping skill relationships...",
                "Validating extracted entries...",
            ]
            detail = substeps[int(elapsed / 12) % len(substeps)]
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

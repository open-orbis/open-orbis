from __future__ import annotations

from pydantic import BaseModel, field_validator

# ISO 639-1 subset covering the languages we actually support.
# Kept deliberately short — expand as real users request new ones.
ALLOWED_LANGUAGES = {
    "en", "it", "es", "fr", "de", "pt", "nl", "pl", "ro", "sv",
    "da", "nb", "fi", "cs", "sk", "hu", "hr", "sl", "bg", "el",
    "tr", "ar", "zh", "ja", "ko", "hi", "ru", "uk", "he", "th",
    "vi", "id", "ms",
}  # fmt: skip


class ExistingSkill(BaseModel):
    uid: str
    name: str


class EnhanceNoteRequest(BaseModel):
    text: str
    target_language: str = "en"
    existing_skills: list[ExistingSkill] = []

    @field_validator("target_language")
    @classmethod
    def _validate_language(cls, v: str) -> str:
        v = v.strip().lower()[:10]
        if v not in ALLOWED_LANGUAGES:
            raise ValueError(
                f"Unsupported language '{v}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_LANGUAGES))}"
            )
        return v


class EnhanceNoteResponse(BaseModel):
    node_type: str
    properties: dict
    suggested_skill_uids: list[str] = []

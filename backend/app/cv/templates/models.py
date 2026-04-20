from __future__ import annotations

from pydantic import BaseModel


class TemplateListItem(BaseModel):
    id: str
    name: str
    description: str | None = None
    engine: str
    thumbnail_url: str | None = None
    is_preloaded: bool


class TemplateDetail(BaseModel):
    id: str
    name: str
    description: str | None = None
    engine: str
    license: str | None = None
    thumbnail_url: str | None = None
    is_preloaded: bool
    tex_content: str


class CompileRequest(BaseModel):
    template_id: str
    tex_content: str | None = None

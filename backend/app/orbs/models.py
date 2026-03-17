from __future__ import annotations

from pydantic import BaseModel


class NodeCreate(BaseModel):
    node_type: str  # education, work_experience, skill, etc.
    properties: dict


class NodeUpdate(BaseModel):
    properties: dict


class PersonUpdate(BaseModel):
    headline: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    twitter_url: str | None = None
    instagram_url: str | None = None
    scholar_url: str | None = None
    website_url: str | None = None
    open_to_work: bool | None = None


class OrbIdUpdate(BaseModel):
    orb_id: str

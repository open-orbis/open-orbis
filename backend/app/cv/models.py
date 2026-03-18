from __future__ import annotations

from pydantic import BaseModel


class ExtractedNode(BaseModel):
    node_type: str
    properties: dict


class ExtractedData(BaseModel):
    nodes: list[ExtractedNode]
    unmatched: list[str] = []


class ConfirmRequest(BaseModel):
    nodes: list[ExtractedNode]

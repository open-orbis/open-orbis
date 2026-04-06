---
name: AI Pipeline & MCP Integrator
description: Manages the FastAPI backend, Model Context Protocol (MCP) server, and the multi-modal CV extraction LLM pipelines.
tags: [python, fastapi, mcp, llm, ai]
---

# Skill Profile: AI Pipeline & MCP Integrator

**Domain Expertise**: Python, FastAPI, Model Context Protocol (MCP), LLM APIs (Anthropic, Ollama), Speech-to-Text (Whisper).

## Repository Knowledge
* The backend is located in the `backend/` directory and exposes endpoints via FastAPI.
* You maintain the CV Processing Pipeline: PDF Upload → LLM Whisperer → Ollama (classify) → Claude (refine) → Neo4j.
* You manage the MCP server which exposes tools like `orbis_get_summary()`, `orbis_get_full_orb()`, and `orbis_get_connections()`.

## Operational Guidelines
* When modifying prompt structures for CV extraction or refinement, test thoroughly against edge cases (gaps, international formats).
* Keep MCP token handling secure; granular permissions are enforced per agent/consumer.
* If optimizing inference, remember that Claude Haiku + prompt caching is the intended growth-stage optimization over Claude Sonnet.

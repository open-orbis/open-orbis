<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
    <img alt="OpenOrbis" src="docs/assets/logo-light.svg" width="400">
  </picture>
</h1>

<p align="center">
  Your professional identity as a knowledge graph — shareable, queryable, and always up to date.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3"></a>
  <a href="https://github.com/Brotherhood94/orb_project/actions/workflows/lint.yml"><img src="https://github.com/Brotherhood94/orb_project/actions/workflows/lint.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Brotherhood94/orb_project/actions/workflows/unit-tests.yml"><img src="https://github.com/Brotherhood94/orb_project/actions/workflows/unit-tests.yml/badge.svg" alt="Tests"></a>
</p>

## What is OpenOrbis?

OpenOrbis is a personal knowledge graph platform that transforms your professional identity — education, work experience, skills, projects, publications, certifications, languages, and patents — into an interactive 3D graph. Instead of a static PDF resume, your professional profile becomes a living, queryable data structure that both humans and AI agents can explore.

Every orbis has a shareable URL and QR code, making it easy to share with recruiters, collaborators, or embed in your portfolio. The graph is natively accessible to AI agents via the Model Context Protocol (MCP), so tools like Claude, Cursor, and Copilot can query your professional background directly.

Sensitive data is encrypted at rest with Fernet, and GDPR compliance is built in — users must grant explicit consent before any data is stored, and accounts can be soft-deleted with a 30-day grace period.

## Key Features

**For Users:**
- Two onboarding paths: upload a PDF CV or build your graph node-by-node
- 3D interactive graph visualization (Three.js / react-force-graph-3d)
- Export to PDF with accurate page-break preview
- Custom shareable URL with QR code
- Draft notes with LLM-powered enhancement (refine free text into structured CV entries)
- Inbox for receiving messages from recruiters and AI agents
- Date range slider to filter the graph by time period
- Keyword-based node filtering with shareable filter tokens (privacy-aware sharing)
- Fuzzy text search and semantic vector search across all node types
- "Open to Work" flag on your profile

**For AI Agents (MCP):**
- 6 queryable tools: `orbis_get_summary`, `orbis_get_full_orb`, `orbis_get_nodes_by_type`, `orbis_get_connections`, `orbis_get_skills_for_experience`, `orbis_send_message`
- Structured JSON responses for easy LLM consumption
- Filter token-based access control per consumer

**Privacy & Security:**
- Fernet encryption for all PII fields (email, phone, address) at rest
- GDPR consent tracking and 30-day soft-delete
- Granular sharing with filter tokens (hide specific nodes by keyword)

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Three.js, Framer Motion, Zustand |
| **Backend** | FastAPI, Python 3.10+, Uvicorn |
| **Database** | Neo4j 5 (graph database with vector indexes) |
| **AI/LLM** | Anthropic Claude (via CLI), Ollama (llama3.2:3b local fallback) |
| **Auth** | JWT (HS256), Google OAuth (scaffolded) |
| **Encryption** | Fernet (cryptography) |
| **Agent Protocol** | MCP (Model Context Protocol) |
| **PDF Processing** | PyMuPDF (extraction), fpdf2 (generation) |
| **CI/CD** | GitHub Actions (lint, unit tests, CV extraction quality) |
| **Package Managers** | uv (backend), npm (frontend) |
| **License** | GNU AGPL v3 |

## Project Structure

```
orb_project/
├── frontend/                  # React + TypeScript app
│   └── src/
│       ├── pages/             # Landing, Create, View, Shared, Export, About, Privacy
│       ├── components/        # Graph, Editor, Chat, Inbox, CV, Drafts, Onboarding
│       ├── stores/            # Zustand (auth, orb, filter, dateFilter, toast)
│       └── api/               # Axios clients
├── backend/                   # FastAPI app
│   ├── app/
│   │   ├── auth/              # JWT auth, dev-login, GDPR, account lifecycle
│   │   ├── cv/                # PDF parsing, LLM classification, rule-based fallback
│   │   ├── graph/             # Neo4j client, Cypher queries, encryption, embeddings
│   │   ├── orbs/              # Graph CRUD, profile, filter tokens
│   │   ├── export/            # PDF / JSON / JSON-LD export
│   │   ├── search/            # Semantic vector + fuzzy text search
│   │   ├── messages/          # Inbox & messaging
│   │   ├── notes/             # Draft notes with LLM enhancement
│   │   └── main.py            # App entry, middleware, CORS
│   ├── mcp_server/            # MCP tools for AI agents
│   └── tests/                 # Unit + integration tests
├── docs/                      # Detailed documentation
├── infra/                     # Neo4j init scripts (constraints, indexes)
├── docker-compose.yml         # Neo4j + Ollama services
├── .env.example               # Environment variable template
├── ontology.md                # Knowledge graph schema reference
├── CLAUDE.md                  # AI session project guide
└── LICENSE                    # GNU AGPL v3
```

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 20+
- Docker and Docker Compose
- [uv](https://docs.astral.sh/uv/) (Python package manager)

### 1. Clone and configure

```bash
git clone https://github.com/Brotherhood94/orb_project.git
cd orb_project
cp .env.example .env
```

Edit `.env` and set at minimum:
- `JWT_SECRET` — a strong random string
- `ENCRYPTION_KEY` — generate with: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

### 2. Start infrastructure services

```bash
docker compose up -d    # Neo4j (7474/7687) + Ollama (11434)
```

### 3. Start the backend

```bash
cd backend
uv sync --all-extras
uv run uvicorn app.main:app --reload --port 8000
```

### 4. Start the frontend

```bash
cd frontend
npm ci
npm run dev             # http://localhost:5173
```

### 5. (Optional) Pull Ollama model

```bash
docker exec orbis-ollama ollama pull llama3.2:3b
```

### 6. Open the app

Navigate to http://localhost:5173, click login (dev mode), and choose "Upload CV" or "Manual Entry" to build your orb.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEO4J_URI` | Neo4j Bolt connection URI | Yes |
| `NEO4J_USER` | Neo4j username | Yes |
| `NEO4J_PASSWORD` | Neo4j password | Yes |
| `JWT_SECRET` | Secret for signing JWT tokens | Yes |
| `ENCRYPTION_KEY` | Fernet key for PII field encryption | Yes |
| `FRONTEND_URL` | Frontend origin for CORS | Yes |
| `BACKEND_URL` | Backend URL | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Prod only |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Prod only |
| `ANTHROPIC_API_KEY` | Claude API key | Optional |
| `OLLAMA_BASE_URL` | Ollama endpoint (default: `http://localhost:11434`) | Optional |
| `OLLAMA_MODEL` | Ollama model name (default: `llama3.2:3b`) | Optional |
| `JWT_ALGORITHM` | JWT signing algorithm (default: `HS256`) | Optional |
| `JWT_EXPIRE_MINUTES` | JWT token TTL in minutes (default: `1440`) | Optional |

See [`.env.example`](.env.example) for the full template.

## Running Tests

```bash
# Backend unit tests (75% coverage minimum)
cd backend
uv run pytest tests/unit/ -v --tb=short --cov=app --cov-report=term-missing --cov-fail-under=75

# Backend linting
uv run ruff check .
uv run ruff format --check .

# Frontend linting
cd frontend
npm run lint
```

See [`docs/testing.md`](docs/testing.md) for the full test strategy, CI pipelines, and CV extraction quality gates.

## MCP Integration

OpenOrbis includes an MCP server that exposes your knowledge graph to AI agents. The server provides 6 tools:

| Tool | Description |
|------|-------------|
| `orbis_get_summary` | Name, headline, location, node type counts |
| `orbis_get_full_orb` | Complete person profile + all nodes |
| `orbis_get_nodes_by_type` | Filter nodes by type (education, skill, etc.) |
| `orbis_get_connections` | All relationships of a specific node |
| `orbis_get_skills_for_experience` | Skills linked to a work experience or project |
| `orbis_send_message` | Send a message to the orb owner |

To run the MCP server:

```bash
cd backend
uv run python -m mcp_server.server
```

The server uses streamable-http transport and connects to Neo4j independently.

## Knowledge Graph Schema

Each user's orb is a graph rooted at a **Person** node, connected to domain-specific nodes via typed relationships:

```
Person ──HAS_EDUCATION──► Education
       ──HAS_WORK_EXPERIENCE──► WorkExperience
       ──HAS_SKILL──► Skill
       ──SPEAKS──► Language
       ──HAS_CERTIFICATION──► Certification
       ──HAS_PUBLICATION──► Publication
       ──HAS_PROJECT──► Project
       ──HAS_PATENT──► Patent
       ──COLLABORATED_WITH──► Collaborator
```

The key graph feature is `USED_SKILL` — a cross-link between experience nodes (WorkExperience, Project, Education, Publication) and Skill nodes, enabling queries like "which skills were used at company X?"

See [`ontology.md`](ontology.md) for the full schema and [`docs/database.md`](docs/database.md) for query patterns and indexes.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Run linters before committing:
   ```bash
   cd backend && uv run ruff check . && uv run ruff format .
   cd frontend && npm run lint
   ```
4. Ensure tests pass with >= 75% coverage
5. Open a pull request against `main`

## Documentation

Detailed documentation lives in [`docs/`](docs/):

- [`architecture.md`](docs/architecture.md) — system design and data flow
- [`api.md`](docs/api.md) — API endpoint reference
- [`onboarding.md`](docs/onboarding.md) — local setup and dev workflow
- [`database.md`](docs/database.md) — Neo4j schema and query patterns
- [`testing.md`](docs/testing.md) — test strategy and CI pipelines
- [`deployment.md`](docs/deployment.md) — production setup and Docker
- [`cv-extraction-quality.md`](docs/cv-extraction-quality.md) — CV extraction quality metrics

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

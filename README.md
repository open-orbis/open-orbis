<p align="center">
  <img src="frontend/public/favicon.svg" width="80" alt="Orbis logo"/>
</p>

<h1 align="center">Orbis</h1>

<p align="center">
  <strong>Your CV as a living knowledge graph.</strong><br/>
  Create once. Share everywhere. Query with AI.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10+-blue?logo=python&logoColor=white" alt="Python"/>
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white" alt="React"/>
  <img src="https://img.shields.io/badge/neo4j-5.20+-008CC1?logo=neo4j&logoColor=white" alt="Neo4j"/>
  <img src="https://img.shields.io/badge/MCP-native-blueviolet" alt="MCP"/>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License"/>
</p>

---

## What is Orbis?

Orbis transforms traditional CVs into **portable, machine-readable knowledge graphs** (GraphRAG) stored in Neo4j and exposed via **Model Context Protocol (MCP)** tools.

Each person's graph is an **"orb"** — a 3D interactive visualization of their professional identity: education, work experience, skills, publications, projects, certifications, languages, and collaborators.

```
Stop rewriting your CV for every application.
Create your graph once — share it with anyone, any tool, any agent.
```

**Try it:** paste your orb link into Claude, ChatGPT, or any MCP-compatible agent and ask it anything about your professional background.

---

## Why Orbis?

| Problem | Orbis Solution |
|---------|---------------|
| Rewriting CVs for every job | Create once, share a link |
| Recruiter keyword matching misses talent | Graph-structured semantic search |
| Professional data locked in LinkedIn | Full data portability (JSON, JSON-LD, PDF) |
| AI agents can't read your resume | MCP-native — any agent can query your orb |
| No control over who sees what | Granular per-field, per-consumer permissions |
| Profiles are static documents | Living graph with vector embeddings |

---

## Features

#### For Individuals
- **Two onboarding paths** — upload a PDF or build your orb node-by-node
- **Voice input** — speak your experience, Whisper transcribes, AI classifies
- **3D interactive graph** — explore, edit, and share your professional identity
- **Shareable link** — `orbis.io/your-name` with QR code generation
- **Export anywhere** — download as PDF, JSON, or JSON-LD
- **End-to-end encrypted** — sensitive fields protected with Fernet encryption
- **"Open to Work" flag** — signal availability to recruiters

#### For AI Agents
- **MCP tools** — 6 queryable endpoints out of the box:
  - `orbis_get_summary()` — profile overview with node counts
  - `orbis_get_full_orb()` — complete graph data
  - `orbis_get_nodes_by_type()` — filtered retrieval
  - `orbis_get_connections()` — relationship traversal
  - `orbis_get_skills_for_experience()` — experience-to-skills mapping
  - `orbis_send_message()` — contact the orb owner
- **Granular permissions** — token-based access control per agent

#### For Recruiters *(planned)*
- Search the interconnected graph across all public orbs
- Cluster candidates by expertise
- Semantic matching with explainable results

---

## Architecture

```
Frontend (React + Three.js)          Backend (FastAPI)
┌──────────────────────┐       ┌──────────────────────────┐
│  Landing Page        │       │  /auth    Google OAuth    │
│  3D Graph Viewer     │──────>│  /orbs    Node CRUD      │
│  CV Upload           │ REST  │  /cv      PDF pipeline   │
│  Editor / Inbox      │<──────│  /search  Semantic search │
│  Voice Recorder      │       │  /export  PDF/JSON/JSONLD│
└──────────────────────┘       │  /mcp     Agent tools    │
                               └────────────┬─────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
              ┌─────▼─────┐         ┌──────▼──────┐        ┌──────▼──────┐
              │   Neo4j   │         │   Ollama    │        │    LLM     │
              │  Graph DB │         │  llama3.2   │        │  Whisperer │
              │  + Vector │         │  Classify   │        │  PDF → Text│
              │  Indexes  │         └─────────────┘        └────────────┘
              └───────────┘
```

### CV Processing Pipeline

```
PDF Upload → LLM Whisperer (extract) → Ollama (classify) → Claude (refine) → Neo4j (store)
                                                                                    │
Voice Input → Whisper (transcribe) → Ollama (classify) ─────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS 4 |
| **3D Visualization** | Three.js, React Three Fiber, react-force-graph-3d |
| **Animations** | Framer Motion |
| **State** | Zustand |
| **Backend** | FastAPI, Python 3.10+, Uvicorn |
| **Database** | Neo4j 5.20+ (Community Edition) with vector indexes |
| **Auth** | Google OAuth 2.0, JWT (python-jose) |
| **Encryption** | Fernet (cryptography) |
| **AI / LLM** | Ollama (llama3.2:3b), Anthropic Claude API |
| **PDF Extraction** | LLM Whisperer (Unstract), PyMuPDF |
| **Speech-to-Text** | OpenAI Whisper (self-hosted) |
| **Agent Protocol** | Model Context Protocol (MCP) |
| **Containers** | Docker Compose |

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Python 3.10+
- Node.js 18+
- Google OAuth credentials ([console.cloud.google.com](https://console.cloud.google.com))
- Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- LLM Whisperer API key ([unstract.com](https://unstract.com))

### 1. Clone & configure

```bash
git clone https://github.com/Brotherhood94/orb_project.git
cd orb_project
cp .env.example .env
# Edit .env with your API keys and secrets
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This launches:
- **Neo4j** on `localhost:7474` (browser) / `localhost:7687` (bolt)
- **Ollama** on `localhost:11434`
- **Whisper** on `localhost:9000`

### 3. Pull the LLM model

```bash
docker exec orbis-ollama ollama pull llama3.2:3b
```

### 4. Start the backend

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173) and create your orb.

---

## Environment Variables

```env
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=orbis_dev_password

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# JWT
JWT_SECRET=change-me-to-a-random-secret

# Encryption
ENCRYPTION_KEY=change-me-generate-with-fernet

# AI Services
ANTHROPIC_API_KEY=your-anthropic-api-key
LLMWHISPERER_API_KEY=your-llmwhisperer-api-key

# Local Services (defaults work with docker-compose)
OLLAMA_BASE_URL=http://localhost:11434
WHISPER_API_URL=http://localhost:9000
```

---

## MCP Integration

Connect any MCP-compatible client to your orb:

```json
{
  "mcpServers": {
    "orbis": {
      "command": "python",
      "args": ["-m", "mcp_server.server"],
      "cwd": "/path/to/orb_project/backend"
    }
  }
}
```

Then ask your AI agent:

> *"Tell me about this person's work experience and skills."*
>
> *"Find publications related to machine learning."*
>
> *"What skills were used at their most recent job?"*

---

## Project Structure

```
orb_project/
├── frontend/
│   ├── src/
│   │   ├── pages/          # Landing, Create, View, Shared, Auth
│   │   ├── components/     # Graph, Editor, Chat, Inbox, CV Upload
│   │   ├── stores/         # Zustand (auth, orb, toast)
│   │   └── api/            # Axios client wrappers
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── auth/           # Google OAuth, JWT
│   │   ├── orbs/           # Node CRUD, graph queries
│   │   ├── cv/             # PDF upload, classification, refinement
│   │   ├── graph/          # Neo4j client, encryption, embeddings
│   │   ├── search/         # Semantic + text search
│   │   ├── export/         # PDF, JSON, JSON-LD export
│   │   ├── messages/       # Inbox, messaging
│   │   └── main.py         # FastAPI app
│   ├── mcp_server/         # MCP tool definitions
│   └── pyproject.toml
├── infra/
│   └── neo4j/init.cypher   # DB constraints & vector indexes
├── docker-compose.yml
└── .env.example
```

---

## Usage Examples

**Share your orb with an LLM:**
```
Here is my professional profile: orbis.io/nicola-mei
Tell me what roles I'd be a good fit for.
```

**Recruiter query via MCP:**
```
Find all people with 5+ years in ML within 2 connections of Alessandro Berti.
```

**Build a portfolio site:**
```
Navigate my orb at orbis.io/nicola-mei and build me a portfolio website.
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

See [TODO.md](TODO.md) for the current task list and priorities.

---

## License

MIT

---

<p align="center">
  <em>The personal landing page is dead. Your orb is your new digital presence.</em>
</p>

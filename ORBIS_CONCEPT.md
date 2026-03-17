# Orbis — Your CV as a Living Knowledge Graph

## Vision

Orbis transforms CVs into portable, machine-readable knowledge graphs (GraphRAG) stored in **Neo4j** and exposed via **MCP tools**. Each person's graph is an **"orb"** — a 3D interactive graph representing their professional identity. Orbs can link to other orbs, forming a professional network that recruiters can query and navigate.

**Core proposition:** Stop wasting time choosing CV templates and rewriting your resume for every application. Create your GraphRAG once, share it everywhere. Your orb is your new digital presence — structured, queryable, and interoperable with AI agents. The personal landing page is dead.

---

## Architecture Decisions

| Decision | Choice |
|---|---|
| Graph Database | **Neo4j** |
| API Layer | **MCP tools** |
| Authentication | **Google OAuth** (email required) |
| Security | **End-to-end encryption** |
| CV Input | Upload CV **or** manual entry, node by node |

---

## User Flow

### 1. Landing Page

- Dark background with a glowing digital orb with rays emanating from it.
- Two CTAs: **"What is an Orb?"** and **"Create Your Orb"**

### 2. "What is an Orb?"

- An orb is a portable, structured representation of your professional identity.
- It lives on Orbis but can also be:
  - **Downloaded** (static snapshot, harder to keep updated)
  - **Accessed via a permanent link** — your **Orb ID** (custom, user-chosen). Example: `orbis.io/nicola-mei`
- **Pro feature:** Automatic periodic updates — Orbis crawls the web for new info about you, double-checks with you, and updates the orb.
- Interoperable: pass your orb URI to any LLM, agent, or tool and it gets structured data (JSON, RDF, etc.)

#### Why Orbis?

- No more choosing templates, formatting, or rewriting your CV every time.
- Create your graph once — share it with anyone, any tool, any agent.
- Your orb is always structured, always queryable, always up to date.

### 3. "Create Your Orb"

- On click, the UI transitions: light increases, screen turns white.
- The user has **two paths**:

#### Path A: Upload CV

1. Central message: **"Upload your CV to create your orb."**
2. CV is processed to extract and structure information into the Neo4j graph.
3. After processing: **"It's time to double-check what we read from your CV."**
4. User reviews and corrects extracted data.
5. After confirmation: **"Your orb is ready."** — the full 3D graph is displayed.

#### Path B: Manual Entry (node by node)

1. The 3D graph is displayed in the background (initially empty or with a central "You" node).
2. A **floating input box** appears centered on screen, prompting the user to enter details for a new entry (category, title, dates, description, links, etc.).
3. On clicking **"Add"**, the entry animates from the input box into the background graph, populating a new node in real time.
4. The user repeats this to build their orb incrementally.

### 4. The Orb (3D Graph)

A 3D interactive graph. Top-level nodes represent categories:

- **Education**
- **Work Experience**
- **Certifications**
- **Languages**
- **Publications**
- **Projects (as PI)**
- **Skills**
- **People** (collaborators detected or added)

#### Node Interactions

| Action | Behavior |
|---|---|
| **Mouse hover** | A dialog appears showing the full details of that node |
| **Click** | Opens the node for editing — same floating input box, pre-filled with current data |
| **Add** | Floating centered input box to create a new node; on confirm, it animates into the graph |

#### Node Properties

- Each node contains: title, description, date range (US & EU format support), links (company pages, publications, etc.)
- Each node has a **vector embedding** for efficient semantic retrieval
- Social links (LinkedIn, Google Scholar, etc.) attached where relevant

### 5. Post-Creation

- **Name detection:** If collaborator names are found in the CV, prompt: *"Want to invite them to join Orbis?"* (email invite)
- **Orb connections:** If invited people join, an edge forms between the two orbs, visually represented.
- **Download:** The orb is downloadable.
- **Demo prompt:** Suggest the user paste their orb link into an LLM chat and ask it questions. Message: *"We'll be back as your orb is ready."*

---

## Key Features

### For Individuals

- **"Open to Work"** flag
- **Share your orb** — via link or download
- **Single Source of Truth** — update once, everything downstream updates
- **Granular access control** — token/permission-based: e.g., *"give Lovable everything for my site; hide my home address from HR agents"*
- **Neighborhood view** — see what people with similar skills are doing
- **End-to-end encrypted** by default
- **Google login** required (email collected)

### For Recruiters (Paid Tier)

- Access to the **full interconnected graph** across all public orbs
- **Cluster by expertise** — find talent pools by skill area
- **Select candidates by connections** — leverage the graph topology
- **Fuzzy search with confirmation** — e.g., *"Do you mean Alessandro Berti?"*
- **Market analytics** — statistics, trends, talent supply analysis

### For AI Agents / Machines (Pro Value)

- **Total interoperability:** Pass an orb URI (e.g., `identity.yourname.com`) to any agent — recruiting bots, Lovable, automation tools — and it gets perfectly structured data.
- **MCP tools exposure:** Orbs are queryable via MCP, making them native to agentic workflows.
- **Single Source of Truth:** Update in one place; generated CVs, websites, and profiles update downstream.
- **Granular permissions:** Control what each agent sees via tokens.

---

## Usage Examples

- Pass the orb link to Lovable with the prompt: *"Navigate the DB and build me a portfolio site."*
- Paste the orb link into ChatGPT/Claude: *"Tell me about this person's experience."*
- Recruiter agent queries the MCP endpoint: *"Find all people with 5+ years in ML within 2 connections of Alessandro Berti."*

---

## Open Questions

1. **Graph schema design** — Define the full Neo4j node labels, relationships, and properties. What ontology to follow?
2. **Access for low-skill users** — Lower the entrance cost, but ensure the tool remains powerful. How to balance?
3. **Download format** — What format for the downloadable orb? JSON-LD? RDF? Custom?
4. **3D visualization library** — Which library for the 3D graph? (e.g., Three.js, react-three-fiber, force-graph-3d)
5. **Vector embedding storage** — Store in Neo4j (native vector index) or separate vector DB?

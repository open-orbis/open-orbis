# Orbis — TODO List

*Organized task list for collaborative development.*

---

## A. Core Graph & Data Layer

| # | Task | Details | Priority |
|---|------|---------|----------|
| A1 | **Test GraphRAG end-to-end** | Define a testing strategy for the GraphRAG pipeline: validate that CV data is correctly extracted, classified, stored as nodes/edges in Neo4j, and retrievable via MCP tools. Create test CVs covering edge cases (gaps, multiple roles, international formats). Measure extraction accuracy vs. ground truth. | High |
| A2 | **Fix graph visualization consistency** | The 3D graph rendered on screen (react-force-graph-3d) does not match the actual GraphRAG structure in Neo4j. Audit the mapping between Neo4j nodes/relationships and the frontend graph data. Ensure all node types, edges (HAS_EDUCATION, USED_SKILL, etc.), and hierarchies are accurately represented in the visualization. | High |
| A3 | **Graph-level similarity for HR queries** | Individual nodes have vector embeddings, but there's no way to compute similarity between an HR query and the *entire* graph. Research approaches: (1) aggregate node embeddings into a single graph-level embedding (mean/weighted pooling), (2) subgraph matching with ranked node hits, (3) GNN-based graph embeddings, (4) query decomposition — break HR query into sub-queries, match each to relevant nodes, aggregate scores. This is critical for the recruiter tier. | High |
| A4 | **Implement fine-grained access control** | Allow users to control visibility per node, per field, per consumer. Example: "show everything to Lovable, hide my address from HR agents, hide salary from public view." Design a permission token system: each token specifies allowed node types, fields, and operations. Enforce at the API/MCP layer before data leaves the backend. | High |
| A5 | **Introduce similarity distance evaluation metrics** | Currently there is no formal way to assess how well the embedding-based similarity performs. Introduce metrics such as Inner Product Error (IPE), cosine distance distribution, and rank correlation against human-labelled relevance judgments. Build a benchmark dataset of query–graph pairs with known relevance scores, compute metrics across different aggregation strategies (mean pooling, weighted pooling, GNN), and report precision@k / nDCG. This directly supports tuning and validating the graph-level similarity work in A3. | Medium |

---

## B. Onboarding & CV Processing

| # | Task | Details | Priority |
|---|------|---------|----------|
| B1 | **Test voice & LinkedIn onboarding with Claude models** | Run systematic tests of the voice onboarding and LinkedIn import flows using Haiku, Sonnet, and Opus. For each model: (1) measure classification accuracy, (2) evaluate structured CV output quality, (3) compare cost per CV, (4) measure latency. Build a comparison matrix and decide which model to use for each pipeline stage. | High |
| B2 | **Email scraping → friend invite with rewards** | When emails are detected in a CV (collaborators, references), prompt the user: "Want to invite them to join Orbis?" Design a reward system: what incentive does the inviter/invitee get? Options: premium feature unlock, extended storage, badge/visibility boost, early access to recruiter features. Implement the invite email flow with tracking. | Medium |
| B3 | **Evaluate NVIDIA NeMo for speech-to-text** | Assess [NVIDIA NeMo](https://github.com/NVIDIA-NeMo/NeMo) as an alternative or complement to the current speech-to-text pipeline used during voice onboarding. Benchmark NeMo's ASR models (Conformer, FastConformer) against the current solution on: (1) word error rate across English + multilingual CVs, (2) latency per utterance, (3) GPU/CPU resource cost, (4) ease of self-hosting vs. API dependency. If NeMo outperforms, design a migration plan; if comparable, evaluate whether self-hosting reduces long-term costs. Ties into multilanguage support (C7). | Medium |

---

## C. User Experience & Interface

| # | Task | Details | Priority |
|---|------|---------|----------|
| C1 | **User click telemetry** | Instrument the frontend to track user interactions: clicks, navigation paths, time-on-page, feature usage, drop-off points. Use a lightweight analytics solution (PostHog, Plausible, or custom event logging). Focus on: onboarding funnel conversion, graph interaction patterns, and feature discovery rates. Essential for data-driven UX decisions. | Medium |
| C2 | **A2UI (AI-to-UI) testing** | Test AI-to-UI interaction patterns — where AI actions directly manipulate the interface. Validate that AI-generated graph updates render correctly, that real-time node additions animate properly, and that AI suggestions integrate smoothly into the editing flow. | Low |
| C3 | **Interface walkthrough / guided tour** | Implement an interactive walkthrough for first-time users: highlight key features (add node, edit, share link, MCP orb ID, export). Use a library like Shepherd.js or Intro.js. Cover: graph navigation (rotate, zoom, click), node editing, sharing, and the "paste your orb link into an LLM" demo flow. | Medium |
| C4 | **Print orb + QR code** | Generate a printable version of the orb (static graph snapshot or styled summary) with a QR code that links to the live 3D interactive graph. Use case: hand out at conferences, attach to physical resumes. Implement as an export option (PDF with embedded QR). The QR links to the public orb URL (`orbis.io/{orb_id}`). | Low |
| C5 | **Edge insertion UI via node selection** | Allow users to manually add edges between nodes directly in the 3D graph. Interaction flow: (1) user clicks a source node (highlighted), (2) clicks a destination node, (3) a pop-up menu appears listing the valid relationship labels from the ontology (e.g., HAS_SKILL, WORKED_AT, HAS_EDUCATION) filtered to only those semantically valid for the selected node types. User picks one and the edge is created in Neo4j + rendered in real time. Include an undo action and validation to prevent duplicate edges. | Medium |
| C6 | **Node color legend and colorblind accessibility** | Add a visible legend panel to the graph view that maps each node color to its type (e.g., blue = Skill, green = Education, orange = Experience). Audit the current palette for colorblind accessibility — test against Deuteranopia, Protanopia, and Tritanopia using a simulator (e.g., Coblis or Sim Daltonism). If the palette fails, switch to a colorblind-safe scheme (e.g., IBM Design, Wong palette) and add secondary cues (shape, icon, or pattern) so color is never the sole differentiator. | Medium |
| C7 | **Multilanguage website and pipeline** | Internationalize the entire platform: (1) wrap all UI strings with an i18n framework (react-i18next or similar), (2) support locale-aware speech-to-text in the voice onboarding (ties into B3/NeMo evaluation), (3) ensure the CV extraction pipeline handles non-English CVs (accented characters, right-to-left scripts, CJK text), (4) add a language selector in the UI. Start with English, Italian, and Spanish as pilot locales; design the system so adding new languages requires only a translation file, no code changes. | Low |

---

## D. Platform & Ecosystem

| # | Task | Details | Priority |
|---|------|---------|----------|
| D1 | **User playground for orb usage** | Give users a sandbox where they can see how their orb works in practice: paste their orb link, see what an LLM extracts, preview MCP tool responses, test different queries. Consider making it pluggable with Lovable (user pastes orb link → Lovable generates a portfolio site). This demonstrates the value proposition directly. | Medium |
| D2 | **Cross-platform MCP client** | Build an installable MCP client/plugin for ChatGPT, Gemini, and Claude so users can access any orb from within those platforms. Package as: (1) ChatGPT custom GPT/action, (2) Gemini extension, (3) Claude MCP server config. The client connects to Orbis's MCP endpoint and exposes the 5 orb query tools. | High |
| D3 | **MCP query monetization** | Design a billing model for MCP queries. Options: (1) per-query pricing ($0.01–0.05/query), (2) monthly API token bundles, (3) freemium with rate limits (100 free queries/month, then paid). Integrate with Stripe. Track query origin (which agent/platform), query type, and data volume. This is the core B2B revenue stream. | High |
| D4 | **Orb as identity/login provider** | Explore using an orb as a universal login identity — replacing email-based auth. Why should an email define your online identity? Research: (1) OAuth provider implementation (Orbis as an identity provider), (2) DID (Decentralized Identifier) standards, (3) Verifiable Credentials. Long-term vision but architecturally significant — start with a design doc. | Low |
| D5 | **CV template export from visible orb data** | Let users upload a CV/résumé template (DOCX, LaTeX, or structured HTML) and auto-populate it with the information currently visible in their orb (respecting active filters and access control settings — filtered-out nodes are excluded). Return the document in an editable format (DOCX or HTML). Two delivery options: (1) download the pre-filled document for offline editing, (2) integrate a lightweight in-app editor (e.g., TipTap, CKEditor, or OnlyOffice) so users can review and tweak content before exporting. Support section mapping: map orb node types → template sections (Experience, Education, Skills, etc.). | Medium |

---

## E. Social Graph & Network

| # | Task | Details | Priority |
|---|------|---------|----------|
| E1 | **Hidden social graph (connection system)** | Build a background social graph that maps relationships between users — similar to LinkedIn connections but transparent to the user (they don't manually "connect"). Infer connections from: shared collaborators, co-authored publications, overlapping work history, invite chains. Surface this to recruiters as a searchable network topology. | Medium |
| E2 | **Competitive advantage over LinkedIn: instant precision search** | Build the recruiter search experience around the proposition: "Search and find the right person instantly." Leverage graph structure + embeddings for precise, explainable results (not keyword matching). Show *why* a candidate matches (graph path visualization). This is the core recruiter-tier differentiator. | High |

---

## F. Testing & Quality

| # | Task | Details | Priority |
|---|------|---------|----------|
| F1 | **Platform-wide testing strategy** | Define a comprehensive testing approach: (1) unit tests for backend services, (2) integration tests for the CV pipeline (upload → extract → classify → refine → store), (3) E2E tests for critical user flows (signup → create orb → share → view), (4) MCP endpoint contract tests, (5) load testing for concurrent CV uploads. Set up CI/CD pipeline with automated test runs. | High |
| F2 | **Agent-based UI testing (Claude + browser)** | Connect Claude to a browser (via Puppeteer/Playwright or Claude computer use) and give it an objective: "You have this CV. Create an orb, edit it, share the link, and verify the public view." Let the agent navigate the platform autonomously. Record: where it gets stuck, confusing UX patterns, broken flows. Use findings to improve the interface. | Medium |

---

## G. Mobile & Extended Platforms

| # | Task | Details | Priority |
|---|------|---------|----------|
| G1 | **Mobile app feasibility (Android/iOS)** | Evaluate whether a native mobile app adds value. Primary use case: quick note-taking on the go (add a new skill, log a project, update work experience). The full 3D graph may not translate well to mobile — consider a simplified list/card view with graph preview. Options: React Native (share code with web), PWA (lower effort), or native. Start with a PWA to test demand. | Low |
| G2 | **Email integration for behavior insights** | If the user grants email access (same account used for login), Orbis could detect professional activity: conference registrations, course completions, newsletter subscriptions, project updates. Privacy-sensitive — requires explicit opt-in, clear data usage policy, and granular controls. Flag as experimental/future. | Low |

---

## H. Account & Settings

| # | Task | Details | Priority |
|---|------|---------|----------|
| H1 | **Change sign-in email and account deletion** | Allow users to update the email address associated with their account (with re-verification of the new address) and to permanently delete their account and all associated data. Account deletion must: (1) remove all Neo4j graph data, embeddings, and uploaded files, (2) revoke all active MCP tokens and permission grants, (3) send a confirmation email before executing, (4) comply with GDPR right-to-erasure requirements (full data wipe within 30 days). Expose both actions in a dedicated "Account Settings" page with clear warnings and confirmation dialogs. | Medium |

---

## Priority Summary

| Priority | Count | Tasks |
|----------|-------|-------|
| **High** | 8 | A1, A2, A3, A4, B1, D2, D3, E2, F1 |
| **Medium** | 12 | A5, B2, B3, C1, C3, C5, C6, D1, D5, E1, F2, H1 |
| **Low** | 7 | C2, C4, C7, D4, G1, G2 |

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

---

## B. Onboarding & CV Processing

| # | Task | Details | Priority |
|---|------|---------|----------|
| B1 | **Test voice & LinkedIn onboarding with Claude models** | Run systematic tests of the voice onboarding and LinkedIn import flows using Haiku, Sonnet, and Opus. For each model: (1) measure classification accuracy, (2) evaluate structured CV output quality, (3) compare cost per CV, (4) measure latency. Build a comparison matrix and decide which model to use for each pipeline stage. | High |
| B2 | **Email scraping → friend invite with rewards** | When emails are detected in a CV (collaborators, references), prompt the user: "Want to invite them to join Orbis?" Design a reward system: what incentive does the inviter/invitee get? Options: premium feature unlock, extended storage, badge/visibility boost, early access to recruiter features. Implement the invite email flow with tracking. | Medium |

---

## C. User Experience & Interface

| # | Task | Details | Priority |
|---|------|---------|----------|
| C1 | **User click telemetry** | Instrument the frontend to track user interactions: clicks, navigation paths, time-on-page, feature usage, drop-off points. Use a lightweight analytics solution (PostHog, Plausible, or custom event logging). Focus on: onboarding funnel conversion, graph interaction patterns, and feature discovery rates. Essential for data-driven UX decisions. | Medium |
| C2 | **A2UI (AI-to-UI) testing** | Test AI-to-UI interaction patterns — where AI actions directly manipulate the interface. Validate that AI-generated graph updates render correctly, that real-time node additions animate properly, and that AI suggestions integrate smoothly into the editing flow. | Low |
| C3 | **Interface walkthrough / guided tour** | Implement an interactive walkthrough for first-time users: highlight key features (add node, edit, share link, MCP orb ID, export). Use a library like Shepherd.js or Intro.js. Cover: graph navigation (rotate, zoom, click), node editing, sharing, and the "paste your orb link into an LLM" demo flow. | Medium |
| C4 | **Print orb + QR code** | Generate a printable version of the orb (static graph snapshot or styled summary) with a QR code that links to the live 3D interactive graph. Use case: hand out at conferences, attach to physical resumes. Implement as an export option (PDF with embedded QR). The QR links to the public orb URL (`orbis.io/{orb_id}`). | Low |

---

## D. Platform & Ecosystem

| # | Task | Details | Priority |
|---|------|---------|----------|
| D1 | **User playground for orb usage** | Give users a sandbox where they can see how their orb works in practice: paste their orb link, see what an LLM extracts, preview MCP tool responses, test different queries. Consider making it pluggable with Lovable (user pastes orb link → Lovable generates a portfolio site). This demonstrates the value proposition directly. | Medium |
| D2 | **Cross-platform MCP client** | Build an installable MCP client/plugin for ChatGPT, Gemini, and Claude so users can access any orb from within those platforms. Package as: (1) ChatGPT custom GPT/action, (2) Gemini extension, (3) Claude MCP server config. The client connects to Orbis's MCP endpoint and exposes the 5 orb query tools. | High |
| D3 | **MCP query monetization** | Design a billing model for MCP queries. Options: (1) per-query pricing ($0.01–0.05/query), (2) monthly API token bundles, (3) freemium with rate limits (100 free queries/month, then paid). Integrate with Stripe. Track query origin (which agent/platform), query type, and data volume. This is the core B2B revenue stream. | High |
| D4 | **Orb as identity/login provider** | Explore using an orb as a universal login identity — replacing email-based auth. Why should an email define your online identity? Research: (1) OAuth provider implementation (Orbis as an identity provider), (2) DID (Decentralized Identifier) standards, (3) Verifiable Credentials. Long-term vision but architecturally significant — start with a design doc. | Low |

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

## Priority Summary

| Priority | Count | Tasks |
|----------|-------|-------|
| **High** | 8 | A1, A2, A3, A4, B1, D2, D3, E2, F1 |
| **Medium** | 6 | B2, C1, C3, D1, E1, F2 |
| **Low** | 5 | C2, C4, D4, G1, G2 |

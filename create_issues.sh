#!/bin/bash
# Usage: gh auth login && bash create_issues.sh
# Creates labels + 19 GitHub issues for the Orbis TODO list

REPO="Brotherhood94/orb_project"

echo "=== Creating labels ==="
gh label create "high-priority" --repo "$REPO" --color "B60205" --description "High priority task" 2>/dev/null || echo "Label high-priority already exists"
gh label create "medium-priority" --repo "$REPO" --color "FBCA04" --description "Medium priority task" 2>/dev/null || echo "Label medium-priority already exists"
gh label create "low-priority" --repo "$REPO" --color "0E8A16" --description "Low priority task" 2>/dev/null || echo "Label low-priority already exists"
echo ""
echo "=== Creating 19 issues ==="
echo ""

# --- A1 ---
BODY='## Category: Core Graph & Data Layer

Define a testing strategy for the GraphRAG pipeline: validate that CV data is correctly extracted, classified, stored as nodes/edges in Neo4j, and retrievable via MCP tools. Create test CVs covering edge cases (gaps, multiple roles, international formats). Measure extraction accuracy vs. ground truth.

**Priority:** High'

gh issue create --repo "$REPO" --label "high-priority" --title "[A1] Test GraphRAG end-to-end" --body "$BODY" && echo "Created A1" || echo "FAILED A1"

# --- A2 ---
BODY='## Category: Core Graph & Data Layer

The 3D graph rendered on screen (react-force-graph-3d) does not match the actual GraphRAG structure in Neo4j. Audit the mapping between Neo4j nodes/relationships and the frontend graph data. Ensure all node types, edges (HAS_EDUCATION, USED_SKILL, etc.), and hierarchies are accurately represented in the visualization.

**Priority:** High'

gh issue create --repo "$REPO" --label "high-priority" --title "[A2] Fix graph visualization consistency" --body "$BODY" && echo "Created A2" || echo "FAILED A2"

# --- A3 ---
BODY='## Category: Core Graph & Data Layer

Individual nodes have vector embeddings, but there is no way to compute similarity between an HR query and the entire graph. Research approaches:
1. Aggregate node embeddings into a single graph-level embedding (mean/weighted pooling)
2. Subgraph matching with ranked node hits
3. GNN-based graph embeddings
4. Query decomposition: break HR query into sub-queries, match each to relevant nodes, aggregate scores

This is critical for the recruiter tier.

**Priority:** High'

gh issue create --repo "$REPO" --label "high-priority" --title "[A3] Graph-level similarity for HR queries" --body "$BODY" && echo "Created A3" || echo "FAILED A3"

# --- A4 ---
BODY='## Category: Core Graph & Data Layer

Allow users to control visibility per node, per field, per consumer. Example: "show everything to Lovable, hide my address from HR agents, hide salary from public view." Design a permission token system: each token specifies allowed node types, fields, and operations. Enforce at the API/MCP layer before data leaves the backend.

**Priority:** High'

gh issue create --repo "$REPO" --label "high-priority" --title "[A4] Implement fine-grained access control" --body "$BODY" && echo "Created A4" || echo "FAILED A4"

# --- B1 ---
BODY='## Category: Onboarding & CV Processing

Run systematic tests of the voice onboarding and LinkedIn import flows using Haiku, Sonnet, and Opus. For each model:
1. Measure classification accuracy
2. Evaluate structured CV output quality
3. Compare cost per CV
4. Measure latency

Build a comparison matrix and decide which model to use for each pipeline stage.

**Priority:** High'

gh issue create --repo "$REPO" --label "high-priority" --title "[B1] Test voice and LinkedIn onboarding with Claude models" --body "$BODY" && echo "Created B1" || echo "FAILED B1"

# --- B2 ---
BODY='## Category: Onboarding & CV Processing

When emails are detected in a CV (collaborators, references), prompt the user: "Want to invite them to join Orbis?" Design a reward system: what incentive does the inviter/invitee get? Options: premium feature unlock, extended storage, badge/visibility boost, early access to recruiter features. Implement the invite email flow with tracking.

**Priority:** Medium'

gh issue create --repo "$REPO" --label "medium-priority" --title "[B2] Email scraping - friend invite with rewards" --body "$BODY" && echo "Created B2" || echo "FAILED B2"

# --- C1 ---
BODY='## Category: User Experience & Interface

Instrument the frontend to track user interactions: clicks, navigation paths, time-on-page, feature usage, drop-off points. Use a lightweight analytics solution (PostHog, Plausible, or custom event logging). Focus on: onboarding funnel conversion, graph interaction patterns, and feature discovery rates. Essential for data-driven UX decisions.

**Priority:** Medium'

gh issue create --repo "$REPO" --label "medium-priority" --title "[C1] User click telemetry" --body "$BODY" && echo "Created C1" || echo "FAILED C1"

# --- C2 ---
BODY='## Category: User Experience & Interface

Test AI-to-UI interaction patterns where AI actions directly manipulate the interface. Validate that AI-generated graph updates render correctly, that real-time node additions animate properly, and that AI suggestions integrate smoothly into the editing flow.

**Priority:** Low'

gh issue create --repo "$REPO" --label "low-priority" --title "[C2] A2UI (AI-to-UI) testing" --body "$BODY" && echo "Created C2" || echo "FAILED C2"

# --- C3 ---
BODY='## Category: User Experience & Interface

Implement an interactive walkthrough for first-time users: highlight key features (add node, edit, share link, MCP orb ID, export). Use a library like Shepherd.js or Intro.js. Cover: graph navigation (rotate, zoom, click), node editing, sharing, and the "paste your orb link into an LLM" demo flow.

**Priority:** Medium'

gh issue create --repo "$REPO" --label "medium-priority" --title "[C3] Interface walkthrough / guided tour" --body "$BODY" && echo "Created C3" || echo "FAILED C3"

# --- C4 ---
BODY='## Category: User Experience & Interface

Generate a printable version of the orb (static graph snapshot or styled summary) with a QR code that links to the live 3D interactive graph. Use case: hand out at conferences, attach to physical resumes. Implement as an export option (PDF with embedded QR). The QR links to the public orb URL.

**Priority:** Low'

gh issue create --repo "$REPO" --label "low-priority" --title "[C4] Print orb + QR code" --body "$BODY" && echo "Created C4" || echo "FAILED C4"

# --- D1 ---
BODY='## Category: Platform & Ecosystem

Give users a sandbox where they can see how their orb works in practice: paste their orb link, see what an LLM extracts, preview MCP tool responses, test different queries. Consider making it pluggable with Lovable (user pastes orb link and Lovable generates a portfolio site). This demonstrates the value proposition directly.

**Priority:** Medium'

gh issue create --repo "$REPO" --label "medium-priority" --title "[D1] User playground for orb usage" --body "$BODY" && echo "Created D1" || echo "FAILED D1"

# --- D2 ---
BODY='## Category: Platform & Ecosystem

Build an installable MCP client/plugin for ChatGPT, Gemini, and Claude so users can access any orb from within those platforms. Package as:
1. ChatGPT custom GPT/action
2. Gemini extension
3. Claude MCP server config

The client connects to the Orbis MCP endpoint and exposes the 5 orb query tools.

**Priority:** High'

gh issue create --repo "$REPO" --label "high-priority" --title "[D2] Cross-platform MCP client" --body "$BODY" && echo "Created D2" || echo "FAILED D2"

# --- D3 ---
BODY='## Category: Platform & Ecosystem

Design a billing model for MCP queries. Options:
1. Per-query pricing (0.01-0.05 per query)
2. Monthly API token bundles
3. Freemium with rate limits (100 free queries/month, then paid)

Integrate with Stripe. Track query origin (which agent/platform), query type, and data volume. This is the core B2B revenue stream.

**Priority:** High'

gh issue create --repo "$REPO" --label "high-priority" --title "[D3] MCP query monetization" --body "$BODY" && echo "Created D3" || echo "FAILED D3"

# --- D4 ---
BODY='## Category: Platform & Ecosystem

Explore using an orb as a universal login identity, replacing email-based auth. Why should an email define your online identity? Research:
1. OAuth provider implementation (Orbis as an identity provider)
2. DID (Decentralized Identifier) standards
3. Verifiable Credentials

Long-term vision but architecturally significant. Start with a design doc.

**Priority:** Low'

gh issue create --repo "$REPO" --label "low-priority" --title "[D4] Orb as identity/login provider" --body "$BODY" && echo "Created D4" || echo "FAILED D4"

# --- E1 ---
BODY='## Category: Social Graph & Network

Build a background social graph that maps relationships between users, similar to LinkedIn connections but transparent to the user (they do not manually "connect"). Infer connections from: shared collaborators, co-authored publications, overlapping work history, invite chains. Surface this to recruiters as a searchable network topology.

**Priority:** Medium'

gh issue create --repo "$REPO" --label "medium-priority" --title "[E1] Hidden social graph (connection system)" --body "$BODY" && echo "Created E1" || echo "FAILED E1"

# --- E2 ---
BODY='## Category: Social Graph & Network

Build the recruiter search experience around the proposition: "Search and find the right person instantly." Leverage graph structure + embeddings for precise, explainable results (not keyword matching). Show why a candidate matches (graph path visualization). This is the core recruiter-tier differentiator.

**Priority:** High'

gh issue create --repo "$REPO" --label "high-priority" --title "[E2] Competitive advantage: instant precision search" --body "$BODY" && echo "Created E2" || echo "FAILED E2"

# --- F1 ---
BODY='## Category: Testing & Quality

Define a comprehensive testing approach:
1. Unit tests for backend services
2. Integration tests for the CV pipeline (upload, extract, classify, refine, store)
3. E2E tests for critical user flows (signup, create orb, share, view)
4. MCP endpoint contract tests
5. Load testing for concurrent CV uploads

Set up CI/CD pipeline with automated test runs.

**Priority:** High'

gh issue create --repo "$REPO" --label "high-priority" --title "[F1] Platform-wide testing strategy" --body "$BODY" && echo "Created F1" || echo "FAILED F1"

# --- F2 ---
BODY='## Category: Testing & Quality

Connect Claude to a browser (via Puppeteer/Playwright or Claude computer use) and give it an objective: "You have this CV. Create an orb, edit it, share the link, and verify the public view." Let the agent navigate the platform autonomously. Record: where it gets stuck, confusing UX patterns, broken flows. Use findings to improve the interface.

**Priority:** Medium'

gh issue create --repo "$REPO" --label "medium-priority" --title "[F2] Agent-based UI testing (Claude + browser)" --body "$BODY" && echo "Created F2" || echo "FAILED F2"

# --- G1 ---
BODY='## Category: Mobile & Extended Platforms

Evaluate whether a native mobile app adds value. Primary use case: quick note-taking on the go (add a new skill, log a project, update work experience). The full 3D graph may not translate well to mobile. Consider a simplified list/card view with graph preview. Options: React Native (share code with web), PWA (lower effort), or native. Start with a PWA to test demand.

**Priority:** Low'

gh issue create --repo "$REPO" --label "low-priority" --title "[G1] Mobile app feasibility (Android/iOS)" --body "$BODY" && echo "Created G1" || echo "FAILED G1"

# --- G2 ---
BODY='## Category: Mobile & Extended Platforms

If the user grants email access (same account used for login), Orbis could detect professional activity: conference registrations, course completions, newsletter subscriptions, project updates. Privacy-sensitive. Requires explicit opt-in, clear data usage policy, and granular controls. Flag as experimental/future.

**Priority:** Low'

gh issue create --repo "$REPO" --label "low-priority" --title "[G2] Email integration for behavior insights" --body "$BODY" && echo "Created G2" || echo "FAILED G2"

echo ""
echo "Done! View issues at: https://github.com/$REPO/issues"

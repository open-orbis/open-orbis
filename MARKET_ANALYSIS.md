# Orbis — Full Market Analysis

*Date: March 2026*

---

## 1. Executive Summary

**Orbis** is a CV-as-a-Service platform that transforms traditional resumes into portable, machine-readable professional knowledge graphs (GraphRAG) stored in Neo4j and exposed via Model Context Protocol (MCP) tools. Each user's graph — called an "orb" — is a 3D interactive visualization of their professional identity: queryable, shareable, and natively interoperable with AI agents.

**Core Value Proposition:** Create your professional graph once; share it everywhere. No more rewriting CVs, choosing templates, or maintaining multiple profiles. Your orb becomes a single source of truth — structured, encrypted, and AI-native.

---

## 2. Market Landscape

### 2.1 Total Addressable Market (TAM)

| Segment | Size | Source/Rationale |
|---------|------|------------------|
| Global online recruitment market | ~$43B (2025), projected $58B by 2028 | CAGR ~10.5%, driven by AI adoption |
| Professional networking platforms | ~$20B (LinkedIn dominates at $16B+ revenue) | Includes subscriptions, talent solutions, ads |
| Resume/CV tools market | ~$1.5B | Resume builders, ATS parsers, formatting tools |
| HR Tech / Talent Intelligence | ~$35B | ATS, CRM, sourcing, assessment, analytics |
| AI Agent ecosystem (emerging) | ~$5-10B by 2028 | Agent-to-agent professional data exchange |

**Orbis TAM estimate:** $15–25B across professional identity management, recruiter tools, and AI-native professional data layers.

### 2.2 Serviceable Addressable Market (SAM)

Orbis targets knowledge workers who actively manage their professional presence and recruiters who source talent programmatically:

| Segment | Estimated Users | ARPU Potential |
|---------|----------------|----------------|
| Knowledge workers (tech, research, consulting, design) | ~200M globally | Freemium → $5-15/mo Pro |
| Active job seekers (monthly) | ~40M globally | Free (growth driver) |
| Recruiters & talent sourcers | ~3M globally | $50-200/mo per seat |
| AI agent developers & platforms | ~500K organizations | API/token-based pricing |

**SAM estimate:** $3–5B annually.

### 2.3 Serviceable Obtainable Market (SOM)

First 3-year realistic capture with early-mover advantage in GraphRAG + MCP professional identity:

- **Year 1:** 50K–100K individual users, 500–1K recruiter seats → ~$1–2M ARR
- **Year 2:** 500K individual users, 5K recruiter seats → ~$8–15M ARR
- **Year 3:** 2M+ individual users, 20K recruiter seats, 1K+ agent integrations → ~$30–50M ARR

---

## 3. Competitive Analysis

### 3.1 Direct Competitors

| Competitor | Strengths | Weaknesses | Orbis Differentiation |
|------------|-----------|------------|----------------------|
| **LinkedIn** | 1B+ users, network effects, recruiter ecosystem, brand trust | Walled garden, no data portability, not AI-agent-native, profile format is rigid | Open graph (MCP), full data portability, AI-native interoperability, 3D visualization |
| **Indeed/Glassdoor** | Massive job board traffic, strong SEO | No professional identity layer, CV is static document | Living graph vs. static upload, queryable by AI agents |
| **Polywork** | Multi-faceted professional profiles, modern UX | Small user base, no graph structure, not machine-queryable | Graph-native, MCP tools, recruiter tier |
| **Read.cv** | Clean, developer-focused portfolios | Niche audience, no AI interop, no graph | GraphRAG, semantic search, MCP |
| **Represent.io** | Visual resume builder | Shuttered; proved market interest but failed on execution | Orbis inherits the visual appeal with graph-native architecture |

### 3.2 Indirect Competitors

| Competitor | Overlap | Why Orbis Wins |
|------------|---------|---------------|
| **Resume builders** (Canva, Zety, Novoresume) | CV creation | Orbis replaces the need for templates entirely — the graph IS the CV |
| **ATS platforms** (Greenhouse, Lever, Workday) | Recruiter-side talent data | Orbis provides a pre-structured, queryable candidate graph; reduces parsing errors |
| **Portfolio tools** (Notion, Webflow, Carrd) | Personal landing pages | "The personal landing page is dead" — your orb replaces it |
| **Credential platforms** (Credly, Accredible) | Verified professional data | Orbis can ingest and display credentials as graph nodes |

### 3.3 Competitive Moat Assessment

| Moat Type | Strength | Details |
|-----------|----------|---------|
| **Network effects** | Medium (growing) | Orb-to-orb connections create network value; recruiter queries improve with more orbs |
| **Data moat** | Strong | GraphRAG structure + vector embeddings = rich, hard-to-replicate data layer |
| **Technical moat** | Strong | MCP-native design positions Orbis as infrastructure for the AI agent era |
| **Switching cost** | Medium | Once your professional graph is built, migrating away loses structure/relationships |
| **Brand/UX moat** | Early | 3D orb visualization is distinctive and memorable |

---

## 4. Target Customer Profiles

### 4.1 Individual Users

**Primary Persona: "The Portfolio-Weary Professional"**
- Software engineers, data scientists, researchers, designers, consultants
- Age 25–45, digitally native
- Pain points: maintaining LinkedIn + personal site + resume + portfolio; reformatting for every application
- Motivation: "Create once, share everywhere"
- Willingness to pay: $0–15/month for premium features

**Secondary Persona: "The Open-to-Work Candidate"**
- Actively job seeking
- Wants maximum visibility to recruiters
- Pain points: resume black holes, ATS parsing failures, no feedback
- Motivation: "Be found by the right people, not lost in a pile"
- Willingness to pay: Free tier (acquisition funnel)

### 4.2 Recruiter Users

**Primary Persona: "The Technical Sourcer"**
- Works at tech companies or recruiting agencies
- Sources 50–200 candidates/week
- Pain points: LinkedIn InMail fatigue, shallow profile data, boolean search limitations
- Motivation: "Query the talent graph, not just keyword-match"
- Willingness to pay: $50–200/seat/month

### 4.3 AI Agent / Platform Users

**Primary Persona: "The Agent Developer"**
- Building recruiting bots, portfolio generators, HR automation
- Needs structured, queryable professional data via API
- Pain points: scraping LinkedIn is risky/illegal; no standard for professional data exchange
- Motivation: "Plug into a professional identity layer via MCP"
- Willingness to pay: Token-based / API call pricing

---

## 5. SWOT Analysis

### Strengths
- **First-mover in GraphRAG professional identity** — no competitor offers graph-structured, MCP-queryable CVs
- **AI-native by design** — MCP tools make orbs natively accessible to LLMs and agents (Claude, GPT, custom bots)
- **Strong technical architecture** — Neo4j + vector embeddings + Fernet encryption + FastAPI async backend
- **3D visualization** — distinctive UX differentiator; the orb is memorable and shareable
- **Data portability** — export as JSON, JSON-LD, PDF; your data is not locked in
- **Privacy-first** — end-to-end encryption, granular access control per agent/recruiter
- **Voice onboarding** — lowers barrier to entry for non-technical users
- **Multi-path onboarding** — CV upload (automated) or manual node-by-node entry

### Weaknesses
- **No payment infrastructure** — monetization not yet implemented (no Stripe, no subscription management)
- **Cold-start problem** — graph network value depends on user density; early adopter phase is fragile
- **Ollama dependency** — local LLM requirement for classification may limit deployment flexibility
- **No mobile app** — web-only; professional networking increasingly happens on mobile
- **No LinkedIn import** — the most obvious onboarding path is missing
- **Limited social features** — messaging exists but no feed, endorsements, or community
- **Single auth provider** — Google-only login limits reach (no email/password, no GitHub, no Microsoft)

### Opportunities
- **AI agent explosion (2025–2027)** — as agentic workflows grow, demand for structured professional data APIs will surge
- **LinkedIn fatigue** — growing dissatisfaction with LinkedIn's feed-first, engagement-bait culture creates openness to alternatives
- **Credential verification trend** — blockchain credentials, verified skills; Orbis can become the aggregation layer
- **Enterprise adoption** — companies could use Orbis internally for skill mapping, team composition, knowledge management
- **Academic/research market** — researchers need structured publication/collaboration graphs (Google Scholar is limited)
- **White-label MCP servers** — sell Orbis graph infrastructure to HR tech platforms
- **Job matching** — with graph + embeddings, Orbis can offer AI-powered job matching
- **Open data standard** — position the orb format as an open standard for professional identity

### Threats
- **LinkedIn copies the feature** — LinkedIn has resources to add graph visualization and MCP exposure
- **Platform risk** — MCP is early; if it doesn't become the standard protocol, Orbis needs to adapt
- **Privacy regulation** — GDPR, AI Act; storing professional graphs requires strict compliance
- **AI model dependency** — reliance on external APIs (Anthropic, LLM Whisperer) introduces cost and availability risk
- **Network effect incumbency** — LinkedIn's 1B+ users create massive inertia; users may not adopt a second platform
- **Funding competition** — HR Tech is well-funded; well-capitalized competitors could build similar features quickly

---

## 6. Business Model Analysis

### 6.1 Revenue Streams

| Stream | Model | Est. Revenue Potential |
|--------|-------|----------------------|
| **Individual Pro** | Freemium → $9-15/mo subscription | Auto-updates, advanced analytics, custom domain, priority support |
| **Recruiter Tier** | Per-seat SaaS: $99-199/mo | Full graph access, cluster search, talent analytics, InMail-equivalent |
| **API / Agent Access** | Usage-based: $0.01-0.05 per query | MCP tool calls, bulk queries, agent integration tokens |
| **Enterprise** | Annual contract: $10K-100K/yr | Internal skill mapping, team graphs, custom deployment |
| **Data Insights** (anonymized) | Aggregate market reports | Talent supply/demand trends, skill distribution, salary benchmarking |

### 6.2 Unit Economics (Projected)

| Metric | Individual (Pro) | Recruiter | API/Agent |
|--------|-----------------|-----------|-----------|
| ARPU (monthly) | $12 | $149 | $50 |
| CAC | $5–15 | $200–500 | $100–300 |
| LTV (24-mo) | $288 | $3,576 | $1,200 |
| LTV:CAC ratio | 19:1–58:1 | 7:1–18:1 | 4:1–12:1 |
| Gross margin | ~85% | ~80% | ~90% |

### 6.3 Cost Structure

| Cost Category | Details | Est. Monthly (at 100K users) |
|---------------|---------|------------------------------|
| **Infrastructure** | Neo4j hosting, compute, storage | $3K–8K |
| **AI/LLM APIs** | Anthropic Claude, LLM Whisperer, Whisper ASR | $2K–10K (scales with usage) |
| **Ollama compute** | GPU instances for local classification | $1K–5K |
| **Auth/Security** | Google OAuth, encryption overhead | Minimal |
| **Bandwidth/CDN** | 3D visualization assets, API traffic | $500–2K |
| **Total** | | ~$8K–25K/mo |

---

## 7. Go-to-Market Strategy Recommendations

### 7.1 Phase 1: Developer & Researcher Adoption (Months 1–6)

- **Target:** Software engineers, data scientists, researchers
- **Channel:** Product Hunt launch, Hacker News, dev Twitter/X, Reddit (r/cscareerquestions, r/datascience)
- **Hook:** "Your CV is a knowledge graph. Paste your orb link into Claude and ask it anything."
- **Growth loop:** Share orb link → recipient sees impressive 3D graph → signs up to create their own
- **Key action:** Add LinkedIn profile import to dramatically lower onboarding friction

### 7.2 Phase 2: Network Activation (Months 6–12)

- **Target:** Teams, collaborators, academic groups
- **Feature:** Orb-to-orb connections, team graphs, collaboration visualization
- **Channel:** University partnerships, conference sponsorships, open-source community outreach
- **Hook:** "See how your professional graph connects to your colleagues"
- **Key action:** Implement invite/referral system with visual network growth

### 7.3 Phase 3: Recruiter Monetization (Months 12–18)

- **Target:** Technical recruiters, talent sourcers, recruiting agencies
- **Feature:** Recruiter dashboard, graph search, talent analytics, candidate clustering
- **Channel:** Direct sales, HR Tech conferences, partnerships with ATS vendors
- **Hook:** "Search the professional graph, not just keywords. Find candidates by connections, not just titles."
- **Key action:** Build payment infrastructure (Stripe), recruiter analytics dashboard

### 7.4 Phase 4: AI Agent Ecosystem (Months 18–24)

- **Target:** AI agent developers, HR Tech platforms, automation builders
- **Feature:** MCP marketplace, API documentation portal, SDKs
- **Channel:** AI/ML conferences, developer documentation, MCP ecosystem partnerships
- **Hook:** "The professional identity layer for the agentic web"
- **Key action:** Launch API pricing, developer portal, and partnership program

---

## 8. Key Metrics to Track

### Growth Metrics
| Metric | Target (Year 1) |
|--------|-----------------|
| Total orbs created | 100K |
| Monthly active users | 30K |
| Orb-to-orb connections | 50K |
| Weekly orb shares (link clicks) | 20K |
| MCP tool queries | 100K/month |

### Engagement Metrics
| Metric | Target |
|--------|--------|
| Onboarding completion rate | >60% |
| 7-day retention | >40% |
| 30-day retention | >25% |
| Avg. nodes per orb | >15 |
| Orbs with "Open to Work" flag | >30% |

### Revenue Metrics
| Metric | Target (Year 1) |
|--------|-----------------|
| ARR | $1–2M |
| Paid conversion rate (individual) | 5–8% |
| Recruiter seats sold | 500–1K |
| API paying customers | 50–100 |
| Net Revenue Retention | >110% |

---

## 9. Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LinkedIn launches similar feature | Medium | High | Move fast; build MCP ecosystem moat before incumbents react |
| MCP protocol doesn't achieve adoption | Low-Medium | High | Support multiple protocols (REST, GraphQL, JSON-LD) alongside MCP |
| Cold-start / low user density | High | Medium | Seed with developer communities; orbs are valuable even without network |
| GDPR/privacy compliance complexity | Medium | Medium | Privacy-by-design already in architecture; invest in compliance early |
| AI API cost escalation | Medium | Medium | Hybrid model (local Ollama + cloud APIs); optimize inference costs |
| User data quality / sparse graphs | Medium | Medium | Guided onboarding, voice input, CV auto-extraction minimize empty orbs |

---

## 10. Strategic Recommendations

1. **Prioritize LinkedIn import** — this is the single highest-leverage feature for reducing onboarding friction. Users have years of data on LinkedIn; let them port it in one click.

2. **Build payment infrastructure now** — Stripe integration, subscription management, and recruiter tier pricing should be implemented before the recruiter GTM push.

3. **Position as infrastructure, not just a product** — the long-term value is in being the "professional identity layer for AI agents." MCP-native design is a genuine differentiator; lean into it.

4. **Expand authentication options** — Google-only login limits the addressable market. Add email/password, GitHub OAuth, and Microsoft OAuth.

5. **Mobile-first consideration** — while 3D visualization is powerful on desktop, a mobile companion app (even simplified) would increase daily engagement.

6. **Open-source the orb format** — publishing the graph schema as an open standard (like JSON-LD for professional identity) could drive ecosystem adoption and position Orbis as the reference implementation.

7. **Academic partnerships** — researchers are early adopters of structured data tools and have strong collaboration networks. University partnerships could seed dense, connected graph clusters.

8. **Enterprise pilot program** — companies using Orbis internally for skill mapping and team composition could be a high-value B2B revenue stream.

---

## 11. Conclusion

Orbis is positioned at the intersection of three major trends: the AI agent revolution, professional identity portability, and graph-based knowledge representation. The technical architecture — Neo4j + MCP + vector embeddings + E2E encryption — is well-suited to the emerging agentic web where professional data needs to be structured, queryable, and permissioned.

The primary risks are adoption (cold-start) and incumbent response (LinkedIn). The primary opportunities are in becoming the de facto professional identity layer for AI agents and building a two-sided marketplace connecting talent with recruiters through graph intelligence rather than keyword matching.

With strong execution on onboarding, network growth, and recruiter monetization, Orbis has a credible path to $30–50M ARR within 3 years and a defensible position as the GraphRAG professional identity platform.

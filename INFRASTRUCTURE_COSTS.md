# Orbis — Infrastructure Cost Analysis

*Date: March 2026*

---

## 1. Infrastructure Overview

Orbis runs on **6 core components**: 3 self-hosted Docker services, 2 paid external APIs, and 1 free external service. This analysis prices each component across four scale tiers.

```
┌────────────────────────────────────────────────────────────────────┐
│                        COST CLASSIFICATION                         │
├──────────────────────┬─────────────────────────────────────────────┤
│  SELF-HOSTED (CapEx) │  EXTERNAL APIs (OpEx)                      │
│  ─────────────────── │  ────────────────────                      │
│  Neo4j Community     │  Anthropic Claude API  ← PER CV UPLOAD     │
│  Ollama (llama3.2)   │  LLM Whisperer API     ← PER PDF UPLOAD   │
│  Whisper ASR         │  Google OAuth           ← FREE             │
│  FastAPI Backend     │                                             │
│  React Frontend      │                                             │
└──────────────────────┴─────────────────────────────────────────────┘
```

---

## 2. Component-by-Component Cost Breakdown

### 2.1 Neo4j Graph Database (REQUIRED — Self-hosted)

**Current setup:** `neo4j:5-community` Docker image, Community Edition (free license).

| Scale Tier | Users | Nodes in DB | Recommended Instance | Storage | Monthly Cost |
|------------|-------|-------------|---------------------|---------|-------------|
| Dev/MVP | <1K | <50K | 2 vCPU, 4 GB RAM | 20 GB SSD | $15–30 |
| Startup | 1K–10K | 50K–500K | 4 vCPU, 16 GB RAM | 100 GB SSD | $80–150 |
| Growth | 10K–100K | 500K–5M | 8 vCPU, 32 GB RAM | 500 GB SSD | $250–500 |
| Scale | 100K–1M | 5M–50M | 16 vCPU, 64 GB RAM (clustered) | 2 TB SSD | $800–2,000 |

**Key cost drivers:**
- **Vector indexes** — 5 vector indexes (1536-dim, cosine similarity) for Education, WorkExperience, Certification, Publication, Project. Memory-intensive; each index requires ~6 KB/node × node count.
- **At 100K users × 15 avg nodes/user = 1.5M nodes** → vector index memory: ~9 GB
- **Community vs Enterprise:** Community Edition is free but lacks clustering, hot backup, and role-based access. Enterprise license: ~$36K–65K/year at growth stage.
- **Cloud alternative:** Neo4j AuraDB Professional: $0.09/GB-hour → ~$65–200/mo for growth tier.

**Recommendation:** Stay on Community Edition until 50K+ users, then evaluate AuraDB or Enterprise for HA.

---

### 2.2 Ollama — Local LLM Inference (REQUIRED — Self-hosted)

**Current setup:** `ollama/ollama:latest` running `llama3.2:3b` for CV classification.

| Scale Tier | CV Uploads/day | Concurrency | Recommended Instance | Monthly Cost |
|------------|---------------|-------------|---------------------|-------------|
| Dev/MVP | <50 | 1 | CPU-only: 2 vCPU, 8 GB RAM | $30–60 |
| Startup | 50–500 | 2–3 | 1× NVIDIA T4 GPU (16 GB) | $150–350 |
| Growth | 500–5K | 5–10 | 2× NVIDIA T4 or 1× A10G (24 GB) | $400–900 |
| Scale | 5K–50K | 20+ | 4× A10G or 2× A100 (80 GB) | $2,000–6,000 |

**Key cost drivers:**
- `llama3.2:3b` model: ~2 GB VRAM, ~3 sec/inference on T4 GPU, ~15 sec on CPU
- Each CV upload triggers 1 classification call with up to 12,000 chars input
- **GPU is the dominant cost** — CPU works for MVP but becomes a bottleneck at >50 uploads/day
- No per-call API cost (self-hosted), but infrastructure cost scales with concurrency

**Cloud GPU pricing (reference):**
| Provider | GPU | On-Demand/hr | Spot/hr | Monthly (on-demand) |
|----------|-----|-------------|---------|-------------------|
| AWS | g4dn.xlarge (T4) | $0.526 | $0.16 | $380 |
| AWS | g5.xlarge (A10G) | $1.006 | $0.30 | $725 |
| GCP | n1-standard-4 + T4 | $0.45 | $0.14 | $325 |
| Lambda Labs | 1× A10 | $0.75 | — | $540 |
| RunPod | 1× A10G | $0.38 | — | $274 |

**Recommendation:** Use CPU for MVP. Move to spot T4 instances at startup stage. Consider replacing Ollama with a cheaper cloud LLM API (e.g., Claude Haiku, GPT-4o-mini) at scale if GPU cost exceeds API cost.

---

### 2.3 Whisper ASR — Speech-to-Text (OPTIONAL — Self-hosted)

**Current setup:** `onerahmet/openai-whisper-asr-webservice:latest` with `base` model.

| Scale Tier | Audio Uploads/day | Recommended Instance | Monthly Cost |
|------------|------------------|---------------------|-------------|
| Dev/MVP | <20 | Shared with Ollama instance | $0 (bundled) |
| Startup | 20–200 | 2 vCPU, 4 GB RAM (CPU) | $30–60 |
| Growth | 200–2K | 1× T4 GPU (shared with Ollama) | $0 (bundled) |
| Scale | 2K+ | Dedicated GPU or switch to API | $200–500 |

**Key notes:**
- Whisper `base` model: ~150 MB, runs on CPU in ~5–10 sec per audio clip
- Audio file limit: 25 MB per upload
- **Optional feature** — many users will use CV upload or manual entry instead
- **Alternative:** OpenAI Whisper API at $0.006/minute would cost ~$0.03 per avg 5-min audio. At 1K uploads/day = ~$900/mo. Self-hosted is cheaper until ~10K daily uploads.

**Recommendation:** Keep self-hosted on shared infrastructure. Only separate at very high volume.

---

### 2.4 Anthropic Claude API (REQUIRED — External, Pay-per-use)

**Current setup:** `claude-sonnet-4-20250514` for CV refinement in `refiner.py`.

**Per-CV-upload cost estimate:**
| Component | Tokens | Rate (Sonnet) | Cost |
|-----------|--------|---------------|------|
| Input (system prompt + CV text + partial extraction) | ~3,000–5,000 tokens | $3.00/M input tokens | $0.009–0.015 |
| Output (structured JSON nodes) | ~2,000–4,000 tokens | $15.00/M output tokens | $0.030–0.060 |
| **Total per CV upload** | | | **$0.04–0.08** |

**Monthly cost by scale:**
| Scale Tier | CV Uploads/month | Claude API Cost/month |
|------------|-----------------|----------------------|
| Dev/MVP | 500 | $20–40 |
| Startup | 5,000 | $200–400 |
| Growth | 50,000 | $2,000–4,000 |
| Scale | 500,000 | $20,000–40,000 |

**Cost optimization options:**
1. **Switch to Claude Haiku** ($0.25/$1.25 per M tokens) → ~$0.005–0.01/CV → **8× cheaper**
2. **Batch API** (50% discount) → available for non-real-time processing
3. **Cache system prompts** → prompt caching reduces input cost by ~90% for repeated system prompts
4. **Replace with local model** at scale → use fine-tuned llama for refinement, eliminating API cost entirely

**Recommendation:** Use Sonnet for quality at MVP. Switch to Haiku with prompt caching at growth stage. Evaluate local fine-tuned model at scale.

---

### 2.5 LLM Whisperer API (REQUIRED for PDF uploads — External, Pay-per-use)

**Current setup:** Unstract LLM Whisperer API (`eu-west` endpoint) for PDF text extraction.

**Per-PDF cost estimate:**
| Plan | Pages/month | Cost/page | Monthly Cost |
|------|-------------|-----------|-------------|
| Free | 100 pages | $0 | $0 |
| Starter | 2,000 pages | $0.02 | $40 |
| Growth | 10,000 pages | $0.015 | $150 |
| Enterprise | Custom | Negotiable | Custom |

**Assuming avg 2-page CV:**
| Scale Tier | PDF Uploads/month | Pages/month | LLM Whisperer Cost/month |
|------------|------------------|-------------|-------------------------|
| Dev/MVP | 250 | 500 | $0–10 |
| Startup | 2,500 | 5,000 | $75–100 |
| Growth | 25,000 | 50,000 | $750–1,000 |
| Scale | 250,000 | 500,000 | $5,000–7,500 |

**Cost optimization options:**
1. **PyMuPDF fallback** — already imported in the codebase (`pymupdf`). Use for simple, text-based PDFs; reserve LLM Whisperer for complex layouts/tables
2. **Self-hosted alternative** — Apache Tika, pdf2text, or Docling (open-source) for basic extraction
3. **Hybrid approach** — PyMuPDF first, detect quality, escalate to LLM Whisperer only when needed → could reduce API calls by 50–70%

**Recommendation:** Implement PyMuPDF as primary parser with LLM Whisperer as fallback. This alone could save $500–5,000/mo at growth stage.

---

### 2.6 Google OAuth (REQUIRED — Free)

- **Cost:** $0 at all scales
- **Rate limits:** 10,000 requests/100 seconds per project (more than sufficient)
- **Only consideration:** If adding Microsoft or GitHub OAuth, those are also free-tier

---

### 2.7 Embedding Model (PRODUCTION REQUIREMENT — Not yet implemented)

**Current state:** Placeholder hash-based embedding (`_simple_embedding` in `embeddings.py`). Production deployment needs a real model.

| Option | Cost Model | Quality | Monthly Cost (at 100K nodes) |
|--------|-----------|---------|------------------------------|
| **OpenAI text-embedding-3-small** | $0.02/M tokens | Good | $5–15 |
| **OpenAI text-embedding-3-large** | $0.13/M tokens | Better | $30–100 |
| **Voyage AI voyage-3** | $0.06/M tokens | Best for code/tech | $15–45 |
| **Local sentence-transformers** | Self-hosted | Good | $0 (infra cost only) |
| **Ollama nomic-embed-text** | Self-hosted | Good | $0 (share Ollama infra) |

**Recommendation:** Use `nomic-embed-text` on the existing Ollama infrastructure for zero marginal cost, or OpenAI `text-embedding-3-small` for $5–15/mo.

---

### 2.8 Frontend Hosting & CDN

| Option | Features | Monthly Cost |
|--------|----------|-------------|
| **Vercel** (Free tier) | 100 GB bandwidth, serverless | $0 |
| **Vercel** (Pro) | 1 TB bandwidth, analytics | $20 |
| **Cloudflare Pages** | Unlimited bandwidth | $0 |
| **AWS CloudFront + S3** | Full control, custom domain | $5–50 |
| **Netlify** (Pro) | 1 TB bandwidth | $19 |

**Key note:** The React + Three.js bundle is likely 1–3 MB. 3D visualization assets could add 5–20 MB. At 100K monthly visits → ~2–6 TB bandwidth.

**Recommendation:** Cloudflare Pages (free, unlimited bandwidth) or Vercel Pro ($20/mo).

---

### 2.9 Backend Hosting (FastAPI)

| Scale Tier | Users | Recommended Setup | Monthly Cost |
|------------|-------|-------------------|-------------|
| Dev/MVP | <1K | 1× 2 vCPU, 4 GB RAM | $15–30 |
| Startup | 1K–10K | 2× 2 vCPU, 4 GB RAM (load balanced) | $40–80 |
| Growth | 10K–100K | 4× 4 vCPU, 8 GB RAM + LB | $200–400 |
| Scale | 100K–1M | K8s cluster, autoscaling | $500–2,000 |

**Alternative:** Serverless (AWS Lambda / GCP Cloud Run) — pay per request, $0 at idle.

---

## 3. Total Cost Summary by Scale Tier

### Dev/MVP Tier (<1K users)

| Component | Monthly Cost |
|-----------|-------------|
| Neo4j (Community, shared VM) | $15–30 |
| Ollama (CPU, shared VM) | $0 (bundled) |
| Whisper (CPU, shared VM) | $0 (bundled) |
| FastAPI backend (shared VM) | $0 (bundled) |
| **Single VM total (4 vCPU, 16 GB)** | **$40–80** |
| Frontend hosting (Cloudflare) | $0 |
| Claude API (~500 CVs) | $20–40 |
| LLM Whisperer (~500 pages) | $0–10 |
| Embedding model | $0–5 |
| Domain + DNS | $12/yr → $1 |
| **TOTAL** | **$60–135/mo** |

### Startup Tier (1K–10K users)

| Component | Monthly Cost |
|-----------|-------------|
| Neo4j (dedicated, 4 vCPU / 16 GB) | $80–150 |
| Ollama (1× T4 GPU spot) | $150–350 |
| Whisper (shared w/ backend) | $30–60 |
| FastAPI backend (2× instances) | $40–80 |
| Frontend hosting | $0–20 |
| Claude API (~5K CVs) | $200–400 |
| LLM Whisperer (~5K pages) | $75–100 |
| Embedding model | $5–15 |
| Monitoring (Grafana Cloud free) | $0 |
| **TOTAL** | **$580–1,175/mo** |

### Growth Tier (10K–100K users)

| Component | Monthly Cost |
|-----------|-------------|
| Neo4j (8 vCPU / 32 GB, 500 GB) | $250–500 |
| Ollama (2× T4 or 1× A10G) | $400–900 |
| Whisper (bundled w/ Ollama) | $0 (bundled) |
| FastAPI backend (4× instances + LB) | $200–400 |
| Frontend hosting + CDN | $20–50 |
| Claude API (~50K CVs, Haiku) | $250–500 |
| LLM Whisperer (w/ PyMuPDF fallback) | $200–400 |
| Embedding model | $15–45 |
| Monitoring + logging | $50–100 |
| Backup + disaster recovery | $50–100 |
| **TOTAL** | **$1,435–2,995/mo** |

### Scale Tier (100K–1M users)

| Component | Monthly Cost |
|-----------|-------------|
| Neo4j (Enterprise or AuraDB cluster) | $800–3,000 |
| Ollama (4× A10G or fine-tuned local) | $2,000–6,000 |
| Whisper (dedicated or API) | $200–500 |
| FastAPI backend (K8s autoscaling) | $500–2,000 |
| Frontend CDN | $50–200 |
| Claude API (Haiku + caching + batch) | $2,000–5,000 |
| LLM Whisperer (hybrid w/ PyMuPDF) | $1,500–3,000 |
| Embedding model | $50–200 |
| Monitoring + observability | $200–500 |
| Security + compliance | $200–500 |
| Backup + DR + multi-region | $300–1,000 |
| **TOTAL** | **$7,800–21,900/mo** |

---

## 4. Cost per User Analysis

| Scale Tier | Users | Total Monthly | Cost/User/Month | Revenue Needed/User |
|------------|-------|---------------|----------------|-------------------|
| Dev/MVP | 1K | ~$100 | $0.10 | Freemium OK |
| Startup | 10K | ~$875 | $0.09 | Freemium OK |
| Growth | 100K | ~$2,200 | $0.02 | Freemium OK |
| Scale | 1M | ~$15,000 | $0.015 | Freemium OK |

**Key insight:** Infrastructure cost per user **decreases** with scale. Even at MVP, cost/user is well under $0.50/mo, making the freemium model viable. A 5% paid conversion at $12/mo generates $0.60/user blended — covering infrastructure with healthy margins.

---

## 5. Cost Hotspots & Optimization Roadmap

### Biggest cost drivers ranked (at Growth tier):

| Rank | Component | Monthly Cost | % of Total | Optimization Available |
|------|-----------|-------------|-----------|----------------------|
| 1 | **Ollama GPU** | $400–900 | 28% | Replace with cloud LLM API if cheaper; batch processing |
| 2 | **Neo4j** | $250–500 | 17% | Stay Community; shard at 1M+ users |
| 3 | **Claude API** | $250–500 | 17% | Haiku, prompt caching, batch API |
| 4 | **FastAPI backend** | $200–400 | 14% | Autoscaling, serverless for bursty traffic |
| 5 | **LLM Whisperer** | $200–400 | 14% | PyMuPDF fallback (saves 50–70%) |
| 6 | **All other** | $135–295 | 10% | Already optimized |

### Priority optimizations:

1. **PyMuPDF-first PDF parsing** — saves $100–300/mo at growth, $1K–2K at scale
2. **Claude Haiku for refinement** — 8× cheaper than Sonnet, acceptable quality for structured extraction
3. **Prompt caching** — reduces Claude input token costs by ~90% for the repeated system prompt
4. **Ollama on spot instances** — 60–70% cheaper than on-demand GPU
5. **Batch CV processing** — queue uploads, process in batches → higher GPU utilization, lower idle cost
6. **Nomic embeddings on Ollama** — zero marginal cost for embeddings using existing GPU

---

## 6. Break-Even Analysis

**Assuming Growth tier ($2,200/mo average):**

| Revenue Source | Price | Users Needed to Break Even |
|----------------|-------|---------------------------|
| Individual Pro only ($12/mo) | $12/mo | 184 paid users (1,840 total at 10% conversion) |
| Recruiter only ($149/mo) | $149/mo | 15 recruiter seats |
| Mixed (90% free, 5% Pro, 5% Recruiter) | Blended $8.05/mo | 274 paying users (5,480 total) |
| API access only ($50/mo) | $50/mo | 44 API customers |

**Orbis reaches profitability at approximately 5,000–6,000 total users** with a reasonable conversion mix. This is achievable within 3–6 months of launch with developer-community targeting.

---

## 7. Infrastructure Decision Matrix

| Decision Point | Current | Recommended (Growth) | Recommended (Scale) |
|---------------|---------|---------------------|-------------------|
| Neo4j edition | Community (free) | Community (free) | Enterprise or AuraDB |
| LLM for classification | Ollama (local) | Ollama on spot GPU | Fine-tuned local or API |
| PDF extraction | LLM Whisperer only | PyMuPDF + LLM Whisperer fallback | Self-hosted pipeline |
| CV refinement | Claude Sonnet | Claude Haiku + caching | Local fine-tuned model |
| Embeddings | Placeholder hash | Ollama nomic-embed-text | Dedicated embedding service |
| Speech-to-text | Whisper local | Whisper local | OpenAI Whisper API |
| Frontend CDN | None | Cloudflare Pages | Cloudflare + edge caching |
| Backend hosting | Single VM | Multi-instance + LB | Kubernetes autoscaling |
| Monitoring | None | Grafana Cloud (free) | Datadog / Grafana Pro |

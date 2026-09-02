# RAG Eval Framework

> Benchmark 5 RAG retrieval strategies in parallel using LangGraph agents. Know which one to ship — and exactly why the others failed — in under 10 minutes.

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat&logo=next.js&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-agent-1C3C3C?style=flat)
![pgvector](https://img.shields.io/badge/pgvector-Neon-00E699?style=flat)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat)

**GitHub:** https://github.com/ritikakaushik-18/RAG_EVAL_APP

---

## What it does

- **Upload any PDF** → automatically chunks, embeds with `all-MiniLM-L6-v2` (local, free), and stores vectors in pgvector
- **Runs 5 retrieval strategies in parallel** via LangGraph `Send()` fan-out — 9 seconds vs 25+ seconds sequential
- **LLM-as-judge scoring** evaluates faithfulness, correctness, and completeness per strategy then declares a winner
- **Failure attribution** pinpoints root cause per strategy: embedding weakness, retrieval logic, or generation failure
- **CI/CD regression gates** via GitHub Action blocks merges when quality drops below your baseline threshold
- **Synthetic test generator** auto-creates Q&A pairs from your documents with Microsoft Presidio PII scrubbing and one-click OSFI-compliant audit export

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Eval time (parallel) | ~9 seconds |
| Eval time (sequential) | ~25 seconds |
| Cost per full evaluation | ~$0.002 |
| Embedding dimensions | 384 |
| Default chunk size | 512 chars |
| Chunk overlap | 50 chars |
| E2E tests passing | 16/16 |
| PII entity types detected | PERSON, ORG, LOCATION, DATE |

---

## Screenshot

<!-- Replace with actual screenshot after deploy -->
![RAG Eval Dashboard](./docs/screenshot.png)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       RAG Eval Framework                         │
│                                                                  │
│  ┌───────────────┐        ┌──────────────────────────────────┐  │
│  │  Next.js 14   │        │        FastAPI Backend            │  │
│  │   Frontend    │◀──────▶│                                  │  │
│  │               │  HTTP  │  POST /documents/upload           │  │
│  │  / (upload)   │        │  POST /documents/{id}/ingest      │  │
│  │  /eval/[id]   │        │  POST /eval/run                   │  │
│  └───────────────┘        │  GET  /eval/{id}                  │  │
│                            └──────────────┬───────────────────┘  │
│                                           │                       │
│                            ┌──────────────▼───────────────────┐  │
│                            │       LangGraph Agent             │  │
│                            │                                   │  │
│                            │  run_strategies ──Send──▶ ×5     │  │
│                            │    naive / hybrid / rerank        │  │
│                            │    hyde / parent-child            │  │
│                            │                                   │  │
│                            │  dispatch_judges ──Send──▶ ×5    │  │
│                            │    LLM judge (OpenRouter)         │  │
│                            │                                   │  │
│                            │  aggregate_results (winner)       │  │
│                            └──────────┬──────────┬────────────┘  │
│                                       │          │                │
│                            ┌──────────▼──┐  ┌───▼──────────┐    │
│                            │  Neon (PG)  │  │   AWS S3     │    │
│                            │  pgvector   │  │  PDF storage │    │
│                            └─────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## The 5 Retrieval Strategies

| # | Strategy | Description |
|---|----------|-------------|
| 1 | **Naive RAG** | Pure cosine-similarity vector search. Fast baseline. |
| 2 | **Hybrid BM25 + Vector** | Combines pgvector semantic search with PostgreSQL full-text search, fused via Reciprocal Rank Fusion (RRF). |
| 3 | **Cohere Rerank** | Vector search retrieves 20 candidates; Cohere `rerank-english-v3.0` reranks to top 5. |
| 4 | **HyDE** | Uses an LLM to generate a _hypothetical answer_, embeds that, then searches with the hypothetical embedding instead of the raw query. |
| 5 | **Parent-Child** | Matches on small child chunks but returns the surrounding parent context (±3 chunks), giving richer answers. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TailwindCSS, App Router |
| Backend | FastAPI, Python 3.11, async SQLAlchemy |
| Agent | LangGraph (fan-out/fan-in with Send) |
| Database | Neon PostgreSQL + pgvector |
| Embeddings | `sentence-transformers` / `all-MiniLM-L6-v2` (local, free) |
| Reranking | Cohere `rerank-english-v3.0` |
| LLM Judge | OpenRouter (`anthropic/claude-3-haiku`) |
| File Storage | AWS S3 |
| Tracing | LangSmith |
| Deploy (FE) | Vercel |
| Deploy (BE) | Render |

---

## Run Locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Neon PostgreSQL database with pgvector enabled
- AWS S3 bucket
- OpenRouter API key
- Cohere API key

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/rag-eval-framework.git
cd rag-eval-framework
```

### 2. Configure environment variables

Copy the example and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:

```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_BUCKET_NAME=rag-eval-docs
AWS_REGION=us-east-2
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-3-haiku
COHERE_API_KEY=...
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=rag-eval
LANGSMITH_TRACING=true
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

### 3. Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The first startup creates all database tables automatically.

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**.

### 5. Run your first evaluation

1. Click **Upload PDF** and select any PDF
2. Wait for ingestion to complete (17–50 chunks typical)
3. Click **Run Eval** on the document
4. Enter a query and the expected correct answer
5. Watch the leaderboard populate as results stream in (~30s)

---

## Deploy

### Backend → Render

1. Push this repo to GitHub
2. Go to render.com → New → Web Service
3. Connect your GitHub repo
4. Set Root Directory to: `backend`
5. Set Build Command: `pip install -r requirements.txt`
6. Set Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
7. Add all environment variables from your `.env` (no quotes around values)
8. Select Free tier
9. Deploy

> **Note:** Free tier spins down after 15 minutes of inactivity. Use [cron-job.org](https://cron-job.org) to ping `/health` every 14 minutes to keep it alive.

### Frontend → Vercel

1. Import the repo on **vercel.com/new**
2. Set **Root Directory** to `frontend`
3. Add environment variable: `NEXT_PUBLIC_API_URL` = your Render backend URL (e.g. `https://rag-eval-api.onrender.com`)
4. Deploy — Vercel handles the rest

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check (DB, S3, OpenRouter) |
| `POST` | `/documents/upload` | Upload a PDF (multipart/form-data) |
| `POST` | `/documents/{id}/ingest` | Chunk, embed, and store a document |
| `GET` | `/documents` | List all uploaded documents |
| `POST` | `/retrieve/test` | Test a single retrieval strategy |
| `POST` | `/eval/run` | Start a full evaluation (async, returns immediately) |
| `GET` | `/eval/{id}` | Poll evaluation status and results |
| `POST` | `/baselines` | Create a baseline from an eval run |
| `GET` | `/baselines` | List all baselines |
| `POST` | `/ci/run` | Run CI evaluation against baseline |
| `GET` | `/ci/{id}` | Get CI run results + GitHub PR markdown |
| `POST` | `/datasets/generate` | Generate synthetic test set with PII scrubbing |
| `GET` | `/datasets/{id}` | Get test set with all Q&A items |
| `GET` | `/datasets/{id}/export` | Download audit package ZIP |
| `POST` | `/api-keys` | Generate API key for CI/CD integration |

---

## Advanced Features

### CI/CD Regression Gates

Add to your repo to gate RAG quality on PRs. Copy the workflow file from `.github/workflows/rag-eval.yml`.

Add these GitHub secrets to your repo:

| Secret | Value |
|--------|-------|
| `RAGEVAL_API_URL` | your deployed backend URL |
| `RAGEVAL_API_KEY` | generated in Settings page |
| `RAGEVAL_BASELINE_ID` | from /baselines page |
| `RAGEVAL_TEST_QUERY` | your test question |
| `RAGEVAL_CORRECT_ANSWER` | ground truth answer |
| `RAGEVAL_DOCUMENT_ID` | document UUID |

Every PR will automatically post a quality gate result as a comment and block merges if scores drop below your baseline.

### Synthetic Test Set Generation

No ground truth data? No problem.

1. Upload your documents
2. Go to `/datasets` → Generate New Test Set
3. AI generates realistic Q&A pairs from your document content automatically
4. Microsoft Presidio scrubs PII before storage
5. Download one-click audit ZIP containing: `questions.csv`, `scrub_report.json`, `metadata.json`, `summary.pdf`

Designed for OSFI Guideline E-23 compliance in Canadian regulated industries.

### End-to-End Tests

Run the full test suite:

```bash
python backend/test_e2e.py
```

16/16 tests passing covering every feature. Total time: ~46 seconds. Cost: ~$0.002.

---

## Testing

The test suite generates a sample PDF automatically — no external files needed.
Just run:

```bash
python backend/test_e2e.py
```

This runs a full end-to-end test against a locally running backend (`http://localhost:8000`), covering upload, ingestion, retrieval, evaluation, baselines, CI gates, synthetic dataset generation, and audit export. The temporary PDF is deleted automatically when the suite finishes.

---

## Author

**Ritika Kaushik**

- LinkedIn: [linkedin.com/in/ritika-kaushik-30ab68284](https://www.linkedin.com/in/ritika-kaushik-30ab68284/)

---

## License

MIT — do whatever you want with it.

---

## Contributing

Contributions welcome. Open an issue first to discuss what you would like to change.

---

## Star History

⭐ If this project helped you, please star the repo — it helps others find it too.

**GitHub:** https://github.com/ritikakaushik-18/RAG_EVAL_APP

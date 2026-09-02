import sys
print(f"Python version: {sys.version}", flush=True)
print("Starting imports...", flush=True)

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
print("dotenv loaded", flush=True)

import logging
import time
import uuid
import asyncio
from contextlib import asynccontextmanager
from typing import List, Optional
print("stdlib imported", flush=True)

import hashlib
import secrets

import boto3
import httpx
from botocore.exceptions import BotoCoreError, ClientError
print("boto3/httpx imported", flush=True)

import csv
import io as _io
import json as _json
import re
import zipfile

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
print("FastAPI imported", flush=True)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
print("SQLAlchemy imported", flush=True)

from config import settings
print("Config imported", flush=True)

from database import AsyncSessionLocal, check_db_connection, create_tables, get_db
print("Database imported", flush=True)

from models import Document, EvalRun, EvalResult, Baseline, CIRun, APIKey, TestSet, TestSetItem, BatchEval
print("Models imported", flush=True)

from ci import compare_runs
print("CI imported", flush=True)

from synthetic import generate_test_set, build_summary_pdf
print("Synthetic imported", flush=True)

from ingestion import ingest_document
print("Ingestion imported", flush=True)

from retrieval import STRATEGIES
print("Retrieval imported", flush=True)

from agent import run_eval
print("Agent imported", flush=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — creating database tables if needed...")
    await create_tables()
    logger.info("LangSmith tracing : %s", os.getenv("LANGCHAIN_TRACING_V2"))
    logger.info("LangSmith project : %s", os.getenv("LANGCHAIN_PROJECT"))
    logger.info("LangSmith key set : %s", bool(os.getenv("LANGCHAIN_API_KEY")))
    logger.info("Startup complete.")
    yield
    logger.info("Shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="RAG Eval Framework",
    description="Benchmarks retrieval strategies against each other.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# S3 client (lazy singleton)
# ---------------------------------------------------------------------------

_s3_client = None


def get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _s3_client


async def check_s3_connection() -> bool:
    try:
        s3 = get_s3()
        s3.head_bucket(Bucket=settings.AWS_BUCKET_NAME)
        return True
    except (BotoCoreError, ClientError) as e:
        logger.error("S3 health check failed: %s", e)
        return False


async def check_openrouter_connection() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            )
            return resp.status_code == 200
    except Exception as e:
        logger.error("OpenRouter health check failed: %s", e)
        return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    logger.info("Health check requested.")
    db_ok, s3_ok, openrouter_ok = await _run_health_checks()
    overall = "healthy" if all([db_ok, s3_ok, openrouter_ok]) else "degraded"
    return {
        "status": overall,
        "database": "connected" if db_ok else "unreachable",
        "s3": "connected" if s3_ok else "unreachable",
        "openrouter": "connected" if openrouter_ok else "unreachable",
    }


async def _run_health_checks():
    import asyncio
    db_ok, s3_ok, openrouter_ok = await asyncio.gather(
        check_db_connection(),
        check_s3_connection(),
        check_openrouter_connection(),
    )
    return db_ok, s3_ok, openrouter_ok


_MAX_UPLOAD_FILES = 10
_MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB


@app.post("/documents/upload", status_code=201)
async def upload_documents(
    files: List[UploadFile] = File(...),
    tenant_id: str = Form(default="default"),
    db: AsyncSession = Depends(get_db),
):
    if len(files) > _MAX_UPLOAD_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {_MAX_UPLOAD_FILES} files per upload. Please upload in batches.",
        )

    saved_docs = []

    for file in files:
        if file.content_type not in ("application/pdf", "application/octet-stream") and not (
            file.filename or ""
        ).lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"{file.filename}: only PDF files are accepted.",
            )

        contents = await file.read()

        if not contents:
            raise HTTPException(status_code=400, detail=f"{file.filename} is empty.")

        if len(contents) > _MAX_FILE_BYTES:
            size_mb = round(len(contents) / (1024 * 1024))
            raise HTTPException(
                status_code=400,
                detail=f"{file.filename} exceeds 50MB limit ({size_mb}MB).",
            )

        document_id = str(uuid.uuid4())
        s3_key = f"documents/{tenant_id}/{document_id}/{file.filename}"

        logger.info("Uploading '%s' to S3 key '%s'", file.filename, s3_key)

        try:
            s3 = get_s3()
            s3.put_object(
                Bucket=settings.AWS_BUCKET_NAME,
                Key=s3_key,
                Body=contents,
                ContentType="application/pdf",
            )
            logger.info("S3 upload complete: %s", s3_key)
        except (BotoCoreError, ClientError) as e:
            logger.error("S3 upload failed for %s: %s", file.filename, e)
            raise HTTPException(status_code=502, detail=f"S3 upload failed for {file.filename}: {e}")

        doc = Document(
            id=document_id,
            filename=file.filename,
            s3_key=s3_key,
            chunk_count=0,
            tenant_id=tenant_id,
        )
        db.add(doc)
        saved_docs.append(doc)

    await db.commit()
    for doc in saved_docs:
        await db.refresh(doc)

    logger.info("Uploaded %d document(s) for tenant=%s", len(saved_docs), tenant_id)
    return {
        "documents": [
            {
                "document_id": doc.id,
                "filename": doc.filename,
                "s3_key": doc.s3_key,
                "tenant_id": doc.tenant_id,
                "created_at": doc.created_at,
            }
            for doc in saved_docs
        ],
        "count": len(saved_docs),
    }


@app.post("/documents/{document_id}/ingest")
async def ingest(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found.")

    logger.info("Ingest requested for document_id=%s", document_id)
    try:
        chunk_count = await ingest_document(document_id, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "document_id": document_id,
        "chunk_count": chunk_count,
        "status": "ingested",
    }


@app.get("/documents")
async def list_documents(
    tenant_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Document).order_by(Document.created_at.desc())
    if tenant_id:
        stmt = stmt.where(Document.tenant_id == tenant_id)

    result = await db.execute(stmt)
    docs = result.scalars().all()

    return [
        {
            "document_id": d.id,
            "filename": d.filename,
            "s3_key": d.s3_key,
            "chunk_count": d.chunk_count,
            "tenant_id": d.tenant_id,
            "created_at": d.created_at,
        }
        for d in docs
    ]


# ---------------------------------------------------------------------------
# Retrieval test endpoint
# ---------------------------------------------------------------------------

class RetrieveRequest(BaseModel):
    query: str
    document_ids: list[str]
    strategy: str  # naive | hybrid | rerank | hyde | parent_child


@app.post("/retrieve/test")
async def retrieve_test(
    body: RetrieveRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.strategy not in STRATEGIES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown strategy '{body.strategy}'. "
                   f"Valid options: {sorted(STRATEGIES)}",
        )
    if not body.document_ids:
        raise HTTPException(status_code=400, detail="document_ids must not be empty.")
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="query must not be empty.")

    logger.info(
        "Retrieve test: strategy=%s docs=%s query=%.80s",
        body.strategy, body.document_ids, body.query,
    )

    fn = STRATEGIES[body.strategy]
    try:
        chunks = await fn(body.query, body.document_ids, db, settings)
    except Exception as e:
        logger.exception("Retrieval failed for strategy '%s'", body.strategy)
        raise HTTPException(status_code=502, detail=str(e))

    return {"strategy": body.strategy, "query": body.query, "results": chunks}


# ---------------------------------------------------------------------------
# Evaluation endpoints
# ---------------------------------------------------------------------------

class EvalRequest(BaseModel):
    query: str
    correct_answer: str
    document_ids: list[str]
    tenant_id: str = "default"


@app.post("/eval/run", status_code=202)
async def start_eval(body: EvalRequest, db: AsyncSession = Depends(get_db)):
    if not body.document_ids:
        raise HTTPException(status_code=400, detail="document_ids must not be empty.")
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="query must not be empty.")
    if not body.correct_answer.strip():
        raise HTTPException(status_code=400, detail="correct_answer must not be empty.")

    eval_run_id = str(uuid.uuid4())
    run = EvalRun(
        id=eval_run_id,
        tenant_id=body.tenant_id,
        status="running",
        document_ids=body.document_ids,
    )
    db.add(run)
    await db.commit()

    logger.info("Starting eval_run=%s  query=%.80s", eval_run_id, body.query)

    # Fire-and-forget: agent runs in the background; endpoint returns immediately
    asyncio.create_task(
        run_eval(
            eval_run_id=eval_run_id,
            query=body.query,
            correct_answer=body.correct_answer,
            document_ids=body.document_ids,
        )
    )

    return {
        "eval_run_id": eval_run_id,
        "status": "running",
        "message": "Evaluation started. Poll GET /eval/{eval_run_id} for results.",
    }


@app.get("/eval/runs")
async def list_eval_runs(
    tenant_id: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(EvalRun).order_by(EvalRun.created_at.desc()).limit(50)
    if tenant_id:
        stmt = stmt.where(EvalRun.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(EvalRun.status == status)
    result = await db.execute(stmt)
    runs = result.scalars().all()
    return [
        {
            "eval_run_id": r.id,
            "status":      r.status,
            "tenant_id":   r.tenant_id,
            "created_at":  r.created_at,
            "document_ids": r.document_ids,
        }
        for r in runs
    ]


@app.get("/eval/{eval_run_id}")
async def get_eval(eval_run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(EvalRun, eval_run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Eval run {eval_run_id} not found.")

    result = await db.execute(
        select(EvalResult)
        .where(EvalResult.eval_run_id == eval_run_id)
        .order_by(EvalResult.overall_score.desc().nullslast())
    )
    rows = result.scalars().all()

    # Identify winner (highest overall_score)
    winner = rows[0].strategy_name if rows else None

    strategies = [
        {
            "strategy":            r.strategy_name,
            "overall_score":       r.overall_score,
            "faithfulness":        r.faithfulness_score,
            "correctness":         r.correctness_score,
            "completeness":        r.completeness_score,
            "reasoning":           r.reasoning,
            "retrieved_answer":    r.retrieved_answer,
            "latency_ms":          r.latency_ms,
            "cost_usd":            r.cost_usd,
            "failure_attribution": r.failure_attribution,
            "recommendation":      r.recommendation,
        }
        for r in rows
    ]

    total_cost = sum(r.cost_usd or 0.0 for r in rows)

    return {
        "eval_run_id":            run.id,
        "status":                 run.status,
        "created_at":             run.created_at,
        "completed_at":           run.completed_at,
        "winner":                 winner,
        "total_cost_usd":         round(total_cost, 6),
        "overall_recommendation": run.overall_recommendation,
        "winner_explanation":     run.winner_explanation,
        "strategies":             strategies,
    }


# ---------------------------------------------------------------------------
# API key auth
# ---------------------------------------------------------------------------

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(
    x_api_key: Optional[str] = Depends(_api_key_header),
    db: AsyncSession = Depends(get_db),
) -> APIKey:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key header required.")
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    result = await db.execute(select(APIKey).where(APIKey.key_hash == key_hash))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key.")
    return row


# ---------------------------------------------------------------------------
# API key management
# ---------------------------------------------------------------------------

class CreateAPIKeyRequest(BaseModel):
    tenant_id: str = "default"


@app.post("/api-keys", status_code=201)
async def create_api_key(
    body: CreateAPIKeyRequest,
    db: AsyncSession = Depends(get_db),
):
    raw_key = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:8]

    api_key = APIKey(
        tenant_id=body.tenant_id,
        key_hash=key_hash,
        key_prefix=key_prefix,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    logger.info("Created API key id=%s prefix=%s", api_key.id, key_prefix)
    return {
        "id":         api_key.id,
        "key":        raw_key,   # shown ONCE — not stored in plaintext
        "key_prefix": key_prefix,
        "tenant_id":  api_key.tenant_id,
        "created_at": api_key.created_at,
    }


@app.get("/api-keys")
async def list_api_keys(
    tenant_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(APIKey).order_by(APIKey.created_at.desc())
    if tenant_id:
        stmt = stmt.where(APIKey.tenant_id == tenant_id)
    result = await db.execute(stmt)
    keys = result.scalars().all()
    return [
        {
            "id":         k.id,
            "key_prefix": k.key_prefix,
            "tenant_id":  k.tenant_id,
            "created_at": k.created_at,
        }
        for k in keys
    ]


@app.delete("/api-keys/{key_id}", status_code=204)
async def revoke_api_key(key_id: str, db: AsyncSession = Depends(get_db)):
    key = await db.get(APIKey, key_id)
    if key is None:
        raise HTTPException(status_code=404, detail=f"API key {key_id} not found.")
    await db.delete(key)
    await db.commit()
    logger.info("Revoked API key id=%s", key_id)


# ---------------------------------------------------------------------------
# Baselines
# ---------------------------------------------------------------------------

class BaselineRequest(BaseModel):
    name: str
    eval_run_id: str
    tenant_id: str = "default"
    thresholds: dict = {}


@app.post("/baselines", status_code=201)
async def create_baseline(
    body: BaselineRequest,
    db: AsyncSession = Depends(get_db),
    _auth: APIKey = Depends(require_api_key),
):
    run = await db.get(EvalRun, body.eval_run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Eval run {body.eval_run_id} not found.")
    if run.status != "completed":
        raise HTTPException(status_code=422, detail="Eval run must be completed before creating a baseline.")

    from ci import DEFAULT_THRESHOLDS
    merged_thresholds = {**DEFAULT_THRESHOLDS, **body.thresholds}

    baseline = Baseline(
        name=body.name,
        eval_run_id=body.eval_run_id,
        tenant_id=body.tenant_id,
        thresholds=merged_thresholds,
    )
    db.add(baseline)
    await db.commit()
    await db.refresh(baseline)

    logger.info("Created baseline id=%s name=%s", baseline.id, baseline.name)
    return {
        "baseline_id": baseline.id,
        "name":        baseline.name,
        "eval_run_id": baseline.eval_run_id,
        "tenant_id":   baseline.tenant_id,
        "thresholds":  baseline.thresholds,
        "created_at":  baseline.created_at,
    }


@app.get("/baselines")
async def list_baselines(
    tenant_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Baseline).order_by(Baseline.created_at.desc())
    if tenant_id:
        stmt = stmt.where(Baseline.tenant_id == tenant_id)
    result = await db.execute(stmt)
    baselines = result.scalars().all()
    return [
        {
            "baseline_id": b.id,
            "name":        b.name,
            "eval_run_id": b.eval_run_id,
            "tenant_id":   b.tenant_id,
            "thresholds":  b.thresholds,
            "created_at":  b.created_at,
        }
        for b in baselines
    ]


# ---------------------------------------------------------------------------
# CI runs
# ---------------------------------------------------------------------------

class CIRunRequest(BaseModel):
    baseline_id: str
    query: str
    correct_answer: str
    document_ids: list[str]
    tenant_id: str = "default"
    pr_number: Optional[str] = None
    commit_sha: Optional[str] = None


async def _run_ci_background(
    ci_run_id:            str,
    eval_run_id:          str,
    query:                str,
    correct_answer:       str,
    document_ids:         list[str],
    baseline_eval_run_id: str,
    thresholds:           dict,
) -> None:
    """Runs the eval, compares to baseline, saves results to the ci_run row."""
    try:
        await run_eval(
            eval_run_id=eval_run_id,
            query=query,
            correct_answer=correct_answer,
            document_ids=document_ids,
        )

        async with AsyncSessionLocal() as db:
            current_rows = (
                await db.execute(
                    select(EvalResult).where(EvalResult.eval_run_id == eval_run_id)
                )
            ).scalars().all()

            baseline_rows = (
                await db.execute(
                    select(EvalResult).where(EvalResult.eval_run_id == baseline_eval_run_id)
                )
            ).scalars().all()

            current_run = await db.get(EvalRun, eval_run_id)

        by_strategy = {
            r.strategy_name: {
                "failure_attribution": r.failure_attribution,
                "recommendation":      r.recommendation,
            }
            for r in current_rows
        }
        current_attribution = {
            "overall_recommendation": current_run.overall_recommendation if current_run else None,
            "by_strategy": by_strategy,
        }

        def _to_dict(r: EvalResult) -> dict:
            return {
                "strategy_name":     r.strategy_name,
                "faithfulness_score": r.faithfulness_score,
                "correctness_score":  r.correctness_score,
                "completeness_score": r.completeness_score,
                "overall_score":      r.overall_score,
            }

        comparison = compare_runs(
            baseline_results=[_to_dict(r) for r in baseline_rows],
            current_results=[_to_dict(r)  for r in current_rows],
            thresholds=thresholds,
            current_eval_run_id=eval_run_id,
            current_attribution=current_attribution,
            app_base_url=settings.APP_BASE_URL,
        )

        async with AsyncSessionLocal() as db:
            from sqlalchemy import update as _update
            await db.execute(
                _update(CIRun).where(CIRun.id == ci_run_id).values(
                    status="passed" if comparison["passed"] else "failed",
                    passed=comparison["passed"],
                    summary=comparison,
                )
            )
            await db.commit()

        logger.info(
            "[ci_run] complete  ci_run=%s  passed=%s",
            ci_run_id, comparison["passed"],
        )

    except Exception:
        logger.exception("[ci_run] background task failed  ci_run=%s", ci_run_id)
        async with AsyncSessionLocal() as db:
            from sqlalchemy import update as _update
            await db.execute(
                _update(CIRun).where(CIRun.id == ci_run_id).values(
                    status="failed", passed=False
                )
            )
            await db.commit()


@app.post("/ci/run", status_code=202)
async def start_ci_run(
    body: CIRunRequest,
    db: AsyncSession = Depends(get_db),
    _auth: APIKey = Depends(require_api_key),
):
    if not body.document_ids:
        raise HTTPException(status_code=400, detail="document_ids must not be empty.")
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="query must not be empty.")
    if not body.correct_answer.strip():
        raise HTTPException(status_code=400, detail="correct_answer must not be empty.")

    baseline = await db.get(Baseline, body.baseline_id)
    if baseline is None:
        raise HTTPException(status_code=404, detail=f"Baseline {body.baseline_id} not found.")

    eval_run_id = str(uuid.uuid4())
    ci_run_id   = str(uuid.uuid4())

    # Step 1: persist the EvalRun so the FK target exists before CIRun is written
    run = EvalRun(
        id=eval_run_id,
        tenant_id=body.tenant_id,
        status="running",
        document_ids=body.document_ids,
    )
    db.add(run)
    await db.commit()

    # Step 2: persist the CIRun that references the now-committed EvalRun
    ci_run = CIRun(
        id=ci_run_id,
        baseline_id=body.baseline_id,
        eval_run_id=eval_run_id,
        tenant_id=body.tenant_id,
        status="running",
        pr_number=body.pr_number,
        commit_sha=body.commit_sha,
    )
    db.add(ci_run)
    await db.commit()

    # Step 3: both rows are committed — safe to start the background task
    logger.info(
        "Starting CI run ci_run=%s  baseline=%s  pr=%s",
        ci_run_id, body.baseline_id, body.pr_number,
    )

    asyncio.create_task(
        _run_ci_background(
            ci_run_id=ci_run_id,
            eval_run_id=eval_run_id,
            query=body.query,
            correct_answer=body.correct_answer,
            document_ids=body.document_ids,
            baseline_eval_run_id=baseline.eval_run_id,
            thresholds=baseline.thresholds,
        )
    )

    return {
        "ci_run_id": ci_run_id,
        "status":    "running",
        "message":   f"CI evaluation started. Poll GET /ci/{ci_run_id} for results.",
    }


@app.get("/ci/runs")
async def list_ci_runs(
    tenant_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CIRun).order_by(CIRun.created_at.desc()).limit(100)
    if tenant_id:
        stmt = stmt.where(CIRun.tenant_id == tenant_id)
    result = await db.execute(stmt)
    runs = result.scalars().all()

    # Batch-fetch baseline names
    baseline_ids = list({r.baseline_id for r in runs})
    bmap: dict[str, str] = {}
    if baseline_ids:
        br = await db.execute(
            select(Baseline.id, Baseline.name).where(Baseline.id.in_(baseline_ids))
        )
        bmap = {row.id: row.name for row in br}

    return [
        {
            "ci_run_id":     r.id,
            "baseline_id":   r.baseline_id,
            "baseline_name": bmap.get(r.baseline_id, ""),
            "eval_run_id":   r.eval_run_id,
            "tenant_id":     r.tenant_id,
            "status":        r.status,
            "passed":        r.passed,
            "pr_number":     r.pr_number,
            "commit_sha":    r.commit_sha,
            "created_at":    r.created_at,
        }
        for r in runs
    ]


@app.get("/ci/{ci_run_id}")
async def get_ci_run(ci_run_id: str, db: AsyncSession = Depends(get_db)):
    ci_run = await db.get(CIRun, ci_run_id)
    if ci_run is None:
        raise HTTPException(status_code=404, detail=f"CI run {ci_run_id} not found.")

    summary = ci_run.summary or {}

    return {
        "ci_run_id":               ci_run.id,
        "status":                  ci_run.status,
        "passed":                  ci_run.passed,
        "baseline_id":             ci_run.baseline_id,
        "eval_run_id":             ci_run.eval_run_id,
        "tenant_id":               ci_run.tenant_id,
        "pr_number":               ci_run.pr_number,
        "commit_sha":              ci_run.commit_sha,
        "created_at":              ci_run.created_at,
        "baseline_scores":         summary.get("baseline_scores"),
        "current_scores":          summary.get("current_scores"),
        "diffs":                   summary.get("diffs"),
        "failed_thresholds":       summary.get("failed_thresholds"),
        "recommendation":          summary.get("recommendation"),
        "failure_attribution":     summary.get("failure_attribution"),
        "current_winner":          summary.get("current_winner"),
        "baseline_winner":         summary.get("baseline_winner"),
        "github_comment_markdown": summary.get("github_comment_markdown"),
    }


# ---------------------------------------------------------------------------
# Datasets — synthetic test-set generation
# ---------------------------------------------------------------------------

class GenerateDatasetRequest(BaseModel):
    name:                str
    document_ids:        list[str]
    tenant_id:           str = "default"
    questions_per_chunk: int = 3


@app.post("/datasets/generate", status_code=202)
async def generate_dataset(
    body: GenerateDatasetRequest,
    db: AsyncSession = Depends(get_db),
):
    if not body.document_ids:
        raise HTTPException(status_code=400, detail="document_ids must not be empty.")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name must not be empty.")

    test_set_id = str(uuid.uuid4())
    test_set = TestSet(
        id=test_set_id,
        name=body.name.strip(),
        document_ids=body.document_ids,
        tenant_id=body.tenant_id,
        status="generating",
    )
    db.add(test_set)
    await db.commit()

    logger.info("Generating test set id=%s  name=%s", test_set_id, body.name)

    asyncio.create_task(
        generate_test_set(
            test_set_id=test_set_id,
            test_set_name=body.name.strip(),
            document_ids=body.document_ids,
            questions_per_chunk=body.questions_per_chunk,
        )
    )

    return {
        "test_set_id": test_set_id,
        "status":      "generating",
        "message":     f"Generation started. Poll GET /datasets/{test_set_id} for status.",
    }


@app.get("/datasets")
async def list_datasets(
    tenant_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TestSet).order_by(TestSet.created_at.desc())
    if tenant_id:
        stmt = stmt.where(TestSet.tenant_id == tenant_id)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "test_set_id":  r.id,
            "name":         r.name,
            "document_ids": r.document_ids,
            "tenant_id":    r.tenant_id,
            "item_count":   r.item_count,
            "status":       r.status,
            "created_at":   r.created_at,
        }
        for r in rows
    ]


@app.get("/datasets/{test_set_id}")
async def get_dataset(test_set_id: str, db: AsyncSession = Depends(get_db)):
    ts = await db.get(TestSet, test_set_id)
    if ts is None:
        raise HTTPException(status_code=404, detail=f"Test set {test_set_id} not found.")

    items_result = await db.execute(
        select(TestSetItem)
        .where(TestSetItem.test_set_id == test_set_id)
        .order_by(TestSetItem.created_at)
    )
    items = items_result.scalars().all()

    return {
        "test_set_id":  ts.id,
        "name":         ts.name,
        "document_ids": ts.document_ids,
        "tenant_id":    ts.tenant_id,
        "item_count":   ts.item_count,
        "status":       ts.status,
        "created_at":   ts.created_at,
        "items": [
            {
                "id":           item.id,
                "question":     item.question,
                "answer":       item.answer,
                "source_chunk": item.source_chunk,
                "pii_scrubbed": item.pii_scrubbed,
                "scrub_log":    item.scrub_log,
                "created_at":   item.created_at,
            }
            for item in items
        ],
    }


@app.get("/datasets/{test_set_id}/export")
async def export_dataset(test_set_id: str, db: AsyncSession = Depends(get_db)):
    ts = await db.get(TestSet, test_set_id)
    if ts is None:
        raise HTTPException(status_code=404, detail=f"Test set {test_set_id} not found.")
    if ts.status != "ready":
        raise HTTPException(status_code=422, detail="Dataset is not ready yet.")

    items_result = await db.execute(
        select(TestSetItem)
        .where(TestSetItem.test_set_id == test_set_id)
        .order_by(TestSetItem.created_at)
    )
    items = items_result.scalars().all()

    scrub_log   = [item.scrub_log for item in items]
    sample_items = [
        {
            "question":    item.question,
            "answer":      item.answer,
            "pii_scrubbed": item.pii_scrubbed,
        }
        for item in items[:10]
    ]

    zip_buf = _io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # questions.csv
        csv_buf = _io.StringIO()
        writer  = csv.writer(csv_buf)
        writer.writerow(["id", "question", "answer", "source_chunk", "pii_scrubbed"])
        for item in items:
            writer.writerow([
                item.id, item.question, item.answer,
                item.source_chunk or "", item.pii_scrubbed,
            ])
        zf.writestr("questions.csv", csv_buf.getvalue())

        # scrub_report.json
        zf.writestr(
            "scrub_report.json",
            _json.dumps(
                [
                    {
                        "item_id":     item.id,
                        "pii_scrubbed": item.pii_scrubbed,
                        "log":         item.scrub_log,
                    }
                    for item in items
                ],
                indent=2,
            ),
        )

        # metadata.json
        zf.writestr(
            "metadata.json",
            _json.dumps(
                {
                    "test_set_id":  ts.id,
                    "name":         ts.name,
                    "document_ids": ts.document_ids,
                    "tenant_id":    ts.tenant_id,
                    "item_count":   ts.item_count,
                    "model":        settings.OPENROUTER_MODEL,
                    "created_at":   ts.created_at.isoformat(),
                },
                indent=2,
            ),
        )

        # summary.pdf
        pdf_bytes = build_summary_pdf(
            name=ts.name,
            document_ids=ts.document_ids,
            item_count=ts.item_count,
            model=settings.OPENROUTER_MODEL,
            created_at=ts.created_at.strftime("%Y-%m-%d %H:%M UTC"),
            scrub_log=scrub_log,
            sample_items=sample_items,
        )
        zf.writestr("summary.pdf", pdf_bytes)

    zip_buf.seek(0)
    safe_name = re.sub(r"[^\w\-]", "_", ts.name)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}-audit.zip"'},
    )


# ---------------------------------------------------------------------------
# Batch eval — run all test-set items through the eval agent
# ---------------------------------------------------------------------------

class DatasetEvalRequest(BaseModel):
    test_set_id:  str
    document_ids: list[str]
    tenant_id:    str = "default"


async def _run_batch_eval_background(
    batch_eval_id: str,
    document_ids:  list[str],
    items:         list[dict],
    tenant_id:     str,
) -> None:
    """Run eval sequentially for each test-set item, accumulate scores."""
    from sqlalchemy import update as _update

    all_scores:   list[dict] = []
    eval_run_ids: list[str]  = []

    for idx, item in enumerate(items):
        eval_run_id = str(uuid.uuid4())
        try:
            async with AsyncSessionLocal() as db:
                run = EvalRun(
                    id=eval_run_id,
                    tenant_id=tenant_id,
                    status="running",
                    document_ids=document_ids,
                )
                db.add(run)
                await db.commit()

            await run_eval(
                eval_run_id=eval_run_id,
                query=item["question"],
                correct_answer=item["answer"],
                document_ids=document_ids,
            )

            async with AsyncSessionLocal() as db:
                rows = (
                    await db.execute(
                        select(EvalResult).where(EvalResult.eval_run_id == eval_run_id)
                    )
                ).scalars().all()
                if rows:
                    best = max(rows, key=lambda r: r.overall_score or 0.0)
                    all_scores.append({
                        "faithfulness": best.faithfulness_score or 0.0,
                        "correctness":  best.correctness_score  or 0.0,
                        "completeness": best.completeness_score or 0.0,
                        "overall":      best.overall_score      or 0.0,
                    })
        except Exception:
            logger.exception("[batch_eval] item %d failed  eval_run=%s", idx, eval_run_id)

        eval_run_ids.append(eval_run_id)

        async with AsyncSessionLocal() as db:
            await db.execute(
                _update(BatchEval).where(BatchEval.id == batch_eval_id).values(
                    completed_items=idx + 1,
                    eval_run_ids=eval_run_ids,
                )
            )
            await db.commit()

    avg_scores = None
    if all_scores:
        avg_scores = {
            dim: round(sum(s[dim] for s in all_scores) / len(all_scores), 4)
            for dim in ["faithfulness", "correctness", "completeness", "overall"]
        }

    async with AsyncSessionLocal() as db:
        await db.execute(
            _update(BatchEval).where(BatchEval.id == batch_eval_id).values(
                status="completed",
                eval_run_ids=eval_run_ids,
                avg_scores=avg_scores,
            )
        )
        await db.commit()

    logger.info("[batch_eval] done  batch=%s  items=%d", batch_eval_id, len(items))


@app.post("/eval/run-dataset", status_code=202)
async def run_dataset_eval(
    body: DatasetEvalRequest,
    db: AsyncSession = Depends(get_db),
):
    if not body.document_ids:
        raise HTTPException(status_code=400, detail="document_ids must not be empty.")

    ts = await db.get(TestSet, body.test_set_id)
    if ts is None:
        raise HTTPException(status_code=404, detail=f"Test set {body.test_set_id} not found.")
    if ts.status != "ready":
        raise HTTPException(status_code=422, detail="Test set is not ready yet.")

    items_result = await db.execute(
        select(TestSetItem)
        .where(TestSetItem.test_set_id == body.test_set_id)
        .order_by(TestSetItem.created_at)
    )
    items = [
        {"question": r.question, "answer": r.answer}
        for r in items_result.scalars().all()
    ]
    if not items:
        raise HTTPException(status_code=422, detail="Test set has no items.")

    batch_eval_id = str(uuid.uuid4())
    batch_eval = BatchEval(
        id=batch_eval_id,
        test_set_id=body.test_set_id,
        document_ids=body.document_ids,
        tenant_id=body.tenant_id,
        status="running",
        total_items=len(items),
    )
    db.add(batch_eval)
    await db.commit()

    logger.info(
        "Starting batch eval id=%s  test_set=%s  items=%d",
        batch_eval_id, body.test_set_id, len(items),
    )

    asyncio.create_task(
        _run_batch_eval_background(
            batch_eval_id=batch_eval_id,
            document_ids=body.document_ids,
            items=items,
            tenant_id=body.tenant_id,
        )
    )

    return {
        "batch_eval_id": batch_eval_id,
        "total_items":   len(items),
        "status":        "running",
        "message":       f"Batch evaluation started. Poll GET /eval/batch/{batch_eval_id}.",
    }


@app.get("/eval/batch/{batch_eval_id}")
async def get_batch_eval(batch_eval_id: str, db: AsyncSession = Depends(get_db)):
    be = await db.get(BatchEval, batch_eval_id)
    if be is None:
        raise HTTPException(status_code=404, detail=f"Batch eval {batch_eval_id} not found.")

    progress_pct = (
        round(be.completed_items / be.total_items * 100, 1)
        if be.total_items > 0 else 0.0
    )
    return {
        "batch_eval_id":   be.id,
        "test_set_id":     be.test_set_id,
        "document_ids":    be.document_ids,
        "tenant_id":       be.tenant_id,
        "status":          be.status,
        "total_items":     be.total_items,
        "completed_items": be.completed_items,
        "progress_pct":    progress_pct,
        "avg_scores":      be.avg_scores,
        "eval_run_ids":    be.eval_run_ids,
        "created_at":      be.created_at,
    }

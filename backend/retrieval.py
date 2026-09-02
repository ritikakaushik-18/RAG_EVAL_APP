"""
Five retrieval strategies. Each returns up to TOP_K chunks as:
  {chunk_id, content, score, strategy, document_id, ...extra}
"""

import asyncio
import logging
from typing import Any

import cohere
from openai import AsyncOpenAI
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, settings as _settings
from ingestion import encode_async
from models import Chunk

logger = logging.getLogger(__name__)

TOP_K = 5
RRF_K = 60       # standard constant for Reciprocal Rank Fusion
PARENT_WINDOW = 3  # chunks before and after the matched child


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _embed(text: str) -> list[float]:
    vecs = await encode_async([text])
    return vecs[0]


async def _vector_search(
    query_vec: list[float],
    document_ids: list[str],
    db: AsyncSession,
    n: int = TOP_K,
) -> list[dict]:
    if not document_ids:
        return []
    stmt = (
        select(
            Chunk.id,
            Chunk.content,
            Chunk.chunk_metadata,
            Chunk.chunk_index,
            Chunk.document_id,
            (1 - Chunk.embedding.cosine_distance(query_vec)).label("score"),
        )
        .where(Chunk.document_id.in_(document_ids))
        .order_by(Chunk.embedding.cosine_distance(query_vec))
        .limit(n)
    )
    rows = (await db.execute(stmt)).fetchall()
    return [
        {
            "chunk_id": r.id,
            "content": r.content,
            "score": float(r.score),
            "chunk_index": r.chunk_index,
            "document_id": r.document_id,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Strategy 1 — Naive RAG
# ---------------------------------------------------------------------------

async def retrieve_naive(
    query: str,
    document_ids: list[str],
    db: AsyncSession,
    cfg: Settings = _settings,
) -> list[dict]:
    query_vec = await _embed(query)
    results = await _vector_search(query_vec, document_ids, db, n=TOP_K)
    for r in results:
        r["strategy"] = "naive"
    return results


# ---------------------------------------------------------------------------
# Strategy 2 — Hybrid BM25 + Vector with Reciprocal Rank Fusion
# ---------------------------------------------------------------------------

async def retrieve_hybrid(
    query: str,
    document_ids: list[str],
    db: AsyncSession,
    cfg: Settings = _settings,
) -> list[dict]:
    if not document_ids:
        return []

    query_vec = await _embed(query)

    # Vector search (top 10)
    vec_stmt = (
        select(
            Chunk.id,
            Chunk.content,
            Chunk.chunk_index,
            Chunk.document_id,
        )
        .where(Chunk.document_id.in_(document_ids))
        .order_by(Chunk.embedding.cosine_distance(query_vec))
        .limit(10)
    )

    # Full-text search (top 10)
    tsvec = func.to_tsvector("english", Chunk.content)
    tsq = func.plainto_tsquery("english", query)
    fts_stmt = (
        select(
            Chunk.id,
            Chunk.content,
            Chunk.chunk_index,
            Chunk.document_id,
        )
        .where(Chunk.document_id.in_(document_ids))
        .where(tsvec.op("@@")(tsq))
        .order_by(func.ts_rank(tsvec, tsq).desc())
        .limit(10)
    )

    # Sequential: both hit the same DB connection, no benefit to gather here
    vec_rows = await _exec(db, vec_stmt)
    fts_rows = await _exec(db, fts_stmt)

    # RRF: score = Σ 1/(k + rank)
    rrf_scores: dict[str, float] = {}
    chunk_data: dict[str, dict] = {}

    for rank, row in enumerate(vec_rows):
        rrf_scores[row.id] = rrf_scores.get(row.id, 0.0) + 1.0 / (RRF_K + rank + 1)
        chunk_data[row.id] = {
            "chunk_id": row.id,
            "content": row.content,
            "chunk_index": row.chunk_index,
            "document_id": row.document_id,
        }

    for rank, row in enumerate(fts_rows):
        rrf_scores[row.id] = rrf_scores.get(row.id, 0.0) + 1.0 / (RRF_K + rank + 1)
        chunk_data.setdefault(row.id, {
            "chunk_id": row.id,
            "content": row.content,
            "chunk_index": row.chunk_index,
            "document_id": row.document_id,
        })

    top_ids = sorted(rrf_scores, key=lambda cid: rrf_scores[cid], reverse=True)[:TOP_K]
    return [
        {**chunk_data[cid], "score": rrf_scores[cid], "strategy": "hybrid"}
        for cid in top_ids
    ]


async def _exec(db: AsyncSession, stmt) -> list[Any]:
    return (await db.execute(stmt)).fetchall()


# ---------------------------------------------------------------------------
# Strategy 3 — Cohere Rerank
# ---------------------------------------------------------------------------

def _cohere_rerank_sync(
    api_key: str,
    query: str,
    documents: list[str],
    top_n: int,
) -> list[Any]:
    # Using sync ClientV2 (cohere ≥ 5) in a thread to avoid async-SDK version drift
    co = cohere.ClientV2(api_key=api_key)
    return co.rerank(
        model="rerank-english-v3.0",
        query=query,
        documents=documents,
        top_n=top_n,
    ).results


async def retrieve_rerank(
    query: str,
    document_ids: list[str],
    db: AsyncSession,
    cfg: Settings = _settings,
) -> list[dict]:
    query_vec = await _embed(query)
    candidates = await _vector_search(query_vec, document_ids, db, n=20)

    if not candidates:
        return []

    loop = asyncio.get_running_loop()
    rerank_results = await loop.run_in_executor(
        None,
        _cohere_rerank_sync,
        cfg.COHERE_API_KEY,
        query,
        [c["content"] for c in candidates],
        TOP_K,
    )

    return [
        {
            "chunk_id": candidates[r.index]["chunk_id"],
            "content": candidates[r.index]["content"],
            "score": float(r.relevance_score),
            "document_id": candidates[r.index]["document_id"],
            "strategy": "rerank",
        }
        for r in rerank_results
    ]


# ---------------------------------------------------------------------------
# Strategy 4 — HyDE (Hypothetical Document Embeddings)
# ---------------------------------------------------------------------------

async def retrieve_hyde(
    query: str,
    document_ids: list[str],
    db: AsyncSession,
    cfg: Settings = _settings,
) -> list[dict]:
    client = AsyncOpenAI(
        api_key=cfg.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )

    completion = await client.chat.completions.create(
        model=cfg.OPENROUTER_MODEL,
        messages=[
            {
                "role": "user",
                "content": (
                    "Write a 2-3 sentence factual passage that directly answers "
                    "the following question. Write only the passage, no preamble.\n\n"
                    f"Question: {query}"
                ),
            }
        ],
        max_tokens=150,
        temperature=0.0,
    )

    hypothetical = completion.choices[0].message.content.strip()
    logger.info("HyDE hypothetical answer: %.120s", hypothetical)

    hyp_vec = await _embed(hypothetical)
    results = await _vector_search(hyp_vec, document_ids, db, n=TOP_K)

    for r in results:
        r["strategy"] = "hyde"
        r["hypothetical_document"] = hypothetical

    return results


# ---------------------------------------------------------------------------
# Strategy 5 — Parent-Child
# ---------------------------------------------------------------------------

async def retrieve_parent_child(
    query: str,
    document_ids: list[str],
    db: AsyncSession,
    cfg: Settings = _settings,
) -> list[dict]:
    query_vec = await _embed(query)
    children = await _vector_search(query_vec, document_ids, db, n=TOP_K)

    if not children:
        return []

    results: list[dict] = []
    # Track (doc_id, min_idx, max_idx) of already-included parent windows
    seen: list[tuple[str, int, int]] = []

    for child in children:
        doc_id = child["document_id"]
        ci = child["chunk_index"]
        lo = max(0, ci - PARENT_WINDOW)
        hi = ci + PARENT_WINDOW

        # Skip if this window overlaps a window we already added for the same doc
        if any(
            d == doc_id and not (hi < prev_lo or lo > prev_hi)
            for d, prev_lo, prev_hi in seen
        ):
            continue

        # Fetch all sibling chunks in [lo, hi]
        stmt = (
            select(Chunk.chunk_index, Chunk.content)
            .where(Chunk.document_id == doc_id)
            .where(Chunk.chunk_index >= lo)
            .where(Chunk.chunk_index <= hi)
            .order_by(Chunk.chunk_index)
        )
        siblings = (await db.execute(stmt)).fetchall()
        parent_content = "\n".join(s.content for s in siblings)

        results.append({
            "chunk_id": child["chunk_id"],
            "content": parent_content,
            "score": child["score"],
            "document_id": doc_id,
            "strategy": "parent_child",
            "child_chunk_index": ci,
            "parent_range": [lo, hi],
        })
        seen.append((doc_id, lo, hi))

    return results[:TOP_K]


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

STRATEGIES: dict[str, Any] = {
    "naive":        retrieve_naive,
    "hybrid":       retrieve_hybrid,
    "rerank":       retrieve_rerank,
    "hyde":         retrieve_hyde,
    "parent_child": retrieve_parent_child,
}

"""
LangGraph evaluation agent.

Graph topology (two-level fan-out / fan-in):

  START
    -> run_strategies          [dispatcher node — returns list[Send]]
    -> run_single_strategy ×5  [parallel; state merged via reducer after all complete]
    -> dispatch_judges         [dispatcher node — fan-in point, then returns list[Send]]
    -> judge_single_strategy ×5 [parallel; state merged via reducer after all complete]
    -> aggregate_results
    -> END
"""

# ── LangSmith bootstrap — MUST happen before any langchain/langgraph import ──
# LangSmith registers its tracing callback at import time; if these env vars
# aren't set first, the tracer silently does nothing for the whole process.
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

os.environ["LANGCHAIN_TRACING_V2"] = os.getenv("LANGCHAIN_TRACING_V2", "true")
os.environ["LANGCHAIN_ENDPOINT"]   = os.getenv("LANGCHAIN_ENDPOINT", "https://api.smith.langchain.com")
os.environ["LANGCHAIN_API_KEY"]    = os.getenv("LANGCHAIN_API_KEY", "")
os.environ["LANGCHAIN_PROJECT"]    = os.getenv("LANGCHAIN_PROJECT", "rag-eval")
# ─────────────────────────────────────────────────────────────────────────────

import json
import logging
import operator
import re
import time
import uuid
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from openai import AsyncOpenAI
from sqlalchemy import func, update

from attribution import analyze_failures
from config import settings as _settings
from database import AsyncSessionLocal
from models import EvalResult, EvalRun
from retrieval import STRATEGIES

logger = logging.getLogger(__name__)

STRATEGY_NAMES: list[str] = list(STRATEGIES.keys())

# Cost estimate for anthropic/claude-3-haiku ($/token)
_INPUT_COST  = 0.00000025   # $0.25 / 1M tokens
_OUTPUT_COST = 0.00000125   # $1.25 / 1M tokens


# ─────────────────────────────────────────────────────────────────────────────
# State
# ─────────────────────────────────────────────────────────────────────────────

def _merge_dicts(a: dict, b: dict) -> dict:
    return {**a, **b}


class EvalState(TypedDict):
    query: str
    document_ids: list[str]
    correct_answer: str
    eval_run_id: str
    # Parallel nodes write partial dicts; reducer merges them
    strategy_results: Annotated[dict, _merge_dicts]   # strategy_name -> list[chunk]
    scores:           Annotated[dict, _merge_dicts]   # strategy_name -> score dict
    winner: str
    cost_usd:   Annotated[float, operator.add]        # accumulated across all judge nodes
    latency_ms: float
    start_time: float


# ─────────────────────────────────────────────────────────────────────────────
# Node 1: run_strategies — no-op node; fan-out happens via conditional edge
# ─────────────────────────────────────────────────────────────────────────────

def run_strategies(state: EvalState) -> dict:
    logger.info("[run_strategies] preparing fan-out to %d strategies", len(STRATEGY_NAMES))
    return {}


def route_to_strategies(state: EvalState) -> list[Send]:
    return [
        Send(
            "run_single_strategy",
            {
                "query": state["query"],
                "document_ids": state["document_ids"],
                "strategy_name": name,
            },
        )
        for name in STRATEGY_NAMES
    ]


async def run_single_strategy(payload: dict) -> dict:
    name = payload["strategy_name"]
    logger.info("[run_single_strategy] strategy=%s starting", name)
    t0 = time.time()
    try:
        async with AsyncSessionLocal() as db:
            chunks = await STRATEGIES[name](
                payload["query"],
                payload["document_ids"],
                db,
                _settings,
            )
    except Exception as exc:
        logger.exception("[run_single_strategy] strategy=%s error: %s", name, exc)
        chunks = []
    elapsed_ms = (time.time() - t0) * 1000
    logger.info(
        "[run_single_strategy] strategy=%s done  chunks=%d  %.0fms",
        name, len(chunks), elapsed_ms,
    )
    return {"strategy_results": {name: chunks}}


# ─────────────────────────────────────────────────────────────────────────────
# Node 2: dispatch_judges — no-op node; fan-out happens via conditional edge
# (runs once after all run_single_strategy branches complete and state is merged)
# ─────────────────────────────────────────────────────────────────────────────

def dispatch_judges(state: EvalState) -> dict:
    logger.info(
        "[dispatch_judges] preparing fan-out to %d judges  strategies=%s",
        len(state["strategy_results"]),
        list(state["strategy_results"].keys()),
    )
    return {}


def route_to_judges(state: EvalState) -> list[Send]:
    return [
        Send(
            "judge_single_strategy",
            {
                "query":          state["query"],
                "correct_answer": state["correct_answer"],
                "strategy_name":  name,
                "chunks":         chunks,
                "eval_run_id":    state["eval_run_id"],
            },
        )
        for name, chunks in state["strategy_results"].items()
    ]


# ─────────────────────────────────────────────────────────────────────────────
# LLM judge for one strategy
# ─────────────────────────────────────────────────────────────────────────────

_JUDGE_SYSTEM = """\
You are an expert RAG evaluation judge. Given a query, the correct answer, \
and context retrieved by a RAG system, score the retrieval quality.

Respond with ONLY valid JSON — no markdown fences, no extra text:
{
  "faithfulness":  <float 0.0-1.0>,
  "correctness":   <float 0.0-1.0>,
  "completeness":  <float 0.0-1.0>,
  "reasoning":     "<one concise sentence>"
}

Definitions:
- faithfulness:  Does the retrieved context directly support the correct answer?
- correctness:   Could a reader derive the correct answer from this context alone?
- completeness:  Does the context cover all aspects needed to fully answer the query?
"""

_JUDGE_USER = """\
Query: {query}

Correct answer: {correct_answer}

Retrieved context:
{context}
"""


def _extract_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*?\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    logger.warning("Could not parse LLM response as JSON: %.200s", text)
    return {}


async def judge_single_strategy(payload: dict) -> dict:
    name   = payload["strategy_name"]
    chunks = payload["chunks"]
    logger.info("[judge_single_strategy] strategy=%s  chunks=%d", name, len(chunks))

    # No chunks retrieved — score everything zero
    if not chunks:
        return {
            "scores": {
                name: {
                    "faithfulness": 0.0, "correctness": 0.0,
                    "completeness": 0.0, "overall":     0.0,
                    "reasoning":        "No chunks were retrieved.",
                    "retrieved_answer": "",
                    "latency_ms":       0.0,
                    "cost_usd":         0.0,
                }
            },
            "cost_usd": 0.0,
        }

    context = "\n\n---\n\n".join(
        f"[Chunk {i + 1}]\n{c['content']}" for i, c in enumerate(chunks[:5])
    )
    # First 500 chars of top chunk as the "retrieved answer" stored in DB
    retrieved_answer = chunks[0]["content"][:500] if chunks else ""

    client = AsyncOpenAI(
        api_key=_settings.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )

    t0 = time.time()
    cost = 0.0
    try:
        resp = await client.chat.completions.create(
            model=_settings.OPENROUTER_MODEL,
            messages=[
                {"role": "system", "content": _JUDGE_SYSTEM},
                {
                    "role": "user",
                    "content": _JUDGE_USER.format(
                        query=payload["query"],
                        correct_answer=payload["correct_answer"],
                        context=context,
                    ),
                },
            ],
            max_tokens=256,
            temperature=0.0,
        )
        call_ms = (time.time() - t0) * 1000
        raw     = resp.choices[0].message.content.strip()
        parsed  = _extract_json(raw)

        if resp.usage:
            cost = (
                resp.usage.prompt_tokens     * _INPUT_COST
                + resp.usage.completion_tokens * _OUTPUT_COST
            )

    except Exception as exc:
        logger.exception("[judge_single_strategy] LLM call failed  strategy=%s", name)
        parsed = {}
        call_ms = 0.0

    faith  = float(parsed.get("faithfulness", 0.0))
    corr   = float(parsed.get("correctness",  0.0))
    comp   = float(parsed.get("completeness", 0.0))
    overall = (faith + corr + comp) / 3

    logger.info(
        "[judge_single_strategy] strategy=%s  F=%.2f C=%.2f Co=%.2f overall=%.2f",
        name, faith, corr, comp, overall,
    )

    return {
        "scores": {
            name: {
                "faithfulness":    faith,
                "correctness":     corr,
                "completeness":    comp,
                "overall":         overall,
                "reasoning":       parsed.get("reasoning", ""),
                "retrieved_answer": retrieved_answer,
                "latency_ms":      call_ms,
                "cost_usd":        cost,
            }
        },
        "cost_usd": cost,   # accumulated by operator.add reducer
    }


# ─────────────────────────────────────────────────────────────────────────────
# Aggregate: pick winner, persist results, mark eval_run complete
# (runs once after all judge branches complete and state is merged)
# ─────────────────────────────────────────────────────────────────────────────

async def aggregate_results(state: EvalState) -> dict:
    scores     = state["scores"]
    latency_ms = (time.time() - state["start_time"]) * 1000

    if not scores:
        logger.error("[aggregate_results] no scores — cannot determine winner")
        return {"winner": "none", "latency_ms": latency_ms}

    winner = max(scores, key=lambda n: scores[n].get("overall", 0.0))
    logger.info(
        "[aggregate_results] winner=%s  overall=%.3f  total_cost=$%.6f  total_ms=%.0f",
        winner, scores[winner].get("overall", 0.0), state["cost_usd"], latency_ms,
    )

    attribution = analyze_failures(scores, winner)
    by_strategy = attribution["by_strategy"]

    async with AsyncSessionLocal() as db:
        # One EvalResult row per strategy
        for strategy_name, score in scores.items():
            attr = by_strategy.get(strategy_name, {})
            db.add(EvalResult(
                id=str(uuid.uuid4()),
                eval_run_id=state["eval_run_id"],
                strategy_name=strategy_name,
                question=state["query"],
                retrieved_answer=score.get("retrieved_answer", ""),
                correct_answer=state["correct_answer"],
                faithfulness_score=score.get("faithfulness"),
                correctness_score=score.get("correctness"),
                completeness_score=score.get("completeness"),
                overall_score=score.get("overall"),
                reasoning=score.get("reasoning"),
                latency_ms=score.get("latency_ms"),
                cost_usd=score.get("cost_usd"),
                failure_attribution=attr.get("failure_attribution"),
                recommendation=attr.get("recommendation"),
            ))

        # Mark the run complete with attribution summaries
        await db.execute(
            update(EvalRun)
            .where(EvalRun.id == state["eval_run_id"])
            .values(
                status="completed",
                completed_at=func.now(),
                overall_recommendation=attribution["overall_recommendation"],
                winner_explanation=attribution["winner_explanation"],
            )
        )
        await db.commit()

    logger.info(
        "[aggregate_results] persisted %d results  eval_run=%s",
        len(scores), state["eval_run_id"],
    )
    return {"winner": winner, "latency_ms": latency_ms}


# ─────────────────────────────────────────────────────────────────────────────
# Graph — compiled lazily on first use so import never blocks startup
# ─────────────────────────────────────────────────────────────────────────────

_eval_agent = None


def _get_eval_agent():
    global _eval_agent
    if _eval_agent is None:
        logger.info("LangSmith tracing : %s", os.getenv("LANGCHAIN_TRACING_V2"))
        logger.info("LangSmith project : %s", os.getenv("LANGCHAIN_PROJECT"))
        logger.info("LangSmith key set : %s", bool(os.getenv("LANGCHAIN_API_KEY")))

        graph = StateGraph(EvalState)
        graph.add_node("run_strategies",        run_strategies)
        graph.add_node("run_single_strategy",   run_single_strategy)
        graph.add_node("dispatch_judges",       dispatch_judges)
        graph.add_node("judge_single_strategy", judge_single_strategy)
        graph.add_node("aggregate_results",     aggregate_results)

        graph.add_edge(START, "run_strategies")
        graph.add_conditional_edges("run_strategies", route_to_strategies, ["run_single_strategy"])
        graph.add_edge("run_single_strategy", "dispatch_judges")
        graph.add_conditional_edges("dispatch_judges", route_to_judges, ["judge_single_strategy"])
        graph.add_edge("judge_single_strategy", "aggregate_results")
        graph.add_edge("aggregate_results",     END)

        _eval_agent = graph.compile()
    return _eval_agent


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

async def run_eval(
    eval_run_id: str,
    query: str,
    correct_answer: str,
    document_ids: list[str],
) -> None:
    """Invoke the agent and handle top-level errors gracefully."""
    initial: EvalState = {
        "query":            query,
        "document_ids":     document_ids,
        "correct_answer":   correct_answer,
        "eval_run_id":      eval_run_id,
        "strategy_results": {},
        "scores":           {},
        "winner":           "",
        "cost_usd":         0.0,
        "latency_ms":       0.0,
        "start_time":       time.time(),
    }
    try:
        await _get_eval_agent().ainvoke(
            initial,
            config={
                "run_name": f"eval-{eval_run_id[:8]}",
                "tags":     ["rag-eval"],
                "metadata": {"eval_run_id": eval_run_id},
            },
        )
    except Exception as exc:
        logger.exception("[run_eval] agent failed for eval_run=%s", eval_run_id)
        # Mark run as failed so the GET endpoint can surface this
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(EvalRun)
                .where(EvalRun.id == eval_run_id)
                .values(status="failed", completed_at=func.now())
            )
            await db.commit()

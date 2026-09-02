"""
Failure attribution for RAG evaluation runs.

All functions are pure (no DB access) — they operate on the scores dict
produced by the LangGraph judge nodes and return attribution strings that
are persisted by the caller (aggregate_results in agent.py).
"""

from collections import Counter

PASS_THRESHOLD = 0.6  # overall_score >= this is considered a "pass"

_STRATEGY_LABEL = {
    "naive":        "Naive RAG",
    "hybrid":       "Hybrid BM25 + Vector",
    "rerank":       "Cohere Rerank",
    "hyde":         "HyDE",
    "parent_child": "Parent-Child",
}

# Human-readable labels for each root cause
ATTRIBUTION_LABEL = {
    "EMBEDDING_WEAKNESS":  "Embedding Weakness",
    "RETRIEVAL_LOGIC":     "Retrieval Logic Issue",
    "CONTEXT_WINDOW":      "Context Window Too Small",
    "RERANKING_HELPS":     "Reranking Compensates",
    "GENERATION_FAILURE":  "LLM Ignoring Context",
    "NO_CLEAR_PATTERN":    "No Clear Pattern",
}


# ---------------------------------------------------------------------------
# Per-strategy attribution
# ---------------------------------------------------------------------------

def _overall(scores: dict, name: str) -> float:
    return scores.get(name, {}).get("overall", 0.0)


def _faith(scores: dict, name: str) -> float:
    return scores.get(name, {}).get("faithfulness", 0.0)


def attribute_strategy(
    strategy_name: str,
    all_scores: dict[str, dict],
) -> tuple[str | None, str]:
    """
    Returns (failure_attribution | None, recommendation).
    Returns None attribution when the strategy passed — no failure to explain.

    Priority order matters: each condition is checked from most-specific to
    least-specific so the most actionable root cause wins.
    """
    if _overall(all_scores, strategy_name) >= PASS_THRESHOLD:
        return None, "Strategy is performing well — no changes needed."

    available = set(all_scores.keys())

    # CONTEXT_WINDOW
    # Any strategy (except parent_child itself) failed while parent_child passed
    # → the answer spans multiple chunks, needs wider context
    if (
        strategy_name != "parent_child"
        and "parent_child" in available
        and _overall(all_scores, "parent_child") >= PASS_THRESHOLD
    ):
        return (
            "CONTEXT_WINDOW",
            "Use Parent-Child retrieval — the answer likely spans multiple chunks "
            "and requires the surrounding context that this strategy doesn't capture.",
        )

    # RERANKING_HELPS
    # naive or hybrid failed but rerank passed
    # → initial retrieval order was wrong; reranking fixes it
    if (
        strategy_name in ("naive", "hybrid")
        and "rerank" in available
        and _overall(all_scores, "rerank") >= PASS_THRESHOLD
    ):
        return (
            "RERANKING_HELPS",
            "Add Cohere reranking — the relevant chunks are being retrieved but "
            "ranked too low. Reranking pushes them to the top.",
        )

    # EMBEDDING_WEAKNESS
    # naive failed but hybrid passed
    # → the embedding model can't capture this domain's semantics;
    #   keyword overlap compensates
    if (
        strategy_name == "naive"
        and "hybrid" in available
        and _overall(all_scores, "hybrid") >= PASS_THRESHOLD
    ):
        return (
            "EMBEDDING_WEAKNESS",
            "Switch to Hybrid search — keyword fusion compensates for the "
            "embedding model's weakness on this domain's terminology.",
        )

    # GENERATION_FAILURE
    # All available strategies have low average faithfulness
    # → retrieval might be fine; the LLM isn't using the context
    if len(all_scores) >= 3:
        avg_faith = sum(_faith(all_scores, s) for s in all_scores) / len(all_scores)
        if avg_faith < 0.45:
            return (
                "GENERATION_FAILURE",
                "The LLM is not faithfully using the retrieved context. "
                "Try a stronger model or add an explicit instruction to cite the passages.",
            )

    # RETRIEVAL_LOGIC
    # hybrid failed but naive passed — fusion is actively hurting quality
    if (
        strategy_name == "hybrid"
        and "naive" in available
        and _overall(all_scores, "naive") >= PASS_THRESHOLD
    ):
        return (
            "RETRIEVAL_LOGIC",
            "Disable keyword fusion for this query type — BM25 term matching "
            "is diluting the quality of pure semantic search.",
        )

    return (
        "NO_CLEAR_PATTERN",
        "No single root cause identified. Consider fine-tuning the embedding "
        "model or experimenting with larger chunk sizes for this document type.",
    )


# ---------------------------------------------------------------------------
# Run-level summaries
# ---------------------------------------------------------------------------

def overall_recommendation(
    by_strategy: dict[str, dict],
    winner: str,
    scores: dict[str, dict],
) -> str:
    """
    Single actionable recommendation for the whole eval run,
    derived from the most common failure pattern across strategies.
    """
    failing_attributions = [
        v["failure_attribution"]
        for v in by_strategy.values()
        if v.get("failure_attribution")
    ]

    if not failing_attributions:
        label = _STRATEGY_LABEL.get(winner, winner)
        return (
            f"All strategies performed well. {label} is your best option — "
            "deploy it with confidence."
        )

    top_cause = Counter(failing_attributions).most_common(1)[0][0]

    _recs = {
        "EMBEDDING_WEAKNESS": (
            "Deploy Hybrid BM25 + Vector search — keyword fusion consistently "
            "compensates for gaps in the embedding model across multiple queries."
        ),
        "RERANKING_HELPS": (
            "Deploy Cohere Rerank — reranking significantly and consistently "
            "improves result quality over raw vector search for this document collection."
        ),
        "CONTEXT_WINDOW": (
            "Deploy Parent-Child retrieval — answers in this document regularly "
            "span multiple chunks and require broader surrounding context."
        ),
        "GENERATION_FAILURE": (
            "The retrieval is working but the LLM is not faithfully using the "
            "context it receives. Upgrade the judge/generation model or strengthen "
            "the system prompt to cite retrieved passages explicitly."
        ),
        "RETRIEVAL_LOGIC": (
            "Pure semantic search outperforms hybrid fusion for this content. "
            "Tune or disable the BM25 component for this document type."
        ),
        "NO_CLEAR_PATTERN": (
            "Results are mixed with no dominant failure mode. Run more eval "
            "queries to establish a pattern before optimizing your pipeline."
        ),
    }
    return _recs.get(top_cause, "No clear optimization path identified.")


def winner_explanation(scores: dict[str, dict], winner: str) -> str:
    """
    Plain-English explanation of why the winner beat the field.
    """
    if not scores or winner not in scores:
        return ""

    w = scores[winner]
    w_overall = w.get("overall", 0.0)

    others = {k: v for k, v in scores.items() if k != winner}
    if not others:
        label = _STRATEGY_LABEL.get(winner, winner)
        return f"{label} was the only strategy evaluated — overall score {w_overall*100:.0f}%."

    runner_up_name = max(others, key=lambda k: others[k].get("overall", 0.0))
    runner_up_score = others[runner_up_name].get("overall", 0.0)
    gap = (w_overall - runner_up_score) * 100

    dims = {
        "faithfulness":  w.get("faithfulness", 0.0),
        "correctness":   w.get("correctness",  0.0),
        "completeness":  w.get("completeness", 0.0),
    }
    best_dim = max(dims, key=lambda d: dims[d])
    best_dim_score = dims[best_dim]

    _dim_reason = {
        "faithfulness":  "its retrieved chunks are tightly aligned with the ground truth",
        "correctness":   "the context it retrieves is sufficient to derive the correct answer",
        "completeness":  "it captures all aspects of the question, not just the most obvious match",
    }

    label_w = _STRATEGY_LABEL.get(winner, winner)
    label_r = _STRATEGY_LABEL.get(runner_up_name, runner_up_name)

    return (
        f"{label_w} scored {w_overall*100:.0f}% overall, "
        f"{gap:.0f} points ahead of {label_r} ({runner_up_score*100:.0f}%). "
        f"Its strongest dimension was {best_dim} ({best_dim_score*100:.0f}%), "
        f"meaning {_dim_reason.get(best_dim, 'it outperformed on key quality metrics')}."
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def analyze_failures(
    scores: dict[str, dict],
    winner: str,
) -> dict:
    """
    Main entry point called from agent.aggregate_results.

    Returns:
    {
        "by_strategy": {
            strategy_name: {
                "failure_attribution": str | None,
                "recommendation":      str,
            }
        },
        "overall_recommendation": str,
        "winner_explanation":     str,
    }
    """
    by_strategy: dict[str, dict] = {}
    for name in scores:
        attr, rec = attribute_strategy(name, scores)
        by_strategy[name] = {"failure_attribution": attr, "recommendation": rec}

    return {
        "by_strategy":           by_strategy,
        "overall_recommendation": overall_recommendation(by_strategy, winner, scores),
        "winner_explanation":     winner_explanation(scores, winner),
    }

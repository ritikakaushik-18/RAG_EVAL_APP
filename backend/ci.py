"""
CI regression comparison — pure functions (no DB access).

Takes structured result dicts from two eval runs, checks them against
threshold configuration, and returns the full comparison payload including
the GitHub-ready comment markdown.
"""

from attribution import ATTRIBUTION_LABEL

_STRATEGY_LABEL = {
    "naive":        "Naive RAG",
    "hybrid":       "Hybrid BM25 + Vector",
    "rerank":       "Cohere Rerank",
    "hyde":         "HyDE",
    "parent_child": "Parent-Child",
}

_DIMS = ["faithfulness", "correctness", "completeness", "overall"]

DEFAULT_THRESHOLDS: dict = {
    "faithfulness":       0.75,
    "correctness":        0.75,
    "completeness":       0.70,
    "overall":            0.75,
    "max_regression_pct": 5.0,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _winner_scores(results: list[dict]) -> tuple[str, dict[str, float]]:
    """Return (winner_name, {dim: score}) from a list of eval-result dicts."""
    if not results:
        return "", {d: 0.0 for d in _DIMS}
    winner = max(results, key=lambda r: r.get("overall_score") or 0.0)
    return winner["strategy_name"], {
        "faithfulness": winner.get("faithfulness_score") or 0.0,
        "correctness":  winner.get("correctness_score")  or 0.0,
        "completeness": winner.get("completeness_score") or 0.0,
        "overall":      winner.get("overall_score")      or 0.0,
    }


# ---------------------------------------------------------------------------
# Main comparison function
# ---------------------------------------------------------------------------

def compare_runs(
    baseline_results:    list[dict],
    current_results:     list[dict],
    thresholds:          dict,
    current_eval_run_id: str,
    current_attribution: dict | None = None,
    app_base_url:        str = "",
) -> dict:
    """
    Compare a current eval run against a baseline and return the full
    summary dict that is stored in ci_runs.summary and served by
    GET /ci/{ci_run_id}.
    """
    merged = {**DEFAULT_THRESHOLDS, **thresholds}

    baseline_winner, baseline_scores = _winner_scores(baseline_results)
    current_winner,  current_scores  = _winner_scores(current_results)

    diffs: dict[str, float] = {
        dim: round(current_scores[dim] - baseline_scores[dim], 4)
        for dim in _DIMS
    }

    failed: list[str] = []
    max_reg_frac = merged.get("max_regression_pct", 5.0) / 100.0

    for dim in _DIMS:
        curr = current_scores[dim]
        base = baseline_scores[dim]

        hard_floor = merged.get(dim)
        if hard_floor is not None and curr < hard_floor:
            failed.append(f"{dim} ({curr:.2f}) < threshold ({hard_floor:.2f})")

        if base > 0 and (base - curr) / base > max_reg_frac:
            label = (
                f"{dim} regressed {(base - curr) / base * 100:.1f}% "
                f"(max {merged['max_regression_pct']:.0f}%)"
            )
            if label not in failed:
                failed.append(label)

    passed = len(failed) == 0

    # Pull attribution for the current winner from the post-eval attribution data
    failure_attribution = ""
    recommendation = ""
    if current_attribution:
        by_strategy = current_attribution.get("by_strategy", {})
        attr = by_strategy.get(current_winner, {})
        failure_attribution = attr.get("failure_attribution") or ""
        recommendation = (
            attr.get("recommendation")
            or current_attribution.get("overall_recommendation", "")
        )

    markdown = _build_markdown(
        baseline_scores=baseline_scores,
        current_scores=current_scores,
        diffs=diffs,
        thresholds=merged,
        failed=failed,
        passed=passed,
        current_winner=current_winner,
        failure_attribution=failure_attribution,
        recommendation=recommendation,
        eval_run_id=current_eval_run_id,
        app_base_url=app_base_url,
    )

    return {
        "passed":                  passed,
        "baseline_winner":         baseline_winner,
        "current_winner":          current_winner,
        "baseline_scores":         baseline_scores,
        "current_scores":          current_scores,
        "diffs":                   diffs,
        "failed_thresholds":       failed,
        "recommendation":          recommendation,
        "failure_attribution":     failure_attribution,
        "github_comment_markdown": markdown,
    }


# ---------------------------------------------------------------------------
# Markdown builder
# ---------------------------------------------------------------------------

def _build_markdown(
    baseline_scores:     dict,
    current_scores:      dict,
    diffs:               dict,
    thresholds:          dict,
    failed:              list[str],
    passed:              bool,
    current_winner:      str,
    failure_attribution: str,
    recommendation:      str,
    eval_run_id:         str,
    app_base_url:        str,
) -> str:
    max_reg_frac = thresholds.get("max_regression_pct", 5.0) / 100.0
    rows = []
    for dim in _DIMS:
        base = baseline_scores.get(dim, 0.0)
        curr = current_scores.get(dim, 0.0)
        diff = diffs.get(dim, 0.0)

        hard_floor = thresholds.get(dim)
        fail_hard = hard_floor is not None and curr < hard_floor
        fail_reg  = base > 0 and (base - curr) / base > max_reg_frac
        status = "❌" if (fail_hard or fail_reg) else "✅"

        diff_str = f"+{diff:.2f}" if diff >= 0 else f"{diff:.2f}"
        rows.append(
            f"| {dim.capitalize()} | {base:.2f} | {curr:.2f} | {diff_str} | {status} |"
        )

    table = (
        "## RAG Quality Gate Results\n\n"
        "| Metric | Baseline | Current | Change | Status |\n"
        "|--------|----------|---------|--------|--------|\n"
        + "\n".join(rows)
    )

    winner_label  = _STRATEGY_LABEL.get(current_winner, current_winner)
    attr_label    = ATTRIBUTION_LABEL.get(failure_attribution, "") if failure_attribution else ""

    details = f"\n\n**Winner Strategy:** {winner_label}"
    if attr_label:
        details += f"\n\n**Root Cause:** {attr_label}"
    if recommendation:
        details += f"\n\n**Recommendation:** {recommendation}"

    if passed:
        verdict = "\n\n✅ **SAFE TO MERGE** — All quality thresholds passed"
    else:
        bullet_list = "\n".join(f"- `{ft}`" for ft in failed)
        verdict = f"\n\n❌ **MERGE BLOCKED** — Quality dropped below threshold\n\n{bullet_list}"

    base_url = app_base_url.rstrip("/")
    report_link = f"\n\n[View Full Report]({base_url}/eval/{eval_run_id})" if base_url else ""

    return table + details + verdict + report_link

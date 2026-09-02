#!/usr/bin/env python3
"""
RAG Eval Framework — End-to-End Test Suite
Run with: python backend/test_e2e.py
"""

import asyncio
import csv
import io
import json
import os
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import httpx
from dotenv import load_dotenv
from reportlab.pdfgen import canvas

# ---------------------------------------------------------------------------
# Sample PDF generator
# ---------------------------------------------------------------------------

def create_sample_pdf() -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    c = canvas.Canvas(tmp.name)
    c.drawString(100, 750, "RAG Eval Test Document")
    c.drawString(100, 700, "This is a sample document for testing.")
    c.drawString(100, 650, "It contains information about software engineering.")
    c.drawString(100, 600, "The author has experience with Python and FastAPI.")
    c.drawString(100, 550, "They have worked at companies including Acme Corp.")
    c.drawString(100, 500, "Skills include LangChain, pgvector, and PostgreSQL.")
    c.drawString(100, 450, "Education: Bachelor of Computer Science.")
    c.drawString(100, 400, "Location: Toronto, Ontario, Canada.")
    c.drawString(100, 350, "Contact: test@example.com")
    c.save()
    return tmp.name


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).parent / ".env")

BASE_URL = "http://localhost:8000"
QUERY = "What companies has the author worked at?"
CORRECT_ANSWER = "The author has worked at companies including Acme Corp."
TENANT_ID = "e2e"
STRATEGIES = ["naive", "hybrid", "rerank", "hyde", "parent_child"]

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

S = {
    "api_key":           None,
    "document_id_1":     None,
    "document_id_2":     None,
    "chunk_count":       None,
    "eval_run_id":       None,
    "winner":            None,
    "winner_score":      None,
    "eval_cost":         0.0,
    "eval_time":         0.0,
    "baseline_id":       None,
    "ci_run_id":         None,
    "ci_passed":         None,
    "test_set_id":       None,
    "item_count":        None,
    "scrubbed_count":    0,
}

# Test result registry: name -> ("pass"|"fail"|"skip", detail_str)
RESULTS: dict[str, tuple[str, str]] = {}
RUN_START = time.time()
TOTAL_COST = 0.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def p(msg: str = "") -> None:
    print(msg, flush=True)


def _record(name: str, status: str, detail: str = "") -> None:
    RESULTS[name] = (status, detail)


async def _poll(
    client: httpx.AsyncClient,
    url: str,
    done_fn,
    interval: float = 5.0,
    timeout: float = 120.0,
    headers: dict | None = None,
) -> dict:
    """Poll `url` until `done_fn(data)` is truthy or `timeout` expires."""
    deadline = time.time() + timeout
    kw: dict = {}
    if headers:
        kw["headers"] = headers
    while time.time() < deadline:
        resp = await client.get(url, **kw)
        resp.raise_for_status()
        data = resp.json()
        if done_fn(data):
            return data
        await asyncio.sleep(interval)
    raise TimeoutError(f"Timed out after {timeout}s polling {url}")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_health(client: httpx.AsyncClient) -> None:
    name = "Health check"
    try:
        resp = await client.get(f"{BASE_URL}/health")
        resp.raise_for_status()
        data = resp.json()
        assert data.get("status") == "healthy",     f"status={data.get('status')}"
        assert data.get("database") == "connected", f"database={data.get('database')}"
        assert data.get("s3") == "connected",       f"s3={data.get('s3')}"
        assert data.get("openrouter") == "connected", f"openrouter={data.get('openrouter')}"
        p(f"✅ Health check — all services connected")
        _record(name, "pass")
    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))


async def test_generate_api_key(client: httpx.AsyncClient) -> None:
    name = "API key generation"
    try:
        resp = await client.post(
            f"{BASE_URL}/api-keys",
            json={"tenant_id": TENANT_ID},
        )
        resp.raise_for_status()
        data = resp.json()
        key = data.get("key")
        assert key, "No 'key' in response"
        S["api_key"] = key
        p(f"✅ API key generated — prefix: {key[:8]}...")
        _record(name, "pass")
    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))


async def test_multi_file_upload(client: httpx.AsyncClient, pdf_path: str) -> None:
    name = "Multi-file upload (2 documents)"
    if not S["api_key"] and RESULTS.get("API key generation", ("fail",))[0] == "fail":
        p(f"⏭  {name} — skipped (depends on API key generation)")
        _record(name, "skip", "depends on API key generation")
        return
    try:
        pdf_bytes = Path(pdf_path).read_bytes()
        files = [
            ("files", ("sample_doc.pdf",      io.BytesIO(pdf_bytes), "application/pdf")),
            ("files", ("sample_doc_copy.pdf",  io.BytesIO(pdf_bytes), "application/pdf")),
        ]
        data = {"tenant_id": TENANT_ID}
        resp = await client.post(
            f"{BASE_URL}/documents/upload",
            files=files,
            data=data,
            timeout=60.0,
        )
        resp.raise_for_status()
        body = resp.json()
        docs = body.get("documents", [])
        count = body.get("count", 0)
        assert count == 2,    f"Expected count=2, got {count}"
        assert len(docs) == 2, f"Expected 2 docs, got {len(docs)}"
        for d in docs:
            assert d.get("document_id"), "Missing document_id"
            assert d.get("filename"),    "Missing filename"
            assert d.get("s3_key"),      "Missing s3_key"
        S["document_id_1"] = docs[0]["document_id"]
        S["document_id_2"] = docs[1]["document_id"]
        p(f"✅ Multi-file upload — 2 documents uploaded")
        _record(name, "pass")
    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))


async def test_ingestion(client: httpx.AsyncClient) -> None:
    name = "Document ingestion"
    if not S["document_id_1"]:
        p(f"⏭  {name} — skipped (depends on multi-file upload)")
        _record(name, "skip", "depends on multi-file upload")
        return
    try:
        resp = await client.post(
            f"{BASE_URL}/documents/{S['document_id_1']}/ingest",
            timeout=120.0,
        )
        resp.raise_for_status()
        data = resp.json()
        assert data.get("status") == "ingested", f"status={data.get('status')}"
        chunk_count = data.get("chunk_count", 0)
        assert chunk_count > 0, f"chunk_count={chunk_count}"
        S["chunk_count"] = chunk_count
        p(f"✅ Ingestion — {chunk_count} chunks created")
        _record(name, "pass", f"{chunk_count} chunks")
    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))


async def test_retrieval_strategies(client: httpx.AsyncClient) -> None:
    if not S["document_id_1"] or not S["chunk_count"]:
        for strategy in STRATEGIES:
            label = _strategy_label(strategy)
            p(f"⏭  {label} retrieval — skipped (depends on ingestion)")
            _record(f"{label} retrieval", "skip", "depends on ingestion")
        return

    for strategy in STRATEGIES:
        label = _strategy_label(strategy)
        name = f"{label} retrieval"
        try:
            resp = await client.post(
                f"{BASE_URL}/retrieve/test",
                json={
                    "query":        QUERY,
                    "document_ids": [S["document_id_1"]],
                    "strategy":     strategy,
                },
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()
            results_list = data.get("results", [])
            assert len(results_list) > 0, "Empty results list"
            first = results_list[0]
            assert first.get("content", "").strip(), "First result has empty content"
            score = first.get("score")
            assert score is not None, "Missing score"
            assert isinstance(score, (int, float)), f"score is not a number: {type(score)}"
            assert score > 0, f"score={score} is not > 0"
            assert first.get("strategy") == strategy, \
                f"strategy mismatch: {first.get('strategy')} != {strategy}"
            p(f"✅ {label} — {len(results_list)} chunks returned  "
              f"top score: {score:.3f}")
            _record(name, "pass", f"{len(results_list)} chunks, top score {score:.3f}")
        except Exception as exc:
            p(f"❌ {label} FAILED: {exc}")
            _record(name, "fail", str(exc))


def _strategy_label(strategy: str) -> str:
    return {
        "naive":        "Naive RAG",
        "hybrid":       "Hybrid BM25",
        "rerank":       "Cohere Rerank",
        "hyde":         "HyDE",
        "parent_child": "Parent-Child",
    }.get(strategy, strategy)


async def test_full_eval(client: httpx.AsyncClient) -> None:
    name = "Full evaluation run"
    if not S["document_id_1"]:
        p(f"⏭  {name} — skipped (depends on document upload)")
        _record(name, "skip", "depends on document upload")
        return
    try:
        t0 = time.time()
        resp = await client.post(
            f"{BASE_URL}/eval/run",
            json={
                "query":          QUERY,
                "correct_answer": CORRECT_ANSWER,
                "document_ids":   [S["document_id_1"]],
                "tenant_id":      TENANT_ID,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        start_data = resp.json()
        eval_run_id = start_data.get("eval_run_id")
        assert eval_run_id, "No eval_run_id returned"
        S["eval_run_id"] = eval_run_id

        data = await _poll(
            client,
            f"{BASE_URL}/eval/{eval_run_id}",
            done_fn=lambda d: d.get("status") != "running",
            interval=5.0,
            timeout=180.0,
        )
        elapsed = round(time.time() - t0)

        assert data.get("status") == "completed", f"status={data.get('status')}"
        winner = data.get("winner")
        assert winner in STRATEGIES, f"winner '{winner}' not in {STRATEGIES}"
        strategies = data.get("strategies", [])
        assert len(strategies) == 5, f"Expected 5 strategies, got {len(strategies)}"

        for s in strategies:
            strat = s.get("strategy")
            assert (s.get("overall_score")    or 0) > 0, f"{strat} overall_score <= 0"
            assert (s.get("faithfulness")     or 0) > 0, f"{strat} faithfulness <= 0"
            assert (s.get("correctness")      or 0) > 0, f"{strat} correctness <= 0"
            assert (s.get("completeness")     or 0) > 0, f"{strat} completeness <= 0"

        assert data.get("winner_explanation"), "winner_explanation is empty"
        assert data.get("overall_recommendation"), "overall_recommendation is empty"
        total_cost = data.get("total_cost_usd", 0.0)
        assert total_cost > 0, f"total_cost_usd={total_cost}"

        lowest = min(strategies, key=lambda s: s.get("overall_score") or 1.0)
        lowest_score = lowest.get("overall_score") or 0.0
        attribution = lowest.get("failure_attribution") or ""

        S["winner"]       = winner
        S["winner_score"] = next(
            s["overall_score"] for s in strategies if s["strategy"] == winner
        )
        S["eval_cost"] = total_cost
        S["eval_time"] = elapsed
        global TOTAL_COST
        TOTAL_COST += total_cost

        winner_score_pct = S["winner_score"]
        p(f"✅ Evaluation completed")
        p(f"   Winner: {winner} ({winner_score_pct:.0%})")
        p(f"   Cost:   ${total_cost:.4f}")
        p(f"   Time:   {elapsed}s")
        if attribution:
            p(f"   Attribution (lowest): {attribution[:80]}")
        _record(name, "pass", f"winner={winner} cost=${total_cost:.4f}")

        # Sub-record for failure attribution
        attr_name = "Failure attribution"
        score_gap = winner_score_pct - lowest_score
        if score_gap > 0.05:
            assert attribution, (
                f"lowest strategy '{lowest.get('strategy')}' has no failure_attribution "
                f"but winner-lowest gap is {score_gap:.2f} (> 0.05)"
            )
            _record(attr_name, "pass", attribution[:80])
            p(f"✅ Failure attribution — present on lowest scorer")
        else:
            note = f"all strategies tied (~{winner_score_pct:.2f}), no attribution needed"
            _record(attr_name, "pass", note)
            p(f"✅ Failure attribution — {note}")

    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))
        _record("Failure attribution", "fail", "depends on eval run")


async def test_baseline_creation(client: httpx.AsyncClient) -> None:
    name = "Baseline creation"
    if not S["eval_run_id"] or RESULTS.get("Full evaluation run", ("fail",))[0] != "pass":
        p(f"⏭  {name} — skipped (depends on full evaluation run)")
        _record(name, "skip", "depends on full evaluation run")
        return
    if not S["api_key"]:
        p(f"⏭  {name} — skipped (depends on API key generation)")
        _record(name, "skip", "depends on API key generation")
        return
    try:
        headers = {"X-API-Key": S["api_key"]}
        resp = await client.post(
            f"{BASE_URL}/baselines",
            json={
                "name":        "e2e-test-baseline",
                "eval_run_id": S["eval_run_id"],
                "tenant_id":   TENANT_ID,
                "thresholds": {
                    "overall":            0.50,
                    "faithfulness":       0.50,
                    "correctness":        0.50,
                    "completeness":       0.50,
                    "max_regression_pct": 50,
                },
            },
            headers=headers,
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        baseline_id = data.get("baseline_id")
        assert baseline_id, "No baseline_id in response"
        assert data.get("name") == "e2e-test-baseline", \
            f"name mismatch: {data.get('name')}"
        S["baseline_id"] = baseline_id

        # Verify it appears in the list
        list_resp = await client.get(
            f"{BASE_URL}/baselines",
            headers=headers,
            timeout=30.0,
        )
        list_resp.raise_for_status()
        baselines = list_resp.json()
        ids = [b.get("baseline_id") for b in baselines]
        assert baseline_id in ids, f"Baseline {baseline_id} not found in list"

        p(f"✅ Baseline created — {baseline_id[:8]}...")
        _record(name, "pass", baseline_id[:8])
    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))


async def test_ci_run(client: httpx.AsyncClient) -> None:
    name = "CI run"
    if not S["baseline_id"] or RESULTS.get("Baseline creation", ("fail",))[0] != "pass":
        p(f"⏭  {name} — skipped (depends on baseline creation)")
        _record(name, "skip", "depends on baseline creation")
        return
    if not S["api_key"]:
        p(f"⏭  {name} — skipped (depends on API key generation)")
        _record(name, "skip", "depends on API key generation")
        return
    try:
        headers = {"X-API-Key": S["api_key"]}
        resp = await client.post(
            f"{BASE_URL}/ci/run",
            json={
                "baseline_id":    S["baseline_id"],
                "query":          QUERY,
                "correct_answer": CORRECT_ANSWER,
                "document_ids":   [S["document_id_1"]],
                "tenant_id":      TENANT_ID,
                "pr_number":      "e2e-test-pr-99",
                "commit_sha":     "abc123def456",
            },
            headers=headers,
            timeout=30.0,
        )
        resp.raise_for_status()
        start_data = resp.json()
        ci_run_id = start_data.get("ci_run_id")
        assert ci_run_id, "No ci_run_id returned"
        S["ci_run_id"] = ci_run_id

        data = await _poll(
            client,
            f"{BASE_URL}/ci/{ci_run_id}",
            done_fn=lambda d: d.get("status") not in ("running", None),
            interval=5.0,
            timeout=180.0,
        )

        assert data.get("status") != "running", "CI run still running after timeout"
        passed = data.get("passed")
        assert passed is not None, "passed field is None"
        S["ci_passed"] = passed

        markdown = data.get("github_comment_markdown") or ""
        assert markdown, "github_comment_markdown is empty"
        assert "## RAG Quality Gate" in markdown, \
            "github_comment_markdown missing '## RAG Quality Gate'"
        assert data.get("baseline_scores"), "baseline_scores is empty"
        assert data.get("current_scores"),  "current_scores is empty"
        assert data.get("diffs"),           "diffs is empty"

        result_str = "PASSED ✅" if passed else "FAILED ❌"
        p(f"✅ CI run completed")
        p(f"   Result: {result_str}")
        p(f"   Markdown preview:")
        for line in markdown.splitlines()[:3]:
            p(f"   {line}")
        _record(name, "pass", result_str)
    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))


async def test_synthetic_dataset(client: httpx.AsyncClient) -> None:
    name = "Synthetic test generation"
    if not S["document_id_1"]:
        p(f"⏭  {name} — skipped (depends on document upload)")
        _record(name, "skip", "depends on document upload")
        return
    try:
        resp = await client.post(
            f"{BASE_URL}/datasets/generate",
            json={
                "name":                "e2e-test-dataset",
                "document_ids":        [S["document_id_1"]],
                "tenant_id":           TENANT_ID,
                "questions_per_chunk": 1,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        start_data = resp.json()
        test_set_id = start_data.get("test_set_id")
        assert test_set_id, "No test_set_id returned"
        S["test_set_id"] = test_set_id

        data = await _poll(
            client,
            f"{BASE_URL}/datasets/{test_set_id}",
            done_fn=lambda d: d.get("status") == "ready",
            interval=5.0,
            timeout=180.0,
        )

        assert data.get("status") == "ready", f"status={data.get('status')}"
        item_count = data.get("item_count", 0)
        assert item_count > 0, f"item_count={item_count}"
        items = data.get("items", [])
        assert len(items) > 0, "items list is empty"

        first = items[0]
        assert first.get("question", "").strip(), "First item has empty question"
        assert first.get("answer", "").strip(),   "First item has empty answer"
        assert "pii_scrubbed" in first,           "First item missing pii_scrubbed field"
        assert isinstance(first["pii_scrubbed"], bool), \
            f"pii_scrubbed is not bool: {type(first['pii_scrubbed'])}"

        scrubbed_count = sum(1 for it in items if it.get("pii_scrubbed"))
        S["item_count"]     = item_count
        S["scrubbed_count"] = scrubbed_count

        p(f"✅ Test set generated")
        p(f"   {item_count} questions created")
        p(f"   PII scrubbed: {scrubbed_count}")
        _record(name, "pass", f"{item_count} questions, {scrubbed_count} scrubbed")
    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))


async def test_audit_export(client: httpx.AsyncClient) -> None:
    name = "Audit export ZIP"
    if not S["test_set_id"] or RESULTS.get("Synthetic test generation", ("fail",))[0] != "pass":
        p(f"⏭  {name} — skipped (depends on synthetic test generation)")
        _record(name, "skip", "depends on synthetic test generation")
        return
    try:
        resp = await client.get(
            f"{BASE_URL}/datasets/{S['test_set_id']}/export",
            timeout=60.0,
        )
        resp.raise_for_status()
        assert resp.status_code == 200, f"status_code={resp.status_code}"
        ct = resp.headers.get("content-type", "")
        assert "application/zip" in ct, f"content-type={ct}"
        raw = resp.content
        assert len(raw) > 0, "Empty response body"

        zip_path = Path("/tmp/e2e_audit_test.zip")
        zip_path.write_bytes(raw)
        size_kb = round(len(raw) / 1024, 1)

        expected_files = {"questions.csv", "scrub_report.json", "metadata.json", "summary.pdf"}
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            names_in_zip = set(zf.namelist())
            for fname in expected_files:
                assert fname in names_in_zip, f"Missing '{fname}' in ZIP"

            # Verify questions.csv
            csv_bytes = zf.read("questions.csv").decode("utf-8")
            reader = csv.DictReader(io.StringIO(csv_bytes))
            rows = list(reader)
            fieldnames = reader.fieldnames or []
            assert len(rows) >= 1, "questions.csv has no data rows"
            for col in ("question", "answer", "pii_scrubbed"):
                assert col in fieldnames, f"questions.csv missing column '{col}'"

            # Verify metadata.json
            meta = json.loads(zf.read("metadata.json").decode("utf-8"))
            assert "test_set_id" in meta, "metadata.json missing test_set_id"
            assert "item_count"  in meta, "metadata.json missing item_count"
            assert "model"       in meta, "metadata.json missing model"

            # Verify scrub_report.json is valid JSON list
            scrub = json.loads(zf.read("scrub_report.json").decode("utf-8"))
            assert isinstance(scrub, list), "scrub_report.json is not a list"

            # Verify summary.pdf is non-empty
            pdf_bytes = zf.read("summary.pdf")
            assert len(pdf_bytes) > 0, "summary.pdf is empty"

        p(f"✅ Audit export verified")
        p(f"   ZIP size: {size_kb}KB")
        p(f"   Files: questions.csv, scrub_report.json, metadata.json, summary.pdf")
        p(f"   Questions in CSV: {len(rows)}")
        _record(name, "pass", f"{size_kb}KB, {len(rows)} CSV rows")
    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))


async def test_documents_list(client: httpx.AsyncClient) -> None:
    name = "Documents list"
    if not S["document_id_1"]:
        p(f"⏭  {name} — skipped (depends on document upload)")
        _record(name, "skip", "depends on document upload")
        return
    try:
        resp = await client.get(
            f"{BASE_URL}/documents",
            params={"tenant_id": TENANT_ID},
            timeout=30.0,
        )
        resp.raise_for_status()
        docs = resp.json()
        assert isinstance(docs, list), "Expected a list"
        ids = {d.get("document_id") for d in docs}
        assert S["document_id_1"] in ids, \
            f"document_id_1 {S['document_id_1'][:8]}... not found in list"
        assert S["document_id_2"] in ids, \
            f"document_id_2 {S['document_id_2'][:8]}... not found in list"

        # After ingestion, document_id_1 should have chunk_count > 0
        if S["chunk_count"]:
            our_doc = next(d for d in docs if d["document_id"] == S["document_id_1"])
            assert our_doc.get("chunk_count", 0) > 0, \
                f"chunk_count={our_doc.get('chunk_count')}"

        p(f"✅ Documents list — {len(docs)} documents found")
        _record(name, "pass", f"{len(docs)} docs")
    except Exception as exc:
        p(f"❌ {name} FAILED: {exc}")
        _record(name, "fail", str(exc))


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def print_cleanup() -> None:
    p()
    p("─" * 50)
    p("  Test data created (can be ignored or deleted):")
    p(f"  - Documents: {S['document_id_1']}, {S['document_id_2']}")
    p(f"  - Eval run:  {S['eval_run_id']}")
    p(f"  - Baseline:  {S['baseline_id']}")
    p(f"  - Test set:  {S['test_set_id']}")
    key = S["api_key"] or ""
    p(f"  - API key:   {key[:8]}...")
    p("─" * 50)


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

_TEST_ORDER = [
    ("Health check",                "Health check"),
    ("API key generation",          "API key generation"),
    ("Multi-file upload (2 documents)", "Multi-file upload (2 documents)"),
    ("Document ingestion",          "Document ingestion"),
    ("Naive RAG retrieval",         "Naive RAG retrieval"),
    ("Hybrid BM25 retrieval",       "Hybrid BM25 retrieval"),
    ("Cohere Rerank retrieval",     "Cohere Rerank retrieval"),
    ("HyDE retrieval",              "HyDE retrieval"),
    ("Parent-Child retrieval",      "Parent-Child retrieval"),
    ("Full evaluation run",         "Full evaluation run"),
    ("Failure attribution",         "Failure attribution"),
    ("Baseline creation",           "Baseline creation"),
    ("CI run",                      "CI run"),
    ("Synthetic test generation",   "Synthetic test generation"),
    ("Audit export ZIP",            "Audit export ZIP"),
    ("Documents list",              "Documents list"),
]


def _summary_line(display: str, result_key: str) -> str:
    entry = RESULTS.get(result_key)
    if entry is None:
        return f"  ⏭  {display} — not reached"
    status, detail = entry
    if status == "pass":
        suffix = f" ({detail})" if detail else ""
        return f"  ✅ {display}{suffix}"
    elif status == "skip":
        return f"  ⏭  {display} — skipped ({detail})"
    else:
        return f"  ❌ {display} — {detail}"


def print_summary() -> None:
    elapsed = round(time.time() - RUN_START)
    passed  = sum(1 for v in RESULTS.values() if v[0] == "pass")
    failed  = sum(1 for v in RESULTS.values() if v[0] == "fail")
    skipped = sum(1 for v in RESULTS.values() if v[0] == "skip")
    total   = passed + failed + skipped

    ci_label = ""
    if S["ci_passed"] is not None:
        ci_label = " (PASSED)" if S["ci_passed"] else " (FAILED)"

    ingestion_detail = f" ({S['chunk_count']} chunks)" if S.get("chunk_count") else ""
    dataset_detail   = f" ({S['item_count']} questions)" if S.get("item_count") else ""
    winner_detail    = f" (winner: {S['winner']})" if S.get("winner") else ""

    p()
    p("══════════════════════════════════════════")
    p("  RAG EVAL FRAMEWORK — E2E TEST RESULTS")
    p("══════════════════════════════════════════")
    for display, key in _TEST_ORDER:
        entry = RESULTS.get(key)
        if entry is None:
            p(f"  ⏭  {display} — not reached")
            continue
        status, detail = entry
        if status == "pass":
            extra = ""
            if key == "Document ingestion" and ingestion_detail:
                extra = ingestion_detail
            elif key == "Full evaluation run" and winner_detail:
                extra = winner_detail
            elif key == "CI run" and ci_label:
                extra = ci_label
            elif key == "Synthetic test generation" and dataset_detail:
                extra = dataset_detail
            elif key == "Audit export ZIP" and detail:
                extra = f" ({detail})"
            p(f"  ✅ {display}{extra}")
        elif status == "skip":
            p(f"  ⏭  {display} — skipped ({detail})")
        else:
            p(f"  ❌ {display} — {detail}")
    p("══════════════════════════════════════════")
    if failed == 0 and skipped == 0:
        p(f"  {passed}/{total} tests passed ✅")
    else:
        p(f"  {passed}/{total} tests passed")
        if failed:
            p(f"  {failed} FAILED — see errors above")
        if skipped:
            p(f"  {skipped} skipped")
    p(f"  Total time: {elapsed}s")
    p(f"  Total LLM cost: ${TOTAL_COST:.4f}")
    p("══════════════════════════════════════════")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> int:
    pdf_path = create_sample_pdf()

    p()
    p("══════════════════════════════════════════")
    p("  RAG Eval Framework — E2E Test Suite")
    p("══════════════════════════════════════════")
    p(f"  Base URL: {BASE_URL}")
    p(f"  PDF:      generated sample document (temp file)")
    p()

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        # --- Test 1: Health ---
        await test_health(client)
        p()

        # --- Test 2: API key ---
        await test_generate_api_key(client)
        p()

        # --- Test 3: Multi-file upload ---
        await test_multi_file_upload(client, pdf_path)
        p()

        # --- Test 4: Ingestion ---
        await test_ingestion(client)
        p()

        # --- Test 5: Retrieval strategies ---
        await test_retrieval_strategies(client)
        p()

        # --- Test 6: Full eval ---
        await test_full_eval(client)
        p()

        # --- Test 7: Baseline ---
        await test_baseline_creation(client)
        p()

        # --- Test 8: CI run ---
        await test_ci_run(client)
        p()

        # --- Test 9: Synthetic dataset ---
        await test_synthetic_dataset(client)
        p()

        # --- Test 10: Audit export ---
        await test_audit_export(client)
        p()

        # --- Test 11: Documents list ---
        await test_documents_list(client)

    print_cleanup()
    print_summary()

    os.unlink(pdf_path)

    failed = sum(1 for v in RESULTS.values() if v[0] == "fail")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

"""
Synthetic test-set generator with PII scrubbing.

LangGraph topology:
  START
    → load_chunks
    → dispatch_batches          [no-op; fan-out via conditional edge]
    → generate_batch ×N         [parallel LLM calls, one per batch of 5 chunks]
    → scrub_pii                 [Presidio; runs in thread pool]
    → save_dataset
    → END
"""

import asyncio
import io
import json
import logging
import operator
import re
import uuid
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from openai import AsyncOpenAI
from sqlalchemy import select, update

from config import settings as _settings
from database import AsyncSessionLocal
from models import Chunk, TestSet, TestSetItem

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Presidio — lazy-loaded so startup memory stays low
# ---------------------------------------------------------------------------

_presidio_analyzer  = None
_presidio_anonymizer = None


def _get_presidio():
    """Return (analyzer, anonymizer) or (None, None) if unavailable."""
    global _presidio_analyzer, _presidio_anonymizer
    if _presidio_analyzer is not None:
        return _presidio_analyzer, _presidio_anonymizer
    try:
        from presidio_analyzer import AnalyzerEngine
        from presidio_analyzer.nlp_engine import NlpEngineProvider
        from presidio_anonymizer import AnonymizerEngine

        configuration = {
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
        }
        provider = NlpEngineProvider(nlp_configuration=configuration)
        nlp_engine = provider.create_engine()
        _presidio_analyzer  = AnalyzerEngine(nlp_engine=nlp_engine)
        _presidio_anonymizer = AnonymizerEngine()
        logger.info("Presidio PII analyzer loaded (en_core_web_sm).")
    except Exception as exc:
        logger.warning(
            "Presidio/spacy unavailable: %s  — PII scrubbing will be skipped. "
            "Run: python -m spacy download en_core_web_sm",
            exc,
        )
    return _presidio_analyzer, _presidio_anonymizer


_PII_MAP = {
    "PERSON":          "<PERSON>",
    "EMAIL_ADDRESS":   "<EMAIL>",
    "PHONE_NUMBER":    "<PHONE>",
    "CREDIT_CARD":     "<ID>",
    "US_SSN":          "<ID>",
    "US_BANK_NUMBER":  "<ID>",
    "US_ITIN":         "<ID>",
    "IBAN_CODE":       "<ID>",
    "IP_ADDRESS":      "<ID>",
}


def _scrub_text(text: str, analyzer, anonymizer) -> tuple[str, list[dict]]:
    from presidio_anonymizer.entities import OperatorConfig

    results = analyzer.analyze(text=text, language="en")
    if not results:
        return text, []

    operators = {
        et: OperatorConfig("replace", {"new_value": repl})
        for et, repl in _PII_MAP.items()
    }
    scrubbed = anonymizer.anonymize(
        text=text, analyzer_results=results, operators=operators
    )
    findings = [
        {
            "entity_type": r.entity_type,
            "start":       r.start,
            "end":         r.end,
            "score":       round(r.score, 3),
        }
        for r in results
    ]
    return scrubbed.text, findings


def _scrub_pairs_sync(pairs: list[dict]) -> dict:
    """CPU-bound scrub pass — runs in thread pool via run_in_executor."""
    analyzer, anonymizer = _get_presidio()
    scrubbed_pairs: list[dict] = []
    scrub_log:      list[dict] = []

    for pair in pairs:
        if analyzer is None:
            scrubbed_pairs.append({**pair, "pii_scrubbed": False})
            scrub_log.append({"question_findings": [], "answer_findings": []})
            continue

        sq, qf = _scrub_text(pair.get("question", ""), analyzer, anonymizer)
        sa, af = _scrub_text(pair.get("answer",   ""), analyzer, anonymizer)

        scrubbed_pairs.append({
            **pair,
            "question":    sq,
            "answer":      sa,
            "pii_scrubbed": bool(qf or af),
        })
        scrub_log.append({"question_findings": qf, "answer_findings": af})

    return {"scrubbed_pairs": scrubbed_pairs, "scrub_log": scrub_log}


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class SyntheticState(TypedDict):
    document_ids:        list[str]
    test_set_id:         str
    test_set_name:       str
    questions_per_chunk: int
    chunks:              list[str]
    raw_pairs:           Annotated[list, operator.add]  # merged across parallel nodes
    scrubbed_pairs:      list[dict]
    scrub_log:           list[dict]


# ---------------------------------------------------------------------------
# Node 1 — load_chunks
# ---------------------------------------------------------------------------

async def load_chunks(state: SyntheticState) -> dict:
    logger.info("[load_chunks] %d document(s)", len(state["document_ids"]))
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Chunk.content)
            .where(Chunk.document_id.in_(state["document_ids"]))
            .order_by(Chunk.document_id, Chunk.chunk_index)
        )
        chunks = [row[0] for row in result.fetchall()]
    logger.info("[load_chunks] %d chunks loaded", len(chunks))
    return {"chunks": chunks}


# ---------------------------------------------------------------------------
# Node 2 — dispatch_batches (no-op) + route_to_batches (conditional edge fn)
# ---------------------------------------------------------------------------

def dispatch_batches(state: SyntheticState) -> dict:
    n_batches = (len(state["chunks"]) + 4) // 5
    logger.info(
        "[dispatch_batches] %d chunks → %d batch(es) of 5",
        len(state["chunks"]), n_batches,
    )
    return {}


def route_to_batches(state: SyntheticState) -> list[Send]:
    chunks = state["chunks"]
    return [
        Send(
            "generate_batch",
            {
                "batch":               chunks[i : i + 5],
                "questions_per_chunk": state["questions_per_chunk"],
            },
        )
        for i in range(0, len(chunks), 5)
    ]


# ---------------------------------------------------------------------------
# Node 2b — generate_batch (one per batch, runs in parallel via Send)
# ---------------------------------------------------------------------------

_GEN_SYSTEM = (
    "You are an expert at building evaluation datasets for RAG (Retrieval-Augmented "
    "Generation) systems. Generate realistic questions and accurate answers from document text."
)

_GEN_USER = """\
Given these document excerpts, generate exactly {n} diverse questions per chunk that a \
real user would ask, paired with the correct answer derived from the text.

Document excerpts:
{context}

Return ONLY a valid JSON array — no markdown, no explanation:
[
  {{"question": "...", "answer": "...", "source_chunk": "first 120 chars of the chunk this came from"}},
  ...
]"""


def _parse_json_list(text: str) -> list:
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if m:
        try:
            parsed = json.loads(m.group())
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
    logger.warning("[generate_batch] could not parse JSON: %.200s", text)
    return []


async def generate_batch(payload: dict) -> dict:
    batch = payload["batch"]
    n     = payload.get("questions_per_chunk", 3)

    context = "\n\n---\n\n".join(
        f"[Chunk {i + 1}]\n{chunk[:800]}" for i, chunk in enumerate(batch)
    )

    client = AsyncOpenAI(
        api_key=_settings.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )
    try:
        resp = await client.chat.completions.create(
            model=_settings.OPENROUTER_MODEL,
            messages=[
                {"role": "system", "content": _GEN_SYSTEM},
                {"role": "user",   "content": _GEN_USER.format(n=n, context=context)},
            ],
            max_tokens=1500,
            temperature=0.7,
        )
        raw   = resp.choices[0].message.content.strip()
        pairs = _parse_json_list(raw)
    except Exception as exc:
        logger.exception("[generate_batch] LLM call failed: %s", exc)
        pairs = []

    logger.info("[generate_batch] batch=%d chunks → %d QA pairs", len(batch), len(pairs))
    return {"raw_pairs": pairs}


# ---------------------------------------------------------------------------
# Node 3 — scrub_pii
# ---------------------------------------------------------------------------

async def scrub_pii(state: SyntheticState) -> dict:
    pairs = state["raw_pairs"]
    logger.info("[scrub_pii] %d pairs to scrub", len(pairs))
    if not pairs:
        return {"scrubbed_pairs": [], "scrub_log": []}
    loop   = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, _scrub_pairs_sync, pairs)
    pii_n  = sum(1 for p in result["scrubbed_pairs"] if p.get("pii_scrubbed"))
    logger.info("[scrub_pii] done — %d/%d items had PII", pii_n, len(pairs))
    return result


# ---------------------------------------------------------------------------
# Node 4 — save_dataset
# ---------------------------------------------------------------------------

async def save_dataset(state: SyntheticState) -> dict:
    pairs     = state["scrubbed_pairs"]
    scrub_log = state["scrub_log"]
    logger.info("[save_dataset] saving %d items  test_set=%s", len(pairs), state["test_set_id"])

    async with AsyncSessionLocal() as db:
        items = [
            TestSetItem(
                id=str(uuid.uuid4()),
                test_set_id=state["test_set_id"],
                question=p.get("question", ""),
                answer=p.get("answer", ""),
                source_chunk=(p.get("source_chunk") or "")[:500],
                pii_scrubbed=p.get("pii_scrubbed", False),
                scrub_log=scrub_log[i] if i < len(scrub_log) else {},
            )
            for i, p in enumerate(pairs)
        ]
        db.add_all(items)
        await db.execute(
            update(TestSet)
            .where(TestSet.id == state["test_set_id"])
            .values(status="ready", item_count=len(items))
        )
        await db.commit()

    logger.info("[save_dataset] complete  test_set=%s  items=%d", state["test_set_id"], len(pairs))
    return {}


# ---------------------------------------------------------------------------
# Graph — compiled lazily on first use so import never blocks startup
# ---------------------------------------------------------------------------

_synth_agent = None


def _get_synth_agent():
    global _synth_agent
    if _synth_agent is None:
        graph = StateGraph(SyntheticState)
        graph.add_node("load_chunks",      load_chunks)
        graph.add_node("dispatch_batches", dispatch_batches)
        graph.add_node("generate_batch",   generate_batch)
        graph.add_node("scrub_pii",        scrub_pii)
        graph.add_node("save_dataset",     save_dataset)

        graph.add_edge(START, "load_chunks")
        graph.add_edge("load_chunks", "dispatch_batches")
        graph.add_conditional_edges("dispatch_batches", route_to_batches, ["generate_batch"])
        graph.add_edge("generate_batch", "scrub_pii")
        graph.add_edge("scrub_pii",      "save_dataset")
        graph.add_edge("save_dataset",   END)

        _synth_agent = graph.compile()
    return _synth_agent


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def generate_test_set(
    test_set_id:         str,
    test_set_name:       str,
    document_ids:        list[str],
    questions_per_chunk: int = 3,
) -> None:
    """Called from main.py background task."""
    initial: SyntheticState = {
        "document_ids":        document_ids,
        "test_set_id":         test_set_id,
        "test_set_name":       test_set_name,
        "questions_per_chunk": questions_per_chunk,
        "chunks":              [],
        "raw_pairs":           [],
        "scrubbed_pairs":      [],
        "scrub_log":           [],
    }
    try:
        await _get_synth_agent().ainvoke(
            initial,
            config={
                "run_name": f"synth-{test_set_id[:8]}",
                "tags":     ["rag-eval", "synthetic"],
            },
        )
    except Exception:
        logger.exception("[generate_test_set] agent failed  test_set=%s", test_set_id)
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(TestSet).where(TestSet.id == test_set_id).values(status="failed")
            )
            await db.commit()


# ---------------------------------------------------------------------------
# PDF export builder (reportlab — imported lazily)
# ---------------------------------------------------------------------------

def build_summary_pdf(
    name:         str,
    document_ids: list[str],
    item_count:   int,
    model:        str,
    created_at:   str,
    scrub_log:    list[dict],
    sample_items: list[dict],
) -> bytes:
    from reportlab.lib           import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles    import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units     import inch
    from reportlab.platypus      import (
        PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=inch, rightMargin=inch,
        topMargin=inch, bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1x", parent=styles["Heading1"], spaceAfter=8,  spaceBefore=16)
    h3 = ParagraphStyle("H3x", parent=styles["Heading3"], spaceAfter=4,  spaceBefore=8)
    nb = styles["Normal"]
    story = []

    # ── Cover ────────────────────────────────────────────────────────────────
    cover = ParagraphStyle("Cover", parent=styles["Title"], fontSize=28, spaceAfter=14, leading=34)
    story.append(Spacer(1, 1.2 * inch))
    story.append(Paragraph("RAG Evaluation Dataset", cover))
    story.append(Paragraph(f"<b>{name}</b>", styles["Heading2"]))
    story.append(Spacer(1, 0.25 * inch))
    cover_tbl = Table(
        [
            ["Generated:",    created_at],
            ["Documents:",    str(len(document_ids))],
            ["QA Pairs:",     str(item_count)],
            ["Model:",        model],
        ],
        colWidths=[1.5 * inch, 4.5 * inch],
    )
    cover_tbl.setStyle(TableStyle([
        ("FONTNAME",       (0, 0), (0, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("PADDING",        (0, 0), (-1, -1), 6),
    ]))
    story.append(cover_tbl)
    story.append(PageBreak())

    # ── Section 1: Generation Summary ────────────────────────────────────────
    story.append(Paragraph("Section 1: Generation Summary", h1))
    gen_tbl = Table(
        [
            ["Model Used",           model],
            ["Documents Processed",  str(len(document_ids))],
            ["QA Pairs Generated",   str(item_count)],
            ["Generated At",         created_at],
        ],
        colWidths=[2.5 * inch, 4 * inch],
    )
    gen_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e8f5e9")),
        ("FONTNAME",   (0, 0), (0, -1), "Helvetica-Bold"),
        ("GRID",       (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
        ("PADDING",    (0, 0), (-1, -1), 6),
    ]))
    story.append(gen_tbl)
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("Source document IDs:", h3))
    for doc_id in document_ids:
        story.append(Paragraph(f"• <font name='Courier' size='9'>{doc_id}</font>", nb))
    story.append(PageBreak())

    # ── Section 2: PII Scrubbing Report ──────────────────────────────────────
    story.append(Paragraph("Section 2: PII Scrubbing Report", h1))
    pii_count = sum(
        1 for log in scrub_log
        if log.get("question_findings") or log.get("answer_findings")
    )
    story.append(Paragraph(
        f"Items with PII detected and scrubbed: <b>{pii_count}</b> of {item_count}", nb
    ))
    story.append(Spacer(1, 0.15 * inch))

    type_counts: dict[str, int] = {}
    for log in scrub_log:
        for f in log.get("question_findings", []) + log.get("answer_findings", []):
            t = f.get("entity_type", "UNKNOWN")
            type_counts[t] = type_counts.get(t, 0) + 1

    if type_counts:
        story.append(Paragraph("PII entity types found:", h3))
        pii_rows = [["Entity Type", "Occurrences"]] + [
            [k, str(v)]
            for k, v in sorted(type_counts.items(), key=lambda x: -x[1])
        ]
        pii_tbl = Table(pii_rows, colWidths=[3 * inch, 2 * inch])
        pii_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), colors.HexColor("#1b4332")),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#f0fdf4")]),
            ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
            ("PADDING",       (0, 0), (-1, -1), 6),
        ]))
        story.append(pii_tbl)
    else:
        story.append(Paragraph("✓ No PII was detected in this dataset.", nb))
    story.append(PageBreak())

    # ── Section 3: Sample Questions ──────────────────────────────────────────
    story.append(Paragraph("Section 3: Sample Questions (first 10)", h1))
    for i, item in enumerate(sample_items[:10], 1):
        story.append(Paragraph(f"<b>Q{i}:</b> {item.get('question', '')}", nb))
        story.append(Spacer(1, 2))
        story.append(Paragraph(f"<b>A:</b> {item.get('answer', '')}", nb))
        if item.get("pii_scrubbed"):
            story.append(Paragraph(
                "<i>⚠ PII was detected and scrubbed from this item.</i>",
                styles["Italic"],
            ))
        story.append(Spacer(1, 0.15 * inch))

    def _footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#888888"))
        canvas.drawCentredString(
            letter[0] / 2.0, 0.4 * inch, "Generated by RAG Eval Framework"
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()

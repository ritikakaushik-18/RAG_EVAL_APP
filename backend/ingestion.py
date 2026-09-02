import asyncio
import io
import logging
from functools import lru_cache

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pypdf import PdfReader
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Chunk, Document

logger = logging.getLogger(__name__)

CHUNK_SIZE = 512
CHUNK_OVERLAP = 50
CHUNK_STEP = CHUNK_SIZE - CHUNK_OVERLAP


# ---------------------------------------------------------------------------
# Embedding model — loaded once, reused across requests
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _load_model():
    from sentence_transformers import SentenceTransformer  # lazy — keeps torch off the import path
    logger.info("Loading embedding model '%s' ...", settings.EMBEDDING_MODEL)
    model = SentenceTransformer(settings.EMBEDDING_MODEL)
    logger.info("Embedding model loaded.")
    return model


def _encode(texts: list[str]) -> list[list[float]]:
    model = _load_model()
    vectors = model.encode(texts, show_progress_bar=False, batch_size=64)
    return [v.tolist() for v in vectors]


async def encode_async(texts: list[str]) -> list[list[float]]:
    """Run CPU-bound encoding in a thread pool so it doesn't block the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _encode, texts)


# ---------------------------------------------------------------------------
# PDF loading from S3
# ---------------------------------------------------------------------------

def _download_from_s3(s3_key: str) -> bytes:
    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )
    response = s3.get_object(Bucket=settings.AWS_BUCKET_NAME, Key=s3_key)
    return response["Body"].read()


async def download_pdf(s3_key: str) -> bytes:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _download_from_s3, s3_key)


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_pages(pdf_bytes: bytes) -> list[tuple[int, str]]:
    """Return [(page_number, page_text), ...] — page_number is 1-indexed."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append((i + 1, text))
    logger.info("Extracted text from %d pages.", len(pages))
    return pages


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def chunk_pages(
    pages: list[tuple[int, str]],
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[dict]:
    """
    Concatenate all page text, then slide a window over it.
    Track the page number where each chunk begins.
    """
    step = chunk_size - overlap

    # Build full document text and a page-offset index
    full_text = ""
    page_offsets: list[tuple[int, int]] = []  # (char_offset, page_num)
    for page_num, text in pages:
        page_offsets.append((len(full_text), page_num))
        full_text += text + "\n"

    chunks = []
    chunk_index = 0
    pos = 0

    while pos < len(full_text):
        chunk_text = full_text[pos : pos + chunk_size]
        if not chunk_text.strip():
            pos += step
            continue

        # Determine which page this chunk starts on
        page_num = page_offsets[0][1]
        for offset, pnum in page_offsets:
            if offset <= pos:
                page_num = pnum
            else:
                break

        chunks.append({
            "content": chunk_text,
            "chunk_index": chunk_index,
            "chunk_metadata": {"page_number": page_num, "start_char": pos},
        })
        pos += step
        chunk_index += 1

    logger.info("Produced %d chunks (size=%d, overlap=%d).", len(chunks), chunk_size, overlap)
    return chunks


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

async def ingest_document(document_id: str, db: AsyncSession) -> int:
    """
    Full ingestion pipeline for a document that has already been uploaded to S3.
    Returns the number of chunks stored.
    """
    # 1. Fetch document record
    doc: Document | None = await db.get(Document, document_id)
    if doc is None:
        raise ValueError(f"Document {document_id} not found.")

    logger.info("Ingesting document '%s' (id=%s)", doc.filename, document_id)

    # 2. Download PDF from S3
    try:
        pdf_bytes = await download_pdf(doc.s3_key)
    except (BotoCoreError, ClientError) as e:
        raise RuntimeError(f"Failed to download PDF from S3: {e}") from e

    # 3. Extract text per page
    pages = extract_pages(pdf_bytes)
    if not pages:
        raise ValueError("No extractable text found in the PDF.")

    # 4. Chunk
    raw_chunks = chunk_pages(pages)
    if not raw_chunks:
        raise ValueError("Chunking produced no output.")

    # 5. Embed (all chunks in one batch)
    texts = [c["content"] for c in raw_chunks]
    logger.info("Generating embeddings for %d chunks...", len(texts))
    embeddings = await encode_async(texts)
    logger.info("Embeddings generated.")

    # 6. Delete any existing chunks for this document (safe re-ingest)
    await db.execute(delete(Chunk).where(Chunk.document_id == document_id))

    # 7. Bulk-insert new chunks
    chunk_objects = [
        Chunk(
            document_id=document_id,
            content=c["content"],
            embedding=embeddings[i],
            chunk_index=c["chunk_index"],
            chunk_metadata=c["chunk_metadata"],
        )
        for i, c in enumerate(raw_chunks)
    ]
    db.add_all(chunk_objects)

    # 8. Update chunk_count on the document
    doc.chunk_count = len(chunk_objects)

    await db.commit()
    logger.info("Ingestion complete: %d chunks stored for document %s.", len(chunk_objects), document_id)
    return len(chunk_objects)

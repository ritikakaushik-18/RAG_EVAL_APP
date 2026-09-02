from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Boolean, Column, String, Integer, Float, DateTime,
    ForeignKey, Text, func
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship
from pgvector.sqlalchemy import Vector
import uuid


class Base(DeclarativeBase):
    pass


def _uuid():
    return str(uuid.uuid4())


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=_uuid)
    filename = Column(String, nullable=False)
    s3_key = Column(String, nullable=False, unique=True)
    chunk_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    tenant_id = Column(String, nullable=False, default="default")

    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(String, primary_key=True, default=_uuid)
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(384))
    chunk_index = Column(Integer, nullable=False)
    chunk_metadata = Column(JSONB, nullable=False, default=dict)

    document = relationship("Document", back_populates="chunks")


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id = Column(String, primary_key=True, default=_uuid)
    tenant_id = Column(String, nullable=False, default="default")
    status = Column(String, nullable=False, default="pending")  # pending | running | completed | failed
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    document_ids = Column(JSONB, nullable=False, default=list)
    overall_recommendation = Column(Text, nullable=True)
    winner_explanation = Column(Text, nullable=True)

    results = relationship("EvalResult", back_populates="eval_run", cascade="all, delete-orphan")


class EvalResult(Base):
    __tablename__ = "eval_results"

    id = Column(String, primary_key=True, default=_uuid)
    eval_run_id = Column(String, ForeignKey("eval_runs.id", ondelete="CASCADE"), nullable=False)
    strategy_name = Column(String, nullable=False)
    question = Column(Text, nullable=False)
    retrieved_answer = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=True)
    faithfulness_score = Column(Float, nullable=True)
    correctness_score = Column(Float, nullable=True)
    completeness_score = Column(Float, nullable=True)
    overall_score = Column(Float, nullable=True)
    reasoning = Column(Text, nullable=True)
    latency_ms = Column(Float, nullable=True)
    cost_usd = Column(Float, nullable=True)
    failure_attribution = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    eval_run = relationship("EvalRun", back_populates="results")


class Baseline(Base):
    __tablename__ = "baselines"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    eval_run_id = Column(String, ForeignKey("eval_runs.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String, nullable=False, default="default")
    thresholds = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CIRun(Base):
    __tablename__ = "ci_runs"

    id = Column(String, primary_key=True, default=_uuid)
    baseline_id = Column(String, ForeignKey("baselines.id", ondelete="CASCADE"), nullable=False)
    eval_run_id = Column(String, ForeignKey("eval_runs.id", ondelete="SET NULL"), nullable=True)
    tenant_id = Column(String, nullable=False, default="default")
    status = Column(String, nullable=False, default="running")  # running | passed | failed
    passed = Column(Boolean, nullable=True)
    summary = Column(JSONB, nullable=True)
    pr_number = Column(String, nullable=True)
    commit_sha = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class APIKey(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=_uuid)
    tenant_id = Column(String, nullable=False, default="default")
    key_hash = Column(String, nullable=False, unique=True)
    key_prefix = Column(String, nullable=False)  # first 8 chars shown in the UI
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TestSet(Base):
    __tablename__ = "test_sets"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    document_ids = Column(JSONB, nullable=False, default=list)
    tenant_id = Column(String, nullable=False, default="default")
    item_count = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="generating")  # generating | ready | failed
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    items = relationship("TestSetItem", back_populates="test_set", cascade="all, delete-orphan")


class TestSetItem(Base):
    __tablename__ = "test_set_items"

    id = Column(String, primary_key=True, default=_uuid)
    test_set_id = Column(String, ForeignKey("test_sets.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    source_chunk = Column(Text, nullable=True)
    pii_scrubbed = Column(Boolean, nullable=False, default=False)
    scrub_log = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    test_set = relationship("TestSet", back_populates="items")


class BatchEval(Base):
    __tablename__ = "batch_evals"

    id = Column(String, primary_key=True, default=_uuid)
    test_set_id = Column(String, ForeignKey("test_sets.id", ondelete="CASCADE"), nullable=False)
    document_ids = Column(JSONB, nullable=False, default=list)
    tenant_id = Column(String, nullable=False, default="default")
    status = Column(String, nullable=False, default="running")  # running | completed | failed
    total_items = Column(Integer, nullable=False, default=0)
    completed_items = Column(Integer, nullable=False, default=0)
    eval_run_ids = Column(JSONB, nullable=False, default=list)
    avg_scores = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

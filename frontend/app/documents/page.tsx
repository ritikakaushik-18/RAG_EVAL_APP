"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listDocuments,
  uploadDocuments,
  ingestDocument,
  startEval,
  listDatasets,
  runDatasetEval,
  type Document,
  type TestSetSummary,
} from "@/lib/api";

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : `Copy ${text}`}
      className="rounded p-0.5 text-neutral-600 transition-colors hover:text-neutral-300"
    >
      {copied ? (
        <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="4" rx="1" />
          <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
        </svg>
      )}
    </button>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILES = 10;
const MAX_BYTES = 50 * 1024 * 1024;

// ─── Types ───────────────────────────────────────────────────────────────────

type FileEntry = {
  file: File;
  error: string | null;
  status: "ready" | "uploading" | "ingesting" | "done" | "failed";
  documentId: string | null;
  chunkCount: number | null;
  uploadError: string | null;
};

type UploadPane =
  | { phase: "idle" }
  | { phase: "staged"; entries: FileEntry[]; globalError: string | null }
  | { phase: "processing"; entries: FileEntry[] }
  | { phase: "complete"; entries: FileEntry[] };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function validateFiles(files: File[]): {
  entries: FileEntry[];
  globalError: string | null;
} {
  if (files.length > MAX_FILES) {
    return {
      entries: [],
      globalError: `Maximum ${MAX_FILES} files per upload. Please upload in batches.`,
    };
  }
  return {
    globalError: null,
    entries: files.map((file) => {
      let error: string | null = null;
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        error = "Only PDF files are supported";
      } else if (file.size > MAX_BYTES) {
        error = `Too large (${fmtBytes(file.size)})`;
      }
      return {
        file,
        error,
        status: "ready" as const,
        documentId: null,
        chunkCount: null,
        uploadError: null,
      };
    }),
  };
}

// ─── Eval Modal ──────────────────────────────────────────────────────────────

interface EvalModalProps {
  documents: Document[];
  initialSelectedIds: string[];
  onClose: () => void;
  onStart: (query: string, answer: string, documentIds: string[]) => Promise<void>;
  onStartBatch: (testSetId: string, documentIds: string[]) => Promise<void>;
  starting: boolean;
}

function EvalModal({
  documents,
  initialSelectedIds,
  onClose,
  onStart,
  onStartBatch,
  starting,
}: EvalModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [useTestSet, setUseTestSet] = useState(false);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [datasets, setDatasets] = useState<TestSetSummary[]>([]);
  const [selectedDataset, setSelectedDataset] = useState("");

  useEffect(() => {
    if (useTestSet) {
      listDatasets()
        .then((ds) => setDatasets(ds.filter((d) => d.status === "ready")))
        .catch(() => {});
    }
  }, [useTestSet]);

  function toggleDoc(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  const canSubmit =
    selectedIds.length > 0 &&
    (useTestSet ? !!selectedDataset : !!(query.trim() && answer.trim()));

  function handleSubmit() {
    if (!canSubmit) return;
    if (useTestSet) {
      onStartBatch(selectedDataset, selectedIds);
    } else {
      onStart(query, answer, selectedIds);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="mb-5 text-lg font-semibold text-white">Run Evaluation</h2>

        {/* Document selection */}
        <div className="mb-5">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-300">
            Documents to evaluate
            {selectedIds.length > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-normal text-emerald-400">
                {selectedIds.length} selected
              </span>
            )}
          </label>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800">
            {documents.map((doc) => (
              <label
                key={doc.document_id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-700"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(doc.document_id)}
                  onChange={() => toggleDoc(doc.document_id)}
                  className="accent-emerald-500"
                />
                <span className="flex-1 truncate text-sm text-neutral-200">
                  {doc.filename}
                </span>
                <span className="flex-shrink-0 text-xs text-neutral-500">
                  {doc.chunk_count} chunks
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Test-set toggle */}
        <label className="mb-4 flex cursor-pointer items-center gap-3">
          <div
            onClick={() => setUseTestSet((v) => !v)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              useTestSet ? "bg-emerald-600" : "bg-neutral-700"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                useTestSet ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-sm text-neutral-300">
            Use test set instead of manual input
          </span>
        </label>

        {useTestSet ? (
          <>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Test Set
            </label>
            {datasets.length === 0 ? (
              <p className="mb-4 text-xs text-neutral-500">
                No ready test sets found.{" "}
                <a href="/datasets" className="text-emerald-400 underline">
                  Generate one
                </a>{" "}
                first.
              </p>
            ) : (
              <select
                className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value)}
              >
                <option value="">— select a test set —</option>
                {datasets.map((d) => (
                  <option key={d.test_set_id} value={d.test_set_id}>
                    {d.name} ({d.item_count} questions)
                  </option>
                ))}
              </select>
            )}
            {selectedDataset && selectedIds.length > 0 && (
              <p className="mb-4 rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-400">
                All questions will be evaluated against{" "}
                <span className="text-neutral-200">
                  {selectedIds.length} document
                  {selectedIds.length > 1 ? "s" : ""}
                </span>
                . Results show average scores across all questions.
              </p>
            )}
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Query
            </label>
            <input
              className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="e.g. What are the main conclusions?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Correct Answer{" "}
              <span className="font-normal text-neutral-500">(ground truth)</span>
            </label>
            <textarea
              className="mb-5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              rows={3}
              placeholder="The expected answer the LLM judge will compare against…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={starting || !canSubmit}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {starting
              ? "Starting…"
              : useTestSet
              ? "Start Batch Evaluation"
              : "Start Evaluation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [pane, setPane] = useState<UploadPane>({ phase: "idle" });

  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [evalPreselected, setEvalPreselected] = useState<string[]>([]);
  const [startingEval, setStartingEval] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  async function fetchDocs() {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch {
      // silently fail — list stays empty
    } finally {
      setLoadingDocs(false);
    }
  }

  useEffect(() => {
    fetchDocs();
  }, []);

  // ── File selection ──────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    e.target.value = "";
    if (!fileList || fileList.length === 0) return;
    const { entries, globalError } = validateFiles(Array.from(fileList));
    setPane({ phase: "staged", entries, globalError });
  }

  // ── Upload + ingest ─────────────────────────────────────────────────────

  async function handleUpload() {
    if (pane.phase !== "staged") return;

    const { entries } = pane;
    const validEntries = entries.filter((e) => e.error === null);
    if (validEntries.length === 0) return;

    // Transition to processing: valid → uploading, invalid → failed
    const working: FileEntry[] = entries.map((e) => ({
      ...e,
      status: e.error ? ("failed" as const) : ("uploading" as const),
      uploadError: e.error,
    }));
    setPane({ phase: "processing", entries: working });

    try {
      const result = await uploadDocuments(validEntries.map((e) => e.file));

      // Map result.documents back to their positions (same order as validEntries)
      let vi = 0;
      for (let i = 0; i < working.length; i++) {
        if (working[i].status === "uploading") {
          working[i] = {
            ...working[i],
            status: "ingesting",
            documentId: result.documents[vi++].document_id,
          };
        }
      }
      setPane({ phase: "processing", entries: [...working] });

      // Ingest each document sequentially, updating state after each
      for (let i = 0; i < working.length; i++) {
        if (working[i].status !== "ingesting" || !working[i].documentId) continue;
        try {
          const { chunk_count } = await ingestDocument(working[i].documentId!);
          working[i] = { ...working[i], status: "done", chunkCount: chunk_count };
        } catch (err) {
          working[i] = {
            ...working[i],
            status: "failed",
            uploadError: err instanceof Error ? err.message : "Ingest failed",
          };
        }
        setPane({ phase: "processing", entries: [...working] });
      }

      setPane({ phase: "complete", entries: [...working] });
      await fetchDocs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      const failed = working.map((e) => ({
        ...e,
        status: e.status === "uploading" ? ("failed" as const) : e.status,
        uploadError: e.status === "uploading" ? msg : e.uploadError,
      }));
      setPane({ phase: "complete", entries: failed });
    }
  }

  // ── Eval ────────────────────────────────────────────────────────────────

  function openEvalModal(preselected: string[] = []) {
    setEvalPreselected(preselected);
    setEvalError(null);
    setStartingEval(false);
    setEvalModalOpen(true);
  }

  async function handleStartEval(
    query: string,
    answer: string,
    documentIds: string[]
  ) {
    if (documentIds.length === 0) return;
    setEvalError(null);
    setStartingEval(true);
    try {
      const { eval_run_id } = await startEval({
        query,
        correct_answer: answer,
        document_ids: documentIds,
      });
      router.push(`/eval/${eval_run_id}`);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Failed to start");
      setStartingEval(false);
    }
  }

  async function handleStartBatchEval(testSetId: string, documentIds: string[]) {
    if (documentIds.length === 0) return;
    setEvalError(null);
    setStartingEval(true);
    try {
      const { batch_eval_id } = await runDatasetEval({
        test_set_id: testSetId,
        document_ids: documentIds,
      });
      router.push(`/eval/batch/${batch_eval_id}`);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Failed to start");
      setStartingEval(false);
    }
  }

  // ── Upload pane rendering ───────────────────────────────────────────────

  function UploadPaneCard() {
    if (pane.phase === "idle") return null;

    // Global file-count error
    if (pane.phase === "staged" && pane.globalError) {
      return (
        <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/20 px-5 py-4">
          <p className="text-sm text-red-400">{pane.globalError}</p>
          <button
            onClick={() => setPane({ phase: "idle" })}
            className="mt-1.5 text-xs text-neutral-500 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      );
    }

    const entries = pane.entries;
    const validCount = entries.filter((e) => e.error === null).length;
    const invalidCount = entries.filter((e) => e.error !== null).length;
    const doneCount = entries.filter((e) => e.status === "done").length;
    const failedCount = entries.filter(
      (e) => e.status === "failed"
    ).length;
    const isProcessing = pane.phase === "processing";
    const isComplete = pane.phase === "complete";

    const headerLabel = isProcessing
      ? "Uploading…"
      : isComplete
      ? `${doneCount} uploaded${failedCount > 0 ? `, ${failedCount} failed` : ""}`
      : `${entries.length} file${entries.length !== 1 ? "s" : ""} selected`;

    return (
      <div className="mb-6 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
        {/* Card header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <span className="text-sm font-medium text-neutral-200">{headerLabel}</span>
          {!isProcessing && (
            <button
              onClick={() => setPane({ phase: "idle" })}
              className="text-xs text-neutral-500 transition-colors hover:text-white"
            >
              {isComplete ? "Dismiss" : "Cancel"}
            </button>
          )}
        </div>

        {/* File rows */}
        <div className="divide-y divide-neutral-800/50">
          {entries.map((entry, i) => {
            const rowError = entry.error ?? entry.uploadError;
            const isError = !!rowError;
            const isDone = entry.status === "done";
            const isBusy =
              entry.status === "uploading" || entry.status === "ingesting";

            return (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                {/* Status icon */}
                <span
                  className={`w-4 flex-shrink-0 text-center text-sm ${
                    isDone
                      ? "text-emerald-400"
                      : isError
                      ? "text-red-400"
                      : isBusy
                      ? "text-neutral-400"
                      : "text-neutral-600"
                  }`}
                >
                  {isDone ? "✓" : isError ? "✗" : isBusy ? "⟳" : "·"}
                </span>

                {/* Filename */}
                <span
                  className={`flex-1 truncate text-sm ${
                    isDone
                      ? "text-emerald-300"
                      : isError
                      ? "text-red-400"
                      : "text-neutral-200"
                  }`}
                >
                  {entry.file.name}
                </span>

                {/* File size */}
                <span className="flex-shrink-0 text-xs text-neutral-600">
                  {fmtBytes(entry.file.size)}
                </span>

                {/* Status label */}
                <span
                  className={`w-28 flex-shrink-0 text-right text-xs ${
                    isDone
                      ? "text-emerald-400"
                      : isError
                      ? "text-red-400"
                      : "text-neutral-500"
                  }`}
                >
                  {isDone
                    ? `${entry.chunkCount} chunks`
                    : entry.status === "ingesting"
                    ? "Ingesting…"
                    : entry.status === "uploading"
                    ? "Uploading…"
                    : rowError
                    ? rowError
                    : "Ready"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Card footer */}
        <div className="border-t border-neutral-800 px-5 py-3">
          {pane.phase === "staged" ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-600">
                {invalidCount > 0
                  ? `${invalidCount} invalid file${invalidCount !== 1 ? "s" : ""} will be skipped`
                  : ""}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPane({ phase: "idle" })}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={validCount === 0}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Upload {validCount} PDF{validCount !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          ) : isComplete ? (
            <button
              onClick={() => {
                setPane({ phase: "idle" });
                fileInputRef.current?.click();
              }}
              className="text-xs text-neutral-400 transition-colors hover:text-white"
            >
              + Upload more PDFs
            </button>
          ) : (
            <span className="text-xs text-neutral-600">
              Do not navigate away while uploading.
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const isUploading = pane.phase === "processing";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">RAG Eval</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Benchmark 5 retrieval strategies · find the best one
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={() => {
              if (!isUploading) fileInputRef.current?.click();
            }}
            disabled={isUploading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Spinner />
                Uploading…
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload PDFs
              </>
            )}
          </button>
          <p className="text-xs text-neutral-600">Up to 10 PDFs · 50 MB per file</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Upload staging / progress / results card */}
      <UploadPaneCard />

      {/* Documents table */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2 className="text-sm font-medium text-neutral-200">Documents</h2>
          {documents.length > 0 && (
            <button
              onClick={() => openEvalModal()}
              className="rounded-lg border border-neutral-700 px-3 py-1 text-xs font-medium text-neutral-300 hover:border-emerald-600 hover:text-emerald-400"
            >
              Run Eval
            </button>
          )}
        </div>

        {loadingDocs ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-800" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-4xl">📄</div>
            <p className="text-sm font-medium text-neutral-300">No documents yet</p>
            <p className="mt-1 text-xs text-neutral-500">Upload a PDF to get started</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
                <th className="px-5 py-3 font-medium">Filename</th>
                <th className="px-5 py-3 font-medium">Chunks</th>
                <th className="px-5 py-3 font-medium">Uploaded</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc, i) => (
                <tr
                  key={doc.document_id}
                  className={
                    i < documents.length - 1 ? "border-b border-neutral-800" : ""
                  }
                >
                  <td className="px-5 py-3">
                    <span className="text-sm font-medium text-neutral-100">
                      {doc.filename}
                    </span>
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="font-mono text-xs text-neutral-600">
                        {doc.document_id.slice(0, 8)}…
                      </span>
                      <CopyButton text={doc.document_id} />
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {doc.chunk_count > 0 ? (
                      <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-300">
                        {doc.chunk_count} chunks
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">
                    {formatDate(doc.created_at)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => openEvalModal([doc.document_id])}
                      disabled={doc.chunk_count === 0}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-emerald-600 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Run Eval
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {evalError && (
        <p className="mt-3 text-sm text-red-400">Error: {evalError}</p>
      )}

      {evalModalOpen && (
        <EvalModal
          documents={documents.filter((d) => d.chunk_count > 0)}
          initialSelectedIds={evalPreselected}
          onClose={() => setEvalModalOpen(false)}
          onStart={handleStartEval}
          onStartBatch={handleStartBatchEval}
          starting={startingEval}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getDataset,
  runDatasetEval,
  listDocuments,
  exportDatasetUrl,
  type TestSetDetail,
  type TestSetItem,
  type Document,
} from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function RunEvalModal({
  testSetId,
  onClose,
  onStarted,
}: {
  testSetId: string;
  onClose: () => void;
  onStarted: (batchId: string) => void;
}) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listDocuments().then(setDocs).catch(() => {}); }, []);

  function toggle(id: string) {
    setSelected((p) => p.includes(id) ? p.filter((d) => d !== id) : [...p, id]);
  }

  async function handleStart() {
    if (selected.length === 0) { setError("Select at least one document."); return; }
    setError(null);
    setStarting(true);
    try {
      const { batch_eval_id } = await runDatasetEval({
        test_set_id: testSetId,
        document_ids: selected,
      });
      onStarted(batch_eval_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setStarting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="mb-1 text-base font-semibold text-white">Run Eval on Dataset</h2>
        <p className="mb-5 text-xs text-neutral-500">
          Select the documents to search against when evaluating each question.
        </p>
        {error && (
          <div className="mb-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">{error}</div>
        )}
        <div className="mb-5 max-h-48 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800">
          {docs.map((doc) => (
            <label key={doc.document_id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-700">
              <input type="checkbox" checked={selected.includes(doc.document_id)} onChange={() => toggle(doc.document_id)} className="accent-emerald-500" />
              <span className="flex-1 text-sm text-neutral-200">{doc.filename}</span>
              <span className="text-xs text-neutral-500">{doc.chunk_count} chunks</span>
            </label>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Cancel</button>
          <button onClick={handleStart} disabled={starting} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
            {starting ? "Starting…" : "Start Batch Eval"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dataset, setDataset] = useState<TestSetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pii" | "clean">("all");
  const [showRunModal, setShowRunModal] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchDataset() {
    try {
      const data = await getDataset(id);
      setDataset(data);
      if (data.status !== "generating") {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDataset();
    intervalRef.current = setInterval(fetchDataset, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [id]);

  const filtered = dataset?.items.filter((item) => {
    if (filter === "pii")   return item.pii_scrubbed;
    if (filter === "clean") return !item.pii_scrubbed;
    return true;
  }) ?? [];

  const piiCount = dataset?.items.filter((i) => i.pii_scrubbed).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Back */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push("/datasets")} className="text-neutral-400 hover:text-white">← Back</button>
        <span className="text-neutral-700">|</span>
        <h1 className="text-lg font-semibold text-white">{dataset?.name ?? "Dataset"}</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-800" />)}
        </div>
      ) : !dataset ? (
        <p className="text-sm text-neutral-400">Dataset not found.</p>
      ) : dataset.status === "generating" ? (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-6">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-2 w-2 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-neutral-300">Generating questions — check back in a moment…</p>
        </div>
      ) : dataset.status === "failed" ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-400">
          Generation failed. Please try again.
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-4">
            <div className="text-sm">
              <span className="text-neutral-500">Total: </span>
              <span className="font-medium text-white">{dataset.item_count} questions</span>
            </div>
            <div className="text-sm">
              <span className="text-neutral-500">PII scrubbed: </span>
              <span className={`font-medium ${piiCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {piiCount}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-neutral-500">Created: </span>
              <span className="text-neutral-300">{formatDate(dataset.created_at)}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <a
                href={exportDatasetUrl(id)}
                download
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
              >
                Export ZIP
              </a>
              <button
                onClick={() => setShowRunModal(true)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
              >
                Run Eval on Dataset
              </button>
            </div>
          </div>

          {/* Filter */}
          <div className="mb-4 flex gap-2">
            {(["all", "pii", "clean"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-500 hover:text-white"
                }`}
              >
                {f === "all" ? "All" : f === "pii" ? "PII Scrubbed" : "Clean"}
                {f === "pii" && piiCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 text-amber-400">
                    {piiCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Items table */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
                  <th className="px-5 py-3 font-medium">#</th>
                  <th className="px-5 py-3 font-medium">Question</th>
                  <th className="px-5 py-3 font-medium">Answer</th>
                  <th className="px-5 py-3 font-medium">PII</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={item.id} className={i < filtered.length - 1 ? "border-b border-neutral-800" : ""}>
                    <td className="px-5 py-3 text-xs text-neutral-600">{i + 1}</td>
                    <td className="px-5 py-3 text-sm text-neutral-200 max-w-xs">
                      <p className="line-clamp-2">{item.question}</p>
                    </td>
                    <td className="px-5 py-3 text-sm text-neutral-400 max-w-xs">
                      <p className="line-clamp-2">{item.answer}</p>
                    </td>
                    <td className="px-5 py-3">
                      {item.pii_scrubbed ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                          Scrubbed
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-500">
                          Clean
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-neutral-500">
                      No items match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showRunModal && (
        <RunEvalModal
          testSetId={id}
          onClose={() => setShowRunModal(false)}
          onStarted={(batchId) => router.push(`/eval/batch/${batchId}`)}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listCIRuns,
  getCIRun,
  listBaselines,
  type CIRunSummary,
  type CIRunDetail,
  type Baseline,
} from "@/lib/api";
import { startCIRun } from "@/lib/api";

const STRATEGY_LABEL: Record<string, string> = {
  naive:        "Naive RAG",
  hybrid:       "Hybrid BM25 + Vector",
  rerank:       "Cohere Rerank",
  hyde:         "HyDE",
  parent_child: "Parent-Child",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status, passed }: { status: string; passed: boolean | null }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Running
      </span>
    );
  }
  if (passed) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
        ✅ Passed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400">
      ❌ Failed
    </span>
  );
}

function DiffCell({ diff, dim }: { diff: number | undefined; dim: string }) {
  if (diff === undefined) return <span className="text-neutral-600">—</span>;
  const sign = diff >= 0 ? "+" : "";
  const color = diff >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <span className={`font-mono text-xs ${color}`}>
      {sign}{diff.toFixed(2)}
    </span>
  );
}

function DetailPanel({ ciRunId, onClose }: { ciRunId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CIRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function poll() {
      try {
        const data = await getCIRun(ciRunId);
        setDetail(data);
        setLoading(false);
        if (data.status !== "running") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        setLoading(false);
      }
    }
    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ciRunId]);

  const dims = ["faithfulness", "correctness", "completeness", "overall"] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            CI Run Detail
          </h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-neutral-800" />
            ))}
          </div>
        ) : detail ? (
          <>
            <div className="mb-5 flex flex-wrap gap-3 text-xs text-neutral-500">
              <StatusBadge status={detail.status} passed={detail.passed} />
              {detail.pr_number && (
                <span>PR #{detail.pr_number}</span>
              )}
              {detail.commit_sha && (
                <span className="font-mono">{detail.commit_sha.slice(0, 7)}</span>
              )}
              {detail.current_winner && (
                <span>
                  Winner: <span className="text-neutral-300">{STRATEGY_LABEL[detail.current_winner] ?? detail.current_winner}</span>
                </span>
              )}
            </div>

            {detail.status !== "running" && detail.baseline_scores && (
              <table className="mb-5 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="pb-2 font-medium">Metric</th>
                    <th className="pb-2 font-medium">Baseline</th>
                    <th className="pb-2 font-medium">Current</th>
                    <th className="pb-2 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {dims.map((dim) => (
                    <tr key={dim} className="border-t border-neutral-800">
                      <td className="py-2 capitalize text-neutral-300">{dim}</td>
                      <td className="py-2 font-mono text-xs text-neutral-400">
                        {detail.baseline_scores?.[dim].toFixed(2)}
                      </td>
                      <td className="py-2 font-mono text-xs text-neutral-400">
                        {detail.current_scores?.[dim].toFixed(2)}
                      </td>
                      <td className="py-2">
                        <DiffCell diff={detail.diffs?.[dim]} dim={dim} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {detail.failed_thresholds && detail.failed_thresholds.length > 0 && (
              <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2.5">
                <p className="mb-1.5 text-xs font-semibold text-red-400">Failed thresholds</p>
                <ul className="space-y-1">
                  {detail.failed_thresholds.map((ft) => (
                    <li key={ft} className="font-mono text-xs text-neutral-400">
                      {ft}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.recommendation && (
              <div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2.5">
                <p className="text-xs text-neutral-300">{detail.recommendation}</p>
              </div>
            )}

            {detail.github_comment_markdown && (
              <details className="mb-4">
                <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">
                  GitHub comment markdown
                </summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-neutral-800 p-3 text-xs text-neutral-300">
                  {detail.github_comment_markdown}
                </pre>
              </details>
            )}

            {detail.eval_run_id && (
              <button
                onClick={() => { onClose(); router.push(`/eval/${detail.eval_run_id}`); }}
                className="text-xs text-emerald-400 hover:underline"
              >
                View full eval results →
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-400">CI run not found.</p>
        )}
      </div>
    </div>
  );
}

function RunCIModal({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: () => void;
}) {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [docId, setDocId] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBaselines().then(setBaselines).catch(() => {});
  }, []);

  async function handleStart() {
    const apiKey = localStorage.getItem("rageval_api_key");
    if (!apiKey) {
      setError("No API key found. Generate one in Settings first.");
      return;
    }
    if (!baselineId || !query.trim() || !answer.trim() || !docId.trim()) {
      setError("All fields are required.");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      await startCIRun(
        {
          baseline_id:    baselineId,
          query:          query.trim(),
          correct_answer: answer.trim(),
          document_ids:   [docId.trim()],
        },
        apiKey
      );
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start CI run");
      setStarting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="mb-5 text-lg font-semibold text-white">Run CI Evaluation</h2>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-neutral-300">Baseline</label>
        <select
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          value={baselineId}
          onChange={(e) => setBaselineId(e.target.value)}
        >
          <option value="">— select a baseline —</option>
          {baselines.map((b) => (
            <option key={b.baseline_id} value={b.baseline_id}>{b.name}</option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-neutral-300">Document ID</label>
        <input
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
          placeholder="UUID of the document to evaluate"
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
        />

        <label className="mb-1 block text-xs font-medium text-neutral-300">Test Query</label>
        <input
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
          placeholder="The regression test question"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <label className="mb-1 block text-xs font-medium text-neutral-300">Correct Answer</label>
        <textarea
          className="mb-5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
          rows={3}
          placeholder="Expected ground-truth answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {starting ? "Starting…" : "Start CI Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CIPage() {
  const [runs, setRuns] = useState<CIRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);

  async function fetchRuns() {
    try {
      const data = await listCIRuns();
      setRuns(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRuns();
    const t = setInterval(fetchRuns, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">CI Runs</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Automated regression checks triggered by GitHub pull requests.
          </p>
        </div>
        <button
          onClick={() => setShowRunModal(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Run CI Eval
        </button>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 px-5 py-3">
          <h2 className="text-sm font-medium text-neutral-200">History</h2>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-800" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-4xl">🔬</div>
            <p className="text-sm font-medium text-neutral-300">No CI runs yet</p>
            <p className="mt-1 text-xs text-neutral-500">
              CI runs are triggered automatically on pull requests, or manually above.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Baseline</th>
                <th className="px-5 py-3 font-medium">PR / Commit</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr
                  key={r.ci_run_id}
                  className={i < runs.length - 1 ? "border-b border-neutral-800" : ""}
                >
                  <td className="px-5 py-3">
                    <StatusBadge status={r.status} passed={r.passed} />
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-300">
                    {r.baseline_name || (
                      <span className="font-mono text-xs text-neutral-500">
                        {r.baseline_id.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-neutral-500">
                    {r.pr_number && <span className="mr-2">PR #{r.pr_number}</span>}
                    {r.commit_sha && (
                      <span className="font-mono">{r.commit_sha.slice(0, 7)}</span>
                    )}
                    {!r.pr_number && !r.commit_sha && "—"}
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setSelectedRunId(r.ci_run_id)}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedRunId && (
        <DetailPanel
          ciRunId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
        />
      )}

      {showRunModal && (
        <RunCIModal
          onClose={() => setShowRunModal(false)}
          onStarted={() => {
            setShowRunModal(false);
            fetchRuns();
          }}
        />
      )}
    </div>
  );
}

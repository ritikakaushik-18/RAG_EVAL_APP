"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getEval, createBaseline, type EvalRun, type StrategyResult } from "@/lib/api";

const STRATEGY_LABEL: Record<string, string> = {
  naive: "Naive RAG",
  hybrid: "Hybrid BM25 + Vector",
  rerank: "Cohere Rerank",
  hyde: "HyDE",
  parent_child: "Parent-Child",
};

const ATTRIBUTION_LABEL: Record<string, string> = {
  EMBEDDING_WEAKNESS: "Embedding Weakness",
  RETRIEVAL_LOGIC:    "Retrieval Logic Issue",
  CONTEXT_WINDOW:     "Context Window Too Small",
  RERANKING_HELPS:    "Reranking Compensates",
  GENERATION_FAILURE: "LLM Ignoring Context",
  NO_CLEAR_PATTERN:   "No Clear Pattern",
};

const STRATEGY_DESC: Record<string, string> = {
  naive: "Pure vector similarity search",
  hybrid: "Vector + keyword fusion (RRF)",
  rerank: "Vector search + Cohere reranking",
  hyde: "Hypothetical document embeddings",
  parent_child: "Child match → parent context window",
};

function scoreColor(score: number | null) {
  if (score === null) return "bg-neutral-700";
  if (score >= 0.7) return "bg-emerald-500";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

function scoreFg(score: number | null) {
  if (score === null) return "text-neutral-400";
  if (score >= 0.7) return "text-emerald-400";
  if (score >= 0.4) return "text-amber-400";
  return "text-red-400";
}

function ScoreBar({
  label,
  score,
}: {
  label: string;
  score: number | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-neutral-500">{label}</span>
      <div className="flex-1 rounded-full bg-neutral-800 h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${scoreColor(score)}`}
          style={{ width: `${(score ?? 0) * 100}%` }}
        />
      </div>
      <span className={`w-10 text-right text-xs font-mono ${scoreFg(score)}`}>
        {score !== null ? score.toFixed(2) : "—"}
      </span>
    </div>
  );
}

function StrategyCard({
  result,
  rank,
  isWinner,
  style,
}: {
  result: StrategyResult;
  rank: number;
  isWinner: boolean;
  style?: React.CSSProperties;
}) {
  const overall = result.overall_score;

  return (
    <div
      style={style}
      className={`rounded-xl border p-5 transition-all duration-500 ${
        isWinner
          ? "border-emerald-500 bg-neutral-900 shadow-lg shadow-emerald-950"
          : "border-neutral-800 bg-neutral-900"
      }`}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isWinner
                ? "bg-emerald-500 text-white"
                : "bg-neutral-800 text-neutral-400"
            }`}
          >
            {rank}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">
                {STRATEGY_LABEL[result.strategy] ?? result.strategy}
              </h3>
              {isWinner && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  Winner
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              {STRATEGY_DESC[result.strategy] ?? ""}
            </p>
          </div>
        </div>

        <span
          className={`text-2xl font-bold tabular-nums ${scoreFg(overall)}`}
        >
          {overall !== null ? (overall * 100).toFixed(0) : "—"}
          <span className="text-base font-normal text-neutral-500">%</span>
        </span>
      </div>

      {/* Overall bar */}
      <div className="mb-4 rounded-full bg-neutral-800 h-2">
        <div
          className={`h-2 rounded-full transition-all duration-1000 ${scoreColor(overall)}`}
          style={{ width: `${(overall ?? 0) * 100}%` }}
        />
      </div>

      {/* Sub-scores */}
      <div className="mb-4 space-y-2">
        <ScoreBar label="Faithfulness" score={result.faithfulness} />
        <ScoreBar label="Correctness" score={result.correctness} />
        <ScoreBar label="Completeness" score={result.completeness} />
      </div>

      {/* Reasoning */}
      {result.reasoning && (
        <p className="mb-4 rounded-lg bg-neutral-800 px-3 py-2 text-xs leading-relaxed text-neutral-300 italic">
          &ldquo;{result.reasoning}&rdquo;
        </p>
      )}

      {/* Attribution (failing strategies only) */}
      {result.failure_attribution && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2.5">
          <p className="mb-1 text-xs font-semibold text-red-400">
            Root Cause: {ATTRIBUTION_LABEL[result.failure_attribution] ?? result.failure_attribution}
          </p>
          {result.recommendation && (
            <p className="text-xs leading-relaxed text-neutral-400">
              {result.recommendation}
            </p>
          )}
        </div>
      )}

      {/* Footer: latency + cost */}
      <div className="flex gap-4 text-xs text-neutral-500">
        {result.latency_ms !== null && (
          <span>⏱ {(result.latency_ms / 1000).toFixed(1)}s</span>
        )}
        {result.cost_usd !== null && result.cost_usd > 0 && (
          <span>💰 ${result.cost_usd.toFixed(6)}</span>
        )}
      </div>
    </div>
  );
}

function SkeletonCard({ index }: { index: number }) {
  const names = Object.values(STRATEGY_LABEL);
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-7 w-7 animate-pulse rounded-full bg-neutral-800" />
        <div>
          <div className="mb-1.5 h-4 w-36 animate-pulse rounded bg-neutral-800" />
          <div className="h-3 w-24 animate-pulse rounded bg-neutral-800" />
        </div>
      </div>
      <div className="mb-4 h-2 animate-pulse rounded-full bg-neutral-800" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 w-28 animate-pulse rounded bg-neutral-800" />
            <div className="h-1.5 flex-1 animate-pulse rounded-full bg-neutral-800" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-neutral-600">
        Running {names[index]}…
      </p>
    </div>
  );
}

function elapsed(createdAt: string, completedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  return secs >= 60
    ? `${Math.floor(secs / 60)}m ${secs % 60}s`
    : `${secs}s`;
}

const DEFAULT_THRESHOLDS = {
  faithfulness: 0.75, correctness: 0.75,
  completeness: 0.70, overall: 0.75, max_regression_pct: 5.0,
};

function SetBaselineModal({
  evalRunId,
  onClose,
}: {
  evalRunId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [thresholds, setThresholds] = useState({ ...DEFAULT_THRESHOLDS });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function update(field: string, v: number) {
    setThresholds((p) => ({ ...p, [field]: v }));
  }

  async function handleSave() {
    const apiKey =
      typeof window !== "undefined"
        ? localStorage.getItem("rageval_api_key")
        : null;
    if (!apiKey) {
      setError("No API key found.");
      return;
    }
    if (!name.trim()) { setError("Name is required."); return; }
    setError(null);
    setSaving(true);
    try {
      await createBaseline(
        { name: name.trim(), eval_run_id: evalRunId, thresholds },
        apiKey
      );
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create baseline");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        {done ? (
          <>
            <p className="mb-4 text-sm font-medium text-emerald-400">
              Baseline created successfully.
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Close</button>
              <button
                onClick={() => router.push("/baselines")}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                View Baselines
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-4 text-base font-semibold text-white">Set as Baseline</h2>
            {error && (
              <div className="mb-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                {error}{" "}
                {error.includes("API key") && (
                  <button onClick={() => router.push("/settings")} className="underline">Go to Settings</button>
                )}
              </div>
            )}
            <label className="mb-1 block text-xs font-medium text-neutral-300">Name</label>
            <input
              className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
              placeholder="e.g. main-v1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <p className="mb-2 text-xs font-medium text-neutral-400">Thresholds</p>
            <div className="mb-5 space-y-2">
              {[
                ["Faithfulness", "faithfulness", false],
                ["Correctness",  "correctness",  false],
                ["Completeness", "completeness", false],
                ["Overall",      "overall",      false],
                ["Max regression %", "max_regression_pct", true],
              ].map(([label, field, isPct]) => (
                <div key={field as string} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-xs text-neutral-500">{label as string}</span>
                  <input
                    type="number" min={0} max={isPct ? 100 : 1} step={isPct ? 1 : 0.05}
                    value={thresholds[field as keyof typeof thresholds]}
                    onChange={(e) => update(field as string, parseFloat(e.target.value) || 0)}
                    className="w-20 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-white outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
                {saving ? "Saving…" : "Save Baseline"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function EvalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [evalData, setEvalData] = useState<EvalRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // forces re-render for elapsed timer
  const [showBaselineModal, setShowBaselineModal] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      try {
        const data = await getEval(id);
        if (!stopped) setEvalData(data);
        if (data.status === "completed" || data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch (err) {
        if (!stopped)
          setError(err instanceof Error ? err.message : "Failed to load");
      }
    }

    poll();
    intervalRef.current = setInterval(poll, 2000);

    // Tick every second so the elapsed timer updates while running
    const tickTimer = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      stopped = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(tickTimer);
    };
  }, [id]);

  const sorted =
    evalData?.strategies
      .slice()
      .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0)) ?? [];

  const isRunning = !evalData || evalData.status === "running" || evalData.status === "pending";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Back + header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="text-neutral-400 hover:text-white"
        >
          ← Back
        </button>
        <span className="text-neutral-700">|</span>
        <h1 className="text-lg font-semibold text-white">Evaluation</h1>
        <span className="font-mono text-xs text-neutral-600">
          {id.slice(0, 8)}…
        </span>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Status bar */}
      {evalData && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-4">
          <StatusBadge status={evalData.status} />

          <div className="flex items-center gap-1 text-sm">
            <span className="text-neutral-500">Time:</span>
            <span className="font-mono text-neutral-200">
              {elapsed(evalData.created_at, evalData.completed_at)}
            </span>
          </div>

          {evalData.status === "completed" && evalData.total_cost_usd > 0 && (
            <div className="flex items-center gap-1 text-sm">
              <span className="text-neutral-500">Total cost:</span>
              <span className="font-mono text-neutral-200">
                ${evalData.total_cost_usd.toFixed(6)}
              </span>
            </div>
          )}

          {evalData.winner && evalData.status === "completed" && (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="text-neutral-500">Winner:</span>
              <span className="font-semibold text-emerald-400">
                {STRATEGY_LABEL[evalData.winner] ?? evalData.winner}
              </span>
              <button
                onClick={() => setShowBaselineModal(true)}
                className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:border-emerald-600 hover:text-emerald-400"
              >
                Set as Baseline
              </button>
            </div>
          )}
        </div>
      )}

      {/* Winner explanation */}
      {evalData?.status === "completed" && evalData.winner_explanation && (
        <div className="mb-5 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5">
          <h3 className="mb-2 text-sm font-semibold text-emerald-400">
            Why {STRATEGY_LABEL[evalData.winner ?? ""] ?? evalData.winner} Won
          </h3>
          <p className="text-sm leading-relaxed text-neutral-300">
            {evalData.winner_explanation}
          </p>
        </div>
      )}

      {/* Running banner */}
      {isRunning && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-4">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-emerald-500"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-neutral-300">
            Running 5 retrieval strategies in parallel…
          </p>
        </div>
      )}

      {/* Strategy cards */}
      <div className="space-y-4">
        {isRunning ? (
          // Skeleton cards while running
          Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} index={i} />
          ))
        ) : (
          // Real cards, sorted by score, staggered entrance
          sorted.map((result, i) => (
            <StrategyCard
              key={result.strategy}
              result={result}
              rank={i + 1}
              isWinner={result.strategy === evalData?.winner}
              style={{
                animationDelay: `${i * 80}ms`,
                animationFillMode: "backwards",
              }}
            />
          ))
        )}
      </div>

      {/* Overall recommendation */}
      {evalData?.status === "completed" && evalData.overall_recommendation && (
        <div className="mt-6 rounded-xl border border-amber-900/50 bg-amber-950/20 p-5">
          <h3 className="mb-2 text-sm font-semibold text-amber-400">
            Optimization Recommendation
          </h3>
          <p className="text-sm leading-relaxed text-neutral-300">
            {evalData.overall_recommendation}
          </p>
        </div>
      )}

      {showBaselineModal && (
        <SetBaselineModal
          evalRunId={id}
          onClose={() => setShowBaselineModal(false)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: EvalRun["status"] }) {
  const map = {
    pending: {
      dot: "bg-yellow-400 animate-pulse",
      text: "text-yellow-300",
      label: "Pending",
    },
    running: {
      dot: "bg-emerald-400 animate-pulse",
      text: "text-emerald-300",
      label: "Running",
    },
    completed: {
      dot: "bg-emerald-500",
      text: "text-emerald-400",
      label: "Completed",
    },
    failed: {
      dot: "bg-red-500",
      text: "text-red-400",
      label: "Failed",
    },
  };
  const s = map[status] ?? map.pending;
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${s.dot}`} />
      <span className={`text-sm font-medium ${s.text}`}>{s.label}</span>
    </div>
  );
}

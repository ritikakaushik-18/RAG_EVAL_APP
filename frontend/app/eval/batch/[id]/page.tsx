"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getBatchEval, type BatchEvalResult } from "@/lib/api";

function ScoreCell({ value }: { value: number }) {
  const color =
    value >= 0.7 ? "text-emerald-400" : value >= 0.4 ? "text-amber-400" : "text-red-400";
  return (
    <span className={`font-mono text-sm tabular-nums ${color}`}>
      {(value * 100).toFixed(0)}%
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-neutral-800">
      <div
        className="h-2 rounded-full bg-emerald-500 transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function BatchEvalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<BatchEvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      try {
        const result = await getBatchEval(id);
        if (!stopped) setData(result);
        if (result.status !== "running") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch (err) {
        if (!stopped)
          setError(err instanceof Error ? err.message : "Failed to load");
      }
    }

    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      stopped = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id]);

  const isRunning = !data || data.status === "running";
  const dims = ["faithfulness", "correctness", "completeness", "overall"] as const;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push("/datasets")} className="text-neutral-400 hover:text-white">← Datasets</button>
        <span className="text-neutral-700">|</span>
        <h1 className="text-lg font-semibold text-white">Batch Evaluation</h1>
        <span className="font-mono text-xs text-neutral-600">{id.slice(0, 8)}…</span>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Progress card */}
      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        {isRunning ? (
          <>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Running
              </span>
              <span className="text-neutral-400">
                {data?.completed_items ?? 0} / {data?.total_items ?? "…"} questions
              </span>
            </div>
            <ProgressBar pct={data?.progress_pct ?? 0} />
            <p className="mt-2 text-xs text-neutral-500">
              Each question runs all 5 retrieval strategies. This may take a few minutes.
            </p>
          </>
        ) : data?.status === "failed" ? (
          <p className="text-sm text-red-400">Batch evaluation failed.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium text-emerald-400">
                ✓ Completed
              </span>
              <span className="text-neutral-400">
                {data?.total_items} questions evaluated
              </span>
            </div>
            <ProgressBar pct={100} />
          </>
        )}
      </div>

      {/* Average scores */}
      {data?.avg_scores && (
        <div className="mb-6 rounded-xl border border-emerald-900/50 bg-neutral-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-200">
            Average Scores Across All Questions
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {dims.map((dim) => (
              <div key={dim} className="rounded-lg bg-neutral-800 p-3 text-center">
                <p className="mb-1 text-xs text-neutral-500 capitalize">{dim}</p>
                <ScoreCell value={data.avg_scores![dim]} />
              </div>
            ))}
          </div>
          {data.avg_scores.overall >= 0.7 ? (
            <p className="mt-4 text-xs text-emerald-400">
              ✓ Strong overall performance — this retrieval setup works well for this dataset.
            </p>
          ) : data.avg_scores.overall >= 0.4 ? (
            <p className="mt-4 text-xs text-amber-400">
              ⚠ Mixed results — some questions are not being answered well. Review individual runs.
            </p>
          ) : (
            <p className="mt-4 text-xs text-red-400">
              ✗ Low scores overall — consider improving your chunking strategy or embedding model.
            </p>
          )}
        </div>
      )}

      {/* Individual run links */}
      {data && data.eval_run_ids.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 px-5 py-3">
            <h2 className="text-sm font-medium text-neutral-200">
              Individual Eval Runs ({data.eval_run_ids.length})
            </h2>
          </div>
          <div className="divide-y divide-neutral-800">
            {data.eval_run_ids.map((runId, i) => (
              <div key={runId} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-neutral-400">Question {i + 1}</span>
                <button
                  onClick={() => router.push(`/eval/${runId}`)}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  View results →
                </button>
              </div>
            ))}
            {isRunning && data.completed_items < data.total_items && (
              <div className="px-5 py-3">
                <p className="text-xs text-neutral-600">
                  {data.total_items - data.completed_items} question(s) still running…
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

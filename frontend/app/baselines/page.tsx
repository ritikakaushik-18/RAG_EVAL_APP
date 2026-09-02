"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listBaselines,
  createBaseline,
  listEvalRuns,
  type Baseline,
  type EvalRunSummary,
} from "@/lib/api";

const DEFAULT_THRESHOLDS = {
  faithfulness:       0.75,
  correctness:        0.75,
  completeness:       0.70,
  overall:            0.75,
  max_regression_pct: 5.0,
};

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ThresholdRow({
  label,
  field,
  value,
  onChange,
  isPercent,
}: {
  label: string;
  field: string;
  value: number;
  onChange: (field: string, v: number) => void;
  isPercent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-xs text-neutral-400">{label}</span>
      <input
        type="number"
        min={0}
        max={isPercent ? 100 : 1}
        step={isPercent ? 1 : 0.05}
        value={value}
        onChange={(e) => onChange(field, parseFloat(e.target.value) || 0)}
        className="w-24 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
      />
      <span className="text-xs text-neutral-500">{isPercent ? "%" : "(0–1)"}</span>
    </div>
  );
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [evalRunId, setEvalRunId] = useState("");
  const [thresholds, setThresholds] = useState({ ...DEFAULT_THRESHOLDS });
  const [evalRuns, setEvalRuns] = useState<EvalRunSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvalRuns("completed").then(setEvalRuns).catch(() => {});
  }, []);

  function updateThreshold(field: string, value: number) {
    setThresholds((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate() {
    const apiKey = localStorage.getItem("rageval_api_key");
    if (!apiKey) {
      setError("No API key found. Generate one in Settings first.");
      return;
    }
    if (!name.trim()) {
      setError("Baseline name is required.");
      return;
    }
    if (!evalRunId) {
      setError("Select an eval run to use as the baseline.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await createBaseline({ name: name.trim(), eval_run_id: evalRunId, thresholds }, apiKey);
      onCreated();
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
      <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="mb-5 text-lg font-semibold text-white">New Baseline</h2>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-neutral-300">
          Baseline Name
        </label>
        <input
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
          placeholder="e.g. shopify-sidekick-v1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label className="mb-1 block text-xs font-medium text-neutral-300">
          Eval Run (golden run)
        </label>
        <select
          className="mb-5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          value={evalRunId}
          onChange={(e) => setEvalRunId(e.target.value)}
        >
          <option value="">— select a completed eval run —</option>
          {evalRuns.map((r) => (
            <option key={r.eval_run_id} value={r.eval_run_id}>
              {r.eval_run_id.slice(0, 8)}… · {formatDate(r.created_at)}
            </option>
          ))}
        </select>

        <p className="mb-3 text-xs font-medium text-neutral-300">
          Quality Thresholds
        </p>
        <div className="mb-5 space-y-2.5">
          <ThresholdRow label="Faithfulness (min)"   field="faithfulness"       value={thresholds.faithfulness}       onChange={updateThreshold} />
          <ThresholdRow label="Correctness (min)"    field="correctness"        value={thresholds.correctness}        onChange={updateThreshold} />
          <ThresholdRow label="Completeness (min)"   field="completeness"       value={thresholds.completeness}       onChange={updateThreshold} />
          <ThresholdRow label="Overall (min)"        field="overall"            value={thresholds.overall}            onChange={updateThreshold} />
          <ThresholdRow label="Max regression"       field="max_regression_pct" value={thresholds.max_regression_pct} onChange={updateThreshold} isPercent />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {saving ? "Creating…" : "Create Baseline"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BaselinesPage() {
  const router = useRouter();
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  async function fetchBaselines() {
    try {
      const data = await listBaselines();
      setBaselines(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBaselines();
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Baselines</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Golden eval runs used as the quality reference for CI gates.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          New Baseline
        </button>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 px-5 py-3">
          <h2 className="text-sm font-medium text-neutral-200">All Baselines</h2>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-neutral-800" />
            ))}
          </div>
        ) : baselines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-4xl">📏</div>
            <p className="text-sm font-medium text-neutral-300">No baselines yet</p>
            <p className="mt-1 text-xs text-neutral-500">
              Run an evaluation, then create a baseline from the results page.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {baselines.map((b) => (
              <div key={b.baseline_id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">{b.name}</p>
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-neutral-500">
                      eval {b.eval_run_id.slice(0, 8)}…
                      <CopyButton text={b.eval_run_id} />
                      <span className="font-sans">· {formatDate(b.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <code className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-400">
                        {b.baseline_id.slice(0, 8)}…
                      </code>
                      <CopyButton text={b.baseline_id} />
                    </div>
                    <button
                      onClick={() => router.push(`/eval/${b.eval_run_id}`)}
                      className="rounded-lg border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-500 hover:text-white"
                    >
                      View Eval
                    </button>
                  </div>
                </div>

                {/* Thresholds */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(b.thresholds).map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-400"
                    >
                      {k === "max_regression_pct"
                        ? `max regression: ${v}%`
                        : `${k} ≥ ${v}`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            fetchBaselines();
          }}
        />
      )}
    </div>
  );
}

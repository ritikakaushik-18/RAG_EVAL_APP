"use client";

import { useEffect, useState } from "react";
import {
  createAPIKey,
  listAPIKeys,
  revokeAPIKey,
  type APIKeyRecord,
} from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<APIKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function fetchKeys() {
    try {
      const data = await listAPIKeys();
      setKeys(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const result = await createAPIKey("default");
      setNewKey(result.key);
      // Save to localStorage for use in the UI
      localStorage.setItem("rageval_api_key", result.key);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate key");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    setRevoking(keyId);
    try {
      await revokeAPIKey(keyId);
      if (keys.length === 1) localStorage.removeItem("rageval_api_key");
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-xl font-bold text-white">Settings</h1>
      <p className="mb-8 text-sm text-neutral-400">
        Manage API keys for the GitHub Actions integration.
      </p>

      {error && (
        <div className="mb-5 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* One-time key reveal */}
      {newKey && (
        <div className="mb-6 rounded-xl border border-emerald-800 bg-emerald-950/30 p-5">
          <p className="mb-2 text-sm font-semibold text-emerald-400">
            API Key generated — copy it now. It won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 select-all break-all rounded-lg bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-100">
              {newKey}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newKey);
              }}
              className="shrink-0 rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Copy
            </button>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            This key has also been saved to your browser&apos;s localStorage for use
            in the &quot;Set as Baseline&quot; button on eval result pages.
          </p>
          <button
            onClick={() => setNewKey(null)}
            className="mt-3 text-xs text-neutral-500 underline hover:text-neutral-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Key list */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2 className="text-sm font-medium text-neutral-200">API Keys</h2>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate New Key"}
          </button>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-800" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-neutral-400">No API keys yet.</p>
            <p className="mt-1 text-xs text-neutral-600">
              Generate a key to use with the GitHub Action.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
                <th className="px-5 py-3 font-medium">Prefix</th>
                <th className="px-5 py-3 font-medium">Tenant</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr
                  key={k.id}
                  className={i < keys.length - 1 ? "border-b border-neutral-800" : ""}
                >
                  <td className="px-5 py-3">
                    <code className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-200">
                      {k.key_prefix}…
                    </code>
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">
                    {k.tenant_id}
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">
                    {formatDate(k.created_at)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleRevoke(k.id)}
                      disabled={revoking === k.id}
                      className="text-xs text-red-500 hover:text-red-400 disabled:opacity-40"
                    >
                      {revoking === k.id ? "Revoking…" : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* GitHub Actions usage guide */}
      <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h3 className="mb-3 text-sm font-semibold text-neutral-200">
          GitHub Actions Secrets
        </h3>
        <p className="mb-3 text-xs text-neutral-500">
          Add these secrets to your repository under Settings → Secrets and variables → Actions:
        </p>
        <div className="space-y-1.5">
          {[
            ["RAGEVAL_API_URL",       "Your deployed backend URL"],
            ["RAGEVAL_API_KEY",       "The key generated above"],
            ["RAGEVAL_BASELINE_ID",   "ID from /baselines page"],
            ["RAGEVAL_TEST_QUERY",    "Your regression test question"],
            ["RAGEVAL_CORRECT_ANSWER","Ground-truth answer"],
            ["RAGEVAL_DOCUMENT_ID",   "Document to evaluate against"],
            ["RAGEVAL_TENANT_ID",     "default (or your tenant)"],
          ].map(([name, desc]) => (
            <div key={name} className="flex items-center gap-3 text-xs">
              <code className="w-52 shrink-0 rounded bg-neutral-800 px-2 py-0.5 font-mono text-neutral-200">
                {name}
              </code>
              <span className="text-neutral-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

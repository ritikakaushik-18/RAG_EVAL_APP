"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listDatasets,
  generateDataset,
  listDocuments,
  exportDatasetUrl,
  type TestSetSummary,
  type Document,
} from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: TestSetSummary["status"] }) {
  if (status === "generating") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Generating
      </span>
    );
  }
  if (status === "ready") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
        Ready
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400">
      Failed
    </span>
  );
}

function GenerateModal({
  onClose,
  onGenerated,
}: {
  onClose: () => void;
  onGenerated: (id: string) => void;
}) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [name, setName] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [qpc, setQpc] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDocuments().then(setDocuments).catch(() => {});
  }, []);

  function toggleDoc(id: string) {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleGenerate() {
    if (!name.trim()) { setError("Name is required."); return; }
    if (selectedDocs.length === 0) { setError("Select at least one document."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const { test_set_id } = await generateDataset({
        name: name.trim(),
        document_ids: selectedDocs,
        questions_per_chunk: qpc,
      });
      onGenerated(test_set_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="mb-5 text-lg font-semibold text-white">Generate Test Set</h2>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-neutral-300">Dataset Name</label>
        <input
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
          placeholder="e.g. Q4 Support Docs"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label className="mb-2 block text-xs font-medium text-neutral-300">
          Documents <span className="text-neutral-500">(select one or more)</span>
        </label>
        <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800">
          {documents.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-500">No documents yet. Upload one first.</p>
          ) : (
            documents.map((doc) => (
              <label
                key={doc.document_id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-700"
              >
                <input
                  type="checkbox"
                  checked={selectedDocs.includes(doc.document_id)}
                  onChange={() => toggleDoc(doc.document_id)}
                  className="accent-emerald-500"
                />
                <span className="flex-1 text-sm text-neutral-200">{doc.filename}</span>
                <span className="text-xs text-neutral-500">{doc.chunk_count} chunks</span>
              </label>
            ))
          )}
        </div>

        <div className="mb-5 flex items-center gap-3">
          <label className="text-xs font-medium text-neutral-300">
            Questions per chunk
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={qpc}
            onChange={(e) => setQpc(parseInt(e.target.value) || 3)}
            className="w-20 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
          />
          <span className="text-xs text-neutral-500">
            ~{selectedDocs.reduce((acc, id) => {
              const doc = documents.find((d) => d.document_id === id);
              return acc + (doc?.chunk_count ?? 0);
            }, 0) * qpc} questions total
          </span>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={submitting}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {submitting ? "Starting…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DatasetsPage() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<TestSetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  async function fetchDatasets() {
    try {
      const data = await listDatasets();
      setDatasets(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDatasets();
    const t = setInterval(fetchDatasets, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Test Datasets</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Synthetic QA pairs generated from your documents — with PII scrubbing and audit export.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Generate New Dataset
        </button>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 px-5 py-3">
          <h2 className="text-sm font-medium text-neutral-200">All Datasets</h2>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-neutral-800" />
            ))}
          </div>
        ) : datasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-4xl">🧪</div>
            <p className="text-sm font-medium text-neutral-300">No datasets yet</p>
            <p className="mt-1 text-xs text-neutral-500">
              Generate a test set from your uploaded documents.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Items</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {datasets.map((ds, i) => (
                <tr
                  key={ds.test_set_id}
                  className={i < datasets.length - 1 ? "border-b border-neutral-800" : ""}
                >
                  <td className="px-5 py-3 text-sm font-medium text-neutral-100">
                    {ds.name}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={ds.status} />
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">
                    {ds.item_count > 0 ? ds.item_count : "—"}
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">
                    {formatDate(ds.created_at)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {ds.status === "ready" && (
                        <a
                          href={exportDatasetUrl(ds.test_set_id)}
                          download
                          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
                        >
                          Export ZIP
                        </a>
                      )}
                      <button
                        onClick={() => router.push(`/datasets/${ds.test_set_id}`)}
                        disabled={ds.status !== "ready"}
                        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-emerald-600 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        View Items
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <GenerateModal
          onClose={() => setShowModal(false)}
          onGenerated={(id) => {
            setShowModal(false);
            router.push(`/datasets/${id}`);
          }}
        />
      )}
    </div>
  );
}

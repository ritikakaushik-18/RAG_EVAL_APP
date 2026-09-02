const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Document {
  document_id: string;
  filename: string;
  s3_key: string;
  chunk_count: number;
  tenant_id: string;
  created_at: string;
}

export interface StrategyResult {
  strategy: string;
  overall_score: number | null;
  faithfulness: number | null;
  correctness: number | null;
  completeness: number | null;
  reasoning: string | null;
  retrieved_answer: string | null;
  latency_ms: number | null;
  cost_usd: number | null;
  failure_attribution: string | null;
  recommendation: string | null;
}

export interface EvalRun {
  eval_run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
  winner: string | null;
  total_cost_usd: number;
  overall_recommendation: string | null;
  winner_explanation: string | null;
  strategies: StrategyResult[];
}

export interface EvalRunSummary {
  eval_run_id: string;
  status: string;
  tenant_id: string;
  created_at: string;
  document_ids: string[];
}

export interface ScoreMap {
  faithfulness: number;
  correctness: number;
  completeness: number;
  overall: number;
}

export interface Baseline {
  baseline_id: string;
  name: string;
  eval_run_id: string;
  tenant_id: string;
  thresholds: {
    faithfulness?: number;
    correctness?: number;
    completeness?: number;
    overall?: number;
    max_regression_pct?: number;
  };
  created_at: string;
}

export interface CIRunSummary {
  ci_run_id: string;
  baseline_id: string;
  baseline_name: string;
  eval_run_id: string | null;
  tenant_id: string;
  status: "running" | "passed" | "failed";
  passed: boolean | null;
  pr_number: string | null;
  commit_sha: string | null;
  created_at: string;
}

export interface CIRunDetail extends CIRunSummary {
  baseline_scores: ScoreMap | null;
  current_scores: ScoreMap | null;
  diffs: ScoreMap | null;
  failed_thresholds: string[] | null;
  recommendation: string | null;
  failure_attribution: string | null;
  current_winner: string | null;
  baseline_winner: string | null;
  github_comment_markdown: string | null;
}

export interface APIKeyRecord {
  id: string;
  tenant_id: string;
  key_prefix: string;
  created_at: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listDocuments(): Promise<Document[]> {
  return handleResponse(await fetch(`${API}/documents`));
}

export interface UploadedDoc {
  document_id: string;
  filename: string;
  s3_key: string;
  tenant_id: string;
  created_at: string;
}

export async function uploadDocuments(
  files: File[],
  tenantId = "default"
): Promise<{ documents: UploadedDoc[]; count: number }> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  form.append("tenant_id", tenantId);
  return handleResponse(
    await fetch(`${API}/documents/upload`, { method: "POST", body: form })
  );
}

export async function ingestDocument(
  documentId: string
): Promise<{ chunk_count: number; status: string }> {
  return handleResponse(
    await fetch(`${API}/documents/${documentId}/ingest`, { method: "POST" })
  );
}

export async function startEval(params: {
  query: string;
  correct_answer: string;
  document_ids: string[];
  tenant_id?: string;
}): Promise<{ eval_run_id: string; status: string }> {
  return handleResponse(
    await fetch(`${API}/eval/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: "default", ...params }),
    })
  );
}

export async function getEval(evalRunId: string): Promise<EvalRun> {
  return handleResponse(await fetch(`${API}/eval/${evalRunId}`));
}

export async function listEvalRuns(status?: string): Promise<EvalRunSummary[]> {
  const url = status ? `${API}/eval/runs?status=${status}` : `${API}/eval/runs`;
  return handleResponse(await fetch(url));
}

// Baselines
export async function createBaseline(
  params: {
    name: string;
    eval_run_id: string;
    tenant_id?: string;
    thresholds?: Record<string, number>;
  },
  apiKey: string
): Promise<Baseline> {
  return handleResponse(
    await fetch(`${API}/baselines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ tenant_id: "default", thresholds: {}, ...params }),
    })
  );
}

export async function listBaselines(): Promise<Baseline[]> {
  return handleResponse(await fetch(`${API}/baselines`));
}

// CI runs
export async function startCIRun(
  params: {
    baseline_id: string;
    query: string;
    correct_answer: string;
    document_ids: string[];
    tenant_id?: string;
    pr_number?: string;
    commit_sha?: string;
  },
  apiKey: string
): Promise<{ ci_run_id: string; status: string }> {
  return handleResponse(
    await fetch(`${API}/ci/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ tenant_id: "default", ...params }),
    })
  );
}

export async function listCIRuns(): Promise<CIRunSummary[]> {
  return handleResponse(await fetch(`${API}/ci/runs`));
}

export async function getCIRun(ciRunId: string): Promise<CIRunDetail> {
  return handleResponse(await fetch(`${API}/ci/${ciRunId}`));
}

// API keys
export async function createAPIKey(
  tenantId = "default"
): Promise<{ id: string; key: string; key_prefix: string; tenant_id: string }> {
  return handleResponse(
    await fetch(`${API}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId }),
    })
  );
}

export async function listAPIKeys(): Promise<APIKeyRecord[]> {
  return handleResponse(await fetch(`${API}/api-keys`));
}

// Datasets
export interface TestSetSummary {
  test_set_id: string;
  name: string;
  document_ids: string[];
  tenant_id: string;
  item_count: number;
  status: "generating" | "ready" | "failed";
  created_at: string;
}

export interface TestSetItem {
  id: string;
  question: string;
  answer: string;
  source_chunk: string | null;
  pii_scrubbed: boolean;
  scrub_log: {
    question_findings: Array<{ entity_type: string; score: number }>;
    answer_findings: Array<{ entity_type: string; score: number }>;
  };
  created_at: string;
}

export interface TestSetDetail extends TestSetSummary {
  items: TestSetItem[];
}

export interface BatchEvalResult {
  batch_eval_id: string;
  test_set_id: string;
  document_ids: string[];
  tenant_id: string;
  status: "running" | "completed" | "failed";
  total_items: number;
  completed_items: number;
  progress_pct: number;
  avg_scores: {
    faithfulness: number;
    correctness: number;
    completeness: number;
    overall: number;
  } | null;
  eval_run_ids: string[];
  created_at: string;
}

export async function generateDataset(params: {
  name: string;
  document_ids: string[];
  tenant_id?: string;
  questions_per_chunk?: number;
}): Promise<{ test_set_id: string; status: string }> {
  return handleResponse(
    await fetch(`${API}/datasets/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: "default", questions_per_chunk: 3, ...params }),
    })
  );
}

export async function listDatasets(): Promise<TestSetSummary[]> {
  return handleResponse(await fetch(`${API}/datasets`));
}

export async function getDataset(testSetId: string): Promise<TestSetDetail> {
  return handleResponse(await fetch(`${API}/datasets/${testSetId}`));
}

export function exportDatasetUrl(testSetId: string): string {
  return `${API}/datasets/${testSetId}/export`;
}

export async function runDatasetEval(params: {
  test_set_id: string;
  document_ids: string[];
  tenant_id?: string;
}): Promise<{ batch_eval_id: string; total_items: number }> {
  return handleResponse(
    await fetch(`${API}/eval/run-dataset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: "default", ...params }),
    })
  );
}

export async function getBatchEval(batchEvalId: string): Promise<BatchEvalResult> {
  return handleResponse(await fetch(`${API}/eval/batch/${batchEvalId}`));
}

export async function revokeAPIKey(keyId: string): Promise<void> {
  const res = await fetch(`${API}/api-keys/${keyId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
}

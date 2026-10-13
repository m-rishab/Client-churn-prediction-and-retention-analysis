// Typed API client. All requests go to same-origin /api (proxied in dev).
// No external network calls anywhere in the app.

export type RiskBand = 'Low' | 'Medium' | 'High'
export type Mode = 'balanced' | 'catch_more'

export interface TopReason {
  label: string
  raw_reason: string
  direction: 'up' | 'down'
  detail: string
  tooltip: string
}

export interface PredictResult {
  client_id: string
  risk_score: number
  risk_band: RiskBand
  segment: string
  segment_meaning: string
  recommended_action: string
  top_3_reasons: TopReason[]
  expected_loss: number
  mode_used: Mode
  model_version: string
}

export interface FieldInfo {
  name: string
  label: string
  dtype: 'numeric' | 'categorical'
  min: number | null
  max: number | null
  allowed_categories: string[] | null
  typical: string | number | null
  missing_allowed: boolean
  quick_check: boolean
}

export interface ModelInfo {
  model_version: string
  model_name: string
  trained_on: string
  synthetic_data: boolean
  disclaimer: string
  quick_check_fields: string[]
  features: FieldInfo[]
  thresholds: Record<string, unknown>
  test_metrics: {
    roc_auc: number
    pr_auc: number
    accuracy: number
    precision: number
    recall: number
    f1: number
    threshold: number
    confusion_matrix: { tn: number; fp: number; fn: number; tp: number }
  }
  segment_rules: Record<string, string>
}

export interface GlossaryEntry {
  label: string
  definition: string
  example: string | number
  input?: 'number' | 'score' | 'segmented' | 'switch'
  group?: string
  range?: number[] | string[]
  typical?: string | number
  direction_hint?: string
  data_origin?: 'telecom_base' | 'simulated'
  options?: { value: string; label: string; definition: string; example: string }[]
}

export interface Glossary {
  fields: Record<string, GlossaryEntry>
  segments: Record<string, { api_values: string[]; definition: string; example: string }>
  risk_bands: Record<string, { score_range: number[]; definition: string; example: string }>
  modes: Record<string, { label: string; definition: string; example: string }>
  metrics: Record<string, { label: string; definition: string; example: string }>
  misc: Record<string, { label: string; definition: string; example: string; direction_hint?: string }>
  ui: Record<string, { label: string; definition: string; example: string }>
}

export interface Brief {
  summary: string
  next_steps: string[]
  source: 'llm' | 'template'
  model: string | null
  cached: boolean
  notice: string | null
  risk_score: number
  risk_band: RiskBand
  segment: string
  mode_used: Mode
  model_version: string
  disclaimer: string
}

export interface SaveNowItem {
  client_id: string
  risk_score: number
  segment: string
  next_action: string
  expected_loss: number
}

export interface BatchResponse {
  count: number
  rejected_count: number
  results: PredictResult[]
  rejected: { row: number | null; client_id: string | null; reason: string }[]
  download_available: boolean
  mode_used: Mode
  model_version: string
}

export interface HistoryItem {
  id: number
  created_at: string
  source: string
  client_id: string | null
  mode: string
  model_version: string
  risk_score: number | null
  risk_band: string | null
  segment: string | null
  recommended_action: string | null
}

export interface SegmentTile {
  segment: string
  clients: number
  expected_loss: number
  meaning: string
}

export interface CurvePoint {
  clients_contacted: number
  covered_share: number
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body && typeof body.error === 'string') msg = body.error
    } catch {
      /* keep default message */
    }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string; model_version: string }>('/api/health'),
  modelInfo: () => request<ModelInfo>('/api/model-info'),
  glossary: () => request<Glossary>('/api/glossary'),
  predict: (client: Record<string, unknown>, mode: Mode, save: boolean, signal?: AbortSignal) =>
    request<PredictResult>(`/api/predict?save=${save}`, {
      method: 'POST',
      body: JSON.stringify({ ...client, mode }),
      signal,
    }),
  batch: (file: File, mode: Mode) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`/api/predict/batch?mode=${mode}`, { method: 'POST', body: form }).then(
      async (res) => {
        const body = await res.json()
        if (!res.ok) throw new ApiError(res.status, body?.error ?? 'Upload failed.')
        return body as BatchResponse
      },
    )
  },
  batchTemplateUrl: () => '/api/predict/batch/template',
  brief: (client: Record<string, unknown>, mode: Mode) =>
    request<Brief>('/api/brief', {
      method: 'POST',
      body: JSON.stringify({ ...client, mode }),
    }),
  whatIf: (client: Record<string, unknown>, changes: Record<string, unknown>, mode: Mode) =>
    request<{ before: PredictResult; after: PredictResult; delta: number; note: string }>(
      '/api/what-if',
      { method: 'POST', body: JSON.stringify({ client, changes, mode }) },
    ),
  history: (limit = 50) =>
    request<{ count: number; items: HistoryItem[] }>(`/api/predictions?limit=${limit}`),
  segments: () => request<{ segments: SegmentTile[] }>('/api/segments'),
  saveNow: (limit = 50) =>
    request<{ count: number; items: SaveNowItem[] }>(`/api/save-now?limit=${limit}`),
  capacityCurve: () =>
    request<{ points: CurvePoint[]; caption: string; note: string }>('/api/capacity-curve'),
  figureUrl: (name: string) => `/api/figures/${name}`,
}

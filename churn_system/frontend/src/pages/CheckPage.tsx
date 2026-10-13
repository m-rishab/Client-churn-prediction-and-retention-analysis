import { useEffect, useRef, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown, FileText, LifeBuoy, ShieldCheck, Upload, Users } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Glossary, type Mode, type PredictResult } from '../lib/api'
import { Field } from '../components/fields'
import { ResultCard } from '../components/ResultCard'
import { CountUp } from '../components/CountUp'
import { SAMPLE_CLIENT, FIELD_GROUPS, downloadCsv, friendlyAction } from '../lib/sample'

type Values = Record<string, string | number | undefined>

const EMPTY: Values = {}

const GROUP_ICONS: Record<string, { tint: string; icon: React.ReactNode }> = {
  'About the account': { tint: '#EEF2FF', icon: <Users size={16} style={{ color: '#4F46E5' }} /> },
  'Content and guidelines': { tint: '#FFF1F2', icon: <ShieldCheck size={16} style={{ color: '#E11D48' }} /> },
  'How active the client is': { tint: '#E0F2FE', icon: <FileText size={16} style={{ color: '#0EA5E9' }} /> },
  'Help requests': { tint: '#F5F3FF', icon: <LifeBuoy size={16} style={{ color: '#7C3AED' }} /> },
  'Google Search and website': { tint: '#F0FDFA', icon: <FileText size={16} style={{ color: '#0D9488' }} /> },
}

export function CheckPage() {
  const [tab, setTab] = useState('one')

  const { data: modelInfo } = useQuery({ queryKey: ['model-info'], queryFn: api.modelInfo })
  const { data: glossary } = useQuery({ queryKey: ['glossary'], queryFn: api.glossary })

  return (
    <div>
      {/* Hero stays mounted for the whole visit: collapsing it when the first
          result arrives caused a large layout shift (CLS 0.09 > 0.05 budget). */}
      <div className="mb-6">
        <section
            aria-label="About this tool"
            className="relative overflow-hidden rounded-card p-6 text-white shadow-[0_10px_30px_rgba(79,70,229,0.25)]"
            style={{ background: 'linear-gradient(120deg, #4F46E5 0%, #6366F1 55%, #7C3AED 100%)' }}
          >
            <div className="hero-glow" aria-hidden />
            <div className="hero-orb left-[8%] top-[20%] h-24 w-24" aria-hidden />
            <div className="hero-orb right-[14%] top-[-30%] h-40 w-40" aria-hidden />
            <div className="relative">
              <h1 className="text-xl2 font-semibold">Check a client in under a minute.</h1>
              <p className="mt-1 max-w-[640px] text-base text-indigo-100">
                Enter a few details to see how likely they are to leave, why, and what to do next.
              </p>
              <ol className="mt-3 flex flex-wrap gap-2 text-xs2">
                {[
                  ['Enter a few details', '#FFFFFF'],
                  ['See the top reasons', '#FFFFFF'],
                  ['Do the suggested action', '#FFFFFF'],
                ].map(([label, iconColour], i) => (
                  <li
                    key={label}
                    className="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1"
                  >
                    <span
                      aria-hidden
                      className="flex h-4 w-4 items-center justify-center rounded-full text-xs2 font-semibold"
                      style={{ background: iconColour, color: '#4F46E5' }}
                    >
                      {i + 1}
                    </span>
                    {label}
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs2 text-indigo-100">
                Not sure? Leave it blank. We'll use a typical value.
              </p>
            </div>
        </section>
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="mb-4 flex gap-4 border-b border-line">
          <Tabs.Trigger
            value="one"
            className="-mb-px border-b-2 border-transparent pb-2 text-base text-muted data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-ink"
          >
            One client
          </Tabs.Trigger>
          <Tabs.Trigger
            value="many"
            className="-mb-px border-b-2 border-transparent pb-2 text-base text-muted data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-ink"
          >
            Many clients
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="one">
          {modelInfo && glossary ? (
            <OneClient modelInfo={modelInfo} glossary={glossary} />
          ) : (
            <p className="text-base text-muted">Loading. One moment.</p>
          )}
        </Tabs.Content>

        <Tabs.Content value="many">
          <ManyClients />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function OneClient({
  modelInfo,
  glossary,
}: {
  modelInfo: NonNullable<ReturnType<typeof api.modelInfo> extends Promise<infer T> ? T : never>
  glossary: Glossary
}) {
  const [values, setValues] = useState<Values>(EMPTY)
  const [showAll, setShowAll] = useState(false)
  const [mode, setMode] = useState<Mode>('balanced')
  const [result, setResult] = useState<PredictResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [baseline, setBaseline] = useState<{ score: number } | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const gotResultRef = useRef(false)

  const quickFields = modelInfo.quick_check_fields
  const filledQuick = quickFields.filter((f) => values[f] !== undefined).length
  const ready = filledQuick >= 3
  const totalFields = modelInfo.features.length

  const extraGroups = Object.entries(FIELD_GROUPS).map(([title, fields]) => ({
    title,
    fields: fields.filter((f) => !quickFields.includes(f) && glossary.fields[f]),
  }))

  const setValue = (field: string, v: string | number | undefined) => {
    setValues((prev) => ({ ...prev, [field]: v }))
  }

  useEffect(() => {
    window.clearTimeout(timerRef.current)
    if (!ready) {
      setResult(null)
      return
    }
    timerRef.current = window.setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setLoading(true)
      setError(null)
      try {
        const res = await api.predict(values, mode, false, ctrl.signal)
        if (!gotResultRef.current) {
          gotResultRef.current = true
          setBaseline({ score: res.risk_score })
        }
        setResult(res)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }, 500)
    return () => window.clearTimeout(timerRef.current)
  }, [values, mode, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSample = () => {
    setValues({ ...SAMPLE_CLIENT })
    setBaseline(null)
    gotResultRef.current = false
    setSaved(false)
  }
  const clear = () => {
    setValues(EMPTY)
    setBaseline(null)
    gotResultRef.current = false
    setResult(null)
    setSaved(false)
  }

  const saveCheck = async () => {
    if (!result) return
    await api.predict(values, mode, true)
    setSaved(true)
  }

  const renderFields = (fields: string[]) =>
    fields.map((f) => (
      <Field
        key={f}
        field={f}
        entry={glossary.fields[f]}
        value={values[f]}
        onChange={setValue}
      />
    ))

  return (
    <div className="grid gap-6 md:grid-cols-[5fr_7fr]">
      <section aria-label="Client details">
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs2">
          <button type="button" onClick={loadSample} className="text-accent underline underline-offset-4">
            Load a sample client
          </button>
          {Object.keys(values).length > 0 && (
            <button type="button" onClick={clear} className="text-muted underline underline-offset-4 hover:text-ink">
              Clear
            </button>
          )}
          <span className="ml-auto text-muted">
            Details filled: <CountUp value={filledQuick} /> of {totalFields}
          </span>
        </div>

        <div className="card-tint space-y-4 rounded-card border border-line p-4 shadow-card">
          {renderFields(quickFields)}

          {!showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs2 text-accent underline underline-offset-4"
            >
              Add more details
            </button>
          ) : (
            <Accordion.Root type="multiple" className="space-y-2">
              {extraGroups.map(({ title, fields }) => (
                <Accordion.Item key={title} value={title} className="rounded-input border border-line">
                  <Accordion.Header>
                    <Accordion.Trigger className="group flex w-full items-center justify-between px-3 py-2 text-xs2 font-medium">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="flex h-8 w-8 items-center justify-center rounded-lg"
                          style={{ background: GROUP_ICONS[title]?.tint ?? '#EEF2FF' }}
                        >
                          {GROUP_ICONS[title]?.icon ?? <FileText size={16} style={{ color: '#4F46E5' }} />}
                        </span>
                        {title}
                      </span>
                      <ChevronDown size={16} className="transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="space-y-4 px-3 pb-3">
                    {renderFields(fields)}
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          )}
        </div>
      </section>

      <section aria-label="Result area" aria-live="polite">
        {!ready && !result ? (
          <div className="flex h-64 items-center justify-center rounded-card border border-dashed border-inputline bg-white/70">
            <p className="text-base text-muted">Fill in a few details to see the risk here.</p>
          </div>
        ) : loading && !result ? (
          <div className="flex h-64 items-center justify-center rounded-card border border-line bg-white/70">
            <p className="text-base text-muted">Checking. One moment.</p>
          </div>
        ) : error ? (
          <div className="rounded-card border border-line bg-surface p-6">
            <p className="text-base">{error}</p>
            <button type="button" onClick={clear} className="mt-2 text-xs2 text-accent underline underline-offset-4">
              Start over
            </button>
          </div>
        ) : result ? (
          <div className={loading ? 'opacity-70 transition-opacity duration-150' : 'transition-opacity duration-150'}>
            <ResultCard
              result={result}
              mode={mode}
              onModeChange={setMode}
              onSave={saveCheck}
              saved={saved}
              baseline={baseline}
              onResetBaseline={() => {
                setBaseline({ score: result.risk_score })
              }}
              client={values}
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */

interface BatchRow {
  client_id: string
  risk_score: number
  risk_band: string
  segment: string
  recommended_action: string
}

function ManyClients() {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortDesc, setSortDesc] = useState(true)
  const [filter, setFilter] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: (f: File) => api.batch(f, 'balanced'),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['history'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const results: BatchRow[] = mutation.data?.results ?? []
  const sorted = [...results].sort((a, b) =>
    sortDesc ? b.risk_score - a.risk_score : a.risk_score - b.risk_score,
  )
  const shown = sorted.filter(
    (r) =>
      !filter ||
      r.client_id.toLowerCase().includes(filter.toLowerCase()) ||
      r.risk_band.toLowerCase() === filter.toLowerCase(),
  )

  const toCsv = () => {
    const header = 'Client,Score,Level,Segment,Next action'
    const lines = sorted.map(
      (r) => `${r.client_id},${r.risk_score},${r.risk_band},"${r.segment}","${r.recommended_action}"`,
    )
    return [header, ...lines].join('\n')
  }

  return (
    <div>        <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) {
            setFile(f)
            mutation.mutate(f)
          }
        }}
        className={`flex flex-col items-center justify-center rounded-card border border-dashed p-8 transition-colors duration-150 ${
          dragOver ? 'border-accent bg-accent-weak' : 'border-line bg-white/70'
        }`}
      >
        <Upload size={20} className="text-muted" aria-hidden />
        <p className="mt-2 text-base">Drop a CSV file here, or</p>
        <label className="mt-1 text-xs2 text-accent underline underline-offset-4 cursor-pointer">
          choose a file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setFile(f)
                mutation.mutate(f)
              }
            }}
          />
        </label>
        <a href={api.batchTemplateUrl()} download="template.csv" className="mt-2 text-xs2 text-muted underline underline-offset-4">
          Download template
        </a>
        {file && <p className="mt-2 text-xs2 text-muted">{file.name}</p>}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-input bg-[#FEF2F2] p-3 text-xs2 text-[#B91C1C]">
          {error}
        </p>
      )}

      {mutation.data && mutation.data.rejected.length > 0 && (
        <div className="mt-3 rounded-card border border-line bg-surface p-4">
          <p className="text-xs2 font-semibold">
            {mutation.data.rejected_count} row{mutation.data.rejected_count === 1 ? '' : 's'} need a fix:
          </p>
          <ul className="mt-1 space-y-0.5 text-xs2 text-muted">
            {mutation.data.rejected.slice(0, 20).map((r, i) => (
              <li key={i}>
                {r.row != null && `Row ${r.row}: `}
                {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <input
              type="text"
              placeholder="Filter by client or level"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter results"
              className="rounded-input border border-line bg-surface px-2 py-1.5 text-xs2"
            />
            <button
              type="button"
              onClick={() => downloadCsv('client-risk-results.csv', toCsv())}
              className="rounded-input border border-line px-3 py-1.5 text-xs2 hover:bg-bg"
            >
              Download results
            </button>
          </div>
          <div className="card-tint overflow-x-auto rounded-card border border-line shadow-card">
            <table className="w-full text-left text-xs2">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="p-2">Client</th>
                  <th className="p-2">
                    <button type="button" onClick={() => setSortDesc(!sortDesc)} aria-label="Sort by score">
                      Score {sortDesc ? '&darr;' : '&uarr;'}
                    </button>
                  </th>
                  <th className="p-2">Level</th>
                  <th className="p-2">Segment</th>
                  <th className="p-2">Next action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.client_id} className="border-b border-line last:border-0">
                    <td className="p-2">{r.client_id}</td>
                    <td className="p-2">{Math.round(r.risk_score)}</td>
                    <td className="p-2">{r.risk_band}</td>
                    <td className="p-2">{r.segment}</td>
                    <td className="p-2">{friendlyAction(r.recommended_action)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

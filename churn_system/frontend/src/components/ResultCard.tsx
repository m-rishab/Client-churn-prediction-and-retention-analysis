import * as Accordion from '@radix-ui/react-accordion'
import { Check, ChevronDown, Copy, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { api, type Brief, type PredictResult, type Mode } from '../lib/api'
import { BAND_SENTENCE, buildSummary } from '../lib/sample'
import { InfoTip } from './InfoTip'
import { CountUp } from './CountUp'

const BAND_STYLE: Record<string, { pill: string; strip: string; wash: string; icon: string }> = {
  Low: { pill: 'bg-[#F0FDF4] text-[#15803D]', strip: '#15803D', wash: '#F0FDF4', icon: '↓' },
  Medium: { pill: 'bg-[#FFFBEB] text-[#B45309]', strip: '#B45309', wash: '#FFFBEB', icon: '→' },
  High: { pill: 'bg-[#FEF2F2] text-[#B91C1C]', strip: '#B91C1C', wash: '#FEF2F2', icon: '↑' },
}

export function BandPill({ band }: { band: string }) {
  const s = BAND_STYLE[band] ?? BAND_STYLE.Medium
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs2 font-semibold ${s.pill}`}>
      <span aria-hidden>{s.icon}</span>
      {band}
    </span>
  )
}

export function ScoreBar({ score }: { score: number }) {
  return (
    <div className="mt-3">
      <div className="flex h-2 w-full overflow-hidden rounded-full" aria-hidden>
        <div className="h-full w-[40%] bg-[#F0FDF4]" />
        <div className="h-full w-[20%] bg-[#FFFBEB]" />
        <div className="h-full w-[40%] bg-[#FEF2F2]" />
      </div>
      <div className="relative h-0">
        <div
          className="score-marker absolute -top-[14px] h-3 w-[3px] rounded-full bg-ink"
          style={{ left: `calc(${Math.min(100, Math.max(0, score))}% - 1.5px)` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs2 text-muted">
        <span>Low</span>
        <span>Medium</span>
        <span>High</span>
      </div>
    </div>
  )
}

export function RiskScoreBlock({ result }: { result: PredictResult }) {
  const band = BAND_STYLE[result.risk_band] ?? BAND_STYLE.Medium
  return (
    <div>
      <div className="flex items-end gap-3">
        <CountUp
          value={result.risk_score}
          className="inline-block min-w-[3ch] text-4xl2 font-semibold leading-none"
        />
        <BandPill band={result.risk_band} />
      </div>
      <ScoreBar score={result.risk_score} />
      {/* risk colours stay confined to this score area */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full" aria-hidden>
        <div className="h-full w-full" style={{ background: `${band.strip}22` }} />
      </div>
    </div>
  )
}

export function TopReasons({ result }: { result: PredictResult }) {
  return (
    <div>
      <p className="text-xs2 font-semibold text-ink">
        Top reasons
        <InfoTip
          label="Top reasons"
          content={{
            definition: 'The details that moved this score up or down the most.',
            example: 'A down arrow means the detail lowered the score.',
            directionHint:
              'This shows a pattern in practice data. It does not prove that changing something will keep the client.',
          }}
        />
      </p>
      <ul className="mt-1 space-y-1">
        {result.top_3_reasons.map((r, i) => (
          <li
            key={r.raw_reason}
            className="rise-in flex items-center gap-2"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            {r.direction === 'up' ? (
              <TrendingUp size={16} className="text-[#B91C1C]" aria-label="raised the score" />
            ) : (
              <TrendingDown size={16} className="text-[#15803D]" aria-label="lowered the score" />
            )}
            <span className="text-xs2 text-ink">{r.label}</span>
            <InfoTip
              label={r.label}
              content={{ definition: r.detail, directionHint: r.tooltip }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function RetentionBrief({ client, mode }: { client: Record<string, unknown>; mode: Mode }) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const write = async () => {
    setLoading(true)
    setError(null)
    try {
      setBrief(await api.brief(client, mode))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 rounded-input border border-line bg-white/60 p-4">
      {!brief ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={write}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-input border border-line px-3 py-1.5 text-xs2 font-medium text-ink hover:bg-bg disabled:opacity-60"
          >
            <Sparkles size={16} aria-hidden />
            {loading ? 'Writing\u2026' : 'Write a retention brief'}
          </button>
          <span className="text-xs2 text-muted">A short draft, in plain words.</span>
        </div>
      ) : (
        <div>
          <p className="text-xs2 font-semibold text-ink">
            Retention brief
            {brief.source === 'template' && (
              <span className="ml-2 rounded-full bg-bg px-2 py-0.5 text-xs2 font-normal text-muted">
                template
              </span>
            )}
          </p>
          <p className="mt-1 text-xs2 text-ink">{brief.summary}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs2 text-ink">
            {brief.next_steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs2 text-muted">{brief.notice ?? brief.disclaimer}</p>
          <button
            type="button"
            onClick={write}
            disabled={loading}
            className="mt-2 text-xs2 text-accent underline underline-offset-4 disabled:opacity-60"
          >
            {loading ? 'Writing\u2026' : 'Write it again'}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs2 text-[#B91C1C]">{error}</p>}
    </div>
  )
}

interface Props {
  result: PredictResult
  mode: Mode
  onModeChange: (m: Mode) => void
  onSave: () => void
  saved: boolean
  baseline?: { score: number } | null
  onResetBaseline: () => void
  client?: Record<string, unknown>
}

export function ResultCard({ result, mode, onModeChange, onSave, saved, baseline, onResetBaseline, client = {} }: Props) {
  const [copied, setCopied] = useState(false)
  const delta = baseline ? Math.round(result.risk_score - baseline.score) : null
  const showChip = baseline != null && delta !== null && delta !== 0
  const band = BAND_STYLE[result.risk_band] ?? BAND_STYLE.Medium

  const copy = async () => {
    await navigator.clipboard.writeText(buildSummary(result))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section
      aria-label="Result"
      className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      {/* 3px top strip in the current risk colour */}
      <div className="h-[3px] w-full" style={{ background: band.strip }} aria-hidden />
      <div className="p-6" style={{ background: `${band.wash}66` }}>
      {showChip && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent-weak px-2.5 py-1 text-xs2 text-accent">
          Before <CountUp value={Math.round(baseline.score)} className="inline-block min-w-[2ch]" /> &rarr; Now{' '}
          <CountUp value={Math.round(result.risk_score)} className="inline-block min-w-[2ch]" /> (
          {delta! > 0 ? '+' : ''}
          <CountUp value={delta} className="inline-block min-w-[2ch]" />)
          <InfoTip
            label="Before and now"
            content={{
              definition: 'The first result of this session, next to the result you see now.',
              directionHint:
                'This shows a pattern in practice data. It does not prove that making this change will keep the client.',
            }}
          />
          <button
            type="button"
            onClick={onResetBaseline}
            className="text-accent underline underline-offset-4"
          >
            Start again from here
          </button>
        </p>
      )}

      <RiskScoreBlock result={result} />
      <p className="mt-3 text-base">{BAND_SENTENCE[result.risk_band]}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs2 font-semibold text-ink">
            {result.segment}
            <InfoTip
              label="Segment"
              content={{ definition: 'Which of four groups the client falls into, and the matching next step.' }}
            />
          </p>
          <p className="text-xs2 text-muted">{result.segment_meaning}</p>
        </div>
        <div>
          <p className="text-xs2 font-semibold text-ink">What to do next</p>
          <p className="text-xs2 text-ink">{result.recommended_action}</p>
        </div>
      </div>

      <div className="mt-4">
        <TopReasons result={result} />
      </div>

      <RetentionBrief client={client} mode={mode} />

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          data-primary="true"
          className="rounded-input bg-gradient-to-b from-accent to-[#6366F1] px-4 py-2 text-base font-medium text-white shadow-[0_4px_14px_rgba(79,70,229,0.35)] transition-transform duration-150 hover:-translate-y-px hover:from-accent-hover disabled:opacity-60"
          disabled={saved}
        >
          {saved ? (
            <span className="inline-flex items-center gap-1">
              <Check size={16} aria-hidden /> Saved
            </span>
          ) : (
            'Save this check'
          )}
        </button>
        <span className="text-xs2 text-muted">A guide, not a promise.</span>
      </div>

      <Accordion.Root type="single" collapsible className="mt-4 border-t border-line pt-2">
        <Accordion.Item value="more">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center gap-1 py-2 text-xs2 text-muted hover:text-ink">
              More details
              <ChevronDown size={16} className="transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-[none]">
            <div className="space-y-4 pb-3">
              <div>
                <p className="text-xs2 font-semibold">What this score means</p>
                <p className="text-xs2 text-muted">
                  0 to 100. Higher means more likely to leave. A guide, not a promise. Always
                  read it with the Low / Medium / High label.
                </p>
              </div>

              <div>
                <p className="text-xs2 font-semibold">How careful should I be?</p>
                <div className="mt-1 flex rounded-input border border-inputline p-0.5" role="radiogroup" aria-label="Mode">
                  {(
                    [
                      ['balanced', 'Balanced', 'Flags fewer clients, fewer false alarms.'],
                      ['catch_more', 'Catch more', 'Flags more clients, misses fewer leavers, more false alarms.'],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={mode === value}
                      title={hint}
                      onClick={() => onModeChange(value)}
                      className={`flex-1 rounded-[6px] px-2 py-1.5 text-xs2 transition-colors duration-150 ${
                        mode === value ? 'bg-accent font-semibold text-white' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs2 text-muted">
                  {mode === 'balanced'
                    ? 'Balanced: flags fewer clients, so fewer false alarms.'
                    : 'Catch more: flags more clients, so you miss fewer leavers, but with more false alarms.'}
                </p>
              </div>

              <div>
                <p className="text-xs2 font-semibold">
                  Expected loss
                  <InfoTip
                    label="Expected loss"
                    content={{
                      definition: 'Rough money we could lose = risk score x client value (demo units).',
                      example: 'Risk 50 on a client worth 1,000 gives about 500.',
                    }}
                  />
                </p>
                <p className="text-xs2 text-muted">
                  About <CountUp value={result.expected_loss} format="money" className="inline-block min-w-[5ch]" /> (demo money units)
                </p>
              </div>

              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 text-xs2 text-accent underline underline-offset-4"
              >
                <Copy size={16} aria-hidden />
                {copied ? 'Copied' : 'Copy summary'}
              </button>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
      </div>
    </section>
  )
}

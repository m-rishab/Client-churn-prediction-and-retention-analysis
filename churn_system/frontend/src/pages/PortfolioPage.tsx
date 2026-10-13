import { useMemo, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown, Rocket, Mail, Sprout, Eye } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, type SegmentTile } from '../lib/api'
import { BandPill } from '../components/ResultCard'
import { InfoTip } from '../components/InfoTip'
import { CountUp } from '../components/CountUp'
import { downloadCsv, friendlyAction } from '../lib/sample'

// Segment identity colours: always icon + text label, never colour alone.
// Text shades are darkened one step where axe-core found the pair below 4.5:1
// (rose on its tint); the strip keeps the brand shade.
const SEGMENT: Record<string, { fg: string; bg: string; icon: React.ReactNode }> = {
  'Save now': { fg: '#BE123C', bg: '#FFF1F2', icon: <Rocket size={16} aria-hidden /> },
  'Automated nudge': { fg: '#B45309', bg: '#FFFBEB', icon: <Mail size={16} aria-hidden /> },
  Nurture: { fg: '#0F766E', bg: '#F0FDFA', icon: <Sprout size={16} aria-hidden /> },
  Monitor: { fg: '#475569', bg: '#F1F5F9', icon: <Eye size={16} aria-hidden /> },
}
const segStyle = (name: string) => SEGMENT[name] ?? { fg: '#4F46E5', bg: '#EEF2FF', icon: <Rocket size={16} aria-hidden /> }

export function SegmentBadge({ segment }: { segment: string }) {
  const s = segStyle(segment)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs2 font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.icon}
      {segment}
    </span>
  )
}

export function PortfolioPage() {
  const { data } = useQuery({ queryKey: ['segments'], queryFn: api.segments })
  const tiles = data?.segments ?? []

  return (
    <div>
      <h1 className="text-xl2 font-semibold">Your clients at a glance.</h1>
      <p className="mt-1 text-base text-muted">Pick a group to see who to contact first.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {tiles.map((t, i) => (
          <Tile key={t.segment} tile={t} index={i} />
        ))}
      </div>

      <Tabs.Root defaultValue="call" className="mt-6">
        <Tabs.List className="mb-4 flex gap-4 border-b border-line">
          <Tabs.Trigger
            value="call"
            className="-mb-px border-b-2 border-transparent pb-2 text-base text-muted data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-ink"
          >
            Call first
          </Tabs.Trigger>
          <Tabs.Trigger
            value="past"
            className="-mb-px border-b-2 border-transparent pb-2 text-base text-muted data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-ink"
          >
            Past checks
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="call">
          <CallFirst />
        </Tabs.Content>
        <Tabs.Content value="past">
          <PastChecks />
        </Tabs.Content>
      </Tabs.Root>

      <Accordion.Root type="single" collapsible className="mt-6">
        <Accordion.Item value="curve">
          <Accordion.Header>
            <Accordion.Trigger className="group flex items-center gap-1 text-base font-medium">
              See how many clients to contact
              <ChevronDown size={16} className="transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <CapacityCurve />
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </div>
  )
}

function Tile({ tile, index }: { tile: SegmentTile; index: number }) {
  const s = segStyle(tile.segment)
  return (
    <div
      className="card-tint rise-in overflow-hidden rounded-card border border-line shadow-card transition-transform duration-150 hover:-translate-y-0.5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex" style={{ borderTop: `3px solid ${s.fg}` }}>
        <div className="flex-1 p-4">
          <p className="flex items-center gap-1.5 text-base font-medium">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: s.bg, color: s.fg }}>
              {s.icon}
            </span>
            {tile.segment}
            <InfoTip label={tile.segment} content={{ definition: tile.meaning }} />
          </p>
          <p className="mt-1 text-xs2 text-muted">{tile.meaning}</p>
          <p className="mt-2 text-xl2 font-semibold">
            <CountUp value={tile.clients} />
          </p>
          <p className="text-xs2 text-muted">
            <CountUp value={Math.round(tile.expected_loss)} format="money" /> at risk (demo units)
          </p>
        </div>
      </div>
    </div>
  )
}

function CallFirst() {
  const { data, isLoading } = useQuery({ queryKey: ['save-now'], queryFn: () => api.saveNow(50) })
  const items = useMemo(() => data?.items ?? [], [data])

  if (isLoading) return <p className="text-base text-muted">Loading. One moment.</p>

  return (
    <div>
      <p className="mb-3 text-xs2 text-muted">
        These clients have the most money at risk. Start at the top.
      </p>
      <div className="card-tint overflow-x-auto rounded-card border border-line shadow-card">
        <table className="w-full text-left text-xs2">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="p-2">Client</th>
              <th className="p-2">Score</th>
              <th className="p-2">Segment</th>
              <th className="p-2">Next action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.client_id} className="border-b border-line last:border-0">
                <td className="p-2">{c.client_id}</td>
                <td className="p-2">{c.risk_score != null ? Math.round(c.risk_score) : '-'}</td>
                <td className="p-2">
                  <SegmentBadge segment={c.segment} />
                </td>
                <td className="p-2">{friendlyAction(c.next_action)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() =>
          downloadCsv(
            'call-first.csv',
            ['Client,Score,Segment,Next action',
              ...items.map((c) => `${c.client_id},${c.risk_score},${c.segment},"${c.next_action}"`)].join('\\n'),
          )
        }
        className="mt-3 rounded-input border border-line px-3 py-1.5 text-xs2 hover:bg-accent-weak"
      >
        Download CSV
      </button>
    </div>
  )
}

interface PastItem {
  id: number
  created_at: string
  source: string
  client_id: string | null
  risk_band: string | null
  risk_score: number | null
  segment: string | null
}

function PastChecks() {
  const { data, isLoading } = useQuery({ queryKey: ['history'], queryFn: () => api.history(50) })
  const [band, setBand] = useState('')
  const items: PastItem[] = (data?.items ?? []).filter(
    (i) => i.source === 'single' || i.source === 'batch',
  )
  const shown = items.filter((i) => !band || i.risk_band === band)

  if (isLoading) return <p className="text-base text-muted">Loading. One moment.</p>

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {['', 'Low', 'Medium', 'High'].map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBand(b)}
            aria-pressed={band === b}
            className={`rounded-full border px-3 py-1 text-xs2 transition-colors duration-150 ${
              band === b ? 'border-accent bg-accent-weak font-semibold text-accent' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {b === '' ? 'All' : b}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-inputline bg-white/70 p-6 text-base text-muted">
          Nothing here yet. Save a check on the Check page first.
        </p>
      ) : (
        <div className="card-tint overflow-x-auto rounded-card border border-line shadow-card">
          <table className="w-full text-left text-xs2">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="p-2">When</th>
                <th className="p-2">Client</th>
                <th className="p-2">Score</th>
                <th className="p-2">Level</th>
                <th className="p-2">Segment</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="p-2">{i.created_at.slice(0, 16).replace('T', ' ')}</td>
                  <td className="p-2">{i.client_id ?? '-'}</td>
                  <td className="p-2">{i.risk_score != null ? Math.round(i.risk_score) : '-'}</td>
                  <td className="p-2">{i.risk_band && <BandPill band={i.risk_band} />}</td>
                  <td className="p-2">{i.segment && <SegmentBadge segment={i.segment} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CapacityCurve() {
  const { data, isLoading } = useQuery({ queryKey: ['capacity'], queryFn: api.capacityCurve })
  if (isLoading || !data) return <p className="py-4 text-base text-muted">Loading. One moment.</p>

  return (
    <div className="mt-3 rounded-card border border-line bg-skysoft/40 p-4 shadow-card">
      <p className="text-xs2 font-semibold">
        Money at risk covered, by calls made
        <InfoTip
          label="Capacity curve"
          content={{
            definition:
              'How much of the money at risk the first N calls cover. The first calls matter most.',
          }}
        />
      </p>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E0E7FF" strokeDasharray="3 3" />
            <XAxis dataKey="clients_contacted" tick={{ fontSize: 13 }} stroke="#5B5F7A" />
            <YAxis tick={{ fontSize: 13 }} stroke="#5B5F7A" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
            <RTooltip formatter={(v) => [`${Math.round(Number(v) * 100)}%`, 'Covered']} />
            <Area type="monotone" dataKey="covered_share" stroke="#4F46E5" strokeWidth={2} fill="url(#areaFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs2 text-muted">{data.caption}</p>
      <p className="mt-1 text-xs2 text-muted">{data.note}</p>
    </div>
  )
}

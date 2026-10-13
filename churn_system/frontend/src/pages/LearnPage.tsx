import { useMemo, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { InfoTip } from '../components/InfoTip'
import { CountUp } from '../components/CountUp'
import { project } from '../config/project'

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What does "client leaving" mean?',
    a: 'It means a client stops working with us. The tool looks at patterns from the past to guess how likely that is for one client.',
  },
  {
    q: 'What is a risk score?',
    a: 'A number from 0 to 100. Higher means the pattern looks more like clients who left before. It is a guide, not a promise.',
  },
  {
    q: 'Can I trust it?',
    a: 'It is right most of the time on practice data, but not always. Always read the Low / Medium / High label and the top reasons, then use your own judgement.',
  },
  {
    q: 'What does "practice data" mean?',
    a: 'The tool was built on made-up data, not real Highspring clients. Numbers show the tool works, not real results.',
  },
  {
    q: 'What should I do with a High score?',
    a: 'Follow the suggested next step on the result card. Usually: talk to the client soon and check the top reasons first.',
  },
  {
    q: 'How can churn prediction support customer retention?',
    a: 'It shows which clients are most likely to leave and why, so you can contact the right clients first, act on the top reasons, and check early whether your changes are working.',
  },
]

const TABS = [
  ['about', 'About this project'],
  ['terms', 'Terms'],
  ['faq', 'FAQ'],
  ['model', 'Model report'],
] as const

export function LearnPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab = raw && TABS.some(([v]) => v === raw) ? raw : 'about'

  const onTabChange = (v: string) => {
    const next = new URLSearchParams(params)
    if (v === 'about') next.delete('tab')
    else next.set('tab', v)
    setParams(next, { replace: true })
  }

  return (
    <div>
      <h1 className="text-xl2 font-semibold">Learn.</h1>
      <p className="mt-1 text-base text-muted">Short answers, in plain words.</p>

      <Tabs.Root value={tab} onValueChange={onTabChange} className="mt-4">
        <Tabs.List className="flex flex-wrap gap-x-4 border-b border-line">
          {TABS.map(([v, label]) => (
            <Tabs.Trigger
              key={v}
              value={v}
              className="-mb-px border-b-2 border-transparent pb-2 text-base text-muted data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-ink"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="about">
          <AboutProject />
        </Tabs.Content>
        <Tabs.Content value="terms">
          <Terms />
        </Tabs.Content>
        <Tabs.Content value="faq">
          <Faq />
        </Tabs.Content>
        <Tabs.Content value="model">
          <ModelReport />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

/* ---------------------------------------------------------- About —-- */

type OriginStatus = 'Built for Highspring' | 'Reusable' | 'Demo'

const REAL_ROWS: { what: string; status: OriginStatus; note: string }[] = [
  {
    what: 'The problem and the users',
    status: 'Built for Highspring',
    note: "Taken from Highspring's own client work.",
  },
  {
    what: 'The details we ask about (content quality, guidelines, activity, help requests, Search visibility)',
    status: 'Built for Highspring',
    note: 'Chosen because they matter in this work.',
  },
  {
    what: 'The four groups and next actions (Save now, Automated nudge, Nurture, Monitor)',
    status: 'Built for Highspring',
    note: 'Made for the Highspring team.',
  },
  {
    what: 'The scoring method and the checks',
    status: 'Reusable',
    note: 'Works the same way with real data.',
  },
  {
    what: 'Client rows and their values',
    status: 'Demo',
    note: 'Practice data. Not real Highspring clients.',
  },
  {
    what: 'Contract, service package, monthly payment',
    status: 'Demo',
    note: 'Borrowed from a telecom dataset. Real data will replace them.',
  },
  {
    what: 'Accuracy numbers',
    status: 'Demo',
    note: 'They show the tool works. They are not real Highspring results.',
  },
]

const CHANGES = [
  'Service package becomes the client\u2019s real service line.',
  'Contract length becomes the real type of engagement.',
  'A client type (advertiser, publisher or website owner) can be added.',
  'The practice details are replaced with real data from client records, content ratings and support systems.',
  'The model is trained again and checked on real history.',
  'A small pilot with a control group tests whether the suggested actions really help.',
]

function StatusPill({ status }: { status: OriginStatus }) {
  const cls =
    status === 'Built for Highspring'
      ? 'bg-accent-weak text-accent'
      : status === 'Reusable'
        ? 'bg-skysoft text-[#0369A1]'
        : 'bg-violetsoft text-[#6D28D9]'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs2 font-medium ${cls}`}>
      {status}
    </span>
  )
}

function DemoRealTable() {
  return (
    <div className="mt-2">
      <div className="hidden grid-cols-[1.4fr_1fr_1.2fr] gap-x-3 border-b border-line px-1 pb-2 text-xs2 font-semibold text-muted sm:grid">
        <span>What</span>
        <span>Status</span>
        <span>Note</span>
      </div>
      <ul className="divide-y divide-line">
        {REAL_ROWS.map((r) => (
          <li
            key={r.what}
            className="grid gap-y-1 px-1 py-2 sm:grid-cols-[1.4fr_1fr_1.2fr] sm:items-start sm:gap-x-3"
          >
            <span className="text-xs2 text-ink">{r.what}</span>
            <span className="text-xs2">
              <span className="mr-1 font-semibold text-muted sm:hidden">Status</span>
              <StatusPill status={r.status} />
            </span>
            <span className="text-xs2 text-muted">
              <span className="mr-1 font-semibold text-ink sm:hidden">Note</span>
              {r.note}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AboutProject() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl2 font-semibold">About this project</h2>

      <section className="rounded-card border border-line card-tint p-4 shadow-card">
        <h3 className="text-base font-semibold">Why this exists</h3>
        <p className="mt-1 text-xs2 text-ink">
          Highspring helps clients with their Google Search content strategy. Some clients slowly
          go quiet and then leave, often after a drop in Search visibility, a poor content
          rating, or a guideline problem that stays open. Today the team often finds out only
          after it happens. This tool helps spot the risk early.
        </p>
      </section>

      <section className="rounded-card border border-line card-tint p-4">
        <h3 className="text-base font-semibold">Who it is for</h3>
        <p className="mt-1 text-xs2 text-ink">
          The Content Strategy and Client Advisory team, and the Client Success team.
        </p>
      </section>

      <section className="rounded-card border border-line card-tint p-4">
        <h3 className="text-base font-semibold">What it does</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs2 text-ink">
          <li>Gives each client a risk score from 0 to 100.</li>
          <li>Shows the top reasons behind the score.</li>
          <li>Suggests what to do next, and who to call first.</li>
        </ul>
      </section>

      <section className="rounded-card border border-line card-tint p-4">
        <h3 className="text-base font-semibold">What is real and what is demo</h3>
        <DemoRealTable />
      </section>

      <Accordion.Root type="single" collapsible className="space-y-2">
        <Accordion.Item value="changes" className="rounded-card border border-line card-tint">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between p-4 text-base font-medium">
              What changes when real data arrives
              <ChevronDown size={16} className="transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="px-4 pb-4">
            <ul className="list-disc space-y-1 pl-5 text-xs2 text-ink">
              {CHANGES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>

      <p className="text-xs2 text-muted">
        Method checked on practice data. Ready to plug in real Highspring data.
      </p>

      {project.showCredit && <p className="text-xs2 text-muted">{project.credit}</p>}
    </div>
  )
}

function Terms() {
  const { data: glossary, isLoading } = useQuery({ queryKey: ['glossary'], queryFn: api.glossary })
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    if (!glossary) return []
    const all = Object.entries(glossary.fields).map(([, e]) => ({
      term: e.label,
      definition: e.definition,
      example: String(e.example ?? ''),
    }))
    for (const [name, e] of Object.entries(glossary.segments)) {
      all.push({ term: name, definition: e.definition, example: e.example })
    }
    const needle = q.trim().toLowerCase()
    return all.filter(
      (r) => !needle || r.term.toLowerCase().includes(needle) || r.definition.toLowerCase().includes(needle),
    )
  }, [glossary, q])

  if (isLoading) return <p className="text-base text-muted">Loading. One moment.</p>

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a word"
        aria-label="Search terms"
        className="mb-4 w-full max-w-[360px] rounded-input border border-line bg-surface px-3 py-2 text-base"
      />
      <dl className="space-y-4">
        {rows.map((r) => (
          <div key={r.term} className="rounded-card border border-line card-tint p-4">
            <dt className="text-base font-medium">{r.term}</dt>
            <dd className="mt-0.5 text-xs2 text-ink">{r.definition}</dd>
            {r.example && <dd className="mt-1 text-xs2 text-muted">Example: {r.example}</dd>}
          </div>
        ))}
        {rows.length === 0 && <p className="text-base text-muted">No match. Try another word.</p>}
      </dl>
    </div>
  )
}

function Faq() {
  return (
    <Accordion.Root type="single" collapsible className="space-y-2">
      {FAQ.map((f) => (
        <Accordion.Item key={f.q} value={f.q} className="rounded-card border border-line card-tint">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between p-4 text-base font-medium">
              {f.q}
              <ChevronDown size={16} className="transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="px-4 pb-4 text-xs2 text-muted">{f.a}</Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}

function MetricRow({
  name,
  tip,
  value,
  decimals = 0,
  format = 'decimal',
}: {
  name: string
  tip: string
  value: number
  decimals?: number
  format?: 'decimal' | 'percent'
}) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 last:border-0">
      <span className="flex items-center gap-1 text-base">
        {name}
        <InfoTip label={name} content={{ definition: tip }} />
      </span>
      <span className="text-base font-semibold">
        <CountUp value={value} decimals={decimals} format={format} />
      </span>
    </div>
  )
}

function ModelReport() {
  const { data: info, isLoading } = useQuery({ queryKey: ['model-info'], queryFn: api.modelInfo })

  if (isLoading || !info) return <p className="text-base text-muted">Loading. One moment.</p>
  const m = info.test_metrics
  const cm = m.confusion_matrix

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-accent-weak/40 p-4 shadow-card">
        <p className="text-base font-medium">How good is it? (on practice test data)</p>
        <div className="mt-2">
          <MetricRow name="ROC-AUC" tip="How well it tells leaving clients from staying ones. 0.5 is a coin flip, 1 is perfect." value={m.roc_auc} decimals={3} />
          <MetricRow name="PR-AUC" tip="How well it puts the clients most likely to leave at the top of the list. 1 is perfect." value={m.pr_auc} decimals={3} />
          <MetricRow name="Accuracy" tip="Of all clients, how often the tool called it right." value={m.accuracy} format="percent" />
          <MetricRow name="Precision" tip="When it says a client will leave, how often it is right." value={m.precision} format="percent" />
          <MetricRow name="Recall" tip="Of clients who really leave, how many it catches." value={m.recall} format="percent" />
          <MetricRow name="F1" tip="One score that balances precision and recall." value={m.f1} decimals={3} />
        </div>

        <div className="mt-4">
          <p className="text-xs2 font-semibold">Its calls, counted</p>
          <div className="mt-2 grid max-w-[360px] grid-cols-2 gap-2">
            {(
              [
                ['Caught leaving', cm.tp, '#15803D', '#F0FDF4'],
                ['Missed', cm.fn, '#B45309', '#FFFBEB'],
                ['False alarm', cm.fp, '#7C3AED', '#F5F3FF'],
                ['Rightly cleared', cm.tn, '#4F46E5', '#EEF2FF'],
              ] as const
            ).map(([label, v, fg, bg]) => (
              <div key={label} className="rounded-input p-2 text-center" style={{ background: bg }}>
                <p className="text-xl2 font-semibold" style={{ color: fg }}>
                  <CountUp value={v} />
                </p>
                <p className="text-xs2" style={{ color: fg }}>
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 text-xs2 text-muted">
          {`In one sentence: on the practice test, it caught ${cm.tp} of ${cm.tp + cm.fn} leavers, missed ${cm.fn}, raised ${cm.fp} false alarms, and rightly cleared ${cm.tn} steady clients.`}
        </p>
      </div>

      <Accordion.Root type="single" collapsible className="space-y-2">
        {[
          ['roc_curves.png', 'ROC curves: how well it separates leavers from stayers.'],
          ['confusion_matrices.png', 'Right and wrong calls, counted.'],
          ['calibration_curves.png', 'Do the scores match reality? Close is good.'],
          ['shap_summary_bar.png', 'Which details matter most across all clients.'],
        ].map(([file, caption]) => (
          <Accordion.Item key={file} value={file} className="rounded-card border border-line card-tint">
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full items-center justify-between p-4 text-base font-medium">
                {caption}
                <ChevronDown size={16} className="transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="px-4 pb-4">
              <img src={api.figureUrl(file)} alt={caption} className="max-w-full rounded-input" loading="lazy" />
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>

      <div className="rounded-card border border-line bg-violetsoft/40 p-4 shadow-card">
        <p className="text-base font-medium">Limitations</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs2 text-muted">
          <li>Built on made-up practice data, not real Highspring clients.</li>
          <li>One region and one industry only.</li>
          <li>Patterns change over time, so scores get stale.</li>
          <li>Risk is not the same as "will respond to our help".</li>
          <li>A small pilot with a control group is needed before rolling it out.</li>
        </ul>
      </div>
    </div>
  )
}
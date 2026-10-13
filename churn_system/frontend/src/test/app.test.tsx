import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { InfoTip } from '../components/InfoTip'
import { ResultCard } from '../components/ResultCard'
import { CheckPage } from '../pages/CheckPage'
import { PortfolioPage } from '../pages/PortfolioPage'
import { LearnPage } from '../pages/LearnPage'
import { SAMPLE_CLIENT } from '../lib/sample'
import type { PredictResult } from '../lib/api'

// ---------------------------------------------------------------- stubs ---
const MOCK_INFO = {
  model_version: 'test',
  quick_check_fields: ['Service_Type', 'Client_Tenure_Months', 'Days_Since_Last_Engagement'],
  features: [],
  test_metrics: { roc_auc: 0.9 },
  disclaimer: 'demo',
}

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      modelInfo: vi.fn(async () => ({
        ...MOCK_INFO,
        quick_check_fields: [
          'Service_Type',
          'Client_Tenure_Months',
          'Days_Since_Last_Engagement',
          'Critical_Compliance_Issues',
          'Report_Views',
          'Content_Score_Trend_30D',
        ],
        features: [],
        test_metrics: {
          roc_auc: 0.91, pr_auc: 0.78, accuracy: 0.84, precision: 0.68, recall: 0.8,
          f1: 0.73, threshold: 0.61, confusion_matrix: { tn: 671, fp: 106, fn: 55, tp: 225 },
        },
      })),
      glossary: vi.fn(async () => ({
        fields: Object.fromEntries(
          Object.entries({
            Client_Tenure_Months: { label: 'Months with us', definition: 'How many months this client has worked with us.', example: 18, input: 'number', range: [0, 72] },
            Service_Type: { label: 'Plan', definition: 'Which plan the client is on.', example: 'Fiber optic', input: 'segmented', range: ['DSL'], data_origin: 'telecom_base', options: [{ value: 'DSL', label: 'Standard (DSL)', definition: 'd', example: 'DSL' }, { value: 'Fiber optic', label: 'Premium (Fiber)', definition: 'd', example: 'F' }] },
            Support_Access: { label: 'Extra support', definition: 'Whether the client has a dedicated help package.', example: 'No', input: 'switch', range: ['No'], options: [{ value: 'Yes', label: 'Yes', definition: 'd', example: 'Y' }, { value: 'No', label: 'No', definition: 'd', example: 'N' }] },
            Engagement_Type: { label: 'Contract length', definition: 'How long their agreement runs.', example: 'Month-to-month', input: 'segmented', range: ['Month-to-month'], options: [{ value: 'Month-to-month', label: 'Month to month', definition: 'd', example: 'M' }] },
            Days_Since_Last_Engagement: { label: 'Days since last contact', definition: 'Days since they last replied, joined a call or opened a report.', example: 12, input: 'number', range: [-51, 102.2] },
            Critical_Compliance_Issues: { label: 'Serious guideline issues', definition: 'Serious problems still open.', example: 0, input: 'number', range: [-2.9, 4], data_origin: 'simulated' },
            Monthly_Client_Value: { label: 'Monthly payment', definition: 'How much they pay us each month.', example: 80, input: 'number', range: [0, 150], data_origin: 'telecom_base' },
            Cumulative_Client_Value: { label: 'Total paid so far', definition: 'How much they have paid us in total.', example: 800, input: 'number', range: [0, 5000], data_origin: 'telecom_base' },
            Report_Views: { label: 'Reports opened', definition: 'How many times they opened our reports recently.', example: 15, input: 'number', range: [-13.6, 40.3] },
            Content_Score_Trend_30D: { label: 'Content score change, last 30 days', definition: 'How much that score moved.', example: -4, input: 'number', range: [-25.9, 28.5] },
          }).map(([k, v]) => [k, { typical: v.example, ...v }]),
        ),
        segments: {},
        risk_bands: {},
        modes: {},
        metrics: {},
        misc: {},
        ui: {},
      })),
      predict: vi.fn(async () => RESULT),
      brief: vi.fn(async () => BRIEF),
      segments: vi.fn(async () => ({ segments: [] })),
      history: vi.fn(async () => ({ count: 0, items: [] })),
      saveNow: vi.fn(async () => ({ count: 0, items: [] })),
      capacityCurve: vi.fn(async () => ({ points: [], caption: '', note: '' })),
    },
  }
})

const RESULT: PredictResult = {
  client_id: 'This check',
  risk_score: 84,
  risk_band: 'High',
  segment: 'Save now',
  segment_meaning: 'Likely to leave and important to us. Talk to them personally within 7 days.',
  recommended_action: 'Save now - senior advisor call within 7 days',
  top_3_reasons: [
    { label: 'Days since last contact', raw_reason: 'd', direction: 'up', detail: 'raised', tooltip: 'pattern only' },
  ],
  expected_loss: 1234,
  mode_used: 'balanced',
  model_version: 'test',
}

const BRIEF = {
  summary: 'This client scores 84 out of 100, so the risk is high.',
  next_steps: ['Call this client within 7 days.', 'Review the content.', 'Check again next week.'],
  source: 'template' as const,
  model: null,
  cached: false,
  notice: 'No AI key is set, so this brief was written by the built-in template, not by an AI model.',
  risk_score: 84,
  risk_band: 'High' as const,
  segment: 'Save now',
  mode_used: 'balanced' as const,
  model_version: 'test',
  disclaimer: 'Draft only.',
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

// --------------------------------------------------------------- tests ---

describe('InfoTip (tooltips)', () => {
  it('shows the glossary text when opened', async () => {
    render(
      <InfoTip
        label="Months with us"
        content={{ definition: 'How many months this client has worked with us.', example: 18 }}
      />,
    )
    const btn = screen.getByRole('button', { name: 'About Months with us' })
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByText(/What it means/)).toBeTruthy())
    expect(screen.getByText('How many months this client has worked with us.')).toBeTruthy()
  })

  it('every rendered field carries an info icon', async () => {
    renderWithProviders(<CheckPage />)
    await waitFor(() => expect(screen.getAllByLabelText(/^About /).length).toBeGreaterThan(5))
  })
})

describe('Result card', () => {
  it('shows segment meaning, next action and band sentence', () => {
    renderWithProviders(
      <ResultCard
        result={RESULT}
        mode="balanced"
        onModeChange={() => {}}
        onSave={() => {}}
        saved={false}
        baseline={null}
        onResetBaseline={() => {}}
      />,
    )
    expect(screen.getByText(/Talk to them personally within 7 days/)).toBeTruthy()
    expect(screen.getByText('Save now - senior advisor call within 7 days')).toBeTruthy()
    expect(screen.getByText('This client may be about to leave. High risk.')).toBeTruthy()
  })
})

describe('Retention brief', () => {
  it('writes a brief on demand and shows the steps', async () => {
    const { api } = await import('../lib/api')
    renderWithProviders(
      <ResultCard
        result={RESULT}
        mode="balanced"
        onModeChange={() => {}}
        onSave={() => {}}
        saved={false}
        baseline={null}
        onResetBaseline={() => {}}
        client={{ Client_Tenure_Months: 5 }}
      />,
    )
    // no brief until asked for
    expect(screen.queryByText(/scores 84 out of 100/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Write a retention brief' }))
    await waitFor(() => expect(screen.getByText(/scores 84 out of 100/)).toBeTruthy())
    expect(screen.getByText('Call this client within 7 days.')).toBeTruthy()
    expect(screen.getByText('template')).toBeTruthy()
    expect(api.brief).toHaveBeenCalledWith({ Client_Tenure_Months: 5 }, 'balanced')
  })
})

describe('Demo data pill and footer on every page', () => {
  const pages = [
    ['/', <CheckPage key="c" />],
    ['/portfolio', <PortfolioPage key="p" />],
    ['/learn', <LearnPage key="l" />],
  ] as const

  for (const [path, page] of pages) {
    it(`appears on ${path}`, async () => {
      renderWithProviders(<Layout>{page}</Layout>)
      expect(screen.getAllByText('Demo data').length).toBeGreaterThan(0)
      expect(
        screen.getByText(/Demo data\. Built for Highspring's Content Strategy and Client Advisory team\./),
      ).toBeTruthy()
    })
  }
})

describe('Demo pill and data_origin notes', () => {
  it('shows the demo pill on exactly the 4 tagged fields', async () => {
    renderWithProviders(<CheckPage />)
    await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0))
    // quick check: the Plan field carries the pill right away
    expect(screen.getAllByRole('button', { name: 'About this demo value' }).length).toBe(1)
    // the other 3 live in the About the account accordion
    fireEvent.click(screen.getByText('Add more details'))
    fireEvent.click(screen.getByRole('button', { name: 'About the account' }))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'About this demo value' }).length).toBe(4),
    )
  })

  it('shows the telecom demo note in a field tooltip', async () => {
    renderWithProviders(<CheckPage />)
    await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'About Plan' })[0])
    await waitFor(() =>
      expect(
        screen.getByText(
          'Demo value: this comes from a telecom practice dataset. Real Highspring data will replace it.',
        ),
      ).toBeTruthy(),
    )
  })

  it('shows the simulated demo note in a field tooltip', async () => {
    renderWithProviders(<CheckPage />)
    await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'About Serious guideline issues' })[0],
    )
    await waitFor(() =>
      expect(
        screen.getByText('Demo value: this is simulated practice data.'),
      ).toBeTruthy(),
    )
  })
})

describe('Learn page - About this project', () => {
  it('shows the real-vs-demo table with its 7 rows and statuses', async () => {
    renderWithProviders(<LearnPage />)
    await waitFor(() =>
      expect(screen.getByText('What is real and what is demo')).toBeTruthy(),
    )
    expect(screen.getAllByText('Built for Highspring').length).toBe(3)
    expect(screen.getAllByText('Reusable').length).toBe(1)
    expect(screen.getAllByText('Demo').length).toBe(3)
    expect(
      screen.getByText('Method checked on practice data. Ready to plug in real Highspring data.'),
    ).toBeTruthy()
    expect(
      screen.getByText('Academic project by Nishita Chauhan, BITS Pilani WILP.'),
    ).toBeTruthy()
  })

  it('the footer link points to the About tab', async () => {
    renderWithProviders(
      <Layout>
        <CheckPage />
      </Layout>,
    )
    const link = screen.getByRole('link', { name: 'About this project' })
    expect(link.getAttribute('href')).toBe('/learn?tab=about')
  })
})

describe('Live preview gate', () => {
  it('does not call predict before 3 quick fields are filled', async () => {
    const { api } = await import('../lib/api')
    renderWithProviders(<CheckPage />)
    await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0))
    // fill only 2 quick fields
    fireEvent.click(screen.getAllByRole('radio', { name: 'Premium (Fiber)' })[0])
    const tenure = screen.getAllByLabelText(/Months with us/)[0] as HTMLInputElement
    fireEvent.change(tenure, { target: { value: '10' } })
    await new Promise((r) => setTimeout(r, 700))
    expect(api.predict).not.toHaveBeenCalled()
    expect(screen.getByText(/Fill in a few details to see the risk here/)).toBeTruthy()

    // third field -> gate opens, predict fires
    const days = screen.getAllByLabelText(/Days since last contact/)[0] as HTMLInputElement
    fireEvent.change(days, { target: { value: '20' } })
    await waitFor(() => expect(api.predict).toHaveBeenCalled(), { timeout: 2000 })
  })
})

describe('Sample client loads and fills the form', () => {
  it('fills quick fields from the sample', async () => {
    renderWithProviders(<CheckPage />)
    await waitFor(() => screen.getByText('Load a sample client'))
    fireEvent.click(screen.getByText('Load a sample client'))
    await waitFor(() => {
      const tenure = screen.getAllByLabelText(/Months with us/)[0] as HTMLInputElement
      expect(tenure.value).toBe(String(SAMPLE_CLIENT.Client_Tenure_Months))
    })
  })
})

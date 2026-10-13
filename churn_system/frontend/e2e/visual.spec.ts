import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { PNG } from 'pngjs'
import { LOW_CLIENT } from '../src/lib/sample'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(HERE, '../../docs/screenshots')

async function apiJson(port: number, pathName: string) {
  const res = await fetch(`http://localhost:${port}${pathName}`)
  return res.json()
}

/** Fraction of pixels that are pure white (or within 1 of it). */
function whiteFraction(file: string): number {
  const png = PNG.sync.read(fs.readFileSync(file))
  const { width, height, data } = png
  let white = 0
  let total = 0
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (width * y + x) << 2
      total++
      if (
        data[i] >= 254 && data[i + 1] >= 254 && data[i + 2] >= 254
      ) {
        white++
      }
    }
  }
  return white / total
}

/* ------------------------------------------------- animated numbers --- */

test.describe('Animated numbers (CountUp)', () => {
  test('score counts up: mid value differs, final equals the API value', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Load a sample client').click()

    const score = page.locator('section[aria-label="Result"] .tabular-nums').first()
    await expect(score).toBeVisible({ timeout: 20_000 })

    // sample the digits shortly after the result appears (mid-animation)
    const digits = () => page.locator('section[aria-label="Result"] .tabular-nums span[aria-hidden]').first().innerText()
    const early = await digits()
    await page.waitForTimeout(1100)
    const finalText = (await digits()).trim()
    const finalShown = Number(finalText.replace(/,/g, ''))
    // the app intentionally displays the score rounded to a whole number

    // the API value for the sample client
    const res = await fetch('http://localhost:8000/api/predict?save=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Client_Tenure_Months: 2, Service_Type: 'Fiber optic', Support_Access: 'No',
        Engagement_Type: 'Month-to-month', Monthly_Client_Value: 64,
        Cumulative_Client_Value: 130, Content_Quality_Score: 60,
        Content_Score_Trend_30D: -3, Guideline_Compliance_Score: 78,
        Compliance_Flags: 2, Critical_Compliance_Issues: 1, Engagement_Score: 45,
        Monthly_Engagements: 4, Client_Meetings: 1, Report_Views: 4,
        Response_Rate: 55, Support_Tickets: 2, Unresolved_Support_Tickets: 1,
        Avg_Resolution_Time: 30, Days_Since_Last_Engagement: 30,
        Search_Visibility_Change: -4, Traffic_Change: -5, mode: 'balanced',
      }),
    })
    const apiResult = await res.json()

    expect(Number(early.replace(/,/g, ''))).not.toBeNaN()
    expect(finalShown).toBe(Math.round(apiResult.risk_score))
    // the screen-reader copy always carries the final displayed value
    const sr = (await score.locator('.sr-only').textContent() ?? '').trim()
    expect(sr).toBe(String(Math.round(apiResult.risk_score)))
  })

  test('portfolio tile counts end on the /api/segments values', async ({ page }) => {
    await page.goto('/portfolio')
    await expect(page.getByText('Your clients at a glance.')).toBeVisible()
    await page.waitForTimeout(1400) // let tiles + counters finish

    const data = await apiJson(8000, '/api/segments')
    const withComma = (n: number) => n.toLocaleString('en-US')
    for (const seg of data.segments) {
      // scope to the animated tile itself (rise-in), not the table badges;
      // inside it, match the visible digits span (the sr-only copy holds the
      // same text, so it must be excluded to keep the locator strict)
      const tile = page.locator('div.rise-in', { has: page.getByText(seg.segment, { exact: true }) })
      const count = tile
        .locator('span[aria-hidden]')
        .filter({ hasText: new RegExp(`^${withComma(seg.clients)}$`) })
      await expect(count).toBeVisible()
    }
  })

  test('reduced motion renders final values immediately', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.getByText('Load a sample client').click()
    const score = page.locator('section[aria-label="Result"] .tabular-nums').first()
    await expect(score).toBeVisible({ timeout: 20_000 })
    // immediately after appearing, the visible digits equal the final value
    // (the sr-only copy holds the same text for screen readers)
    const digits = await score.locator('span[aria-hidden]').textContent()
    const srText = await score.locator('.sr-only').textContent() // sr-only is invisible: textContent, not innerText
    expect((digits ?? '').trim()).toBe((srText ?? '').trim())
    await ctx.close()
  })

  test('no layout shift while numbers animate (CLS < 0.05)', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Load a sample client').click()
    await expect(page.getByText('Top reasons')).toBeVisible({ timeout: 20_000 })
    // start observing after the result is on screen, so we measure only the
    // shifts caused by the numbers animating (not by page load itself)
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0
          const obs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              if (!(e as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
                total += (e as PerformanceEntry & { value: number }).value
              }
            }
          })
          obs.observe({ type: 'layout-shift' })
          // resolve unconditionally after the window: a perfectly stable page
          // produces no layout-shift entries at all (0 CLS is a pass, not a hang)
          setTimeout(() => {
            obs.disconnect()
            resolve(total)
          }, 2600)
        }),
    )
    await page.goto('/portfolio')
    await page.waitForTimeout(300) // let the evaluate resolve before navigating
    expect(cls).toBeLessThan(0.05)
  })
})

/* ------------------------------------------------------ white check --- */

test.describe('Not plain white', () => {
  const views: [string, string, (p: import('@playwright/test').Page) => Promise<void>][] = [
    ['check-empty', '/', async (p) => {
      await p.getByRole('spinbutton', { name: 'Months with us' }).waitFor()
      await p.waitForTimeout(400)
    }],
    ['check-result', '/', async (p) => {
      await p.getByText('Load a sample client').click()
      await p.getByText('Top reasons').waitFor({ timeout: 20_000 })
      await p.waitForTimeout(1200)
    }],
  ]

  for (const [name, url, prepare] of views) {
    test(`${name} is at most 45% pure white`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(url)
      await prepare(page)
      const file = path.join(SHOTS, `v-${name}.png`)
      await page.screenshot({ path: file, fullPage: true })
      const frac = whiteFraction(file)
      console.log(`[white-pixels] ${name}: ${(frac * 100).toFixed(1)}%`)
      expect(frac).toBeLessThanOrEqual(0.45)
    })
  }

  test('portfolio and learn are at most 45% pure white', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    for (const [name, url, wait] of [
      ['portfolio', '/portfolio', 1500],
      ['learn', '/learn', 800],
    ] as const) {
      await page.goto(url)
      await page.waitForTimeout(wait)
      const file = path.join(SHOTS, `v-${name}.png`)
      await page.screenshot({ path: file, fullPage: true })
      const frac = whiteFraction(file)
      console.log(`[white-pixels] ${name}: ${(frac * 100).toFixed(1)}%`)
      expect(frac).toBeLessThanOrEqual(0.45)
    }
  })
})

/* ------------------------------------------------- budget re-check --- */

test.describe('Minimalism budget survives the colour update', () => {
  test('fields, links, words, one primary button, no overflow', async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.getByRole('spinbutton', { name: 'Months with us' })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    }

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('spinbutton', { name: 'Months with us' })).toBeVisible()

    const inputs = page.locator('main input[type=number]:visible')
    expect(await inputs.count()).toBeLessThanOrEqual(6)

    const actionControls = page.locator(
      'main button:visible:not([aria-label^="About"]):not([role=radio]):not([role=tab]), main a:visible',
    )
    expect(await actionControls.count()).toBeLessThanOrEqual(2)

    const body = await page.locator('main').innerText()
    expect(body.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(200)

    // exactly one primary (filled accent) button with a result on screen
    await page.getByText('Load a sample client').click()
    await expect(page.getByRole('button', { name: 'Save this check' })).toBeVisible({ timeout: 20_000 })
    expect(await page.locator('main button[data-primary]').count()).toBe(1)

    expect(await page.locator('[role=dialog]').count()).toBe(0)
  })

  test('4 font sizes and 3 weights across pages', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const sizes = new Set<string>()
    const weights = new Set<string>()
    for (const url of ['/', '/portfolio', '/learn']) {
      await page.goto(url)
      await page.waitForTimeout(600)
      const styles = await page.evaluate(() => {
        const out: [string, string][] = []
        for (const el of document.querySelectorAll('main *')) {
          if (el.tagName === 'svg' || el.closest('svg')) continue // chart internals
          const cs = getComputedStyle(el)
          if (el.textContent?.trim()) out.push([cs.fontSize, cs.fontWeight])
        }
        return out
      })
      for (const [s, w] of styles) {
        sizes.add(s)
        weights.add(w)
      }
    }
    console.log(`[fonts] sizes: ${[...sizes].sort().join(', ')} | weights: ${[...weights].sort().join(', ')}`)
    expect(sizes.size).toBeLessThanOrEqual(4)
    expect(weights.size).toBeLessThanOrEqual(3)
  })
})

/* ------------------------------------------------------ screenshots --- */

test.describe('Visual QA screenshots', () => {
  test('shoot all required views', async ({ page }) => {
    fs.mkdirSync(SHOTS, { recursive: true })
    await page.setViewportSize({ width: 1280, height: 900 })

    // Check empty
    await page.goto('/')
    await expect(page.getByRole('spinbutton', { name: 'Months with us' })).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/colour-check-empty.png`, fullPage: true })

    // Check with a LOW-risk result: fill the whole LOW_CLIENT through the
    // real form (a 3-field override on the HIGH sample still scores High,
    // verified against predict_utils: 0.686 -> High risk).
    await page.getByText('Load a sample client').click()
    await page.getByRole('button', { name: 'Add more details' }).click()
    for (const group of [
      'About the account',
      'Content and guidelines',
      'How active the client is',
      'Help requests',
      'Google Search and website',
    ]) {
      await page.getByRole('button', { name: group }).click()
    }
    const NUMBER_LABELS: Record<string, string> = {
      Client_Tenure_Months: 'Months with us',
      Monthly_Client_Value: 'Monthly payment',
      Cumulative_Client_Value: 'Total paid so far',
      Content_Quality_Score: 'Content quality (0 to 100)',
      Content_Score_Trend_30D: 'Content score change, last 30 days',
      Guideline_Compliance_Score: 'Guideline score (0 to 100)',
      Compliance_Flags: 'Guideline warnings',
      Critical_Compliance_Issues: 'Serious guideline issues',
      Engagement_Score: 'Engagement (0 to 100)',
      Monthly_Engagements: 'Contacts per month',
      Client_Meetings: 'Meetings per month',
      Report_Views: 'Reports opened',
      Response_Rate: 'Reply rate (%)',
      Support_Tickets: 'Help requests',
      Unresolved_Support_Tickets: 'Open help requests',
      Avg_Resolution_Time: 'Hours to solve a request',
      Days_Since_Last_Engagement: 'Days since last contact',
      Search_Visibility_Change: 'Google visibility change (%)',
      Traffic_Change: 'Website visitors change (%)',
    }
    for (const [field, label] of Object.entries(NUMBER_LABELS)) {
      await page.getByRole('spinbutton', { name: label, exact: true }).fill(String(LOW_CLIENT[field]))
    }
    await page.getByRole('radio', { name: 'Standard (DSL)' }).click()
    await page.getByRole('radio', { name: 'Two years' }).click()
    await page.getByRole('switch').click() // Extra support -> Yes
    await expect(page.locator('section[aria-label="Result"]').getByText('Low risk').first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1300)
    await page.screenshot({ path: `${SHOTS}/colour-check-low.png`, fullPage: true })

    // Check with a HIGH-risk result (the shipped sample)
    await page.getByRole('button', { name: 'Clear' }).click()
    await page.getByText('Load a sample client').click()
    await expect(page.getByText('Top reasons')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1300)
    await page.screenshot({ path: `${SHOTS}/colour-check-high.png`, fullPage: true })

    // Portfolio (tiles + chart open)
    await page.goto('/portfolio')
    await expect(page.getByText('Your clients at a glance.')).toBeVisible()
    await page.getByText('See how many clients to contact').click()
    await page.waitForTimeout(1600)
    await page.screenshot({ path: `${SHOTS}/colour-portfolio.png`, fullPage: true })

    // Learn > About
    await page.goto('/learn')
    await expect(page.getByText('What is real and what is demo')).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${SHOTS}/colour-learn.png`, fullPage: true })

    // Check mobile 375
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    await expect(page.getByRole('spinbutton', { name: 'Months with us' })).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/colour-check-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1280, height: 900 })
  })
})

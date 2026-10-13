import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(HERE, '../../docs/screenshots')

/* ------------------------------------------------------------- budget -- */

test.describe('Minimalism budget (section 8)', () => {
  test('Check page default state', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('spinbutton', { name: 'Months with us' })).toBeVisible()

    // at most 6 input fields visible (number inputs + sliders excluded:
    // sliders are decorative mirrors with aria-hidden)
    const inputs = page.locator('main input[type=number]:visible')
    expect(await inputs.count()).toBeLessThanOrEqual(6)

    // at most 2 action buttons/links besides nav, info icons, tabs, radios
    const actionControls = page.locator(
      'main button:visible:not([aria-label^="About"]):not([role=radio]):not([role=tab]), main a:visible',
    )
    expect(await actionControls.count()).toBeLessThanOrEqual(2)

    // at most 200 visible words
    const body = await page.locator('main').innerText()
    expect(body.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(200)

    // no modal on first load
    expect(await page.locator('[role=dialog]').count()).toBe(0)
  })

  test('intro is at most 60 words', async ({ page }) => {
    await page.goto('/')
    const intro = await page.locator('main h1').locator('..').innerText()
    expect(intro.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(60)
  })

  test('no horizontal scroll at 375 / 768 / 1280 px', async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.getByRole('spinbutton', { name: 'Months with us' })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    }
  })

  test('exactly one primary button visible with a result on screen', async ({ page }) => {
    await page.goto('/')
    expect(await page.locator('main button[class*="bg-accent"]:not([class*="bg-accent-weak"])').count()).toBe(0)
    await page.getByText('Load a sample client').click()
    await expect(page.getByRole('button', { name: 'Save this check' })).toBeVisible({ timeout: 20_000 })
    // the save button is the only filled accent button on the page
    expect(await page.locator('main button[class*="bg-accent"]:not([class*="bg-accent-weak"])').count()).toBe(1)
  })
})

/* ---------------------------------------------------------------- e2e -- */

test.describe('Check flow', () => {
  test('sample -> result -> edit -> chip -> save -> history', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Load a sample client').click()

    const result = page.locator('section[aria-label="Result"]')
    await expect(result.getByText('Top reasons')).toBeVisible({ timeout: 20_000 })

    // change a value -> Before / Now chip appears (tenure 2 -> 36 moves the score)
    await page.getByRole('spinbutton', { name: 'Months with us' }).fill('36')
    await expect(result.getByText(/Before \d+ → Now \d+/)).toBeVisible({ timeout: 20_000 })

    // save this check
    await page.getByRole('button', { name: 'Save this check' }).click()
    await expect(page.getByRole('button', { name: /Saved/ })).toBeVisible()

    // shows in Portfolio > Past checks
    await page.goto('/portfolio')
    await page.getByRole('tab', { name: 'Past checks' }).click()
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20_000 })
  })

  test('tooltip opens on click and shows glossary text', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'About Months with us' }).first().click()
    await expect(page.getByText('How many months this client has worked with us.')).toBeVisible()
  })
})

test.describe('Many clients (batch)', () => {
  test('good and bad file', async ({ page }) => {
    const good = 'Client_ID,Months with us,Plan,Contract length,Monthly payment\nG-1,10,Premium (Fiber),Month to month,80\n'
    const bad = 'Client_ID,Months with us\nB-1,9999\n'
    fs.writeFileSync('/tmp/good.csv', good)
    fs.writeFileSync('/tmp/bad.csv', bad)

    await page.goto('/')
    await page.getByRole('tab', { name: 'Many clients' }).click()
    await expect(page.getByText('Drop a CSV file here')).toBeVisible()

    // bad file -> friendly error
    await page.setInputFiles('input[type=file]', '/tmp/bad.csv')
    await expect(page.getByText(/need a fix/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Row 2:/)).toBeVisible()

    // good file -> table with results
    await page.setInputFiles('input[type=file]', '/tmp/good.csv')
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Download results')).toBeVisible()
  })
})

/* -------------------------------------------------------- screenshots -- */

test.describe('Design QA screenshots', () => {
  test('shoot all required views', async ({ page }) => {
    fs.mkdirSync(SHOTS, { recursive: true })

    // Check empty
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('spinbutton', { name: 'Months with us' })).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/check-empty.png`, fullPage: true })

    // Check filled with result
    await page.getByText('Load a sample client').click()
    await expect(page.getByText('Top reasons')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/check-result.png`, fullPage: true })

    // Tooltip open on desktop
    await page.getByRole('button', { name: 'About Months with us' }).first().click()
    await expect(page.getByText('How many months this client has worked with us.')).toBeVisible()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${SHOTS}/check-tooltip.png` })

    // Check mobile 375 with tooltip
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    await page.getByRole('button', { name: 'About Months with us' }).first().click()
    await expect(page.getByText('How many months this client has worked with us.')).toBeVisible()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${SHOTS}/check-mobile-tooltip.png` })
    await page.setViewportSize({ width: 1280, height: 900 })

    // Many clients
    await page.getByRole('tab', { name: 'Many clients' }).click()
    await expect(page.getByText('Drop a CSV file here')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/many-clients.png` })

    // Portfolio
    await page.goto('/portfolio')
    await expect(page.getByText('Your clients at a glance.')).toBeVisible()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${SHOTS}/portfolio.png`, fullPage: true })

    // Learn (About this project is the default tab)
    await page.goto('/learn')
    await expect(page.getByText('Short answers, in plain words.')).toBeVisible()
    await expect(page.getByText('What is real and what is demo')).toBeVisible()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${SHOTS}/learn.png`, fullPage: true })

    // Learn > About, mobile
    await page.setViewportSize({ width: 375, height: 800 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/learn-about-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/learn-about-desktop.png`, fullPage: true })

    // Check: demo pills on the 4 tagged fields (Plan is on quick check)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'About this demo value' })).toBeVisible()
    await page.getByRole('button', { name: 'About this demo value' }).first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/check-demo-pills.png` })

    // Tooltip with the telecom demo line (Plan tooltip)
    await page.getByRole('button', { name: 'About Plan' }).first().click()
    await expect(page.getByText(/Demo value: this comes from .* practice dataset/)).toBeVisible()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${SHOTS}/check-tooltip-demo-line.png` })
  })
})

// Axe-core audit of all three pages (desktop + mobile) with the new colours.
import { chromium } from 'playwright-core'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

const browser = await chromium.launch()

async function audit(url, width, height) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(url)
  await page.waitForTimeout(1200)
  await page.addScriptTag({ content: axeSource })
  const results = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }))
  await page.close()
  return results
}

let totals = { critical: 0, serious: 0, moderate: 0, minor: 0 }
for (const [name, url, w, h] of [
  ['check', 'http://localhost:4173/', 1280, 900],
  ['check-mobile', 'http://localhost:4173/', 375, 800],
  ['portfolio', 'http://localhost:4173/portfolio', 1280, 900],
  ['portfolio-mobile', 'http://localhost:4173/portfolio', 375, 800],
  ['learn', 'http://localhost:4173/learn', 1280, 900],
  ['learn-mobile', 'http://localhost:4173/learn', 375, 800],
]) {
  const r = await audit(url, w, h)
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const v of r.violations) counts[v.impact === null ? 'minor' : v.impact] += v.nodes.length
  for (const k of Object.keys(totals)) totals[k] += counts[k]
  const list = r.violations.map((v) => `${v.id}(${v.impact})x${v.nodes.length}`).join(', ') || 'none'
  console.log(`[axe] ${name}: ${JSON.stringify(counts)} | ${list}`)
}
console.log(`[axe] TOTALS: ${JSON.stringify(totals)}`)
await browser.close()

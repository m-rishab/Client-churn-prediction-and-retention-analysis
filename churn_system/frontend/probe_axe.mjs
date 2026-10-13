// axe-core accessibility audit on all three pages (desktop + mobile widths).
import { chromium } from 'playwright-core'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import * as path from 'path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const axeSource = readFileSync(
  path.join(HERE, 'node_modules/axe-core/axe.min.js'),
  'utf8',
)

const browser = await chromium.launch()
const page = await browser.newPage()
const totals = {}

async function axeRun(name, url, width, height) {
  await page.setViewportSize({ width, height })
  await page.goto(url)
  await page.waitForTimeout(pathIncludesWait(url))
  await page.addScriptTag({ content: axeSource })
  const results = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  }))
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  const all = results.violations
  totals[`${name}@${width}`] = {
    critical: all.filter((v) => v.impact === 'critical').length,
    serious: all.filter((v) => v.impact === 'serious').length,
    moderate: all.filter((v) => v.impact === 'moderate').length,
    minor: all.filter((v) => v.impact === 'minor').length,
  }
  for (const v of all) {
    console.log(`  [${name}@${width}] ${v.impact.toUpperCase()}: ${v.id} - ${v.help} (${v.nodes.length} nodes)`)
    if (['serious', 'critical'].includes(v.impact)) {
      for (const n of v.nodes.slice(0, 2)) {
        console.log(`     -> ${n.html.slice(0, 120)}`)
        console.log(`     fix: ${v.recommendation ?? (n.failureSummary || '').split('\n')[0]}`)
      }
    }
  }
}

function pathIncludesWait() {
  return 1200 // let queries settle
}

for (const [name, path] of [['check', '/'], ['portfolio', '/portfolio'], ['learn', '/learn']]) {
  await axeRun(name, `http://localhost:4173${path}`, 1280, 900)
  await axeRun(name, `http://localhost:4173${path}`, 375, 800)
}

console.log('\n=== SUMMARY (critical/serious must be 0) ===')
let ok = true
for (const [k, v] of Object.entries(totals)) {
  const bad = v.critical + v.serious
  if (bad > 0) ok = false
  console.log(`${k}: critical=${v.critical} serious=${v.serious} moderate=${v.moderate} minor=${v.minor}`)
}
console.log(ok ? 'RESULT: PASS - no serious or critical violations' : 'RESULT: FAIL')
await browser.close()

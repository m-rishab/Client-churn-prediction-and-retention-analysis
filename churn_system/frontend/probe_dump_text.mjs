// Dump rendered page text (all pages + filled state) to JSON for readability.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'fs'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import * as path from 'path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const glossary = JSON.parse(
  readFileSync(path.join(HERE, '../backend/app/glossary.json'), 'utf8'),
)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const out = {}

await page.goto('http://localhost:4173/')
await page.waitForSelector('text=Months with us')
await page.waitForTimeout(400)
out['check (empty)'] = await page.locator('body').innerText()

await page.getByText('Load a sample client').click()
await page.waitForSelector('text=Top reasons', { timeout: 20000 })
await page.waitForTimeout(400)
out['check (result)'] = await page.locator('body').innerText()

await page.goto('http://localhost:4173/portfolio')
await page.waitForTimeout(1200)
out['portfolio'] = await page.locator('body').innerText()

await page.goto('http://localhost:4173/learn')
await page.waitForTimeout(1200)
out['learn'] = await page.locator('body').innerText()

// tooltip texts (closed by default, so add them from the glossary)
const tips = []
for (const f of Object.values(glossary.fields)) {
  tips.push(f.definition)
  if (f.direction_hint) tips.push(f.direction_hint)
}
for (const s of Object.values(glossary.segments)) tips.push(s.definition)
for (const b of Object.values(glossary.risk_bands)) tips.push(b.definition)
for (const m of Object.values(glossary.metrics)) tips.push(m.definition)
out['tooltips'] = tips.join(' ')

writeFileSync('/tmp/page_text.json', JSON.stringify(out, null, 2))
console.log('dumped:', Object.keys(out).join(', '))
await browser.close()

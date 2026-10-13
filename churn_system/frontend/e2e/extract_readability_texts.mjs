// Extracts the rendered body text of every page for the readability check.
// Node must resolve playwright-core, so run this from churn_system/frontend.
//   node e2e/extract_readability_texts.mjs [baseUrl]
// Writes /tmp/readability_texts.json consumed by:
//   python churn_system/scripts/check_readability.py --texts /tmp/readability_texts.json
import { chromium } from 'playwright-core'
import { writeFileSync } from 'fs'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const out = {}
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

await page.goto(BASE + '/')
await page.waitForSelector('text=Months with us')
await page.waitForTimeout(500)
out['check (empty)'] = await page.locator('body').innerText()

await page.getByText('Load a sample client').click()
await page.waitForSelector('text=Top reasons', { timeout: 30000 })
await page.waitForTimeout(500)
out['check (result)'] = await page.locator('body').innerText()

await page.goto(BASE + '/portfolio')
await page.waitForTimeout(1500)
out['portfolio'] = await page.locator('body').innerText()

await page.goto(BASE + '/learn')
await page.waitForTimeout(1500)
out['learn'] = await page.locator('body').innerText()

await browser.close()
writeFileSync('/tmp/readability_texts.json', JSON.stringify(out, null, 2))
console.log('wrote /tmp/readability_texts.json', Object.keys(out))
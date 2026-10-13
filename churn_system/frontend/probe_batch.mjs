// Quick probe of the batch page with the real backend (run with node after
// starting backend on :8000 and `npm run preview` on :4173).
import { chromium } from 'playwright-core'

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 300))
})
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e).slice(0, 300)))

await page.goto('http://localhost:4173/')
await page.getByRole('tab', { name: 'Many clients' }).click()

await page.setInputFiles('input[type=file]', '/tmp/bad.csv')
try {
  await page.waitForSelector('text=need a fix', { timeout: 15000 })
  console.log('BAD FILE OK: rejection UI shown')
  const text = await page.locator('main').innerText()
  console.log('  ->', text.split('\n').filter((l) => /need a fix|Row/.test(l)).join(' | ').slice(0, 300))
} catch {
  console.log('BAD FILE FAILED: no rejection UI. Page text:')
  console.log((await page.locator('main').innerText()).slice(0, 600))
}

await page.setInputFiles('input[type=file]', '/tmp/good.csv')
try {
  await page.waitForSelector('table tbody tr', { timeout: 20000 })
  console.log('GOOD FILE OK: results table shown')
} catch {
  console.log('GOOD FILE FAILED: no table. Page text:')
  console.log((await page.locator('main').innerText()).slice(0, 600))
}

await browser.close()

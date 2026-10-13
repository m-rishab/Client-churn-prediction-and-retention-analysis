import { chromium } from 'playwright-core'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e).slice(0, 300)))
page.on('request', (r) => { if (r.url().includes('/api/')) console.log('REQ', r.method(), r.url().replace('http://localhost:4173', '')) })
page.on('response', (r) => { if (r.url().includes('/api/')) console.log('RES', r.status(), r.url().replace('http://localhost:4173', '')) })
page.on('requestfailed', (r) => { if (r.url().includes('/api/')) console.log('FAIL', r.failure()?.errorText, r.url()) })

await page.goto('http://localhost:4173/')
await page.getByText('Load a sample client').click()
await page.waitForSelector('text=Top reasons', { timeout: 20000 })
console.log('== result shown, intro collapsed?', await page.getByText('What is this?').count() > 0)
console.log('== score text:', await page.locator('section[aria-label="Result"] .text-4xl2').first().innerText())

await page.getByRole('spinbutton', { name: 'Months with us' }).fill('30')
for (const t of [300, 900, 1500, 2500]) {
  await page.waitForTimeout(t === 300 ? 300 : t - (t === 900 ? 300 : t === 1500 ? 900 : 1500))
  const txt = await page.locator('section[aria-label="Result"]').innerText().catch(() => 'GONE')
  console.log(`== t+${t}ms chip?`, txt.includes('Before'), '| score:', (txt.match(/\d+\s*↑|↑\s*\d+/) || ['?'])[0], '| first 80:', txt.slice(0, 80).replace(/\n/g, ' '))
}
await browser.close()

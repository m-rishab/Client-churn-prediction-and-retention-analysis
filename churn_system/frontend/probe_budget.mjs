import { chromium } from 'playwright-core'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(HERE, '../../docs/screenshots')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://localhost:4173/')
await page.waitForSelector('text=Months with us')

const sel = 'main button:visible:not([aria-label^="About"]):not([role=radio]):not([role=tab]), main a:visible'
const els = await page.locator(sel).all()
console.log('matched', els.length)
for (const el of els) {
  console.log(' -', (await el.innerText()).replace(/\n/g, ' '), '| role:', await el.getAttribute('role'), '| aria:', await el.getAttribute('aria-label'))
}
const words = (await page.locator('main').innerText()).split(/\s+/).filter(Boolean).length
console.log('words:', words)
await browser.close()

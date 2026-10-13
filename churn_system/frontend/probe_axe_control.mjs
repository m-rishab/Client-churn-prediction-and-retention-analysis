// Negative control: axe must flag a deliberately broken element.
import { chromium } from 'playwright-core'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import * as path from 'path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const axeSource = readFileSync(path.join(HERE, 'node_modules/axe-core/axe.min.js'), 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('http://localhost:4173/')
await page.waitForTimeout(800)
await page.addScriptTag({ content: axeSource })
const version = await page.evaluate(() => window.axe.version)
await page.evaluate(() => {
  const b = document.createElement('button')
  b.style.position = 'fixed'
  b.textContent = '   ' // empty accessible name
  document.body.appendChild(b)
  const img = document.createElement('img')
  img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
  img.style.position = 'fixed'
  img.style.top = '10px'
  document.body.appendChild(img)
})
const results = await page.evaluate(() => window.axe.run(document, {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
}))
console.log('axe version:', version)
console.log('violations found on deliberately broken page:', results.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', '))
console.log(results.violations.length > 0 ? 'CONTROL PASS: axe detects injected issues' : 'CONTROL FAIL: axe is not detecting anything')
await browser.close()

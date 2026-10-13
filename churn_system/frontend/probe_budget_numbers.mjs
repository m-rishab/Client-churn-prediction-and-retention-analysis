// Final measured minimalism budget numbers (section 8).
import { chromium } from 'playwright-core'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://localhost:4173/')
await page.waitForSelector('text=Months with us')
await page.waitForTimeout(400)

const m = await page.evaluate(() => {
  const words = (s) => s.split(/\s+/).filter(Boolean).length
  const numberInputs = document.querySelectorAll('main input[type=number]').length
  const infoButtons = document.querySelectorAll('main button[aria-label^="About"]').length
  const allButtons = [...document.querySelectorAll('main button')].filter(
    (b) => b.offsetParent && getComputedStyle(b).display !== 'none',
  )
  const infoIcons = [...allButtons].filter((b) => (b.getAttribute('aria-label') || '').startsWith('About')).length
  const radios = allButtons.filter((b) => b.getAttribute('role') === 'radio').length
  const tabs = allButtons.filter((b) => b.getAttribute('role') === 'tab').length
  const others = allButtons.filter(
    (b) => !(b.getAttribute('aria-label') || '').startsWith('About') &&
      b.getAttribute('role') !== 'radio' && b.getAttribute('role') !== 'tab',
  )
  const h1 = document.querySelector('main h1')
  const introWords = words(h1.parentElement.innerText)
  const mainWords = words(document.querySelector('main').innerText)
  return { numberInputs, infoIcons, radios, tabs, others: others.map((b) => b.textContent.trim()), introWords, mainWords }
})

// font sizes/weights across the whole app (check + portfolio + learn)
const sizes = new Set()
const weights = new Set()
for (const path of ['/', '/portfolio', '/learn']) {
  await page.goto(`http://localhost:4173${path}`)
  await page.waitForTimeout(path === '/' ? 500 : 1200)
  await page.evaluate(() => {
    window.__s = window.__s || { sizes: new Set(), weights: new Set() }
    for (const el of document.querySelectorAll('main *, header *, footer *')) {
      const cs = getComputedStyle(el)
      if (el.children.length === 0 && el.textContent.trim()) {
        window.__s.sizes.add(cs.fontSize)
        window.__s.weights.add(cs.fontWeight)
      }
    }
  })
}
const totals = await page.evaluate(() => ({
  sizes: [...window.__s.sizes].sort(),
  weights: [...window.__s.weights].sort(),
}))

console.log('BUDGET NUMBERS (measured, default Check page):')
console.log('  input fields visible:', m.numberInputs, '(limit 6)')
console.log('  buttons/links besides nav+info icons:', JSON.stringify(m.others), '->', m.others.length, '(limit 2)')
console.log('  visible words in main:', m.mainWords, '(limit 200; tooltips closed)')
console.log('  intro words:', m.introWords, '(limit 60)')
console.log('  font sizes across app:', totals.sizes.join(', '), '(max 4)')
console.log('  font weights across app:', totals.weights.join(', '), '(max 3)')
console.log('  (info icons:', m.infoIcons, ', radios:', m.radios, ', tabs:', m.tabs, '- excluded by rule)')
await browser.close()

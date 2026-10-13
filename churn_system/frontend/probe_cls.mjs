// Find which elements cause layout shifts during the Check -> Portfolio flow.
import { chromium } from 'playwright-core'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://localhost:4173/')

await page.evaluate(() => {
  if (!sessionStorage.getItem('__shifts')) sessionStorage.setItem('__shifts', '[]')
  new PerformanceObserver((list) => {
    const all = JSON.parse(sessionStorage.getItem('__shifts') ?? '[]')
    for (const e of list.getEntries()) {
      all.push({
        value: e.value,
        time: Math.round(e.startTime),
        page: location.pathname,
        t_rel: Math.round(e.startTime),
        sources: (e.sources ?? []).map((s) => ({
          node: s.node?.tagName + '.' + (s.node?.className ?? '').toString().slice(0, 60),
          prev: s.previousRect,
          now: s.currentRect,
        })),
      })
    }
    sessionStorage.setItem('__shifts', JSON.stringify(all))
  }).observe({ type: 'layout-shift', buffered: true })
})

await page.getByText('Load a sample client').click()
await page.waitForTimeout(2500)
await page.goto('http://localhost:4173/portfolio')
await page.waitForTimeout(2500)

const shifts = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__shifts') ?? '[]'))
const total = shifts.reduce((a, s) => a + s.value, 0)
console.log(`total CLS: ${total.toFixed(4)} from ${shifts.length} shifts`)
console.log('pages:', JSON.stringify([...new Set(shifts.map((s) => s.page))]))
for (const s of shifts.filter((x) => x.value > 0.01)) {
  console.log(`\n[${s.page}] shift ${s.value.toFixed(4)} at ${s.time}ms`)
  for (const src of s.sources.slice(0, 4)) {
    console.log(`  ${src.node}`)
    console.log(`    prev y=${src.prev?.y} h=${src.prev?.height} -> now y=${src.now?.y} h=${src.now?.height}`)
  }
}
await browser.close()

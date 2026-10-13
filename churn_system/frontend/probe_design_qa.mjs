// Design QA probe: measures computed styles, contrast, overflow and layout
// against sections 7-9 on every page, at desktop and mobile widths.
import { chromium } from 'playwright-core'

const browser = await chromium.launch()
const findings = []

function add(page, issue, detail) {
  findings.push(`[${page}] ${issue}: ${detail}`)
}

async function audit(page, name, width, height) {
  await page.setViewportSize({ width, height })
  await page.goto('http://localhost:4173/')
  await page.waitForSelector('text=Months with us')
  await page.waitForTimeout(300)

  // --- font sizes and weights in use
  const styles = await page.evaluate(() => {
    const sizes = new Map()
    const weights = new Map()
    for (const el of document.querySelectorAll('main *, header *, footer *')) {
      const cs = getComputedStyle(el)
      if (el.children.length === 0 && el.textContent.trim()) {
        sizes.set(cs.fontSize, (sizes.get(cs.fontSize) ?? 0) + 1)
        weights.set(cs.fontWeight, (weights.get(cs.fontWeight) ?? 0) + 1)
      }
    }
    return { sizes: [...sizes.entries()], weights: [...weights.entries()] }
  })
  if (styles.sizes.length > 4) add(name, 'too many font sizes', JSON.stringify(styles.sizes))
  if (styles.weights.length > 3) add(name, 'too many font weights', JSON.stringify(styles.weights))

  // --- horizontal scroll
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0) add(name, 'horizontal overflow px', String(overflow))

  // --- more than one primary button
  const primaries = await page.evaluate(() =>
    [...document.querySelectorAll('main button')].filter((b) => {
      const bg = getComputedStyle(b).backgroundColor
      return bg === 'rgb(37, 99, 235)'
    }).length,
  )
  if (primaries > 1) add(name, 'primary buttons', String(primaries))

  // --- contrast of all visible text (naive WCAG AA on solid backgrounds)
  const contrastIssues = await page.evaluate(() => {
    function lum(c) {
      const [r, g, b] = c.match(/\d+/g).map(Number).map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    function bgOf(el) {
      let node = el
      while (node && node !== document.documentElement) {
        const bg = getComputedStyle(node).backgroundColor
        if (bg && !bg.includes('0, 0, 0, 0') && bg !== 'transparent') return bg
        node = node.parentElement
      }
      return 'rgb(250, 250, 249)'
    }
    const issues = []
    for (const el of document.querySelectorAll('main *, header *, footer *')) {
      if (el.children.length || !el.textContent.trim()) continue
      const cs = getComputedStyle(el)
      const l1 = lum(cs.color)
      const l2 = lum(bgOf(el))
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      const small = parseFloat(cs.fontSize) < 24
      const need = small ? (cs.fontWeight >= 600 ? 4.5 : 4.5) : 3
      if (ratio < need) issues.push(`${el.textContent.trim().slice(0, 30)} ${ratio.toFixed(2)}`)
    }
    return [...new Set(issues)].slice(0, 8)
  })
  if (contrastIssues.length) add(name, 'low-contrast text', contrastIssues.join(' | '))

  // --- elements cut off beyond the right edge
  const cutOff = await page.evaluate(() => {
    const w = document.documentElement.clientWidth
    const bad = []
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && (r.right > w + 2 || r.left < -2)) {
        bad.push(`${el.tagName}.${(el.className || '').toString().slice(0, 30)} right=${Math.round(r.right)}`)
      }
    }
    return bad.slice(0, 5)
  })
  if (cutOff.length) add(name, 'elements beyond viewport', cutOff.join(' | '))

  // --- overlapping visible text (simple pairwise check on leaf nodes)
  const overlaps = await page.evaluate(() => {
    const leaves = [...document.querySelectorAll('main *')].filter(
      (el) => el.children.length === 0 && el.textContent.trim() && el.offsetParent,
    )
    const bad = []
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i].getBoundingClientRect()
        const b = leaves[j].getBoundingClientRect()
        const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
        const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
        if (x > 4 && y > 4 && !leaves[i].contains(leaves[j]) && !leaves[j].contains(leaves[i])) {
          bad.push(`${leaves[i].textContent.trim().slice(0, 18)} ~ ${leaves[j].textContent.trim().slice(0, 18)}`)
        }
      }
    }
    return [...new Set(bad)].slice(0, 5)
  })
  if (overlaps.length) add(name, 'overlapping text', overlaps.join(' | '))
}

const page = await browser.newPage()

// CHECK page
await audit(page, 'check@1280', 1280, 900)
await audit(page, 'check@375', 375, 800)
await audit(page, 'check@768', 768, 900)

// filled state
await page.setViewportSize({ width: 1280, height: 900 })
await page.goto('http://localhost:4173/')
await page.waitForSelector('text=Months with us')
await page.getByText('Load a sample client').click()
await page.waitForSelector('text=Top reasons', { timeout: 20000 })
await page.waitForTimeout(300)
const filled = await page.evaluate(() => {
  const sizes = new Map()
  const weights = new Map()
  for (const el of document.querySelectorAll('main *')) {
    const cs = getComputedStyle(el)
    if (el.children.length === 0 && el.textContent.trim()) {
      sizes.set(cs.fontSize, (sizes.get(cs.fontSize) ?? 0) + 1)
      weights.set(cs.fontWeight, (weights.get(cs.fontWeight) ?? 0) + 1)
    }
  }
  const primaries = [...document.querySelectorAll('main button')].filter(
    (b) => getComputedStyle(b).backgroundColor === 'rgb(37, 99, 235)',
  ).length
  return { sizes: [...sizes.keys()], weights: [...weights.keys()], primaries }
})
if (filled.sizes.length > 4) add('check-filled', 'font sizes', JSON.stringify(filled.sizes))
if (filled.weights.length > 3) add('check-filled', 'font weights', JSON.stringify(filled.weights))
if (filled.primaries > 1) add('check-filled', 'primary buttons', String(filled.primaries))

// PORTFOLIO + LEARN
for (const [path, name] of [['/portfolio', 'portfolio'], ['/learn', 'learn']]) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`http://localhost:4173${path}`)
  await page.waitForTimeout(1200)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0) add(name, 'horizontal overflow px', String(overflow))
  const primaries = await page.evaluate(
    () => [...document.querySelectorAll('main button')].filter((b) => getComputedStyle(b).backgroundColor === 'rgb(37, 99, 235)').length,
  )
  if (primaries > 1) add(name, 'primary buttons', String(primaries))
  const styles = await page.evaluate(() => {
    const sizes = new Set()
    const weights = new Set()
    for (const el of document.querySelectorAll('main *')) {
      const cs = getComputedStyle(el)
      if (el.children.length === 0 && el.textContent.trim()) {
        sizes.add(cs.fontSize)
        weights.add(cs.fontWeight)
      }
    }
    return { sizes: [...sizes], weights: [...weights] }
  })
  if (styles.sizes.length > 4) add(name, 'font sizes', JSON.stringify(styles.sizes))
  if (styles.weights.length > 3) add(name, 'font weights', JSON.stringify(styles.weights))
}

console.log(findings.length ? findings.join('\n') : 'NO FINDINGS - all design QA checks pass')
await browser.close()

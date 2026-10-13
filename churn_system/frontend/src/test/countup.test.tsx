import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { CountUp } from '../components/CountUp'

/** The digits the sighted user sees (aria-hidden node). */
function visible(container: HTMLElement): string {
  return (container.querySelector('span[aria-hidden]') as HTMLElement).textContent ?? ''
}
/** The copy screen readers get (always the exact final value). */
function srCopy(container: HTMLElement): string {
  return (container.querySelector('.sr-only') as HTMLElement).textContent ?? ''
}

/**
 * Deterministic requestAnimationFrame: the test controls the clock.
 * The component reads t0 = performance.now() when the animation starts, so
 * the fake frames are stamped relative to a captured base time.
 */
function useFakeFrames() {
  const base = performance.now()
  const pending = new Map<number, (t: number) => void>()
  let nextId = 1
  const spy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = nextId++
    pending.set(id, cb)
    return id
  })
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  const step = (ms: number) =>
    act(() => {
      const frames = [...pending.entries()]
      pending.clear()
      for (const [, cb] of frames) cb(base + ms)
    })
  return {
    step,
    framesRequested: () => spy.mock.calls.length,
    restore: () => {
      spy.mockRestore()
      cancelSpy.mockRestore()
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('CountUp - final values are exact', () => {
  it.each([
    ['integer', { value: 84 }, '84'],
    ['decimal', { value: 0.914, decimals: 3 }, '0.914'],
    ['money', { value: 1234.6, format: 'money' as const }, '1,235'],
    ['percent', { value: 84.7, format: 'percent' as const, decimals: 1 }, '84.7%'],
  ])('%s format ends on the exact API value', (_, props, expected) => {
    const f = useFakeFrames()
    const { container } = render(<CountUp {...props} />)
    f.step(1000) // finish the animation
    expect(visible(container)).toBe(expected)
    expect(srCopy(container)).toBe(expected) // screen readers get the same final value
    f.restore()
  })

  it('money shows thousand separators', () => {
    const f = useFakeFrames()
    const { container } = render(<CountUp value={84120} format="money" />)
    f.step(1000)
    expect(visible(container)).toBe('84,120')
    f.restore()
  })
})

describe('CountUp - animation behaviour', () => {
  it('counts from 0 on first reveal, then from the previous value on change', () => {
    const f = useFakeFrames()
    const { rerender, container } = render(<CountUp value={100} />)

    f.step(450) // halfway through the 900 ms reveal
    const mid = Number(visible(container))
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(100)

    f.step(900) // finish
    expect(visible(container)).toBe('100')

    rerender(<CountUp value={40} />)
    f.step(1) // a frame was requested for the change animation
    f.step(300) // halfway through the 600 ms change
    const mid2 = Number(visible(container))
    expect(mid2).toBeGreaterThan(40)
    expect(mid2).toBeLessThan(100)

    f.step(600)
    expect(visible(container)).toBe('40')
    f.restore()
  })

  it('never restarts when re-rendered with the same value', () => {
    const f = useFakeFrames()
    const { rerender } = render(<CountUp value={7} />)
    f.step(1000)
    const after = f.framesRequested()
    rerender(<CountUp value={7} />)
    rerender(<CountUp value={7} />)
    expect(f.framesRequested()).toBe(after)
    f.restore()
  })

  it('prefers-reduced-motion shows the final value at once', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    const { container } = render(<CountUp value={64} />)
    expect(visible(container)).toBe('64') // no frames needed
    expect(srCopy(container)).toBe('64')
  })

  it('the screen-reader copy carries the final value while the digits still move', () => {
    const f = useFakeFrames()
    const { container } = render(<CountUp value={90} />)
    f.step(300) // mid-animation
    expect(srCopy(container)).toBe('90') // final value, immediately
    expect(Number(visible(container))).not.toBe(90) // digits still moving
    f.restore()
  })

  it('responds to value changes through the DOM rerender cycle', () => {
    const f = useFakeFrames()
    const { rerender, container } = render(<CountUp value={10} suffix="%" />)
    f.step(1000)
    rerender(<CountUp value={20} suffix="%" />)
    f.step(1000)
    expect(visible(container)).toBe('20%')
    expect(srCopy(container)).toBe('20%')
    f.restore()
  })

  it('resting display never drifts from the API value', () => {
    const f = useFakeFrames()
    const { rerender, container } = render(<CountUp value={99.6} decimals={1} />)
    f.step(1000)
    expect(visible(container)).toBe('99.6')
    rerender(<CountUp value={0.4} decimals={1} />)
    f.step(1000)
    expect(visible(container)).toBe('0.4')
    f.restore()
  })
})

describe('CountUp - smoke check', () => {
  it('renders inside a card without crashing', () => {
    const f = useFakeFrames()
    const { container } = render(
      <div>
        <CountUp value={42} format="money" />
      </div>,
    )
    f.step(1000)
    expect(visible(container)).toBe('42')
    f.restore()
  })
})

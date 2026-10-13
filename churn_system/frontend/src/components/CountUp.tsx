import { useEffect, useRef, useState } from 'react'

type Format = 'integer' | 'decimal' | 'money' | 'percent'

interface Props {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  format?: Format
  className?: string
}

/**
 * Animated number.
 * - First reveal counts up over ~900 ms; a changed value counts from its
 *   previous on-screen value (never from zero) over ~600 ms.
 * - Ease-out cubic, requestAnimationFrame; starts when scrolled into view
 *   (IntersectionObserver, once per mount); never restarts for the same
 *   value; cancels cleanly on unmount or when a new value arrives.
 * - The resting text equals the exact prop value (final frame snaps; no
 *   rounding drift).
 * - Screen readers get the FINAL value immediately via aria-label; the
 *   moving text is aria-hidden. prefers-reduced-motion renders the final
 *   value at once.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  format = 'integer',
  className = '',
}: Props) {
  const reduceInit =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // null display = resting state: show the exact final value.
  const [display, setDisplay] = useState<number | null>(reduceInit ? null : 0)
  const shownRef = useRef<number>(reduceInit ? value : 0) // number on screen now
  const firstRef = useRef(true) // first reveal not played yet
  const rafRef = useRef<number | undefined>(undefined)
  const hostRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const reduce =
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    // Same value as currently on screen: rest on the exact value, never restart.
    if (shownRef.current === value) {
      setDisplay(null)
      return
    }

    const start = () => {
      if (reduce) {
        shownRef.current = value
        setDisplay(null)
        return
      }
      const from = shownRef.current ?? 0
      const dur = firstRef.current ? 900 : 600
      firstRef.current = false
      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        const v = from + (value - from) * eased
        shownRef.current = v
        setDisplay(v)
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          shownRef.current = value
          setDisplay(null) // snap: the resting text is the exact prop value
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    if (typeof IntersectionObserver === 'undefined') {
      start()
      return () => {
        if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
      }
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          start()
        }
      },
      { threshold: 0.1 },
    )
    if (host) io.observe(host)
    else start()
    return () => {
      io.disconnect()
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  const opts: Intl.NumberFormatOptions =
    format === 'percent'
      ? { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
  const nf = new Intl.NumberFormat('en-US', opts)
  const shown = display ?? value
  const shownText =
    format === 'money'
      ? nf.format(Math.round(shown))
      : format === 'percent'
        ? nf.format(shown / 100)
        : nf.format(shown)
  const finalText =
    format === 'money'
      ? nf.format(Math.round(value))
      : format === 'percent'
        ? nf.format(value / 100)
        : nf.format(value)

  return (
    <span
      ref={hostRef}
      className={`tabular-nums ${className}`}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {/* screen readers get the final value immediately; the moving digits are hidden */}
      <span className="sr-only">
        {prefix}
        {finalText}
        {suffix}
      </span>
      <span aria-hidden="true">
        {prefix}
        {shownText}
        {suffix}
      </span>
    </span>
  )
}

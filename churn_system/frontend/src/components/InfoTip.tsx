import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Info } from 'lucide-react'

export interface TipContent {
  definition: string
  example?: string | number
  range?: string
  directionHint?: string
  demoNote?: string
}

/**
 * The one tooltip used across the app (section 9).
 * Fine pointer: opens on hover (~150 ms) and keyboard focus, stays open while
 * the pointer moves onto the content, closes on leave / Escape / outside click.
 * Touch: opens on tap, closes on tap outside. Radix Popover keeps it on screen.
 *
 * `trigger` optionally replaces the default info button (used by the demo pill).
 * `demoNote` renders as the final muted line of the tooltip.
 */
export function InfoTip({
  label,
  content,
  trigger,
}: {
  label: string
  content: TipContent
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [hoverCapable] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches,
  )
  const hoverTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => {
    window.clearTimeout(hoverTimer.current)
    window.clearTimeout(closeTimer.current)
  }, [])

  const openSoon = () => {
    window.clearTimeout(closeTimer.current)
    hoverTimer.current = window.setTimeout(() => setOpen(true), 150)
  }
  const closeSoon = () => {
    window.clearTimeout(hoverTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        asChild
        aria-label={`About ${label}`}
        onMouseEnter={hoverCapable ? openSoon : undefined}
        onMouseLeave={hoverCapable ? closeSoon : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {trigger ?? (
          <button
            type="button"
            className="inline-flex h-8 w-8 -mx-1 items-center justify-center rounded-full text-muted hover:text-ink"
          >
            <Info size={16} aria-hidden />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="tooltip"
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[280px] rounded-lg border border-line bg-surface p-3 shadow-card"
          onMouseEnter={hoverCapable ? () => window.clearTimeout(closeTimer.current) : undefined}
          onMouseLeave={hoverCapable ? closeSoon : undefined}
        >
          <p className="text-xs2 font-semibold text-ink">
            What it means
          </p>
          <p className="text-xs2 text-ink">{content.definition}</p>
          {content.example !== undefined && content.example !== '' && (
            <p className="text-xs2 mt-2 text-ink">
              <span className="font-semibold">Example: </span>
              {String(content.example)}
            </p>
          )}
          {content.range && (
            <p className="text-xs2 mt-1 text-ink">
              <span className="font-semibold">Usual range: </span>
              {content.range}
            </p>
          )}
          {content.directionHint && (
            <p className="text-xs2 mt-2 border-t border-line pt-2 text-muted">
              {content.directionHint}
            </p>
          )}
          {content.demoNote && (
            <p className="text-xs2 mt-2 border-t border-line pt-2 text-muted">
              {content.demoNote}
            </p>
          )}
          <Popover.Arrow className="fill-[#FFFFFF]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
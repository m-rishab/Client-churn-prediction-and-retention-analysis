import * as Switch from '@radix-ui/react-switch'
import { InfoTip, type TipContent } from './InfoTip'
import type { GlossaryEntry } from '../lib/api'
import { DEMO_NOTE, DEMO_PILL_TOOLTIP, DEMO_TAG_FIELDS } from '../lib/demo'

export interface FieldProps {
  field: string
  entry: GlossaryEntry
  value: string | number | undefined
  onChange: (field: string, value: string | number | undefined) => void
}

function rangeText(entry: GlossaryEntry): string {
  const r = entry.range
  if (!r) return ''
  if (typeof r[0] === 'string') return (r as string[]).join(', ')
  const [lo, hi] = r as number[]
  return `${lo} to ${hi}`
}

export function Field({ field, entry, value, onChange }: FieldProps) {
  const tip: TipContent = {
    definition: entry.definition,
    example: entry.example,
    range: rangeText(entry),
    directionHint: entry.direction_hint,
    demoNote: entry.data_origin ? DEMO_NOTE[entry.data_origin] : undefined,
  }
  const id = `field-${field}`
  const showDemoTag = DEMO_TAG_FIELDS.has(field)

  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <label htmlFor={id} className="text-xs2 font-medium text-ink">
          {entry.label}
        </label>
        <InfoTip label={entry.label} content={tip} />
        {showDemoTag && (
          <InfoTip
            label="this demo value"
            content={{ definition: DEMO_PILL_TOOLTIP }}
            trigger={
              <button
                type="button"
                className="rounded-full bg-line px-2 py-0.5 text-xs2 text-muted"
              >
                demo
              </button>
            }
          />
        )}
      </div>

      {entry.input === 'segmented' && (
        <div role="radiogroup" aria-label={`${entry.label} options`} className="flex rounded-input border border-inputline bg-surface p-0.5">
          {(entry.options ?? []).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              onClick={() => onChange(field, value === o.value ? undefined : o.value)}
              className={`flex-1 rounded-[6px] px-2 py-1.5 text-xs2 transition-colors duration-150 ${
                value === o.value ? 'bg-accent font-semibold text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {entry.input === 'switch' && (
        <div className="flex items-center gap-2">
          <Switch.Root
            id={id}
            checked={value === 'Yes'}
            onCheckedChange={(c) => onChange(field, c ? 'Yes' : 'No')}
            className="relative h-6 w-10 rounded-full border border-inputline bg-surface transition-colors duration-150 data-[state=checked]:border-accent data-[state=checked]:bg-accent"
          >
            <Switch.Thumb className="block h-4.5 w-4.5 translate-x-1 rounded-full bg-surface shadow-card transition-transform duration-150 data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
          <span className="text-xs2 text-muted">{value === 'Yes' ? 'Yes' : 'No'}</span>
        </div>
      )}

      {entry.input === 'score' && (
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            placeholder={String(entry.example)}
            value={value ?? ''}
            min={entry.range?.[0] as number}
            max={entry.range?.[1] as number}
            onChange={(e) => onChange(field, e.target.value === '' ? undefined : Number(e.target.value))}
            className="w-24 rounded-input border border-inputline bg-surface px-2 py-1.5 text-base text-ink placeholder:text-muted/60 focus:border-accent"
          />
          <input
            type="range"
            aria-label={`${entry.label} slider`}
            aria-hidden="true"
            tabIndex={-1}
            min={0}
            max={100}
            step={1}
            value={typeof value === 'number' ? value : 50}
            onChange={(e) => onChange(field, Number(e.target.value))}
            className="h-1 w-full accent-[#4F46E5]"
          />
        </div>
      )}

      {entry.input === 'number' && (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          placeholder={String(entry.example)}
          value={value ?? ''}
          onChange={(e) => onChange(field, e.target.value === '' ? undefined : Number(e.target.value))}
          className="w-32 rounded-input border border-inputline bg-surface px-2 py-1.5 text-base text-ink placeholder:text-muted/60 focus:border-accent"
        />
      )}
    </div>
  )
}

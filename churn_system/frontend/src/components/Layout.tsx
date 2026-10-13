import { Link, useLocation } from 'react-router-dom'
import { Info } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'

export function DemoDataPill() {
  return (
    <Popover.Root>
      <Popover.Trigger
        className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-xs2 text-white hover:bg-white/25"
        aria-label="About the data used"
      >
        Demo data
        <Info size={14} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="tooltip"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[280px] rounded-lg border border-line bg-surface p-3 text-xs2 text-ink shadow-card"
        >
          Made-up practice data. Numbers show the tool works, not real Highspring
          results.
          <Popover.Arrow className="fill-[#FFFFFF]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

const TABS = [
  { to: '/', label: 'Check' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/learn', label: 'Learn' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-screen flex-col text-ink">
      <header className="on-deep bg-deep">
        <div className="mx-auto flex h-12 w-full max-w-[960px] items-center justify-between px-4">
          <span className="text-base font-semibold text-white">Client Leaving Risk Checker</span>
          <nav className="flex items-center gap-4" aria-label="Main">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                aria-current={pathname === t.to ? 'page' : undefined}
                className={`text-xs2 transition-colors duration-150 ${
                  pathname === t.to
                    ? 'font-semibold text-white underline decoration-sky decoration-2 underline-offset-4'
                    : 'text-indigo-200 hover:text-white'
                }`}
              >
                {t.label}
              </Link>
            ))}
            <DemoDataPill />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-6">{children}</main>

      <footer className="on-deep bg-deep">
        <div className="mx-auto flex w-full max-w-[960px] flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-xs2 text-indigo-200">
            Demo data. Built for Highspring's Content Strategy and Client Advisory team.
          </p>
          <Link
            to="/learn?tab=about"
            className="text-xs2 text-indigo-200 underline underline-offset-4 hover:text-white"
          >
            About this project
          </Link>
        </div>
      </footer>
    </div>
  )
}

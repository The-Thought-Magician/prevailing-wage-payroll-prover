'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth/client'
import CommandPalette, { type CommandItem } from '@/components/CommandPalette'

type NavItem = { label: string; href: string; icon: string; group: string }

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'D', group: 'Overview' },
  { label: 'Projects', href: '/dashboard/projects', icon: 'P', group: 'Projects & Wages' },
  { label: 'Determinations', href: '/dashboard/determinations', icon: 'W', group: 'Projects & Wages' },
  { label: 'Classifications', href: '/dashboard/classifications', icon: 'C', group: 'Projects & Wages' },
  { label: 'Workers', href: '/dashboard/workers', icon: 'K', group: 'Workforce' },
  { label: 'Apprenticeship Programs', href: '/dashboard/programs', icon: 'A', group: 'Workforce' },
  { label: 'Fringe Plans', href: '/dashboard/fringe-plans', icon: 'F', group: 'Workforce' },
  { label: 'Ledger', href: '/dashboard/ledger', icon: 'L', group: 'Payroll & Proof' },
  { label: 'Validation', href: '/dashboard/validation', icon: 'V', group: 'Payroll & Proof' },
  { label: 'Findings', href: '/dashboard/findings', icon: '!', group: 'Payroll & Proof' },
  { label: 'WH-347', href: '/dashboard/wh347', icon: '3', group: 'Filing' },
  { label: 'Restitution', href: '/dashboard/restitution', icon: 'R', group: 'Filing' },
  { label: 'Subcontractors', href: '/dashboard/subcontractors', icon: 'S', group: 'Filing' },
  { label: 'Audit Packets', href: '/dashboard/audit-packets', icon: 'B', group: 'Filing' },
  { label: 'Deadlines', href: '/dashboard/deadlines', icon: 'T', group: 'Filing' },
  { label: 'Imports', href: '/dashboard/imports', icon: 'I', group: 'Data & Insights' },
  { label: 'Reports', href: '/dashboard/reports', icon: 'X', group: 'Data & Insights' },
  { label: 'Activity', href: '/dashboard/activity', icon: 'Y', group: 'Data & Insights' },
  { label: 'Settings', href: '/dashboard/settings', icon: 'G', group: 'Account' },
]

const COMMAND_ITEMS: CommandItem[] = NAV.map((n) => ({ label: n.label, href: n.href, group: n.group }))

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await authClient.getSession()
      if (cancelled) return
      if (!s?.data?.user) {
        router.push('/auth/sign-in')
        return
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950">
        <div className="flex items-center gap-2 text-stone-400">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-600 border-t-cyan-500" />
          Loading workspace...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <CommandPalette items={COMMAND_ITEMS} />
      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-16 flex-col items-center overflow-y-auto border-r border-stone-800 bg-stone-900 py-4 transition-transform lg:static lg:translate-x-0 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Link
            href="/dashboard"
            className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-cyan-500 text-sm font-black text-stone-950"
            title="PrevailingWagePayrollProver"
          >
            W
          </Link>
          <nav className="flex flex-1 flex-col items-center gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  title={item.label}
                  aria-label={item.label}
                  className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold transition-colors ${
                    active ? 'bg-cyan-500/15 text-cyan-300' : 'text-stone-500 hover:bg-stone-800 hover:text-stone-200'
                  }`}
                >
                  {item.icon}
                </Link>
              )
            })}
          </nav>
        </aside>

        {open && (
          <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
        )}

        <div className="flex min-h-screen flex-1 flex-col lg:pl-16">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stone-800 bg-stone-950/80 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen((v) => !v)}
                aria-label="Toggle navigation"
                className="rounded-md p-2 text-stone-400 hover:bg-stone-800 hover:text-white lg:hidden"
              >
                ☰
              </button>
              <button
                onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                className="flex items-center gap-2 rounded-md border border-stone-800 bg-stone-900 px-3 py-1.5 text-sm text-stone-500 hover:border-stone-700 hover:text-stone-300"
              >
                <span>Search pages</span>
                <span className="rounded border border-stone-700 px-1.5 py-0.5 text-[10px] text-stone-500">⌘K</span>
              </button>
            </div>
            <button
              onClick={signOut}
              className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-200 hover:bg-stone-700"
            >
              Sign out
            </button>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  )
}

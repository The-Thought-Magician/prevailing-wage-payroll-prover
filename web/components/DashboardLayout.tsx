'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth/client'

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

const NAV: NavSection[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', href: '/dashboard' }] },
  {
    title: 'Projects & Wages',
    items: [
      { label: 'Projects', href: '/dashboard/projects' },
      { label: 'Determinations', href: '/dashboard/determinations' },
      { label: 'Classifications', href: '/dashboard/classifications' },
    ],
  },
  {
    title: 'Workforce',
    items: [
      { label: 'Workers', href: '/dashboard/workers' },
      { label: 'Apprenticeship Programs', href: '/dashboard/programs' },
      { label: 'Fringe Plans', href: '/dashboard/fringe-plans' },
    ],
  },
  {
    title: 'Payroll & Proof',
    items: [
      { label: 'Ledger', href: '/dashboard/ledger' },
      { label: 'Validation', href: '/dashboard/validation' },
      { label: 'Findings', href: '/dashboard/findings' },
    ],
  },
  {
    title: 'Filing',
    items: [
      { label: 'WH-347', href: '/dashboard/wh347' },
      { label: 'Restitution', href: '/dashboard/restitution' },
      { label: 'Subcontractors', href: '/dashboard/subcontractors' },
      { label: 'Audit Packets', href: '/dashboard/audit-packets' },
      { label: 'Deadlines', href: '/dashboard/deadlines' },
    ],
  },
  {
    title: 'Data & Insights',
    items: [
      { label: 'Imports', href: '/dashboard/imports' },
      { label: 'Reports', href: '/dashboard/reports' },
      { label: 'Activity', href: '/dashboard/activity' },
    ],
  },
  { title: 'Account', items: [{ label: 'Settings', href: '/dashboard/settings' }] },
]

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
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
          Loading workspace...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 transform overflow-y-auto border-r border-slate-800 bg-slate-900 transition-transform lg:static lg:translate-x-0 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-sm font-black text-slate-950">
              W
            </span>
            <span className="text-sm font-bold tracking-tight text-white">PrevailingWagePayrollProver</span>
          </div>
          <nav className="space-y-6 px-3 py-4">
            {NAV.map((section) => (
              <div key={section.title}>
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  {section.title}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isActive(pathname, item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                          active
                            ? 'bg-amber-500/15 font-medium text-amber-300'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {open && (
          <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
        )}

        <div className="flex min-h-screen flex-1 flex-col lg:pl-0">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen((v) => !v)}
                aria-label="Toggle navigation"
                className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
              >
                ☰
              </button>
              <span className="text-sm font-medium text-slate-400">Compliance Workspace</span>
            </div>
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
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

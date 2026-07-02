'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

const includedFeatures = [
  'Project & contract register',
  'Wage-determination register with rate rows + supersede history',
  'Classification catalog + aliases',
  'Worker roster & apprenticeship programs',
  'Per-worker per-day classification ledger',
  'Deterministic prove engine (rate, fringe, apprentice, OT, classification)',
  'WH-347 generator + statement-of-compliance signing',
  'Restitution / back-wage worksheets',
  'Subcontractor tier tracking & filings',
  'DOL / CO audit packet export',
  'Filing calendar & deadline reminders',
  'CSV import + sample-data seeder',
  'Reports, analytics & activity trail',
]

export default function Pricing() {
  const [stripeEnabled, setStripeEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const plan = await api.getBillingPlan()
        if (!cancelled) setStripeEnabled(Boolean(plan?.stripeEnabled))
      } catch {
        if (!cancelled) setStripeEnabled(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="min-h-screen bg-stone-950 text-white">
      <nav className="flex items-center justify-between border-b border-stone-800 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500 text-sm font-black text-stone-950">
            W
          </span>
          <span className="text-lg font-bold tracking-tight">PrevailingWagePayrollProver</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/auth/sign-in" className="text-stone-300 hover:text-white">
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-stone-950 hover:bg-cyan-400"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="text-4xl font-black tracking-tight">Simple, honest pricing</h1>
        <p className="mx-auto mt-4 max-w-2xl text-stone-400">
          Every capability in PrevailingWagePayrollProver is free. Bring your determinations, prove your
          payroll, and file with confidence at no cost.
        </p>

        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-cyan-500/30 bg-stone-900 p-8 text-left">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-cyan-300">Free</h2>
            <span className="text-3xl font-black">
              $0<span className="text-base font-medium text-stone-500">/mo</span>
            </span>
          </div>
          <p className="mt-2 text-sm text-stone-400">All features, no limits, no card required.</p>
          <ul className="mt-6 space-y-2 text-sm text-stone-300">
            {includedFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-cyan-400">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/auth/sign-up"
            className="mt-8 block w-full rounded-lg bg-cyan-500 py-3 text-center font-semibold text-stone-950 hover:bg-cyan-400"
          >
            Create your free account
          </Link>
          <p className="mt-4 text-center text-xs text-stone-500">
            {stripeEnabled === null
              ? 'Checking billing status...'
              : stripeEnabled
                ? 'Paid plans are available; contact us to upgrade.'
                : 'Billing is not enabled — everything is currently free.'}
          </p>
        </div>
      </section>

      <footer className="border-t border-stone-800 py-8 text-center text-sm text-stone-600">
        <p>PrevailingWagePayrollProver — certified payroll compliance for public-works contractors.</p>
      </footer>
    </main>
  )
}

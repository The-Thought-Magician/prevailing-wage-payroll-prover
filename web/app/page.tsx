import Link from 'next/link'

const features = [
  {
    title: 'Wage-Determination Register',
    body: 'System of record for Davis-Bacon and state wage decisions. Retains WD numbers, modifications, per-classification base and fringe rates, effective dates, and supersede history for examination.',
  },
  {
    title: 'Per-Worker Per-Day Ledger',
    body: 'The controlling compliance record. One line per worker, per project, per work date, per classification, with straight-time, overtime, and doubletime hours plus cash and plan fringe.',
  },
  {
    title: 'Deterministic Prove Engine',
    body: 'Executes rate-floor, fringe-sufficiency, apprentice-ratio, overtime, and classification checks in a single pass. Every ledger line receives a pass or fail determination and a computed shortfall, where applicable.',
  },
  {
    title: 'WH-347 Generator',
    body: 'Populates the federal certified payroll form directly from the ledger: weekly hours grid, fringe statement under 4(a)/4(b), payroll number, and a printable statement of compliance.',
  },
  {
    title: 'Statement-of-Compliance Signing',
    body: 'Routes a generated WH-347 for typed-signature attestation, records signer identity and timestamp, and locks the record immutably upon signature.',
  },
  {
    title: 'Restitution & Back-Wage Calculator',
    body: 'Aggregates base, fringe, and overtime shortfalls per worker across a filing period, produces a restitution worksheet, and records make-up pay as remitted.',
  },
  {
    title: 'Apprentice-Ratio Checker',
    body: 'Validates on-site apprentice-to-journeyworker ratios, flags apprentices absent from a registered program, and confirms rates against program-level percentages.',
  },
  {
    title: 'DOL / Contracting-Officer Audit Packet Export',
    body: 'Assembles WH-347 records, determinations, the classification ledger, fringe worksheets, and restitution records into a single packet with a machine-readable manifest, prepared for submission on request.',
  },
  {
    title: 'Compliance Dashboard & Findings Register',
    body: 'Reports per-project compliance status, open findings by violation type, weeks filed against weeks due, outstanding restitution, and a centralized findings register for remediation tracking.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-950 text-white">
      <nav className="flex items-center justify-between border-b border-stone-800 px-6 py-4">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500 text-sm font-black text-stone-950">
            W
          </span>
          <span className="text-lg font-bold tracking-tight">PrevailingWagePayrollProver</span>
        </span>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-stone-300 hover:text-white">
            Pricing
          </Link>
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

      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-block rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
          Davis-Bacon certified payroll, verified prior to filing
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Verify that every covered worker received the correct prevailing wage before the WH-347 is submitted.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-400">
          A determination-aware system of record for public-works contractors. The platform ingests wage
          decisions and daily payroll, applies deterministic compliance checks, and produces a signed,
          audit-ready certified payroll record. Underpayments are identified before they result in withheld
          contract funds, mandated restitution, or debarment proceedings.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-stone-950 hover:bg-cyan-400"
          >
            Begin compliance review
          </Link>
          <Link
            href="/auth/sign-in"
            className="rounded-lg border border-stone-700 px-6 py-3 font-semibold text-stone-200 hover:bg-stone-800"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="border-y border-stone-800 bg-stone-900/40 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold">The compliance requirement admits no tolerance for error</h2>
          <p className="mx-auto mt-4 max-w-3xl text-stone-400">
            Every covered worker must meet or exceed the prevailing base rate for their classification in the
            project county, satisfy the fringe floor through cash or bona fide plan contributions, comply with
            apprentice-ratio requirements, and have overtime computed on the prevailing rate. A single
            miscalculation exposes the contractor to withheld contract funds, mandatory back-wage restitution,
            liquidated damages, and potential debarment. Manual spreadsheet review does not reliably surface
            these exposures. A deterministic compliance engine does.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold">Capabilities required for defensible certified payroll</h2>
        <p className="mt-3 text-center text-stone-400">
          Built for the payroll and compliance administrator of record accountable for the weekly filing.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <h3 className="text-base font-semibold text-cyan-300">{f.title}</h3>
              <p className="mt-2 text-sm text-stone-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-stone-800 px-6 py-20 text-center">
        <h2 className="text-3xl font-bold">Filing should rest on verification, not assumption.</h2>
        <p className="mx-auto mt-4 max-w-xl text-stone-400">
          Load your wage determinations and payroll ledger, run the compliance engine, and sign a WH-347
          supported by a documented, auditable basis. All capabilities are available at no charge.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-stone-950 hover:bg-cyan-400"
          >
            Create your account
          </Link>
          <Link href="/pricing" className="rounded-lg border border-stone-700 px-6 py-3 font-semibold text-stone-200 hover:bg-stone-800">
            View pricing
          </Link>
        </div>
      </section>

      <footer className="border-t border-stone-800 py-8 text-center text-sm text-stone-600">
        <p>PrevailingWagePayrollProver — certified payroll compliance for public-works contractors.</p>
      </footer>
    </main>
  )
}

import Link from 'next/link'

const features = [
  {
    title: 'Wage-Determination Register',
    body: 'The system of record for Davis-Bacon and state decisions: WD numbers, modifications, per-classification base and fringe rates, effective dates, and supersede history.',
  },
  {
    title: 'Per-Worker Per-Day Ledger',
    body: 'The atomic compliance unit. A payroll line per worker, per project, per work date, per classification with straight, OT, and doubletime hours plus cash and plan fringe.',
  },
  {
    title: 'Deterministic Prove Engine',
    body: 'Run rate-floor, fringe sufficiency, apprentice ratio, overtime, and classification checks in one pass. Every line gets a pass/fail and a computed shortfall.',
  },
  {
    title: 'WH-347 Generator',
    body: 'Populate the federal certified payroll from the ledger: weekly hours grid, fringe 4(a)/4(b) statement, payroll number, and a printable statement of compliance.',
  },
  {
    title: 'Statement-of-Compliance Signing',
    body: 'Route a generated WH-347 for typed-signature attestation, capture signer identity and timestamp, and lock it immutably once signed.',
  },
  {
    title: 'Restitution & Back-Wage Calculator',
    body: 'Aggregate base, fringe, and OT shortfalls per worker across a period, build a restitution worksheet, and mark make-up pay as remitted.',
  },
  {
    title: 'Apprentice-Ratio Checker',
    body: 'Validate on-site apprentice-to-journeyworker ratios, flag apprentices not in a registered program, and confirm rates match program-level percentages.',
  },
  {
    title: 'DOL / CO Audit Packet Export',
    body: 'Bundle WH-347s, determinations, the classification ledger, fringe worksheets, and restitution into one audit-ready packet with a machine-readable manifest.',
  },
  {
    title: 'Compliance Dashboard & Findings',
    body: 'Per-project health scores, open violations by type, weeks filed versus due, restitution outstanding, and a centralized findings tracker.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-sm font-black text-slate-950">
            W
          </span>
          <span className="text-lg font-bold tracking-tight">PrevailingWagePayrollProver</span>
        </span>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-slate-300 hover:text-white">
            Pricing
          </Link>
          <Link href="/auth/sign-in" className="text-slate-300 hover:text-white">
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-slate-950 hover:bg-amber-400"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          Davis-Bacon certified payroll, proven before you file
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Prove every worker was paid the correct prevailing wage, every day, before the WH-347 goes out.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          A determination-aware system of record for public-works contractors. Ingest wage decisions and daily
          payroll, run deterministic rule checks, and produce a signed, audit-ready certified payroll packet that
          catches underpayments before they become withheld funds, restitution, or debarment.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-slate-950 hover:bg-amber-400"
          >
            Start proving payroll
          </Link>
          <Link
            href="/auth/sign-in"
            className="rounded-lg border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/40 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold">The math is brutal and existential</h2>
          <p className="mx-auto mt-4 max-w-3xl text-slate-400">
            Every covered worker must clear the prevailing base rate for their exact classification in the
            project county, meet the fringe floor in cash or bona-fide plan contributions, satisfy apprentice
            ratios, and have overtime computed on the prevailing rate. One wrong number anywhere triggers
            withheld contract funds, mandatory back-wage restitution, liquidated damages, and potential
            debarment. Spreadsheets do not catch it. A deterministic prover does.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold">Everything the filing owner needs</h2>
        <p className="mt-3 text-center text-slate-400">
          Built for the payroll and compliance administrator who personally owns the weekly filing.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-base font-semibold text-amber-300">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-800 px-6 py-20 text-center">
        <h2 className="text-3xl font-bold">Stop filing on faith.</h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-400">
          Ingest your determinations and ledger, run the prove engine, and sign a WH-347 you can defend in an
          audit. Every feature is free.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-slate-950 hover:bg-amber-400"
          >
            Create your account
          </Link>
          <Link href="/pricing" className="rounded-lg border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800">
            See pricing
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-600">
        <p>PrevailingWagePayrollProver — certified payroll compliance for public-works contractors.</p>
      </footer>
    </main>
  )
}

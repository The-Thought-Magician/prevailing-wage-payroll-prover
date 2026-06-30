import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  import_jobs,
  projects,
  companies,
  workers,
  payroll_lines,
  wage_determinations,
  determination_rates,
  activity_log,
} from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes,
// commas inside quotes, and CRLF/LF line endings. Returns an array of
// row objects keyed by the (lower-cased, trimmed) header names.
// ---------------------------------------------------------------------------
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let i = 0
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    // Skip fully-blank lines.
    if (row.length > 1 || row[0].trim().length > 0) rows.push(row)
    row = []
  }
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      pushField()
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      pushRow()
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  // Flush trailing field/row.
  if (field.length > 0 || row.length > 0) pushRow()

  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const out: Record<string, string>[] = []
  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (rows[r][c] ?? '').trim()
    }
    out.push(obj)
  }
  return out
}

function num(v: string | undefined, fallback = 0): number {
  if (v === undefined || v === '') return fallback
  const n = Number(v.replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : fallback
}

const payrollImportSchema = z.object({
  project_id: z.string().min(1),
  csv: z.string().min(1),
})

const determinationImportSchema = z.object({
  determination_id: z.string().min(1),
  csv: z.string().min(1),
})

// ---------------------------------------------------------------------------
// GET / — list import jobs for the current user
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  const rows = userId
    ? await db
        .select()
        .from(import_jobs)
        .where(eq(import_jobs.user_id, userId))
        .orderBy(desc(import_jobs.created_at))
    : await db.select().from(import_jobs).orderBy(desc(import_jobs.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /payroll — import payroll CSV rows (mapped) for a project
// Expected columns: worker_id (or full_name), work_date, week_ending,
//   classification_name, straight_hours, overtime_hours, doubletime_hours,
//   base_rate_paid, fringe_cash_paid, fringe_plan_paid, gross_paid, is_apprentice
// ---------------------------------------------------------------------------
router.post('/payroll', authMiddleware, zValidator('json', payrollImportSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [project] = await db.select().from(projects).where(eq(projects.id, body.project_id))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (project.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const rows = parseCsv(body.csv)
  const errors: Record<string, unknown>[] = []
  let inserted = 0

  // Build a lookup of the user's workers for name → id resolution.
  const userWorkers = await db.select().from(workers).where(eq(workers.user_id, userId))
  const byId = new Map(userWorkers.map((w) => [w.id, w]))
  const byName = new Map(userWorkers.map((w) => [w.full_name.trim().toLowerCase(), w]))

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx]
    const rowNum = idx + 2 // header is line 1
    try {
      let workerId = row.worker_id
      let worker = workerId ? byId.get(workerId) : undefined
      if (!worker && row.full_name) {
        worker = byName.get(row.full_name.trim().toLowerCase())
        if (!worker) {
          // Auto-create a worker shell so the import is not lost.
          const [created] = await db
            .insert(workers)
            .values({
              user_id: userId,
              full_name: row.full_name.trim(),
              default_classification: row.classification_name || null,
            })
            .returning()
          worker = created
          byName.set(created.full_name.trim().toLowerCase(), created)
          byId.set(created.id, created)
        }
        workerId = worker.id
      }
      if (!worker) {
        errors.push({ row: rowNum, error: 'No matching worker_id or full_name' })
        continue
      }
      if (!row.work_date || !row.week_ending || !row.classification_name) {
        errors.push({ row: rowNum, error: 'Missing work_date, week_ending, or classification_name' })
        continue
      }
      await db.insert(payroll_lines).values({
        user_id: userId,
        project_id: body.project_id,
        worker_id: worker.id,
        work_date: row.work_date,
        week_ending: row.week_ending,
        classification_name: row.classification_name,
        straight_hours: num(row.straight_hours),
        overtime_hours: num(row.overtime_hours),
        doubletime_hours: num(row.doubletime_hours),
        base_rate_paid: num(row.base_rate_paid),
        fringe_cash_paid: num(row.fringe_cash_paid),
        fringe_plan_paid: num(row.fringe_plan_paid),
        gross_paid: num(row.gross_paid),
        is_apprentice: /^(1|true|yes|y)$/i.test(row.is_apprentice ?? ''),
        notes: row.notes || null,
      })
      inserted += 1
    } catch (e) {
      errors.push({ row: rowNum, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const [job] = await db
    .insert(import_jobs)
    .values({
      user_id: userId,
      project_id: body.project_id,
      import_type: 'payroll',
      status: errors.length > 0 && inserted === 0 ? 'failed' : 'completed',
      total_rows: rows.length,
      inserted_rows: inserted,
      errors,
    })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'import_job',
    entity_id: job.id,
    action: 'created',
    detail: { import_type: 'payroll', inserted, total: rows.length },
  })

  return c.json(job, 201)
})

// ---------------------------------------------------------------------------
// POST /determination — import determination rate CSV rows
// Expected columns: classification_name, base_rate, fringe_rate
// ---------------------------------------------------------------------------
router.post(
  '/determination',
  authMiddleware,
  zValidator('json', determinationImportSchema),
  async (c) => {
    const userId = getUserId(c)
    const body = c.req.valid('json')

    const [det] = await db
      .select()
      .from(wage_determinations)
      .where(eq(wage_determinations.id, body.determination_id))
    if (!det) return c.json({ error: 'Determination not found' }, 404)
    if (det.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

    const rows = parseCsv(body.csv)
    const errors: Record<string, unknown>[] = []
    let inserted = 0

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]
      const rowNum = idx + 2
      try {
        const name = row.classification_name || row.classification || row.name
        if (!name) {
          errors.push({ row: rowNum, error: 'Missing classification_name' })
          continue
        }
        await db
          .insert(determination_rates)
          .values({
            determination_id: body.determination_id,
            classification_name: name,
            base_rate: num(row.base_rate),
            fringe_rate: num(row.fringe_rate),
          })
          .onConflictDoUpdate({
            target: [determination_rates.determination_id, determination_rates.classification_name],
            set: { base_rate: num(row.base_rate), fringe_rate: num(row.fringe_rate) },
          })
        inserted += 1
      } catch (e) {
        errors.push({ row: rowNum, error: e instanceof Error ? e.message : String(e) })
      }
    }

    const [job] = await db
      .insert(import_jobs)
      .values({
        user_id: userId,
        project_id: det.project_id,
        import_type: 'determination',
        status: errors.length > 0 && inserted === 0 ? 'failed' : 'completed',
        total_rows: rows.length,
        inserted_rows: inserted,
        errors,
      })
      .returning()

    await db.insert(activity_log).values({
      user_id: userId,
      entity_type: 'import_job',
      entity_id: job.id,
      action: 'created',
      detail: { import_type: 'determination', inserted, total: rows.length },
    })

    return c.json(job, 201)
  },
)

// ---------------------------------------------------------------------------
// POST /seed-sample — provision demo company/project/determination/roster/
// ledger with intentional violations so the prover surfaces real findings.
// ---------------------------------------------------------------------------
router.post('/seed-sample', authMiddleware, async (c) => {
  const userId = getUserId(c)

  // Company of record.
  const [company] = await db
    .insert(companies)
    .values({
      user_id: userId,
      legal_name: 'Demo Builders LLC',
      fein: '12-3456789',
      address: '100 Construction Way',
      city: 'Denver',
      state: 'CO',
      zip: '80202',
      signatory_name: 'Pat Foreman',
      signatory_title: 'Payroll Officer',
      ot_rule_set: 'federal',
      rate_tolerance_cents: 0,
    })
    .returning()

  // Covered project.
  const today = new Date()
  const start = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const end = new Date(today.getTime() + 60 * 86_400_000).toISOString().slice(0, 10)
  const [project] = await db
    .insert(projects)
    .values({
      user_id: userId,
      company_id: company.id,
      name: 'Riverside Bridge Rehab',
      awarding_agency: 'CO Dept. of Transportation',
      contract_number: 'CDOT-2026-0042',
      role: 'prime',
      county: 'Denver',
      state: 'CO',
      coverage: 'federal',
      contract_value_cents: 2_500_000_00,
      labor_budget_cents: 900_000_00,
      status: 'active',
      filing_cadence: 'weekly',
      start_date: start,
      end_date: end,
      crafts: ['Laborer', 'Carpenter', 'Electrician'],
    })
    .returning()

  // Active wage determination + per-classification rates.
  const [det] = await db
    .insert(wage_determinations)
    .values({
      user_id: userId,
      project_id: project.id,
      wd_number: 'CO20260012',
      modification_number: '3',
      decision_date: start,
      effective_date: start,
      locality: 'Denver County',
      county: 'Denver',
      state: 'CO',
      schedule_type: 'highway',
      source: 'survey',
      is_active: true,
    })
    .returning()

  const rateRows = [
    { classification_name: 'Laborer', base_rate: 28.5, fringe_rate: 12.25 },
    { classification_name: 'Carpenter', base_rate: 34.75, fringe_rate: 15.5 },
    { classification_name: 'Electrician', base_rate: 41.0, fringe_rate: 18.0 },
  ]
  for (const r of rateRows) {
    await db.insert(determination_rates).values({ determination_id: det.id, ...r })
  }

  // Roster: one journeyworker per craft + one apprentice.
  const workerDefs = [
    { full_name: 'Alex Rivera', default_classification: 'Laborer', is_apprentice: false },
    { full_name: 'Jordan Smith', default_classification: 'Carpenter', is_apprentice: false },
    { full_name: 'Casey Nguyen', default_classification: 'Electrician', is_apprentice: false },
    { full_name: 'Taylor Brooks', default_classification: 'Carpenter', is_apprentice: true },
  ]
  const createdWorkers = []
  for (let i = 0; i < workerDefs.length; i++) {
    const def = workerDefs[i]
    const [w] = await db
      .insert(workers)
      .values({
        user_id: userId,
        full_name: def.full_name,
        ssn_last4: String(1000 + i).slice(-4),
        employee_id: `EMP-${100 + i}`,
        default_classification: def.default_classification,
        is_apprentice: def.is_apprentice,
        is_active: true,
      })
      .returning()
    createdWorkers.push(w)
  }

  // One payroll week ending last Saturday.
  const lastSat = new Date(today)
  lastSat.setUTCDate(lastSat.getUTCDate() - ((lastSat.getUTCDay() + 1) % 7))
  const weekEnding = lastSat.toISOString().slice(0, 10)
  const workDate = weekEnding

  // Intentional violations woven in:
  //  - Alex (Laborer): underpaid base (25.00 vs 28.50) -> rate shortfall
  //  - Jordan (Carpenter): fringe shortfall (10.00 vs 15.50)
  //  - Casey (Electrician): overtime hours but no OT premium hint (paid straight rate)
  //  - Taylor (apprentice Carpenter): correctly paid apprentice scale
  const ledger = [
    {
      worker: createdWorkers[0],
      classification_name: 'Laborer',
      straight_hours: 40,
      overtime_hours: 0,
      base_rate_paid: 25.0, // BELOW determination 28.50 -> violation
      fringe_cash_paid: 12.25,
      is_apprentice: false,
    },
    {
      worker: createdWorkers[1],
      classification_name: 'Carpenter',
      straight_hours: 40,
      overtime_hours: 4,
      base_rate_paid: 34.75,
      fringe_cash_paid: 10.0, // BELOW determination fringe 15.50 -> violation
      is_apprentice: false,
    },
    {
      worker: createdWorkers[2],
      classification_name: 'Electrician',
      straight_hours: 40,
      overtime_hours: 8,
      base_rate_paid: 41.0,
      fringe_cash_paid: 18.0,
      is_apprentice: false,
    },
    {
      worker: createdWorkers[3],
      classification_name: 'Carpenter',
      straight_hours: 40,
      overtime_hours: 0,
      base_rate_paid: 24.3, // ~70% of journeyworker 34.75 apprentice scale
      fringe_cash_paid: 15.5,
      is_apprentice: true,
    },
  ]

  let ledgerInserted = 0
  for (const line of ledger) {
    const gross =
      line.straight_hours * line.base_rate_paid +
      line.overtime_hours * line.base_rate_paid * 1.5 +
      (line.straight_hours + line.overtime_hours) * line.fringe_cash_paid
    await db.insert(payroll_lines).values({
      user_id: userId,
      project_id: project.id,
      worker_id: line.worker.id,
      determination_id: det.id,
      work_date: workDate,
      week_ending: weekEnding,
      classification_name: line.classification_name,
      straight_hours: line.straight_hours,
      overtime_hours: line.overtime_hours,
      doubletime_hours: 0,
      base_rate_paid: line.base_rate_paid,
      fringe_cash_paid: line.fringe_cash_paid,
      fringe_plan_paid: 0,
      gross_paid: Math.round(gross * 100) / 100,
      is_apprentice: line.is_apprentice,
    })
    ledgerInserted += 1
  }

  await db.insert(import_jobs).values({
    user_id: userId,
    project_id: project.id,
    import_type: 'payroll',
    status: 'completed',
    total_rows: ledgerInserted,
    inserted_rows: ledgerInserted,
    errors: [],
  })

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'project',
    entity_id: project.id,
    action: 'created',
    detail: { source: 'seed-sample', workers: createdWorkers.length, lines: ledgerInserted },
  })

  return c.json({
    company,
    project,
    summary: {
      determination_id: det.id,
      rates: rateRows.length,
      workers: createdWorkers.length,
      payroll_lines: ledgerInserted,
      week_ending: weekEnding,
      intentional_violations: ['rate shortfall (Laborer)', 'fringe shortfall (Carpenter)'],
    },
  })
})

export default router

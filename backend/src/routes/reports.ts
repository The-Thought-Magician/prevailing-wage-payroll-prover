import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  payroll_lines,
  determination_rates,
  wage_determinations,
  restitution_worksheets,
  restitution_items,
  projects,
  validation_findings,
} from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

const router = new Hono()

// ---------------------------------------------------------------------------
// Reports & analytics — all public reads, scoped to a project when ?project_id=
// ---------------------------------------------------------------------------

function projectFilter(projectId: string | undefined) {
  return projectId ? eq(payroll_lines.project_id, projectId) : undefined
}

// GET /labor-by-classification — labor cost grouped by classification
// Aggregates hours and dollars across the payroll ledger per classification.
router.get('/labor-by-classification', async (c) => {
  const projectId = c.req.query('project_id') || undefined
  const where = projectFilter(projectId)
  const lines = where
    ? await db.select().from(payroll_lines).where(where)
    : await db.select().from(payroll_lines)

  const byClass = new Map<
    string,
    {
      classification_name: string
      worker_ids: Set<string>
      line_count: number
      straight_hours: number
      overtime_hours: number
      doubletime_hours: number
      total_hours: number
      base_paid: number
      fringe_cash_paid: number
      fringe_plan_paid: number
      gross_paid: number
    }
  >()

  for (const l of lines) {
    const key = l.classification_name
    let row = byClass.get(key)
    if (!row) {
      row = {
        classification_name: key,
        worker_ids: new Set<string>(),
        line_count: 0,
        straight_hours: 0,
        overtime_hours: 0,
        doubletime_hours: 0,
        total_hours: 0,
        base_paid: 0,
        fringe_cash_paid: 0,
        fringe_plan_paid: 0,
        gross_paid: 0,
      }
      byClass.set(key, row)
    }
    const straight = l.straight_hours ?? 0
    const ot = l.overtime_hours ?? 0
    const dt = l.doubletime_hours ?? 0
    const hours = straight + ot + dt
    row.worker_ids.add(l.worker_id)
    row.line_count += 1
    row.straight_hours += straight
    row.overtime_hours += ot
    row.doubletime_hours += dt
    row.total_hours += hours
    row.base_paid += (l.base_rate_paid ?? 0) * hours
    row.fringe_cash_paid += (l.fringe_cash_paid ?? 0) * hours
    row.fringe_plan_paid += (l.fringe_plan_paid ?? 0) * hours
    row.gross_paid += l.gross_paid ?? 0
  }

  const rows = Array.from(byClass.values())
    .map((r) => ({
      classification_name: r.classification_name,
      worker_count: r.worker_ids.size,
      line_count: r.line_count,
      straight_hours: r.straight_hours,
      overtime_hours: r.overtime_hours,
      doubletime_hours: r.doubletime_hours,
      total_hours: r.total_hours,
      base_paid: r.base_paid,
      fringe_cash_paid: r.fringe_cash_paid,
      fringe_plan_paid: r.fringe_plan_paid,
      gross_paid: r.gross_paid,
    }))
    .sort((a, b) => b.gross_paid - a.gross_paid)

  return c.json(rows)
})

// GET /fringe-cash-vs-plan — fringe split report (cash vs bona-fide plan)
// Compares fringe paid as cash against plan contributions per classification,
// and against the required fringe rate from the active determination rates.
router.get('/fringe-cash-vs-plan', async (c) => {
  const projectId = c.req.query('project_id') || undefined
  const where = projectFilter(projectId)
  const lines = where
    ? await db.select().from(payroll_lines).where(where)
    : await db.select().from(payroll_lines)

  // Build a lookup of required fringe rate by (determination_id, classification).
  const rateRows = await db.select().from(determination_rates)
  const requiredFringe = new Map<string, number>()
  for (const r of rateRows) {
    requiredFringe.set(`${r.determination_id}::${r.classification_name}`, r.fringe_rate ?? 0)
  }

  const byClass = new Map<
    string,
    {
      classification_name: string
      total_hours: number
      fringe_cash_paid: number
      fringe_plan_paid: number
      required_fringe: number
    }
  >()

  for (const l of lines) {
    const key = l.classification_name
    let row = byClass.get(key)
    if (!row) {
      row = {
        classification_name: key,
        total_hours: 0,
        fringe_cash_paid: 0,
        fringe_plan_paid: 0,
        required_fringe: 0,
      }
      byClass.set(key, row)
    }
    const hours = (l.straight_hours ?? 0) + (l.overtime_hours ?? 0) + (l.doubletime_hours ?? 0)
    const reqRate = l.determination_id
      ? requiredFringe.get(`${l.determination_id}::${l.classification_name}`) ?? 0
      : 0
    row.total_hours += hours
    row.fringe_cash_paid += (l.fringe_cash_paid ?? 0) * hours
    row.fringe_plan_paid += (l.fringe_plan_paid ?? 0) * hours
    row.required_fringe += reqRate * hours
  }

  const rows = Array.from(byClass.values())
    .map((r) => {
      const total_fringe_paid = r.fringe_cash_paid + r.fringe_plan_paid
      const cash_pct = total_fringe_paid > 0 ? r.fringe_cash_paid / total_fringe_paid : 0
      const plan_pct = total_fringe_paid > 0 ? r.fringe_plan_paid / total_fringe_paid : 0
      const shortfall = Math.max(0, r.required_fringe - total_fringe_paid)
      return {
        classification_name: r.classification_name,
        total_hours: r.total_hours,
        fringe_cash_paid: r.fringe_cash_paid,
        fringe_plan_paid: r.fringe_plan_paid,
        total_fringe_paid,
        required_fringe: r.required_fringe,
        cash_pct,
        plan_pct,
        fringe_shortfall: shortfall,
      }
    })
    .sort((a, b) => b.total_fringe_paid - a.total_fringe_paid)

  return c.json(rows)
})

// GET /apprentice-utilization — apprentice vs journeyworker utilization
// Per classification, splits hours/workers between apprentices and
// journeyworkers and computes the apprentice ratio.
router.get('/apprentice-utilization', async (c) => {
  const projectId = c.req.query('project_id') || undefined
  const where = projectFilter(projectId)
  const lines = where
    ? await db.select().from(payroll_lines).where(where)
    : await db.select().from(payroll_lines)

  const byClass = new Map<
    string,
    {
      classification_name: string
      apprentice_hours: number
      journeyworker_hours: number
      apprentice_workers: Set<string>
      journeyworker_workers: Set<string>
    }
  >()

  for (const l of lines) {
    const key = l.classification_name
    let row = byClass.get(key)
    if (!row) {
      row = {
        classification_name: key,
        apprentice_hours: 0,
        journeyworker_hours: 0,
        apprentice_workers: new Set<string>(),
        journeyworker_workers: new Set<string>(),
      }
      byClass.set(key, row)
    }
    const hours = (l.straight_hours ?? 0) + (l.overtime_hours ?? 0) + (l.doubletime_hours ?? 0)
    if (l.is_apprentice) {
      row.apprentice_hours += hours
      row.apprentice_workers.add(l.worker_id)
    } else {
      row.journeyworker_hours += hours
      row.journeyworker_workers.add(l.worker_id)
    }
  }

  const rows = Array.from(byClass.values())
    .map((r) => {
      const total_hours = r.apprentice_hours + r.journeyworker_hours
      const apprentice_ratio =
        r.journeyworker_hours > 0 ? r.apprentice_hours / r.journeyworker_hours : 0
      const apprentice_hours_pct = total_hours > 0 ? r.apprentice_hours / total_hours : 0
      return {
        classification_name: r.classification_name,
        apprentice_hours: r.apprentice_hours,
        journeyworker_hours: r.journeyworker_hours,
        total_hours,
        apprentice_worker_count: r.apprentice_workers.size,
        journeyworker_worker_count: r.journeyworker_workers.size,
        apprentice_ratio,
        apprentice_hours_pct,
      }
    })
    .sort((a, b) => b.total_hours - a.total_hours)

  return c.json(rows)
})

// GET /restitution-exposure — outstanding restitution exposure
// Sums unpaid restitution exposure per project from worksheets/items, with a
// fallback to open-finding shortfall when a project has no worksheet yet.
router.get('/restitution-exposure', async (c) => {
  const projectId = c.req.query('project_id') || undefined

  const projectRows = projectId
    ? await db.select().from(projects).where(eq(projects.id, projectId))
    : await db.select().from(projects)

  const worksheetRows = projectId
    ? await db
        .select()
        .from(restitution_worksheets)
        .where(eq(restitution_worksheets.project_id, projectId))
    : await db.select().from(restitution_worksheets)

  const itemRows = await db.select().from(restitution_items)
  const itemsByWorksheet = new Map<string, typeof itemRows>()
  for (const it of itemRows) {
    const arr = itemsByWorksheet.get(it.worksheet_id) ?? []
    arr.push(it)
    itemsByWorksheet.set(it.worksheet_id, arr)
  }

  const findingRows = projectId
    ? await db
        .select()
        .from(validation_findings)
        .where(eq(validation_findings.project_id, projectId))
    : await db.select().from(validation_findings)

  const rows = projectRows
    .map((p) => {
      const sheets = worksheetRows.filter((w) => w.project_id === p.id)
      let total_owed = 0
      let outstanding = 0
      let paid = 0
      let worker_ids = new Set<string>()
      let open_worksheets = 0
      for (const w of sheets) {
        if (w.status !== 'paid') open_worksheets += 1
        const items = itemsByWorksheet.get(w.id) ?? []
        for (const it of items) {
          total_owed += it.total_shortfall ?? 0
          worker_ids.add(it.worker_id)
          if (it.paid) paid += it.total_shortfall ?? 0
          else outstanding += it.total_shortfall ?? 0
        }
      }

      // Fallback exposure from open findings not yet on a worksheet.
      const open_finding_shortfall = findingRows
        .filter((f) => f.project_id === p.id && (f.status === 'open' || f.status === 'acknowledged'))
        .reduce((sum, f) => sum + (f.shortfall ?? 0), 0)

      return {
        project_id: p.id,
        project_name: p.name,
        worksheet_count: sheets.length,
        open_worksheets,
        worker_count: worker_ids.size,
        total_owed,
        paid,
        outstanding,
        open_finding_shortfall,
        total_exposure: outstanding + open_finding_shortfall,
      }
    })
    .sort((a, b) => b.total_exposure - a.total_exposure)

  return c.json(rows)
})

export default router

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  wh347_payrolls,
  compliance_signatures,
  payroll_lines,
  workers,
  projects,
  activity_log,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const generateSchema = z.object({
  project_id: z.string().min(1),
  week_ending: z.string().min(1),
  fringe_method: z.enum(['4a', '4b', 'exception']).optional().default('4a'),
  is_final: z.boolean().optional().default(false),
})

interface Wh347Line {
  worker_id: string
  worker_name: string
  ssn_last4: string | null
  classification_name: string
  is_apprentice: boolean
  straight_hours: number
  overtime_hours: number
  doubletime_hours: number
  total_hours: number
  base_rate_paid: number
  fringe_cash_paid: number
  fringe_plan_paid: number
  gross_paid: number
}

// Public: list WH-347 documents, optional ?project_id=
router.get('/', async (c) => {
  const projectId = c.req.query('project_id')
  const rows = await db
    .select()
    .from(wh347_payrolls)
    .where(projectId ? eq(wh347_payrolls.project_id, projectId) : undefined)
    .orderBy(desc(wh347_payrolls.created_at))
  return c.json(rows)
})

// Public: full WH-347 document (lines + totals + signature if signed)
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [doc] = await db.select().from(wh347_payrolls).where(eq(wh347_payrolls.id, id))
  if (!doc) return c.json({ error: 'Not found' }, 404)
  const [signature] = await db
    .select()
    .from(compliance_signatures)
    .where(eq(compliance_signatures.wh347_id, id))
    .orderBy(desc(compliance_signatures.signed_at))
  return c.json({ ...doc, signature: signature ?? null })
})

// Auth: generate WH-347 from the ledger for a project+week
router.post('/generate', authMiddleware, zValidator('json', generateSchema), async (c) => {
  const userId = getUserId(c)
  const { project_id, week_ending, fringe_method, is_final } = c.req.valid('json')

  const [project] = await db.select().from(projects).where(eq(projects.id, project_id))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (project.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // Pull the week of payroll lines for this project.
  const lines = await db
    .select()
    .from(payroll_lines)
    .where(
      and(
        eq(payroll_lines.project_id, project_id),
        eq(payroll_lines.week_ending, week_ending),
      ),
    )

  // Roster lookup for worker names / ssn.
  const workerIds = Array.from(new Set(lines.map((l) => l.worker_id)))
  const roster = new Map<string, { full_name: string; ssn_last4: string | null }>()
  for (const wid of workerIds) {
    const [w] = await db.select().from(workers).where(eq(workers.id, wid))
    if (w) roster.set(wid, { full_name: w.full_name, ssn_last4: w.ssn_last4 })
  }

  // Aggregate per worker + classification into WH-347 rows.
  const grouped = new Map<string, Wh347Line>()
  for (const l of lines) {
    const key = `${l.worker_id}::${l.classification_name}::${l.is_apprentice}`
    let row = grouped.get(key)
    if (!row) {
      const w = roster.get(l.worker_id)
      row = {
        worker_id: l.worker_id,
        worker_name: w?.full_name ?? 'Unknown',
        ssn_last4: w?.ssn_last4 ?? null,
        classification_name: l.classification_name,
        is_apprentice: l.is_apprentice,
        straight_hours: 0,
        overtime_hours: 0,
        doubletime_hours: 0,
        total_hours: 0,
        base_rate_paid: l.base_rate_paid,
        fringe_cash_paid: l.fringe_cash_paid,
        fringe_plan_paid: l.fringe_plan_paid,
        gross_paid: 0,
      }
      grouped.set(key, row)
    }
    row.straight_hours += l.straight_hours
    row.overtime_hours += l.overtime_hours
    row.doubletime_hours += l.doubletime_hours
    row.total_hours += l.straight_hours + l.overtime_hours + l.doubletime_hours
    row.gross_paid += l.gross_paid
  }

  const wh347Lines = Array.from(grouped.values())
  const totals = {
    worker_count: new Set(wh347Lines.map((r) => r.worker_id)).size,
    line_count: wh347Lines.length,
    straight_hours: round2(wh347Lines.reduce((s, r) => s + r.straight_hours, 0)),
    overtime_hours: round2(wh347Lines.reduce((s, r) => s + r.overtime_hours, 0)),
    doubletime_hours: round2(wh347Lines.reduce((s, r) => s + r.doubletime_hours, 0)),
    total_hours: round2(wh347Lines.reduce((s, r) => s + r.total_hours, 0)),
    gross_paid: round2(wh347Lines.reduce((s, r) => s + r.gross_paid, 0)),
  }

  // Next payroll_number for this project+week (handles re-generation of additional payrolls).
  const existing = await db
    .select()
    .from(wh347_payrolls)
    .where(
      and(
        eq(wh347_payrolls.project_id, project_id),
        eq(wh347_payrolls.week_ending, week_ending),
      ),
    )
    .orderBy(desc(wh347_payrolls.payroll_number))
  const nextNumber = existing.length ? (existing[0].payroll_number ?? 0) + 1 : 1

  const [doc] = await db
    .insert(wh347_payrolls)
    .values({
      user_id: userId,
      project_id,
      week_ending,
      payroll_number: nextNumber,
      is_final,
      status: 'draft',
      fringe_method,
      lines: wh347Lines as unknown as Record<string, unknown>[],
      totals: totals as unknown as Record<string, unknown>,
    })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'wh347',
    entity_id: doc.id,
    action: 'created',
    detail: { project_id, week_ending, payroll_number: nextNumber, line_count: wh347Lines.length },
  })

  return c.json(doc, 201)
})

// Auth + owner: delete a draft WH-347 (blocked when signed)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [doc] = await db.select().from(wh347_payrolls).where(eq(wh347_payrolls.id, id))
  if (!doc) return c.json({ error: 'Not found' }, 404)
  if (doc.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  if (doc.status === 'signed') {
    return c.json({ error: 'Cannot delete a signed WH-347; reopen it first' }, 409)
  }

  // Remove any attached signatures (e.g. from a prior reopened cycle) before deleting.
  await db.delete(compliance_signatures).where(eq(compliance_signatures.wh347_id, id))
  await db.delete(wh347_payrolls).where(eq(wh347_payrolls.id, id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'wh347',
    entity_id: id,
    action: 'deleted',
    detail: { project_id: doc.project_id, week_ending: doc.week_ending },
  })

  return c.json({ success: true })
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export default router

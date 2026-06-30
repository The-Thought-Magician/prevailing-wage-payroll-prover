import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { payroll_lines, projects, workers, activity_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const lineSchema = z.object({
  project_id: z.string().min(1),
  worker_id: z.string().min(1),
  determination_id: z.string().optional().nullable(),
  work_date: z.string().min(1),
  week_ending: z.string().min(1),
  classification_name: z.string().min(1),
  straight_hours: z.number().min(0).optional().default(0),
  overtime_hours: z.number().min(0).optional().default(0),
  doubletime_hours: z.number().min(0).optional().default(0),
  base_rate_paid: z.number().min(0).optional().default(0),
  fringe_cash_paid: z.number().min(0).optional().default(0),
  fringe_plan_paid: z.number().min(0).optional().default(0),
  gross_paid: z.number().min(0).optional().default(0),
  is_apprentice: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
})

function computeGross(l: {
  straight_hours: number
  overtime_hours: number
  doubletime_hours: number
  base_rate_paid: number
  fringe_cash_paid: number
}): number {
  // straight + 1.5x OT + 2x DT on base, plus fringe cash on all hours
  const hours = l.straight_hours + l.overtime_hours + l.doubletime_hours
  const base =
    l.straight_hours * l.base_rate_paid +
    l.overtime_hours * l.base_rate_paid * 1.5 +
    l.doubletime_hours * l.base_rate_paid * 2
  return Math.round((base + l.fringe_cash_paid * hours) * 100) / 100
}

// Public: list lines with filters
router.get('/', async (c) => {
  const projectId = c.req.query('project_id')
  const weekEnding = c.req.query('week_ending')
  const workerId = c.req.query('worker_id')
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')

  const conds = []
  if (userId) conds.push(eq(payroll_lines.user_id, userId))
  if (projectId) conds.push(eq(payroll_lines.project_id, projectId))
  if (weekEnding) conds.push(eq(payroll_lines.week_ending, weekEnding))
  if (workerId) conds.push(eq(payroll_lines.worker_id, workerId))

  const rows = await db
    .select()
    .from(payroll_lines)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(payroll_lines.work_date))
  return c.json(rows)
})

// Public: line detail
router.get('/:id', async (c) => {
  const [line] = await db.select().from(payroll_lines).where(eq(payroll_lines.id, c.req.param('id')))
  if (!line) return c.json({ error: 'Not found' }, 404)
  return c.json(line)
})

// Auth: create line
router.post('/', authMiddleware, zValidator('json', lineSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const gross = body.gross_paid && body.gross_paid > 0 ? body.gross_paid : computeGross(body)
  const [line] = await db
    .insert(payroll_lines)
    .values({
      user_id: userId,
      project_id: body.project_id,
      worker_id: body.worker_id,
      determination_id: body.determination_id ?? null,
      work_date: body.work_date,
      week_ending: body.week_ending,
      classification_name: body.classification_name,
      straight_hours: body.straight_hours,
      overtime_hours: body.overtime_hours,
      doubletime_hours: body.doubletime_hours,
      base_rate_paid: body.base_rate_paid,
      fringe_cash_paid: body.fringe_cash_paid,
      fringe_plan_paid: body.fringe_plan_paid,
      gross_paid: gross,
      is_apprentice: body.is_apprentice,
      notes: body.notes ?? null,
    })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'payroll_line',
    entity_id: line.id,
    action: 'created',
    detail: { project_id: line.project_id, worker_id: line.worker_id, work_date: line.work_date },
  })
  return c.json(line, 201)
})

// Auth: bulk create week of lines
router.post(
  '/bulk',
  authMiddleware,
  zValidator('json', z.object({ lines: z.array(lineSchema).min(1) })),
  async (c) => {
    const userId = getUserId(c)
    const { lines } = c.req.valid('json')
    const values = lines.map((body) => ({
      user_id: userId,
      project_id: body.project_id,
      worker_id: body.worker_id,
      determination_id: body.determination_id ?? null,
      work_date: body.work_date,
      week_ending: body.week_ending,
      classification_name: body.classification_name,
      straight_hours: body.straight_hours,
      overtime_hours: body.overtime_hours,
      doubletime_hours: body.doubletime_hours,
      base_rate_paid: body.base_rate_paid,
      fringe_cash_paid: body.fringe_cash_paid,
      fringe_plan_paid: body.fringe_plan_paid,
      gross_paid: body.gross_paid && body.gross_paid > 0 ? body.gross_paid : computeGross(body),
      is_apprentice: body.is_apprentice,
      notes: body.notes ?? null,
    }))
    const inserted = await db.insert(payroll_lines).values(values).returning()
    await db.insert(activity_log).values({
      user_id: userId,
      entity_type: 'payroll_line',
      entity_id: null,
      action: 'created',
      detail: { bulk: true, count: inserted.length },
    })
    return c.json({ inserted: inserted.length, lines: inserted }, 201)
  },
)

// Auth: clone a week's lines to a new week_ending
router.post(
  '/clone-week',
  authMiddleware,
  zValidator(
    'json',
    z.object({
      project_id: z.string().min(1),
      from_week_ending: z.string().min(1),
      to_week_ending: z.string().min(1),
      day_offset: z.number().int().optional().default(7),
    }),
  ),
  async (c) => {
    const userId = getUserId(c)
    const { project_id, from_week_ending, to_week_ending, day_offset } = c.req.valid('json')
    const source = await db
      .select()
      .from(payroll_lines)
      .where(
        and(
          eq(payroll_lines.user_id, userId),
          eq(payroll_lines.project_id, project_id),
          eq(payroll_lines.week_ending, from_week_ending),
        ),
      )
    if (source.length === 0) return c.json({ inserted: 0, lines: [] })

    const shiftDate = (iso: string): string => {
      const d = new Date(iso + 'T00:00:00Z')
      if (Number.isNaN(d.getTime())) return iso
      d.setUTCDate(d.getUTCDate() + day_offset)
      return d.toISOString().slice(0, 10)
    }

    const values = source.map((l) => ({
      user_id: userId,
      project_id: l.project_id,
      worker_id: l.worker_id,
      determination_id: l.determination_id,
      work_date: shiftDate(l.work_date),
      week_ending: to_week_ending,
      classification_name: l.classification_name,
      straight_hours: l.straight_hours,
      overtime_hours: l.overtime_hours,
      doubletime_hours: l.doubletime_hours,
      base_rate_paid: l.base_rate_paid,
      fringe_cash_paid: l.fringe_cash_paid,
      fringe_plan_paid: l.fringe_plan_paid,
      gross_paid: l.gross_paid,
      is_apprentice: l.is_apprentice,
      notes: l.notes,
    }))
    const inserted = await db.insert(payroll_lines).values(values).returning()
    await db.insert(activity_log).values({
      user_id: userId,
      entity_type: 'payroll_line',
      entity_id: project_id,
      action: 'created',
      detail: { clone_week: true, from: from_week_ending, to: to_week_ending, count: inserted.length },
    })
    return c.json({ inserted: inserted.length }, 201)
  },
)

// Auth + owner: update line
router.put('/:id', authMiddleware, zValidator('json', lineSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(payroll_lines).where(eq(payroll_lines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  const merged = {
    straight_hours: body.straight_hours ?? existing.straight_hours,
    overtime_hours: body.overtime_hours ?? existing.overtime_hours,
    doubletime_hours: body.doubletime_hours ?? existing.doubletime_hours,
    base_rate_paid: body.base_rate_paid ?? existing.base_rate_paid,
    fringe_cash_paid: body.fringe_cash_paid ?? existing.fringe_cash_paid,
  }
  const recomputedGross =
    body.gross_paid !== undefined && body.gross_paid > 0 ? body.gross_paid : computeGross(merged)

  const [updated] = await db
    .update(payroll_lines)
    .set({
      ...body,
      determination_id: body.determination_id === undefined ? existing.determination_id : body.determination_id ?? null,
      notes: body.notes === undefined ? existing.notes : body.notes ?? null,
      gross_paid: recomputedGross,
      updated_at: new Date(),
    })
    .where(eq(payroll_lines.id, id))
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'payroll_line',
    entity_id: id,
    action: 'updated',
    detail: {},
  })
  return c.json(updated)
})

// Auth + owner: delete line
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(payroll_lines).where(eq(payroll_lines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(payroll_lines).where(eq(payroll_lines.id, id))
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'payroll_line',
    entity_id: id,
    action: 'deleted',
    detail: {},
  })
  return c.json({ success: true })
})

export default router

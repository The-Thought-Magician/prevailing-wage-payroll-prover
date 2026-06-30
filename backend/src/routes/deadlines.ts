import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { filing_deadlines, projects, activity_log } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Add N days to an ISO date (YYYY-MM-DD) and return an ISO date string.
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Roll a date forward to the next occurrence of a given weekday (0=Sun..6=Sat).
function nextWeekday(iso: string, weekday: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  const cur = d.getUTCDay()
  const delta = (weekday - cur + 7) % 7
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

const generateSchema = z.object({
  project_id: z.string().min(1),
  start_date: z.string().min(1).optional(),
  end_date: z.string().min(1).optional(),
  // weekday the payroll week ends on; default Saturday (6) per Davis-Bacon norm
  week_ending_weekday: z.number().int().min(0).max(6).optional().default(6),
  // statutory filing window: certified payroll due within N days of week-ending
  due_offset_days: z.number().int().min(1).max(30).optional().default(7),
})

const updateSchema = z.object({
  filed: z.boolean().optional(),
  due_date: z.string().min(1).optional(),
})

// ---------------------------------------------------------------------------
// GET / — list filing deadlines (optional ?project_id=)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const projectId = c.req.query('project_id')
  const rows = projectId
    ? await db
        .select()
        .from(filing_deadlines)
        .where(eq(filing_deadlines.project_id, projectId))
        .orderBy(desc(filing_deadlines.week_ending))
    : await db.select().from(filing_deadlines).orderBy(desc(filing_deadlines.week_ending))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /generate — generate weekly deadlines across a project's date range
// ---------------------------------------------------------------------------
router.post('/generate', authMiddleware, zValidator('json', generateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [project] = await db.select().from(projects).where(eq(projects.id, body.project_id))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (project.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const rangeStart = body.start_date ?? project.start_date
  const rangeEnd = body.end_date ?? project.end_date
  if (!rangeStart || !rangeEnd) {
    return c.json({ error: 'Project has no start/end date; supply start_date and end_date' }, 400)
  }
  const startTs = Date.parse(`${rangeStart}T00:00:00.000Z`)
  const endTs = Date.parse(`${rangeEnd}T00:00:00.000Z`)
  if (Number.isNaN(startTs) || Number.isNaN(endTs) || endTs < startTs) {
    return c.json({ error: 'Invalid date range' }, 400)
  }

  // Walk weekly week-ending dates from the first week-ending on/after start.
  let weekEnding = nextWeekday(rangeStart, body.week_ending_weekday)
  let inserted = 0
  // Hard cap to avoid runaway loops on absurd ranges (~10 years of weeks).
  for (let guard = 0; guard < 520; guard++) {
    if (Date.parse(`${weekEnding}T00:00:00.000Z`) > endTs) break
    const dueDate = addDays(weekEnding, body.due_offset_days)
    // Upsert on (project_id, week_ending) — leave existing filed status intact.
    const result = await db
      .insert(filing_deadlines)
      .values({
        user_id: userId,
        project_id: body.project_id,
        week_ending: weekEnding,
        due_date: dueDate,
      })
      .onConflictDoNothing({ target: [filing_deadlines.project_id, filing_deadlines.week_ending] })
      .returning()
    if (result.length > 0) inserted += 1
    weekEnding = addDays(weekEnding, 7)
  }

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'filing_deadline',
    entity_id: body.project_id,
    action: 'created',
    detail: { inserted, range: { start: rangeStart, end: rangeEnd } },
  })

  return c.json({ inserted })
})

// ---------------------------------------------------------------------------
// PUT /:id — toggle filed (or set filed/due_date explicitly)
// ---------------------------------------------------------------------------
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(filing_deadlines).where(eq(filing_deadlines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // If neither field supplied, toggle the filed flag.
  const nextFiled = body.filed !== undefined ? body.filed : !existing.filed
  const patch: Record<string, unknown> = { filed: nextFiled }
  if (body.due_date !== undefined) patch.due_date = body.due_date

  const [updated] = await db
    .update(filing_deadlines)
    .set(patch)
    .where(eq(filing_deadlines.id, id))
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'filing_deadline',
    entity_id: id,
    action: 'updated',
    detail: { filed: nextFiled },
  })

  return c.json(updated)
})

export default router

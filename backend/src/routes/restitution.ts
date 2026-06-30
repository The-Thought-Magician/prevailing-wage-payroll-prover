import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  restitution_worksheets,
  restitution_items,
  projects,
  validation_findings,
  activity_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// GET / — public — list worksheets (optional ?project_id=)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const projectId = c.req.query('project_id')
  const rows = projectId
    ? await db
        .select()
        .from(restitution_worksheets)
        .where(eq(restitution_worksheets.project_id, projectId))
        .orderBy(desc(restitution_worksheets.created_at))
    : await db
        .select()
        .from(restitution_worksheets)
        .orderBy(desc(restitution_worksheets.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — public — worksheet + items
// ---------------------------------------------------------------------------
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [worksheet] = await db
    .select()
    .from(restitution_worksheets)
    .where(eq(restitution_worksheets.id, id))
  if (!worksheet) return c.json({ error: 'Not found' }, 404)
  const items = await db
    .select()
    .from(restitution_items)
    .where(eq(restitution_items.worksheet_id, id))
    .orderBy(desc(restitution_items.created_at))
  return c.json({ ...worksheet, items })
})

// ---------------------------------------------------------------------------
// POST /generate — auth — build worksheet from findings/shortfalls for
// project+period. Aggregates open findings (and their backing payroll lines)
// by worker, splitting shortfall into base / fringe / overtime buckets.
// ---------------------------------------------------------------------------
const generateSchema = z.object({
  project_id: z.string().min(1),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
})

router.post('/generate', authMiddleware, zValidator('json', generateSchema), async (c) => {
  const userId = getUserId(c)
  const { project_id, period_start, period_end } = c.req.valid('json')

  const [project] = await db.select().from(projects).where(eq(projects.id, project_id))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (project.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // Pull all open/acknowledged findings for the project that carry a shortfall.
  const findings = await db
    .select()
    .from(validation_findings)
    .where(eq(validation_findings.project_id, project_id))

  // week_ending of each finding is bounded by the requested period when present.
  const inPeriod = (week: string | null | undefined): boolean => {
    if (!week) return true
    if (period_start && week < period_start) return false
    if (period_end && week > period_end) return false
    return true
  }

  // Aggregate per worker, bucketed by finding type.
  type Bucket = { base: number; fringe: number; ot: number }
  const perWorker = new Map<string, Bucket>()

  for (const f of findings) {
    if (f.status === 'resolved' || f.status === 'waived') continue
    if (!inPeriod(f.week_ending)) continue
    const shortfall = f.shortfall ?? 0
    if (shortfall <= 0) continue
    const wid = f.worker_id
    if (!wid) continue
    let b = perWorker.get(wid)
    if (!b) {
      b = { base: 0, fringe: 0, ot: 0 }
      perWorker.set(wid, b)
    }
    switch (f.finding_type) {
      case 'fringe':
        b.fringe += shortfall
        break
      case 'overtime':
        b.ot += shortfall
        break
      default:
        // rate / classification / apprentice shortfalls land in the base bucket
        b.base += shortfall
        break
    }
  }

  let totalOwed = 0
  for (const b of perWorker.values()) {
    totalOwed += b.base + b.fringe + b.ot
  }

  const [worksheet] = await db
    .insert(restitution_worksheets)
    .values({
      user_id: userId,
      project_id,
      period_start: period_start ?? null,
      period_end: period_end ?? null,
      status: 'open',
      total_owed: totalOwed,
    })
    .returning()

  const insertedItems = []
  for (const [workerId, b] of perWorker) {
    const total = b.base + b.fringe + b.ot
    const [item] = await db
      .insert(restitution_items)
      .values({
        worksheet_id: worksheet.id,
        worker_id: workerId,
        base_shortfall: b.base,
        fringe_shortfall: b.fringe,
        ot_shortfall: b.ot,
        total_shortfall: total,
        paid: false,
      })
      .returning()
    insertedItems.push(item)
  }

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'restitution_worksheet',
    entity_id: worksheet.id,
    action: 'created',
    detail: { project_id, total_owed: totalOwed, item_count: insertedItems.length },
  })

  return c.json({ ...worksheet, items: insertedItems }, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id/items/:itemId — auth+owner — mark item paid w/ reference
// ---------------------------------------------------------------------------
const markPaidSchema = z.object({
  paid: z.boolean().optional().default(true),
  paid_reference: z.string().optional(),
})

router.put(
  '/:id/items/:itemId',
  authMiddleware,
  zValidator('json', markPaidSchema),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const itemId = c.req.param('itemId')
    const body = c.req.valid('json')

    const [worksheet] = await db
      .select()
      .from(restitution_worksheets)
      .where(eq(restitution_worksheets.id, id))
    if (!worksheet) return c.json({ error: 'Not found' }, 404)
    if (worksheet.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

    const [item] = await db
      .select()
      .from(restitution_items)
      .where(and(eq(restitution_items.id, itemId), eq(restitution_items.worksheet_id, id)))
    if (!item) return c.json({ error: 'Item not found' }, 404)

    const [updated] = await db
      .update(restitution_items)
      .set({
        paid: body.paid,
        paid_reference: body.paid_reference ?? item.paid_reference,
      })
      .where(eq(restitution_items.id, itemId))
      .returning()

    // Recompute worksheet status: paid once every item is paid.
    const allItems = await db
      .select()
      .from(restitution_items)
      .where(eq(restitution_items.worksheet_id, id))
    const allPaid = allItems.length > 0 && allItems.every((i) => i.paid)
    const [refreshed] = await db
      .update(restitution_worksheets)
      .set({ status: allPaid ? 'paid' : 'open', updated_at: new Date() })
      .where(eq(restitution_worksheets.id, id))
      .returning()

    await db.insert(activity_log).values({
      user_id: userId,
      entity_type: 'restitution_item',
      entity_id: itemId,
      action: 'updated',
      detail: { worksheet_id: id, paid: body.paid, paid_reference: body.paid_reference ?? null },
    })

    return c.json({ ...updated, worksheet: refreshed })
  },
)

// ---------------------------------------------------------------------------
// DELETE /:id — auth+owner — delete worksheet (and its items)
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [worksheet] = await db
    .select()
    .from(restitution_worksheets)
    .where(eq(restitution_worksheets.id, id))
  if (!worksheet) return c.json({ error: 'Not found' }, 404)
  if (worksheet.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(restitution_items).where(eq(restitution_items.worksheet_id, id))
  await db.delete(restitution_worksheets).where(eq(restitution_worksheets.id, id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'restitution_worksheet',
    entity_id: id,
    action: 'deleted',
    detail: { project_id: worksheet.project_id },
  })

  return c.json({ success: true })
})

export default router

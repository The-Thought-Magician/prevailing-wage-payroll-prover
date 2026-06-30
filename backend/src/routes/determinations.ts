import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { wage_determinations, determination_rates, activity_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const rateSchema = z.object({
  classification_name: z.string().min(1),
  base_rate: z.number(),
  fringe_rate: z.number().optional().default(0),
})

const determinationSchema = z.object({
  project_id: z.string().optional().nullable(),
  wd_number: z.string().min(1),
  modification_number: z.string().optional().default('0'),
  decision_date: z.string().optional().nullable(),
  effective_date: z.string().optional().nullable(),
  locality: z.string().optional().nullable(),
  county: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  schedule_type: z.string().optional().nullable(),
  source: z.enum(['union', 'survey']).optional().default('union'),
  rates: z.array(rateSchema).optional().default([]),
})

// Public: list determinations (optional ?project_id=)
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([])
  const projectId = c.req.query('project_id')
  const where = projectId
    ? and(eq(wage_determinations.user_id, userId), eq(wage_determinations.project_id, projectId))
    : eq(wage_determinations.user_id, userId)
  const rows = await db
    .select()
    .from(wage_determinations)
    .where(where)
    .orderBy(desc(wage_determinations.created_at))
  return c.json(rows)
})

// Public: determination + nested rates
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [det] = await db.select().from(wage_determinations).where(eq(wage_determinations.id, id))
  if (!det) return c.json({ error: 'Not found' }, 404)
  const rates = await db
    .select()
    .from(determination_rates)
    .where(eq(determination_rates.determination_id, id))
    .orderBy(determination_rates.classification_name)
  return c.json({ ...det, rates })
})

// Auth: create determination (with rates array)
router.post('/', authMiddleware, zValidator('json', determinationSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [det] = await db
    .insert(wage_determinations)
    .values({
      user_id: userId,
      project_id: body.project_id ?? null,
      wd_number: body.wd_number,
      modification_number: body.modification_number ?? '0',
      decision_date: body.decision_date ?? null,
      effective_date: body.effective_date ?? null,
      locality: body.locality ?? null,
      county: body.county ?? null,
      state: body.state ?? null,
      schedule_type: body.schedule_type ?? null,
      source: body.source ?? 'union',
    })
    .returning()
  const rates = body.rates ?? []
  let insertedRates: typeof determination_rates.$inferSelect[] = []
  if (rates.length > 0) {
    insertedRates = await db
      .insert(determination_rates)
      .values(
        rates.map((r) => ({
          determination_id: det.id,
          classification_name: r.classification_name,
          base_rate: r.base_rate,
          fringe_rate: r.fringe_rate ?? 0,
        })),
      )
      .returning()
  }
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'determination',
    entity_id: det.id,
    action: 'created',
    detail: { wd_number: det.wd_number, rate_count: insertedRates.length },
  })
  return c.json({ ...det, rates: insertedRates }, 201)
})

// Auth + owner: update determination
router.put('/:id', authMiddleware, zValidator('json', determinationSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(wage_determinations).where(eq(wage_determinations.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  // Strip rates from the determination update; rates are managed via the rates endpoints.
  const { rates, ...fields } = body
  const [updated] = await db
    .update(wage_determinations)
    .set({ ...fields, updated_at: new Date() })
    .where(eq(wage_determinations.id, id))
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'determination',
    entity_id: id,
    action: 'updated',
    detail: { fields: Object.keys(fields) },
  })
  return c.json(updated)
})

// Auth + owner: add or replace a rate row (upsert on classification_name)
router.post('/:id/rates', authMiddleware, zValidator('json', rateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [det] = await db.select().from(wage_determinations).where(eq(wage_determinations.id, id))
  if (!det) return c.json({ error: 'Not found' }, 404)
  if (det.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [rate] = await db
    .insert(determination_rates)
    .values({
      determination_id: id,
      classification_name: body.classification_name,
      base_rate: body.base_rate,
      fringe_rate: body.fringe_rate ?? 0,
    })
    .onConflictDoUpdate({
      target: [determination_rates.determination_id, determination_rates.classification_name],
      set: { base_rate: body.base_rate, fringe_rate: body.fringe_rate ?? 0 },
    })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'determination',
    entity_id: id,
    action: 'updated',
    detail: { rate: body.classification_name },
  })
  return c.json(rate, 201)
})

// Auth + owner: delete a rate
router.delete('/:id/rates/:rateId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const rateId = c.req.param('rateId')
  const [det] = await db.select().from(wage_determinations).where(eq(wage_determinations.id, id))
  if (!det) return c.json({ error: 'Not found' }, 404)
  if (det.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [rate] = await db
    .select()
    .from(determination_rates)
    .where(and(eq(determination_rates.id, rateId), eq(determination_rates.determination_id, id)))
  if (!rate) return c.json({ error: 'Not found' }, 404)
  await db.delete(determination_rates).where(eq(determination_rates.id, rateId))
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'determination',
    entity_id: id,
    action: 'updated',
    detail: { deleted_rate: rate.classification_name },
  })
  return c.json({ success: true })
})

// Auth + owner: mark superseded (set is_active=false, superseded_by)
router.post(
  '/:id/supersede',
  authMiddleware,
  zValidator('json', z.object({ superseded_by: z.string().optional().nullable() })),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const [existing] = await db
      .select()
      .from(wage_determinations)
      .where(eq(wage_determinations.id, id))
    if (!existing) return c.json({ error: 'Not found' }, 404)
    if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    const body = c.req.valid('json')
    const [updated] = await db
      .update(wage_determinations)
      .set({ is_active: false, superseded_by: body.superseded_by ?? null, updated_at: new Date() })
      .where(eq(wage_determinations.id, id))
      .returning()
    await db.insert(activity_log).values({
      user_id: userId,
      entity_type: 'determination',
      entity_id: id,
      action: 'updated',
      detail: { superseded_by: body.superseded_by ?? null },
    })
    return c.json(updated)
  },
)

// Auth + owner: delete determination (and its rates)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(wage_determinations).where(eq(wage_determinations.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(determination_rates).where(eq(determination_rates.determination_id, id))
  await db.delete(wage_determinations).where(eq(wage_determinations.id, id))
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'determination',
    entity_id: id,
    action: 'deleted',
    detail: { wd_number: existing.wd_number },
  })
  return c.json({ success: true })
})

export default router

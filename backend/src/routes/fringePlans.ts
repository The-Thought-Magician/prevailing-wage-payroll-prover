import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { fringe_plans, activity_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const planSchema = z.object({
  name: z.string().min(1),
  plan_type: z.enum(['health', 'pension', 'vacation', 'training', 'apprenticeship']).optional().default('health'),
  provider: z.string().optional().nullable(),
  contribution_basis: z.enum(['per_hour', 'per_month']).optional().default('per_hour'),
  effective_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
})

// Public: list current-user fringe plans
router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (userId) {
    const rows = await db
      .select()
      .from(fringe_plans)
      .where(eq(fringe_plans.user_id, userId))
      .orderBy(desc(fringe_plans.created_at))
    return c.json(rows)
  }
  const rows = await db.select().from(fringe_plans).orderBy(desc(fringe_plans.created_at))
  return c.json(rows)
})

// Auth: create plan
router.post('/', authMiddleware, zValidator('json', planSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [plan] = await db
    .insert(fringe_plans)
    .values({
      user_id: userId,
      name: body.name,
      plan_type: body.plan_type,
      provider: body.provider ?? null,
      contribution_basis: body.contribution_basis,
      effective_date: body.effective_date ?? null,
      end_date: body.end_date ?? null,
    })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'fringe_plan',
    entity_id: plan.id,
    action: 'created',
    detail: { name: plan.name, plan_type: plan.plan_type },
  })
  return c.json(plan, 201)
})

// Auth + owner: update plan
router.put('/:id', authMiddleware, zValidator('json', planSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(fringe_plans).where(eq(fringe_plans.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(fringe_plans)
    .set({ ...body, updated_at: new Date() })
    .where(eq(fringe_plans.id, id))
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'fringe_plan',
    entity_id: id,
    action: 'updated',
    detail: {},
  })
  return c.json(updated)
})

// Auth + owner: delete plan
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(fringe_plans).where(eq(fringe_plans.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(fringe_plans).where(eq(fringe_plans.id, id))
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'fringe_plan',
    entity_id: id,
    action: 'deleted',
    detail: { name: existing.name },
  })
  return c.json({ success: true })
})

export default router

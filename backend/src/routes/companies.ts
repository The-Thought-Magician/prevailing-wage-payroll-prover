import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { companies, activity_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const companySchema = z.object({
  legal_name: z.string().min(1),
  fein: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  signatory_name: z.string().optional().nullable(),
  signatory_title: z.string().optional().nullable(),
  ot_rule_set: z.string().optional().default('federal'),
  rate_tolerance_cents: z.number().int().min(0).optional().default(0),
})

// Public: list current-user companies
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([])
  const rows = await db
    .select()
    .from(companies)
    .where(eq(companies.user_id, userId))
    .orderBy(desc(companies.created_at))
  return c.json(rows)
})

// Public: get a single company
router.get('/:id', async (c) => {
  const [row] = await db.select().from(companies).where(eq(companies.id, c.req.param('id')))
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// Auth: create a company
router.post('/', authMiddleware, zValidator('json', companySchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [row] = await db
    .insert(companies)
    .values({
      user_id: userId,
      legal_name: body.legal_name,
      fein: body.fein ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      signatory_name: body.signatory_name ?? null,
      signatory_title: body.signatory_title ?? null,
      ot_rule_set: body.ot_rule_set ?? 'federal',
      rate_tolerance_cents: body.rate_tolerance_cents ?? 0,
    })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'company',
    entity_id: row.id,
    action: 'created',
    detail: { legal_name: row.legal_name },
  })
  return c.json(row, 201)
})

// Auth + owner: update a company
router.put('/:id', authMiddleware, zValidator('json', companySchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(companies).where(eq(companies.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(companies)
    .set({ ...body, updated_at: new Date() })
    .where(eq(companies.id, id))
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'company',
    entity_id: id,
    action: 'updated',
    detail: { fields: Object.keys(body) },
  })
  return c.json(updated)
})

// Auth + owner: delete a company
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(companies).where(eq(companies.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(companies).where(eq(companies.id, id))
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'company',
    entity_id: id,
    action: 'deleted',
    detail: { legal_name: existing.legal_name },
  })
  return c.json({ success: true })
})

export default router

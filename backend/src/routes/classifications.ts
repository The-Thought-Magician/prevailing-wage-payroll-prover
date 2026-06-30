import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { classifications, classification_aliases, activity_log } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const classificationSchema = z.object({
  canonical_name: z.string().min(1),
  craft_group: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  apprentice_eligible: z.boolean().optional().default(false),
  journeyworker_classification: z.string().optional().nullable(),
})

const aliasSchema = z.object({
  alias: z.string().min(1),
})

// Attach aliases to a list of classification rows.
async function withAliases(rows: (typeof classifications.$inferSelect)[]) {
  return Promise.all(
    rows.map(async (row) => {
      const aliases = await db
        .select()
        .from(classification_aliases)
        .where(eq(classification_aliases.classification_id, row.id))
        .orderBy(classification_aliases.created_at)
      return { ...row, aliases }
    }),
  )
}

// Public: list classifications with aliases
router.get('/', async (c) => {
  const rows = await db.select().from(classifications).orderBy(desc(classifications.created_at))
  return c.json(await withAliases(rows))
})

// Auth: create classification
router.post('/', authMiddleware, zValidator('json', classificationSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(classifications)
    .values({
      user_id: userId,
      canonical_name: body.canonical_name,
      craft_group: body.craft_group ?? null,
      level: body.level ?? null,
      apprentice_eligible: body.apprentice_eligible ?? false,
      journeyworker_classification: body.journeyworker_classification ?? null,
    })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'classification',
    entity_id: created.id,
    action: 'created',
    detail: { canonical_name: created.canonical_name },
  })
  return c.json({ ...created, aliases: [] }, 201)
})

// Auth + owner: update classification
router.put('/:id', authMiddleware, zValidator('json', classificationSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(classifications).where(eq(classifications.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(classifications)
    .set(body)
    .where(eq(classifications.id, id))
    .returning()
  const aliases = await db
    .select()
    .from(classification_aliases)
    .where(eq(classification_aliases.classification_id, id))
    .orderBy(classification_aliases.created_at)
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'classification',
    entity_id: id,
    action: 'updated',
    detail: { ...body },
  })
  return c.json({ ...updated, aliases })
})

// Auth + owner: add alias
router.post('/:id/aliases', authMiddleware, zValidator('json', aliasSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(classifications).where(eq(classifications.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const { alias } = c.req.valid('json')
  const [dupe] = await db
    .select()
    .from(classification_aliases)
    .where(and(eq(classification_aliases.classification_id, id), eq(classification_aliases.alias, alias)))
  if (dupe) return c.json({ error: 'Alias already exists' }, 409)
  const [created] = await db
    .insert(classification_aliases)
    .values({ classification_id: id, alias })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'classification',
    entity_id: id,
    action: 'updated',
    detail: { alias_added: alias },
  })
  return c.json(created, 201)
})

// Auth + owner: delete alias
router.delete('/:id/aliases/:aliasId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const aliasId = c.req.param('aliasId')
  const [existing] = await db.select().from(classifications).where(eq(classifications.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [alias] = await db
    .select()
    .from(classification_aliases)
    .where(and(eq(classification_aliases.id, aliasId), eq(classification_aliases.classification_id, id)))
  if (!alias) return c.json({ error: 'Alias not found' }, 404)
  await db.delete(classification_aliases).where(eq(classification_aliases.id, aliasId))
  return c.json({ success: true })
})

// Auth + owner: delete classification (cascades aliases)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(classifications).where(eq(classifications.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(classification_aliases).where(eq(classification_aliases.classification_id, id))
  await db.delete(classifications).where(eq(classifications.id, id))
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'classification',
    entity_id: id,
    action: 'deleted',
    detail: { canonical_name: existing.canonical_name },
  })
  return c.json({ success: true })
})

export default router

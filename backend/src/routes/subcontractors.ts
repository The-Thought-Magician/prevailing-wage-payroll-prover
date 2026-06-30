import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { subcontractors, sub_filings, projects, activity_log } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// GET / — public — list subs (optional ?project_id=)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const projectId = c.req.query('project_id')
  const rows = projectId
    ? await db
        .select()
        .from(subcontractors)
        .where(eq(subcontractors.project_id, projectId))
        .orderBy(subcontractors.tier, desc(subcontractors.created_at))
    : await db
        .select()
        .from(subcontractors)
        .orderBy(subcontractors.tier, desc(subcontractors.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST / — auth — create sub
// ---------------------------------------------------------------------------
const subSchema = z.object({
  project_id: z.string().min(1),
  name: z.string().min(1),
  tier: z.number().int().min(1).optional().default(1),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional(),
})

router.post('/', authMiddleware, zValidator('json', subSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [project] = await db.select().from(projects).where(eq(projects.id, body.project_id))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (project.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [sub] = await db
    .insert(subcontractors)
    .values({
      user_id: userId,
      project_id: body.project_id,
      name: body.name,
      tier: body.tier,
      contact_name: body.contact_name ?? null,
      contact_email: body.contact_email ?? null,
    })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'subcontractor',
    entity_id: sub.id,
    action: 'created',
    detail: { project_id: body.project_id, name: body.name, tier: body.tier },
  })

  return c.json(sub, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth+owner — update sub
// ---------------------------------------------------------------------------
const subUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  tier: z.number().int().min(1).optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
})

router.put('/:id', authMiddleware, zValidator('json', subUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(subcontractors).where(eq(subcontractors.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(subcontractors)
    .set({ ...body, updated_at: new Date() })
    .where(eq(subcontractors.id, id))
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'subcontractor',
    entity_id: id,
    action: 'updated',
    detail: { ...body },
  })

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth+owner — delete sub (and its filings)
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(subcontractors).where(eq(subcontractors.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(sub_filings).where(eq(sub_filings.subcontractor_id, id))
  await db.delete(subcontractors).where(eq(subcontractors.id, id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'subcontractor',
    entity_id: id,
    action: 'deleted',
    detail: { project_id: existing.project_id, name: existing.name },
  })

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// GET /:id/filings — public — sub filing weeks
// ---------------------------------------------------------------------------
router.get('/:id/filings', async (c) => {
  const id = c.req.param('id')
  const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, id))
  if (!sub) return c.json({ error: 'Not found' }, 404)
  const filings = await db
    .select()
    .from(sub_filings)
    .where(eq(sub_filings.subcontractor_id, id))
    .orderBy(desc(sub_filings.week_ending))
  return c.json(filings)
})

// ---------------------------------------------------------------------------
// POST /:id/filings — auth+owner — upsert a week filed status
// ---------------------------------------------------------------------------
const filingSchema = z.object({
  week_ending: z.string().min(1),
  filed: z.boolean().optional().default(true),
})

router.post('/:id/filings', authMiddleware, zValidator('json', filingSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, id))
  if (!sub) return c.json({ error: 'Not found' }, 404)
  if (sub.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const filedAt = body.filed ? new Date() : null

  const [filing] = await db
    .insert(sub_filings)
    .values({
      subcontractor_id: id,
      week_ending: body.week_ending,
      filed: body.filed,
      filed_at: filedAt,
    })
    .onConflictDoUpdate({
      target: [sub_filings.subcontractor_id, sub_filings.week_ending],
      set: { filed: body.filed, filed_at: filedAt },
    })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'sub_filing',
    entity_id: filing.id,
    action: 'updated',
    detail: { subcontractor_id: id, week_ending: body.week_ending, filed: body.filed },
  })

  return c.json(filing)
})

export default router

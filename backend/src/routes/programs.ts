import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { apprenticeship_programs, apprenticeship_levels, activity_log } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const programSchema = z.object({
  registration_number: z.string().min(1),
  sponsor: z.string().optional().nullable(),
  trade: z.string().optional().nullable(),
  required_ratio: z.number().positive().optional().default(1),
  effective_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
})

const levelSchema = z.object({
  level_name: z.string().min(1),
  period_number: z.number().int().positive().optional().default(1),
  pct_of_journeyworker: z.number().min(0).max(1),
})

// Fetch levels for a program, ordered by period.
async function levelsFor(programId: string) {
  return db
    .select()
    .from(apprenticeship_levels)
    .where(eq(apprenticeship_levels.program_id, programId))
    .orderBy(apprenticeship_levels.period_number)
}

// Public: list programs with nested levels
router.get('/', async (c) => {
  const rows = await db.select().from(apprenticeship_programs).orderBy(desc(apprenticeship_programs.created_at))
  const out = await Promise.all(
    rows.map(async (row) => ({ ...row, levels: await levelsFor(row.id) })),
  )
  return c.json(out)
})

// Public: program + levels
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [program] = await db.select().from(apprenticeship_programs).where(eq(apprenticeship_programs.id, id))
  if (!program) return c.json({ error: 'Not found' }, 404)
  const levels = await levelsFor(id)
  return c.json({ ...program, levels })
})

// Auth: create program
router.post('/', authMiddleware, zValidator('json', programSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(apprenticeship_programs)
    .values({
      user_id: userId,
      registration_number: body.registration_number,
      sponsor: body.sponsor ?? null,
      trade: body.trade ?? null,
      required_ratio: body.required_ratio ?? 1,
      effective_date: body.effective_date ?? null,
      end_date: body.end_date ?? null,
    })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'program',
    entity_id: created.id,
    action: 'created',
    detail: { registration_number: created.registration_number },
  })
  return c.json({ ...created, levels: [] }, 201)
})

// Auth + owner: update program
router.put('/:id', authMiddleware, zValidator('json', programSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(apprenticeship_programs).where(eq(apprenticeship_programs.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(apprenticeship_programs)
    .set({ ...body, updated_at: new Date() })
    .where(eq(apprenticeship_programs.id, id))
    .returning()
  const levels = await levelsFor(id)
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'program',
    entity_id: id,
    action: 'updated',
    detail: { ...body },
  })
  return c.json({ ...updated, levels })
})

// Auth + owner: add level
router.post('/:id/levels', authMiddleware, zValidator('json', levelSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(apprenticeship_programs).where(eq(apprenticeship_programs.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [dupe] = await db
    .select()
    .from(apprenticeship_levels)
    .where(and(eq(apprenticeship_levels.program_id, id), eq(apprenticeship_levels.period_number, body.period_number)))
  if (dupe) return c.json({ error: 'A level with that period number already exists' }, 409)
  const [created] = await db
    .insert(apprenticeship_levels)
    .values({
      program_id: id,
      level_name: body.level_name,
      period_number: body.period_number,
      pct_of_journeyworker: body.pct_of_journeyworker,
    })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'program',
    entity_id: id,
    action: 'updated',
    detail: { level_added: created.level_name },
  })
  return c.json(created, 201)
})

// Auth + owner: delete level
router.delete('/:id/levels/:levelId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const levelId = c.req.param('levelId')
  const [existing] = await db.select().from(apprenticeship_programs).where(eq(apprenticeship_programs.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [level] = await db
    .select()
    .from(apprenticeship_levels)
    .where(and(eq(apprenticeship_levels.id, levelId), eq(apprenticeship_levels.program_id, id)))
  if (!level) return c.json({ error: 'Level not found' }, 404)
  await db.delete(apprenticeship_levels).where(eq(apprenticeship_levels.id, levelId))
  return c.json({ success: true })
})

// Auth + owner: delete program (cascades levels)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(apprenticeship_programs).where(eq(apprenticeship_programs.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(apprenticeship_levels).where(eq(apprenticeship_levels.program_id, id))
  await db.delete(apprenticeship_programs).where(eq(apprenticeship_programs.id, id))
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'program',
    entity_id: id,
    action: 'deleted',
    detail: { registration_number: existing.registration_number },
  })
  return c.json({ success: true })
})

export default router

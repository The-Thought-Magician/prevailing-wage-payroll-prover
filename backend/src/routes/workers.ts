import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { workers, apprenticeship_programs, apprenticeship_levels, activity_log } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const workerSchema = z.object({
  full_name: z.string().min(1),
  ssn_last4: z.string().max(4).optional().nullable(),
  employee_id: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  ethnicity: z.string().optional().nullable(),
  default_classification: z.string().optional().nullable(),
  is_apprentice: z.boolean().optional().default(false),
  program_id: z.string().optional().nullable(),
  program_level_id: z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
})

// Validate that a program / level belong to the user and are consistent.
async function validateEnrollment(
  userId: string,
  programId: string | null | undefined,
  levelId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (programId) {
    const [program] = await db
      .select()
      .from(apprenticeship_programs)
      .where(eq(apprenticeship_programs.id, programId))
    if (!program) return { ok: false, error: 'Program not found' }
    if (program.user_id !== userId) return { ok: false, error: 'Program not owned by user' }
  }
  if (levelId) {
    const [level] = await db
      .select()
      .from(apprenticeship_levels)
      .where(eq(apprenticeship_levels.id, levelId))
    if (!level) return { ok: false, error: 'Program level not found' }
    if (programId && level.program_id !== programId) {
      return { ok: false, error: 'Level does not belong to the given program' }
    }
  }
  return { ok: true }
}

// Public: list workers
router.get('/', async (c) => {
  const rows = await db.select().from(workers).orderBy(desc(workers.created_at))
  return c.json(rows)
})

// Public: worker detail
router.get('/:id', async (c) => {
  const [w] = await db.select().from(workers).where(eq(workers.id, c.req.param('id')))
  if (!w) return c.json({ error: 'Not found' }, 404)
  return c.json(w)
})

// Auth: create worker
router.post('/', authMiddleware, zValidator('json', workerSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const enrollment = await validateEnrollment(userId, body.program_id, body.program_level_id)
  if (!enrollment.ok) return c.json({ error: enrollment.error }, 400)
  const [created] = await db
    .insert(workers)
    .values({
      user_id: userId,
      full_name: body.full_name,
      ssn_last4: body.ssn_last4 ?? null,
      employee_id: body.employee_id ?? null,
      address: body.address ?? null,
      gender: body.gender ?? null,
      ethnicity: body.ethnicity ?? null,
      default_classification: body.default_classification ?? null,
      is_apprentice: body.is_apprentice ?? false,
      program_id: body.program_id ?? null,
      program_level_id: body.program_level_id ?? null,
      is_active: body.is_active ?? true,
    })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'worker',
    entity_id: created.id,
    action: 'created',
    detail: { full_name: created.full_name },
  })
  return c.json(created, 201)
})

// Auth + owner: update worker
router.put('/:id', authMiddleware, zValidator('json', workerSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(workers).where(eq(workers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const programId = body.program_id !== undefined ? body.program_id : existing.program_id
  const levelId = body.program_level_id !== undefined ? body.program_level_id : existing.program_level_id
  const enrollment = await validateEnrollment(userId, programId, levelId)
  if (!enrollment.ok) return c.json({ error: enrollment.error }, 400)
  const [updated] = await db
    .update(workers)
    .set({ ...body, updated_at: new Date() })
    .where(eq(workers.id, id))
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'worker',
    entity_id: id,
    action: 'updated',
    detail: { ...body },
  })
  return c.json(updated)
})

// Auth + owner: delete worker
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(workers).where(eq(workers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(workers).where(eq(workers.id, id))
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'worker',
    entity_id: id,
    action: 'deleted',
    detail: { full_name: existing.full_name },
  })
  return c.json({ success: true })
})

export default router

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { validation_findings, activity_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const updateSchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved', 'waived']).optional(),
  assignee: z.string().nullable().optional(),
  resolution_notes: z.string().nullable().optional(),
})

const bulkResolveSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  status: z.enum(['open', 'acknowledged', 'resolved', 'waived']).optional().default('resolved'),
  resolution_notes: z.string().nullable().optional(),
})

// Public: list findings, optional ?project_id=&status=&type=
router.get('/', async (c) => {
  const projectId = c.req.query('project_id')
  const status = c.req.query('status')
  const type = c.req.query('type')

  const conds = []
  if (projectId) conds.push(eq(validation_findings.project_id, projectId))
  if (status) conds.push(eq(validation_findings.status, status))
  if (type) conds.push(eq(validation_findings.finding_type, type))

  const rows = await db
    .select()
    .from(validation_findings)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(validation_findings.created_at))
  return c.json(rows)
})

// Auth + owner: update a single finding's status / assignee / notes
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(validation_findings)
    .where(eq(validation_findings.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.status !== undefined) patch.status = body.status
  if (body.assignee !== undefined) patch.assignee = body.assignee
  if (body.resolution_notes !== undefined) patch.resolution_notes = body.resolution_notes

  const [updated] = await db
    .update(validation_findings)
    .set(patch)
    .where(eq(validation_findings.id, id))
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'finding',
    entity_id: id,
    action: 'updated',
    detail: { status: updated.status, assignee: updated.assignee },
  })

  return c.json(updated)
})

// Auth: resolve many findings at once (ownership enforced per row)
router.post('/bulk-resolve', authMiddleware, zValidator('json', bulkResolveSchema), async (c) => {
  const userId = getUserId(c)
  const { ids, status, resolution_notes } = c.req.valid('json')

  let updated = 0
  for (const id of ids) {
    const [existing] = await db
      .select()
      .from(validation_findings)
      .where(eq(validation_findings.id, id))
    if (!existing || existing.user_id !== userId) continue

    const patch: Record<string, unknown> = { status, updated_at: new Date() }
    if (resolution_notes !== undefined && resolution_notes !== null) {
      patch.resolution_notes = resolution_notes
    }
    await db
      .update(validation_findings)
      .set(patch)
      .where(and(eq(validation_findings.id, id), eq(validation_findings.user_id, userId)))
    updated++
  }

  if (updated > 0) {
    await db.insert(activity_log).values({
      user_id: userId,
      entity_type: 'finding',
      entity_id: null,
      action: 'updated',
      detail: { bulk_resolve: true, count: updated, status },
    })
  }

  return c.json({ updated })
})

export default router

import { Hono } from 'hono'
import { db } from '../db/index.js'
import { activity_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Immutable activity trail
//
// The activity_log is append-only: there are no write/update/delete endpoints
// here (entries are written by the domain routes as side effects). This file
// exposes a single filtered, newest-first listing of the trail.
// ---------------------------------------------------------------------------

// GET / — activity trail, newest first.
// Optional filters: ?entity_type=, ?entity_id=, ?action=, ?user_id=, ?limit=.
// Public read; when a user_id filter is not supplied but the request carries an
// X-User-Id header, the trail is automatically scoped to that user.
router.get('/', async (c) => {
  const entityType = c.req.query('entity_type') || undefined
  const entityId = c.req.query('entity_id') || undefined
  const action = c.req.query('action') || undefined
  const userIdFilter = c.req.query('user_id') || undefined
  const limitRaw = parseInt(c.req.query('limit') ?? '200', 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 200

  // If no explicit user_id filter, fall back to the authenticated user (if any)
  // so the trail is scoped per-account. A blank header leaves it unscoped.
  const headerUser = getUserId(c)
  const effectiveUserId = userIdFilter ?? (headerUser ? headerUser : undefined)

  const conditions = []
  if (effectiveUserId) conditions.push(eq(activity_log.user_id, effectiveUserId))
  if (entityType) conditions.push(eq(activity_log.entity_type, entityType))
  if (entityId) conditions.push(eq(activity_log.entity_id, entityId))
  if (action) conditions.push(eq(activity_log.action, action))

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const rows = where
    ? await db
        .select()
        .from(activity_log)
        .where(where)
        .orderBy(desc(activity_log.created_at))
        .limit(limit)
    : await db
        .select()
        .from(activity_log)
        .orderBy(desc(activity_log.created_at))
        .limit(limit)

  return c.json(rows)
})

export default router

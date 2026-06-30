import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  projects,
  validation_findings,
  filing_deadlines,
  restitution_worksheets,
  activity_log,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const projectSchema = z.object({
  company_id: z.string().optional().nullable(),
  name: z.string().min(1),
  awarding_agency: z.string().optional().nullable(),
  contract_number: z.string().optional().nullable(),
  role: z.enum(['prime', 'sub']).optional().default('prime'),
  county: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  coverage: z.enum(['federal', 'state']).optional().default('federal'),
  contract_value_cents: z.number().int().min(0).optional().default(0),
  labor_budget_cents: z.number().int().min(0).optional().default(0),
  status: z.enum(['active', 'closed', 'suspended']).optional().default('active'),
  filing_cadence: z.string().optional().default('weekly'),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  crafts: z.array(z.string()).optional().default([]),
})

// Public: list current-user projects
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([])
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.user_id, userId))
    .orderBy(desc(projects.created_at))
  return c.json(rows)
})

// Public: project detail
router.get('/:id', async (c) => {
  const [row] = await db.select().from(projects).where(eq(projects.id, c.req.param('id')))
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// Public: compliance health score
router.get('/:id/health', async (c) => {
  const id = c.req.param('id')
  const [project] = await db.select().from(projects).where(eq(projects.id, id))
  if (!project) return c.json({ error: 'Not found' }, 404)

  const findings = await db
    .select()
    .from(validation_findings)
    .where(eq(validation_findings.project_id, id))
  const openFindings = findings.filter((f) => f.status === 'open' || f.status === 'acknowledged')
  const openByType: Record<string, number> = {}
  const openBySeverity: Record<string, number> = {}
  for (const f of openFindings) {
    openByType[f.finding_type] = (openByType[f.finding_type] ?? 0) + 1
    openBySeverity[f.severity] = (openBySeverity[f.severity] ?? 0) + 1
  }

  const deadlines = await db
    .select()
    .from(filing_deadlines)
    .where(eq(filing_deadlines.project_id, id))
  const weeksDue = deadlines.length
  const weeksFiled = deadlines.filter((d) => d.filed).length
  const today = new Date().toISOString().slice(0, 10)
  const weeksOverdue = deadlines.filter((d) => !d.filed && d.due_date < today).length

  const worksheets = await db
    .select()
    .from(restitution_worksheets)
    .where(eq(restitution_worksheets.project_id, id))
  const restitutionOutstanding = worksheets
    .filter((w) => w.status !== 'paid')
    .reduce((sum, w) => sum + (w.total_owed ?? 0), 0)

  // Score: start at 100, deduct for open findings (weighted by severity),
  // unfiled/overdue weeks, and outstanding restitution.
  let score = 100
  for (const f of openFindings) {
    if (f.severity === 'high') score -= 8
    else if (f.severity === 'medium') score -= 4
    else score -= 2
  }
  score -= weeksOverdue * 5
  const unfiled = weeksDue - weeksFiled
  score -= Math.max(0, unfiled - weeksOverdue) * 2
  if (restitutionOutstanding > 0) score -= 10
  score = Math.max(0, Math.min(100, Math.round(score)))

  let grade = 'F'
  if (score >= 90) grade = 'A'
  else if (score >= 80) grade = 'B'
  else if (score >= 70) grade = 'C'
  else if (score >= 60) grade = 'D'

  return c.json({
    project_id: id,
    score,
    grade,
    open_findings: openFindings.length,
    open_by_type: openByType,
    open_by_severity: openBySeverity,
    weeks_due: weeksDue,
    weeks_filed: weeksFiled,
    weeks_overdue: weeksOverdue,
    restitution_outstanding: restitutionOutstanding,
  })
})

// Auth: create a project
router.post('/', authMiddleware, zValidator('json', projectSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [row] = await db
    .insert(projects)
    .values({
      user_id: userId,
      company_id: body.company_id ?? null,
      name: body.name,
      awarding_agency: body.awarding_agency ?? null,
      contract_number: body.contract_number ?? null,
      role: body.role ?? 'prime',
      county: body.county ?? null,
      state: body.state ?? null,
      coverage: body.coverage ?? 'federal',
      contract_value_cents: body.contract_value_cents ?? 0,
      labor_budget_cents: body.labor_budget_cents ?? 0,
      status: body.status ?? 'active',
      filing_cadence: body.filing_cadence ?? 'weekly',
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      crafts: body.crafts ?? [],
    })
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'project',
    entity_id: row.id,
    action: 'created',
    detail: { name: row.name },
  })
  return c.json(row, 201)
})

// Auth + owner: update a project
router.put('/:id', authMiddleware, zValidator('json', projectSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(projects).where(eq(projects.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(projects)
    .set({ ...body, updated_at: new Date() })
    .where(eq(projects.id, id))
    .returning()
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'project',
    entity_id: id,
    action: 'updated',
    detail: { fields: Object.keys(body) },
  })
  return c.json(updated)
})

// Auth + owner: delete a project
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(projects).where(eq(projects.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(projects).where(eq(projects.id, id))
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'project',
    entity_id: id,
    action: 'deleted',
    detail: { name: existing.name },
  })
  return c.json({ success: true })
})

export default router

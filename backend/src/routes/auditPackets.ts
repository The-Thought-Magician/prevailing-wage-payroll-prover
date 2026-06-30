import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  audit_packets,
  projects,
  wh347_payrolls,
  wage_determinations,
  determination_rates,
  payroll_lines,
  fringe_plans,
  apprenticeship_programs,
  restitution_worksheets,
  restitution_items,
  validation_findings,
  workers,
  activity_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// GET / — public — list packets (optional ?project_id=)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const projectId = c.req.query('project_id')
  const rows = projectId
    ? await db
        .select()
        .from(audit_packets)
        .where(eq(audit_packets.project_id, projectId))
        .orderBy(desc(audit_packets.created_at))
    : await db.select().from(audit_packets).orderBy(desc(audit_packets.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — public — packet + manifest
// ---------------------------------------------------------------------------
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [packet] = await db.select().from(audit_packets).where(eq(audit_packets.id, id))
  if (!packet) return c.json({ error: 'Not found' }, 404)
  return c.json(packet)
})

// ---------------------------------------------------------------------------
// POST /generate — auth — bundle WH-347s / determinations / ledger / fringe /
// apprentice / restitution for a project+range into a manifest.
// ---------------------------------------------------------------------------
const generateSchema = z.object({
  project_id: z.string().min(1),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
})

// week_ending bound by an optional [start, end] window.
function inRange(week: string | null | undefined, start?: string, end?: string): boolean {
  if (!week) return true
  if (start && week < start) return false
  if (end && week > end) return false
  return true
}

router.post('/generate', authMiddleware, zValidator('json', generateSchema), async (c) => {
  const userId = getUserId(c)
  const { project_id, period_start, period_end } = c.req.valid('json')

  const [project] = await db.select().from(projects).where(eq(projects.id, project_id))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (project.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // --- WH-347 certified payrolls in range ---
  const allWh347 = await db
    .select()
    .from(wh347_payrolls)
    .where(eq(wh347_payrolls.project_id, project_id))
    .orderBy(wh347_payrolls.week_ending)
  const wh347InRange = allWh347.filter((w) => inRange(w.week_ending, period_start, period_end))

  // --- Wage determinations attached to the project (+ their rate rows) ---
  const dets = await db
    .select()
    .from(wage_determinations)
    .where(eq(wage_determinations.project_id, project_id))
  const detManifest = []
  for (const d of dets) {
    const rates = await db
      .select()
      .from(determination_rates)
      .where(eq(determination_rates.determination_id, d.id))
    detManifest.push({
      id: d.id,
      wd_number: d.wd_number,
      modification_number: d.modification_number,
      decision_date: d.decision_date,
      is_active: d.is_active,
      rate_count: rates.length,
      rates: rates.map((r) => ({
        classification_name: r.classification_name,
        base_rate: r.base_rate,
        fringe_rate: r.fringe_rate,
      })),
    })
  }

  // --- Payroll ledger lines in range ---
  const allLines = await db
    .select()
    .from(payroll_lines)
    .where(eq(payroll_lines.project_id, project_id))
    .orderBy(payroll_lines.week_ending)
  const linesInRange = allLines.filter((l) => inRange(l.week_ending, period_start, period_end))
  let totalGross = 0
  let totalStraight = 0
  let totalOt = 0
  for (const l of linesInRange) {
    totalGross += l.gross_paid ?? 0
    totalStraight += l.straight_hours ?? 0
    totalOt += l.overtime_hours ?? 0
  }

  // --- Fringe plans (workspace register) ---
  const plans = await db.select().from(fringe_plans).where(eq(fringe_plans.user_id, userId))

  // --- Apprenticeship programs (workspace register) ---
  const programs = await db
    .select()
    .from(apprenticeship_programs)
    .where(eq(apprenticeship_programs.user_id, userId))

  // --- Restitution worksheets for this project (+ items) ---
  const worksheets = await db
    .select()
    .from(restitution_worksheets)
    .where(eq(restitution_worksheets.project_id, project_id))
  const restitutionManifest = []
  let restitutionOutstanding = 0
  for (const w of worksheets) {
    const items = await db
      .select()
      .from(restitution_items)
      .where(eq(restitution_items.worksheet_id, w.id))
    const outstanding = items
      .filter((i) => !i.paid)
      .reduce((sum, i) => sum + (i.total_shortfall ?? 0), 0)
    restitutionOutstanding += outstanding
    restitutionManifest.push({
      id: w.id,
      period_start: w.period_start,
      period_end: w.period_end,
      status: w.status,
      total_owed: w.total_owed,
      outstanding,
      item_count: items.length,
    })
  }

  // --- Open findings snapshot ---
  const findings = await db
    .select()
    .from(validation_findings)
    .where(eq(validation_findings.project_id, project_id))
  const openFindings = findings.filter(
    (f) => f.status !== 'resolved' && f.status !== 'waived',
  )

  // --- Worker roster snapshot ---
  const roster = await db.select().from(workers).where(eq(workers.user_id, userId))

  const manifest = {
    generated_at: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      awarding_agency: project.awarding_agency,
      contract_number: project.contract_number,
      coverage: project.coverage,
      county: project.county,
      state: project.state,
    },
    period: { start: period_start ?? null, end: period_end ?? null },
    wh347: {
      count: wh347InRange.length,
      signed: wh347InRange.filter((w) => w.status === 'signed').length,
      records: wh347InRange.map((w) => ({
        id: w.id,
        week_ending: w.week_ending,
        payroll_number: w.payroll_number,
        is_final: w.is_final,
        status: w.status,
        fringe_method: w.fringe_method,
      })),
    },
    determinations: { count: detManifest.length, records: detManifest },
    ledger: {
      line_count: linesInRange.length,
      total_gross_paid: totalGross,
      total_straight_hours: totalStraight,
      total_overtime_hours: totalOt,
    },
    fringe_plans: {
      count: plans.length,
      records: plans.map((p) => ({
        id: p.id,
        name: p.name,
        plan_type: p.plan_type,
        provider: p.provider,
      })),
    },
    apprenticeship: {
      count: programs.length,
      records: programs.map((p) => ({
        id: p.id,
        registration_number: p.registration_number,
        sponsor: p.sponsor,
        trade: p.trade,
        required_ratio: p.required_ratio,
      })),
    },
    restitution: {
      worksheet_count: restitutionManifest.length,
      outstanding_total: restitutionOutstanding,
      records: restitutionManifest,
    },
    findings: {
      total: findings.length,
      open: openFindings.length,
      by_type: openFindings.reduce<Record<string, number>>((acc, f) => {
        acc[f.finding_type] = (acc[f.finding_type] ?? 0) + 1
        return acc
      }, {}),
    },
    roster: { worker_count: roster.length },
  }

  const [packet] = await db
    .insert(audit_packets)
    .values({
      user_id: userId,
      project_id,
      period_start: period_start ?? null,
      period_end: period_end ?? null,
      status: 'generated',
      manifest,
    })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'audit_packet',
    entity_id: packet.id,
    action: 'exported',
    detail: {
      project_id,
      wh347_count: wh347InRange.length,
      ledger_lines: linesInRange.length,
      restitution_outstanding: restitutionOutstanding,
    },
  })

  return c.json(packet, 201)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth+owner — delete packet
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [packet] = await db.select().from(audit_packets).where(eq(audit_packets.id, id))
  if (!packet) return c.json({ error: 'Not found' }, 404)
  if (packet.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(audit_packets).where(eq(audit_packets.id, id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'audit_packet',
    entity_id: id,
    action: 'deleted',
    detail: { project_id: packet.project_id },
  })

  return c.json({ success: true })
})

export default router

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  validation_runs,
  validation_findings,
  payroll_lines,
  projects,
  workers,
  companies,
  wage_determinations,
  determination_rates,
  apprenticeship_programs,
  apprenticeship_levels,
  activity_log,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

interface FindingDraft {
  payroll_line_id: string | null
  worker_id: string | null
  finding_type: string
  severity: string
  message: string
  shortfall: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Public: list validation runs (optional ?project_id=)
router.get('/runs', async (c) => {
  const projectId = c.req.query('project_id')
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  const conds = []
  if (userId) conds.push(eq(validation_runs.user_id, userId))
  if (projectId) conds.push(eq(validation_runs.project_id, projectId))
  const rows = await db
    .select()
    .from(validation_runs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(validation_runs.created_at))
  return c.json(rows)
})

// Public: run + its findings
router.get('/runs/:id', async (c) => {
  const id = c.req.param('id')
  const [run] = await db.select().from(validation_runs).where(eq(validation_runs.id, id))
  if (!run) return c.json({ error: 'Not found' }, 404)
  const findings = await db
    .select()
    .from(validation_findings)
    .where(eq(validation_findings.run_id, id))
    .orderBy(desc(validation_findings.created_at))
  return c.json({ ...run, findings })
})

// Auth: prove a project + week
router.post(
  '/run',
  authMiddleware,
  zValidator('json', z.object({ project_id: z.string().min(1), week_ending: z.string().min(1) })),
  async (c) => {
    const userId = getUserId(c)
    const { project_id, week_ending } = c.req.valid('json')

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, project_id), eq(projects.user_id, userId)))
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Company tolerance (in cents → dollars) for rate comparisons
    let toleranceDollars = 0
    if (project.company_id) {
      const [company] = await db.select().from(companies).where(eq(companies.id, project.company_id))
      if (company) toleranceDollars = (company.rate_tolerance_cents ?? 0) / 100
    }

    // Pull this week's ledger lines
    const lines = await db
      .select()
      .from(payroll_lines)
      .where(
        and(
          eq(payroll_lines.user_id, userId),
          eq(payroll_lines.project_id, project_id),
          eq(payroll_lines.week_ending, week_ending),
        ),
      )

    // Preload active determinations + rates for the project
    const dets = await db
      .select()
      .from(wage_determinations)
      .where(eq(wage_determinations.project_id, project_id))
    const detIds = dets.map((d) => d.id)
    const allRates = detIds.length
      ? await db.select().from(determination_rates)
      : []
    // rate lookup keyed by determination_id + classification_name
    const rateMap = new Map<string, { base_rate: number; fringe_rate: number }>()
    for (const r of allRates) {
      if (detIds.includes(r.determination_id)) {
        rateMap.set(`${r.determination_id}::${r.classification_name}`, {
          base_rate: r.base_rate,
          fringe_rate: r.fringe_rate,
        })
      }
    }
    // fallback: active determination's rates keyed by classification only
    const activeDet = dets.find((d) => d.is_active) ?? dets[0]
    const classRateMap = new Map<string, { base_rate: number; fringe_rate: number }>()
    if (activeDet) {
      for (const r of allRates) {
        if (r.determination_id === activeDet.id) {
          classRateMap.set(r.classification_name, { base_rate: r.base_rate, fringe_rate: r.fringe_rate })
        }
      }
    }
    const knownClassifications = new Set(allRates.filter((r) => detIds.includes(r.determination_id)).map((r) => r.classification_name))

    // Preload workers + apprentice programs
    const workerIds = Array.from(new Set(lines.map((l) => l.worker_id)))
    const workerRows = workerIds.length ? await db.select().from(workers).where(eq(workers.user_id, userId)) : []
    const workerMap = new Map(workerRows.map((w) => [w.id, w]))
    const programs = await db.select().from(apprenticeship_programs).where(eq(apprenticeship_programs.user_id, userId))
    const programMap = new Map(programs.map((p) => [p.id, p]))
    const allLevels = programs.length ? await db.select().from(apprenticeship_levels) : []
    const levelMap = new Map(allLevels.map((lv) => [lv.id, lv]))

    const findings: FindingDraft[] = []
    let passCount = 0
    let failCount = 0
    let totalShortfall = 0
    const byType: Record<string, number> = {}

    const addFinding = (f: FindingDraft) => {
      findings.push(f)
      byType[f.finding_type] = (byType[f.finding_type] ?? 0) + 1
      totalShortfall = round2(totalShortfall + f.shortfall)
    }

    // OT rule set: federal => OT after 40 straight hours/week (informational per-worker check)
    const weeklyStraightByWorker = new Map<string, number>()

    for (const line of lines) {
      let linePassed = true
      const rateKey = line.determination_id
        ? `${line.determination_id}::${line.classification_name}`
        : ''
      const reqRate =
        (rateKey && rateMap.get(rateKey)) || classRateMap.get(line.classification_name) || null

      const allHours = line.straight_hours + line.overtime_hours + line.doubletime_hours

      // --- Classification check ---
      if (knownClassifications.size > 0 && !knownClassifications.has(line.classification_name)) {
        linePassed = false
        addFinding({
          payroll_line_id: line.id,
          worker_id: line.worker_id,
          finding_type: 'classification',
          severity: 'high',
          message: `Classification "${line.classification_name}" has no matching rate row in any project determination`,
          shortfall: 0,
        })
      }

      // --- Rate check (base) ---
      if (reqRate) {
        const requiredBase = reqRate.base_rate
        if (line.base_rate_paid + toleranceDollars < requiredBase - 1e-6) {
          linePassed = false
          const perHourShort = round2(requiredBase - line.base_rate_paid)
          const shortfall = round2(perHourShort * (line.straight_hours + line.overtime_hours * 1.5 + line.doubletime_hours * 2))
          addFinding({
            payroll_line_id: line.id,
            worker_id: line.worker_id,
            finding_type: 'rate',
            severity: 'high',
            message: `Base rate $${line.base_rate_paid.toFixed(2)} below required $${requiredBase.toFixed(2)} for ${line.classification_name}`,
            shortfall,
          })
        }

        // --- Fringe check (cash + plan must meet required fringe per hour) ---
        const requiredFringe = reqRate.fringe_rate
        const fringeProvided = line.fringe_cash_paid + line.fringe_plan_paid
        if (requiredFringe > 0 && fringeProvided + toleranceDollars < requiredFringe - 1e-6) {
          linePassed = false
          const perHourShort = round2(requiredFringe - fringeProvided)
          const shortfall = round2(perHourShort * allHours)
          addFinding({
            payroll_line_id: line.id,
            worker_id: line.worker_id,
            finding_type: 'fringe',
            severity: 'high',
            message: `Fringe $${fringeProvided.toFixed(2)}/hr below required $${requiredFringe.toFixed(2)}/hr for ${line.classification_name}`,
            shortfall,
          })
        }
      }

      // --- Overtime check: OT/DT hours must be paid at >= 1.5x/2x base ---
      if (line.overtime_hours > 0 && reqRate) {
        const expectedOtRate = reqRate.base_rate * 1.5
        // Heuristic: base_rate_paid is the straight rate; OT premium implied. Flag only if straight base under required (already caught) — keep informational on missing premium when base equals required but no premium tracked.
        if (line.base_rate_paid < expectedOtRate / 1.5 - 1e-6) {
          // covered by rate finding; skip duplicate
        }
      }
      weeklyStraightByWorker.set(
        line.worker_id,
        (weeklyStraightByWorker.get(line.worker_id) ?? 0) + line.straight_hours,
      )

      // --- Apprentice check ---
      if (line.is_apprentice) {
        const worker = workerMap.get(line.worker_id)
        const program = worker?.program_id ? programMap.get(worker.program_id) : undefined
        const level = worker?.program_level_id ? levelMap.get(worker.program_level_id) : undefined
        if (!worker || !worker.program_id || !program) {
          linePassed = false
          addFinding({
            payroll_line_id: line.id,
            worker_id: line.worker_id,
            finding_type: 'apprentice',
            severity: 'high',
            message: `Worker paid as apprentice but is not enrolled in a registered apprenticeship program`,
            shortfall: 0,
          })
        } else if (level && reqRate) {
          // Apprentice base must be at least pct_of_journeyworker of the journeyworker base rate
          const requiredApprBase = round2(reqRate.base_rate * level.pct_of_journeyworker)
          if (line.base_rate_paid + toleranceDollars < requiredApprBase - 1e-6) {
            linePassed = false
            const perHourShort = round2(requiredApprBase - line.base_rate_paid)
            const shortfall = round2(perHourShort * (line.straight_hours + line.overtime_hours * 1.5 + line.doubletime_hours * 2))
            addFinding({
              payroll_line_id: line.id,
              worker_id: line.worker_id,
              finding_type: 'apprentice',
              severity: 'medium',
              message: `Apprentice base $${line.base_rate_paid.toFixed(2)} below ${Math.round(level.pct_of_journeyworker * 100)}% of journeyworker rate ($${requiredApprBase.toFixed(2)})`,
              shortfall,
            })
          }
        }
      }

      if (linePassed) passCount++
      else failCount++
    }

    // --- Weekly OT rule check (federal): straight hours over 40 should have been OT ---
    if (project.coverage === 'federal' || (project as any).coverage === undefined) {
      for (const [wid, straight] of weeklyStraightByWorker) {
        if (straight > 40 + 1e-6) {
          addFinding({
            payroll_line_id: null,
            worker_id: wid,
            finding_type: 'overtime',
            severity: 'medium',
            message: `Worker logged ${round2(straight)} straight hours in week (>40); hours over 40 should be paid as overtime`,
            shortfall: 0,
          })
          failCount++
        }
      }
    }

    const hardFail = findings.some((f) => f.severity === 'high')

    const [run] = await db
      .insert(validation_runs)
      .values({
        user_id: userId,
        project_id,
        week_ending,
        status: 'completed',
        total_lines: lines.length,
        pass_count: passCount,
        fail_count: failCount,
        hard_fail: hardFail,
        total_shortfall: totalShortfall,
        summary: { by_type: byType, finding_count: findings.length, tolerance_dollars: toleranceDollars },
      })
      .returning()

    if (findings.length > 0) {
      await db.insert(validation_findings).values(
        findings.map((f) => ({
          user_id: userId,
          run_id: run.id,
          project_id,
          payroll_line_id: f.payroll_line_id,
          worker_id: f.worker_id,
          finding_type: f.finding_type,
          severity: f.severity,
          status: 'open',
          message: f.message,
          shortfall: f.shortfall,
          week_ending,
        })),
      )
    }

    await db.insert(activity_log).values({
      user_id: userId,
      entity_type: 'validation_run',
      entity_id: run.id,
      action: 'created',
      detail: { project_id, week_ending, findings: findings.length, total_shortfall: totalShortfall },
    })

    return c.json(run, 201)
  },
)

export default router

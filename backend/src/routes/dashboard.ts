import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  projects,
  validation_findings,
  filing_deadlines,
  restitution_worksheets,
  validation_runs,
} from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'

const router = new Hono()

// ---------------------------------------------------------------------------
// GET /summary — global compliance overview for the current user.
// Public read (scoped by X-User-Id header when present). Returns per-project
// health scores, open violations by type, weeks filed vs due, restitution
// outstanding, upcoming deadlines, and a violation trend.
// ---------------------------------------------------------------------------
router.get('/summary', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id') ?? ''

  // No user context -> empty but well-formed summary.
  if (!userId) {
    return c.json({
      projects: [],
      open_violations_by_type: {},
      weeks_filed: 0,
      weeks_due: 0,
      restitution_outstanding: 0,
      upcoming_deadlines: [],
      violation_trend: [],
      totals: { projects: 0, open_findings: 0, hard_findings: 0 },
    })
  }

  const userProjects = await db.select().from(projects).where(eq(projects.user_id, userId))
  const findings = await db
    .select()
    .from(validation_findings)
    .where(eq(validation_findings.user_id, userId))
  const deadlines = await db
    .select()
    .from(filing_deadlines)
    .where(eq(filing_deadlines.user_id, userId))
  const worksheets = await db
    .select()
    .from(restitution_worksheets)
    .where(eq(restitution_worksheets.user_id, userId))
  const runs = await db
    .select()
    .from(validation_runs)
    .where(eq(validation_runs.user_id, userId))
    .orderBy(desc(validation_runs.created_at))

  const openFindings = findings.filter((f) => f.status === 'open' || f.status === 'acknowledged')

  // Open violations grouped by finding_type.
  const openByType: Record<string, number> = {}
  for (const f of openFindings) {
    openByType[f.finding_type] = (openByType[f.finding_type] ?? 0) + 1
  }

  // Restitution outstanding = sum of total_owed across non-paid worksheets.
  const restitutionOutstanding = worksheets
    .filter((w) => w.status !== 'paid')
    .reduce((acc, w) => acc + (w.total_owed ?? 0), 0)

  // Per-project health scoring.
  const findingsByProject = new Map<string, typeof openFindings>()
  for (const f of openFindings) {
    const arr = findingsByProject.get(f.project_id) ?? []
    arr.push(f)
    findingsByProject.set(f.project_id, arr)
  }
  const deadlinesByProject = new Map<string, typeof deadlines>()
  for (const d of deadlines) {
    const arr = deadlinesByProject.get(d.project_id) ?? []
    arr.push(d)
    deadlinesByProject.set(d.project_id, arr)
  }
  const restitutionByProject = new Map<string, number>()
  for (const w of worksheets) {
    if (w.status !== 'paid') {
      restitutionByProject.set(
        w.project_id,
        (restitutionByProject.get(w.project_id) ?? 0) + (w.total_owed ?? 0),
      )
    }
  }

  let totalWeeksFiled = 0
  let totalWeeksDue = 0

  const projectSummaries = userProjects.map((p) => {
    const pf = findingsByProject.get(p.id) ?? []
    const pd = deadlinesByProject.get(p.id) ?? []
    const hardOpen = pf.filter((f) => f.severity === 'high').length
    const weeksFiled = pd.filter((d) => d.filed).length
    const weeksDue = pd.length
    totalWeeksFiled += weeksFiled
    totalWeeksDue += weeksDue
    const restOut = restitutionByProject.get(p.id) ?? 0

    // Health score: start at 100, deduct per open finding (weighted by severity),
    // per unfiled week, and a flat hit if restitution is outstanding. Floor at 0.
    let score = 100
    score -= hardOpen * 8
    score -= (pf.length - hardOpen) * 3
    score -= Math.max(0, weeksDue - weeksFiled) * 4
    if (restOut > 0) score -= 10
    score = Math.max(0, Math.min(100, Math.round(score)))

    return {
      project_id: p.id,
      name: p.name,
      status: p.status,
      score,
      open_findings: pf.length,
      hard_open_findings: hardOpen,
      weeks_filed: weeksFiled,
      weeks_due: weeksDue,
      restitution_outstanding: Math.round(restOut * 100) / 100,
    }
  })

  // Upcoming deadlines (unfiled, due-date today or later), soonest first, top 10.
  const todayIso = new Date().toISOString().slice(0, 10)
  const upcoming = deadlines
    .filter((d) => !d.filed && d.due_date >= todayIso)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 10)
    .map((d) => ({
      id: d.id,
      project_id: d.project_id,
      week_ending: d.week_ending,
      due_date: d.due_date,
    }))

  // Violation trend: fail_count per validation run keyed by week_ending,
  // most recent 12 runs in chronological order.
  const violationTrend = runs
    .slice(0, 12)
    .reverse()
    .map((r) => ({
      run_id: r.id,
      project_id: r.project_id,
      week_ending: r.week_ending,
      fail_count: r.fail_count,
      total_shortfall: r.total_shortfall,
      created_at: r.created_at,
    }))

  return c.json({
    projects: projectSummaries,
    open_violations_by_type: openByType,
    weeks_filed: totalWeeksFiled,
    weeks_due: totalWeeksDue,
    restitution_outstanding: Math.round(restitutionOutstanding * 100) / 100,
    upcoming_deadlines: upcoming,
    violation_trend: violationTrend,
    totals: {
      projects: userProjects.length,
      open_findings: openFindings.length,
      hard_findings: openFindings.filter((f) => f.severity === 'high').length,
    },
  })
})

export default router

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type ProjectScore = {
  project_id?: string
  id?: string
  name?: string
  project_name?: string
  score?: number
  health_score?: number
  open_findings?: number
  weeks_filed?: number
  weeks_due?: number
  restitution_outstanding?: number
}

type ViolationByType = { type?: string; finding_type?: string; count?: number }
type TrendPoint = { week_ending?: string; week?: string; label?: string; count?: number; violations?: number }
type Deadline = {
  id?: string
  project_id?: string
  project_name?: string
  week_ending?: string
  due_date?: string
  filed?: boolean
}

type DashboardSummary = {
  projects?: ProjectScore[]
  project_scores?: ProjectScore[]
  violations_by_type?: ViolationByType[] | Record<string, number>
  open_violations_by_type?: ViolationByType[] | Record<string, number>
  weeks_filed?: number
  weeks_due?: number
  restitution_outstanding?: number
  total_restitution_outstanding?: number
  upcoming_deadlines?: Deadline[]
  deadlines?: Deadline[]
  violation_trend?: TrendPoint[]
  trend?: TrendPoint[]
  open_findings?: number
  total_open_findings?: number
}

type Project = {
  id: string
  name: string
  awarding_agency?: string
  status?: string
  county?: string
  state?: string
}

function money(n?: number) {
  const v = Number(n ?? 0)
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function scoreTone(score: number): 'green' | 'amber' | 'red' {
  if (score >= 90) return 'green'
  if (score >= 70) return 'amber'
  return 'red'
}

function num(n?: number) {
  return Number(n ?? 0)
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [s, p] = await Promise.all([api.getDashboardSummary(), api.getProjects()])
        if (!alive) return
        setSummary(s || {})
        setProjects(Array.isArray(p) ? p : [])
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Failed to load dashboard')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const scores: ProjectScore[] = useMemo(() => {
    if (!summary) return []
    return summary.project_scores || summary.projects || []
  }, [summary])

  const violations: ViolationByType[] = useMemo(() => {
    if (!summary) return []
    const raw = summary.open_violations_by_type || summary.violations_by_type || []
    const list: ViolationByType[] = Array.isArray(raw)
      ? raw
      : Object.entries(raw as Record<string, number>).map(([type, count]) => ({ type, count }))
    return list
      .map((v) => ({ type: v.type || v.finding_type || 'unknown', count: num(v.count) }))
      .sort((a, b) => num(b.count) - num(a.count))
  }, [summary])

  const trend: TrendPoint[] = useMemo(() => {
    if (!summary) return []
    const raw = summary.violation_trend || summary.trend || []
    return raw.map((t) => ({
      label: t.label || t.week_ending || t.week || '',
      count: num(t.count ?? t.violations),
    }))
  }, [summary])

  const deadlines: Deadline[] = useMemo(() => {
    if (!summary) return []
    return (summary.upcoming_deadlines || summary.deadlines || []).filter((d) => !d.filed)
  }, [summary])

  const weeksFiled = num(summary?.weeks_filed)
  const weeksDue = num(summary?.weeks_due)
  const restitution = num(summary?.restitution_outstanding ?? summary?.total_restitution_outstanding)
  const openFindings =
    num(summary?.open_findings ?? summary?.total_open_findings) ||
    scores.reduce((acc, s) => acc + num(s.open_findings), 0) ||
    violations.reduce((acc, v) => acc + num(v.count), 0)

  const avgScore = useMemo(() => {
    if (!scores.length) return null
    const total = scores.reduce((acc, s) => acc + num(s.score ?? s.health_score), 0)
    return Math.round(total / scores.length)
  }, [scores])

  const filedPct = weeksDue > 0 ? Math.round((weeksFiled / weeksDue) * 100) : 0
  const trendMax = Math.max(1, ...trend.map((t) => num(t.count)))
  const violationMax = Math.max(1, ...violations.map((v) => num(v.count)))

  if (loading) return <FullPageSpinner label="Loading compliance overview..." />

  if (error) {
    return (
      <div className="space-y-6">
        <Header />
        <Card className="border-red-500/30">
          <CardBody>
            <p className="text-sm text-red-300">{error}</p>
            <Button className="mt-3" variant="secondary" onClick={() => location.reload()}>
              Retry
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  const hasData = projects.length > 0 || scores.length > 0

  return (
    <div className="space-y-6">
      <Header />

      {!hasData ? (
        <EmptyState
          title="No projects yet"
          description="Create your first prevailing-wage project, or seed sample data with intentional violations to explore the prover."
          icon="🏗️"
          action={
            <div className="flex gap-2">
              <Link href="/dashboard/projects">
                <Button>Create project</Button>
              </Link>
              <Link href="/dashboard/imports">
                <Button variant="secondary">Seed sample data</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Avg compliance score"
              value={avgScore === null ? '—' : `${avgScore}%`}
              tone={avgScore === null ? 'default' : scoreTone(avgScore) === 'green' ? 'green' : scoreTone(avgScore) === 'amber' ? 'amber' : 'red'}
              hint={`${scores.length} project${scores.length === 1 ? '' : 's'} scored`}
            />
            <Stat
              label="Open violations"
              value={openFindings}
              tone={openFindings > 0 ? 'red' : 'green'}
              hint={`${violations.length} violation type${violations.length === 1 ? '' : 's'}`}
            />
            <Stat
              label="Weeks filed / due"
              value={`${weeksFiled} / ${weeksDue}`}
              tone={filedPct >= 100 ? 'green' : filedPct >= 80 ? 'amber' : 'red'}
              hint={`${filedPct}% filed`}
            />
            <Stat
              label="Restitution outstanding"
              value={money(restitution)}
              tone={restitution > 0 ? 'red' : 'green'}
              hint="Back-wages owed to workers"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Project health scores */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Project health</h2>
                <Link href="/dashboard/projects" className="text-xs font-medium text-cyan-400 hover:text-cyan-300">
                  View all →
                </Link>
              </CardHeader>
              <CardBody className="p-0">
                {scores.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-stone-500">
                    No health scores computed yet. Run a validation to populate scores.
                  </div>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Project</TH>
                        <TH className="text-right">Open findings</TH>
                        <TH className="text-right">Filed / due</TH>
                        <TH className="text-right">Restitution</TH>
                        <TH className="text-right">Score</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {scores.map((s) => {
                        const pid = s.project_id || s.id || ''
                        const name = s.name || s.project_name || pid
                        const score = num(s.score ?? s.health_score)
                        return (
                          <TR key={pid}>
                            <TD>
                              {pid ? (
                                <Link href={`/dashboard/projects/${pid}`} className="font-medium text-stone-100 hover:text-cyan-300">
                                  {name}
                                </Link>
                              ) : (
                                <span className="font-medium text-stone-100">{name}</span>
                              )}
                            </TD>
                            <TD className="text-right tabular-nums">
                              {num(s.open_findings) > 0 ? (
                                <span className="text-red-300">{num(s.open_findings)}</span>
                              ) : (
                                <span className="text-emerald-400">0</span>
                              )}
                            </TD>
                            <TD className="text-right tabular-nums text-stone-400">
                              {num(s.weeks_filed)} / {num(s.weeks_due)}
                            </TD>
                            <TD className="text-right tabular-nums">
                              {num(s.restitution_outstanding) > 0 ? (
                                <span className="text-cyan-300">{money(s.restitution_outstanding)}</span>
                              ) : (
                                <span className="text-stone-500">—</span>
                              )}
                            </TD>
                            <TD className="text-right">
                              <Badge tone={scoreTone(score)}>{score}%</Badge>
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </Card>

            {/* Violations by type */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-white">Open violations by type</h2>
              </CardHeader>
              <CardBody>
                {violations.length === 0 ? (
                  <p className="py-6 text-center text-sm text-emerald-400">No open violations 🎉</p>
                ) : (
                  <div className="space-y-3">
                    {violations.map((v) => (
                      <div key={v.type}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="capitalize text-stone-300">{(v.type || '').replace(/_/g, ' ')}</span>
                          <span className="tabular-nums font-medium text-stone-400">{num(v.count)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
                          <div
                            className="h-full rounded-full bg-cyan-500"
                            style={{ width: `${(num(v.count) / violationMax) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Violation trend */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-white">Violation trend</h2>
              </CardHeader>
              <CardBody>
                {trend.length === 0 ? (
                  <p className="py-6 text-center text-sm text-stone-500">No trend data yet.</p>
                ) : (
                  <div className="flex h-40 items-end gap-1.5">
                    {trend.map((t, i) => {
                      const h = (num(t.count) / trendMax) * 100
                      return (
                        <div key={i} className="group flex flex-1 flex-col items-center justify-end" title={`${t.label}: ${num(t.count)}`}>
                          <span className="mb-1 text-[10px] tabular-nums text-stone-500 opacity-0 group-hover:opacity-100">
                            {num(t.count)}
                          </span>
                          <div
                            className="w-full rounded-t bg-cyan-500/70 transition-colors group-hover:bg-cyan-400"
                            style={{ height: `${Math.max(2, h)}%` }}
                          />
                          <span className="mt-1 w-full truncate text-center text-[9px] text-stone-600">
                            {(t.label || '').slice(5)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Upcoming deadlines */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Upcoming filing deadlines</h2>
                <Link href="/dashboard/deadlines" className="text-xs font-medium text-cyan-400 hover:text-cyan-300">
                  Calendar →
                </Link>
              </CardHeader>
              <CardBody className="p-0">
                {deadlines.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-stone-500">No open deadlines.</p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Project</TH>
                        <TH>Week ending</TH>
                        <TH>Due</TH>
                        <TH className="text-right">Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {deadlines.slice(0, 8).map((d, i) => {
                        const due = d.due_date ? new Date(d.due_date) : null
                        const overdue = due ? due.getTime() < Date.now() : false
                        return (
                          <TR key={d.id || i}>
                            <TD className="text-stone-200">{d.project_name || d.project_id || '—'}</TD>
                            <TD className="text-stone-400">{d.week_ending || '—'}</TD>
                            <TD className="text-stone-400">{d.due_date || '—'}</TD>
                            <TD className="text-right">
                              <Badge tone={overdue ? 'red' : 'amber'}>{overdue ? 'Overdue' : 'Due'}</Badge>
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Header() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-white">Compliance overview</h1>
        <p className="mt-1 text-sm text-stone-500">
          Prevailing-wage health across every project, with violations, filing status, and back-wage exposure.
        </p>
      </div>
      <div className="flex gap-2">
        <Link href="/dashboard/validation">
          <Button variant="secondary">Run validation</Button>
        </Link>
        <Link href="/dashboard/projects">
          <Button>New project</Button>
        </Link>
      </div>
    </div>
  )
}

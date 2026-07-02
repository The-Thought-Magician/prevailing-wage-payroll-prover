'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Project = { id: string; name: string }
type ValidationRun = {
  id: string
  project_id: string
  week_ending: string
  status: string
  total_lines: number
  pass_count: number
  fail_count: number
  hard_fail: boolean
  total_shortfall: number
  summary?: Record<string, unknown> | null
  created_at: string
}
type Finding = {
  id: string
  finding_type: string
  severity: string
  status: string
  message: string
  shortfall: number
  worker_id?: string | null
  week_ending?: string | null
}
type RunDetail = ValidationRun & { findings: Finding[] }

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}
function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}
function weekEndingOf(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return d
  const add = (6 - dt.getDay() + 7) % 7
  dt.setDate(dt.getDate() + add)
  return dt.toISOString().slice(0, 10)
}
function severityTone(s: string): 'red' | 'amber' | 'blue' | 'neutral' {
  const v = s.toLowerCase()
  if (v === 'hard' || v === 'critical' || v === 'error') return 'red'
  if (v === 'warning' || v === 'soft' || v === 'medium') return 'amber'
  if (v === 'info' || v === 'low') return 'blue'
  return 'neutral'
}
function statusTone(s: string): 'green' | 'amber' | 'red' | 'neutral' {
  const v = s.toLowerCase()
  if (v === 'passed' || v === 'clean' || v === 'pass' || v === 'complete' || v === 'completed') return 'green'
  if (v === 'failed' || v === 'fail') return 'red'
  if (v === 'running' || v === 'pending') return 'amber'
  return 'neutral'
}

export default function ValidationPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [runs, setRuns] = useState<ValidationRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  const [weekEnding, setWeekEnding] = useState(weekEndingOf(new Date().toISOString().slice(0, 10)))
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadBase = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await api.getProjects()
      const list: Project[] = Array.isArray(p) ? p : []
      setProjects(list)
      if (list.length) setProjectId((cur) => cur || list[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRuns = useCallback(async () => {
    if (!projectId) {
      setRuns([])
      return
    }
    setRunsLoading(true)
    try {
      const r = await api.getValidationRuns(projectId)
      setRuns(Array.isArray(r) ? r : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runs')
    } finally {
      setRunsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  useEffect(() => {
    loadRuns()
    setSelectedId(null)
    setDetail(null)
  }, [loadRuns])

  const openRun = useCallback(async (id: string) => {
    setSelectedId(id)
    setDetailLoading(true)
    setDetail(null)
    try {
      const d = await api.getValidationRun(id)
      setDetail(d as RunDetail)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load run')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  async function runProve() {
    if (!projectId || !weekEnding) return
    setRunning(true)
    setRunError(null)
    try {
      const run = (await api.runValidation({ project_id: projectId, week_ending: weekEnding })) as ValidationRun
      await loadRuns()
      if (run?.id) await openRun(run.id)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Validation failed')
    } finally {
      setRunning(false)
    }
  }

  const agg = useMemo(() => {
    const total = runs.length
    const lastClean = runs.find((r) => !r.hard_fail && num(r.fail_count) === 0)
    const openShortfall = runs.reduce((s, r) => s + num(r.total_shortfall), 0)
    const hardFails = runs.filter((r) => r.hard_fail).length
    return { total, lastClean, openShortfall, hardFails }
  }, [runs])

  // Simple SVG-free bar: pass/fail proportion per run for the latest 12 runs.
  const trend = useMemo(() => runs.slice(0, 12).reverse(), [runs])

  if (loading) return <FullPageSpinner label="Loading validation..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">Validation &amp; Proof</h1>
        <p className="text-sm text-stone-500">
          Prove a project week against its wage determination. The engine checks base rate, fringe, overtime,
          apprentice ratios and classification mapping, then records every finding.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col text-xs font-medium text-stone-400">
            Project
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 min-w-[16rem] rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-cyan-500 focus:outline-none"
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs font-medium text-stone-400">
            Week ending
            <input
              type="date"
              value={weekEnding}
              onChange={(e) => setWeekEnding(e.target.value)}
              className="mt-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-cyan-500 focus:outline-none"
            />
          </label>
          <Button onClick={runProve} disabled={running || !projectId || !weekEnding}>
            {running ? 'Proving...' : 'Run prove'}
          </Button>
          {runError && <span className="text-sm text-red-300">{runError}</span>}
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total runs" value={agg.total} />
        <Stat label="Hard-fail runs" value={agg.hardFails} tone={agg.hardFails ? 'red' : 'green'} />
        <Stat
          label="Last clean week"
          value={agg.lastClean ? agg.lastClean.week_ending : '—'}
          tone={agg.lastClean ? 'green' : 'red'}
        />
        <Stat label="Shortfall (all runs)" value={money(agg.openShortfall)} tone={agg.openShortfall > 0 ? 'amber' : 'green'} />
      </div>

      {trend.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Pass / fail trend</h2>
          </CardHeader>
          <CardBody>
            <div className="flex items-end gap-2" style={{ height: 140 }}>
              {trend.map((r) => {
                const total = Math.max(1, num(r.total_lines))
                const passPct = (num(r.pass_count) / total) * 100
                const failPct = (num(r.fail_count) / total) * 100
                return (
                  <button
                    key={r.id}
                    onClick={() => openRun(r.id)}
                    title={`${r.week_ending} — ${r.pass_count} pass / ${r.fail_count} fail`}
                    className="group flex w-full flex-col justify-end"
                  >
                    <div className="flex h-28 w-full flex-col justify-end overflow-hidden rounded-t bg-stone-800/40">
                      <div className="w-full bg-red-500/70" style={{ height: `${failPct}%` }} />
                      <div className="w-full bg-emerald-500/70" style={{ height: `${passPct}%` }} />
                    </div>
                    <div className="mt-1 truncate text-center text-[10px] text-stone-500 group-hover:text-stone-300">
                      {r.week_ending.slice(5)}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-stone-500">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/70" /> pass</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500/70" /> fail</span>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Run history</h2>
            {runsLoading && <Spinner />}
          </CardHeader>
          <CardBody>
            {!projectId ? (
              <EmptyState title="No project selected" />
            ) : runs.length === 0 && !runsLoading ? (
              <EmptyState
                title="No validation runs yet"
                description="Pick a week above and click Run prove to validate the ledger."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Week</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Pass</TH>
                    <TH className="text-right">Fail</TH>
                    <TH className="text-right">Shortfall</TH>
                  </TR>
                </THead>
                <TBody>
                  {runs.map((r) => (
                    <TR
                      key={r.id}
                      onClick={() => openRun(r.id)}
                      className={`cursor-pointer ${selectedId === r.id ? 'bg-cyan-500/10' : ''}`}
                    >
                      <TD className="whitespace-nowrap text-stone-200">{r.week_ending}</TD>
                      <TD>
                        <Badge tone={r.hard_fail ? 'red' : statusTone(r.status)}>
                          {r.hard_fail ? 'hard fail' : r.status}
                        </Badge>
                      </TD>
                      <TD className="text-right text-emerald-300">{num(r.pass_count)}</TD>
                      <TD className="text-right text-red-300">{num(r.fail_count)}</TD>
                      <TD className="text-right text-cyan-300">{money(num(r.total_shortfall))}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              {detail ? `Findings — week ending ${detail.week_ending}` : 'Run detail'}
            </h2>
            {detailLoading && <Spinner />}
          </CardHeader>
          <CardBody>
            {!selectedId ? (
              <EmptyState title="Select a run" description="Click a run on the left to see its findings." />
            ) : detailLoading ? (
              <div className="py-6">
                <Spinner label="Loading findings..." />
              </div>
            ) : !detail ? (
              <EmptyState title="Could not load run" />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Lines" value={num(detail.total_lines)} />
                  <Stat label="Pass" value={num(detail.pass_count)} tone="green" />
                  <Stat label="Fail" value={num(detail.fail_count)} tone={num(detail.fail_count) ? 'red' : 'green'} />
                  <Stat label="Shortfall" value={money(num(detail.total_shortfall))} tone={num(detail.total_shortfall) ? 'amber' : 'green'} />
                </div>

                {(detail.findings ?? []).length === 0 ? (
                  <EmptyState
                    title="No findings"
                    description="This week proved clean against the wage determination."
                  />
                ) : (
                  <div className="space-y-2">
                    {detail.findings.map((f) => (
                      <div key={f.id} className="rounded-lg border border-stone-800 bg-stone-950/40 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                          <span className="text-xs font-medium text-stone-400">{f.finding_type}</span>
                          {num(f.shortfall) > 0 && (
                            <span className="ml-auto text-xs font-semibold text-cyan-300">
                              {money(num(f.shortfall))}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-stone-200">{f.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

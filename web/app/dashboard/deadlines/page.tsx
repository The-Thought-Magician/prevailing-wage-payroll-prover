'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Project = {
  id: string
  name: string
  contract_number?: string
  start_date?: string
  end_date?: string
  filing_cadence?: string
}

type Deadline = {
  id: string
  project_id: string
  week_ending: string
  due_date: string
  filed: boolean
  created_at?: string
}

function dayStart(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysUntil(d: string): number {
  const today = dayStart(new Date()).getTime()
  const due = dayStart(new Date(d)).getTime()
  return Math.round((due - today) / 86400000)
}

type Status = 'filed' | 'overdue' | 'due-soon' | 'upcoming'

function statusOf(dl: Deadline): Status {
  if (dl.filed) return 'filed'
  const n = daysUntil(dl.due_date)
  if (n < 0) return 'overdue'
  if (n <= 7) return 'due-soon'
  return 'upcoming'
}

const STATUS_META: Record<Status, { label: string; tone: 'green' | 'red' | 'amber' | 'blue' }> = {
  filed: { label: 'Filed', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
  'due-soon': { label: 'Due soon', tone: 'amber' },
  upcoming: { label: 'Upcoming', tone: 'blue' },
}

function defaultGenRange(project?: Project) {
  const today = new Date()
  let start: Date
  let end: Date
  if (project?.start_date) {
    start = new Date(project.start_date)
    end = project.end_date ? new Date(project.end_date) : new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())
  } else {
    start = new Date(today)
    end = new Date(today)
    end.setMonth(end.getMonth() + 3)
  }
  const iso = (d: Date) => (Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10))
  return { start: iso(start), end: iso(end) }
}

export default function DeadlinesPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<'' | Status>('')
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [monthCursor, setMonthCursor] = useState<Date>(dayStart(new Date()))

  const [genOpen, setGenOpen] = useState(false)
  const [genForm, setGenForm] = useState({ start_date: '', end_date: '', due_offset_days: 7 })
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ps: Project[] = await api.getProjects()
        if (cancelled) return
        setProjects(ps || [])
        if (ps && ps.length > 0) setProjectId(ps[0].id)
        else setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load projects')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function loadDeadlines(pid: string, initial = false) {
    if (!pid) return
    if (initial) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const list: Deadline[] = await api.getDeadlines(pid)
      setDeadlines(list || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deadlines')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (projectId) loadDeadlines(projectId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const stats = useMemo(() => {
    let filed = 0
    let overdue = 0
    let dueSoon = 0
    for (const d of deadlines) {
      const s = statusOf(d)
      if (s === 'filed') filed++
      else if (s === 'overdue') overdue++
      else if (s === 'due-soon') dueSoon++
    }
    const total = deadlines.length
    const pct = total > 0 ? Math.round((filed / total) * 100) : 0
    return { total, filed, overdue, dueSoon, pct }
  }, [deadlines])

  const filtered = useMemo(() => {
    if (!statusFilter) return deadlines
    return deadlines.filter((d) => statusOf(d) === statusFilter)
  }, [deadlines, statusFilter])

  // Map due_date (YYYY-MM-DD) -> deadlines for calendar lookups.
  const byDueDate = useMemo(() => {
    const m = new Map<string, Deadline[]>()
    for (const d of deadlines) {
      const k = (d.due_date || '').slice(0, 10)
      if (!k) continue
      const arr = m.get(k) || []
      arr.push(d)
      m.set(k, arr)
    }
    return m
  }, [deadlines])

  function openGenerate() {
    const r = defaultGenRange(selectedProject)
    setGenForm({ start_date: r.start, end_date: r.end, due_offset_days: 7 })
    setGenError(null)
    setGenOpen(true)
  }

  async function generate() {
    if (!genForm.start_date || !genForm.end_date) {
      setGenError('Start and end dates are required.')
      return
    }
    if (genForm.start_date > genForm.end_date) {
      setGenError('Start date must be on or before end date.')
      return
    }
    setGenerating(true)
    setGenError(null)
    try {
      await api.generateDeadlines({
        project_id: projectId,
        start_date: genForm.start_date,
        end_date: genForm.end_date,
        due_offset_days: Number(genForm.due_offset_days) || 7,
      })
      setGenOpen(false)
      await loadDeadlines(projectId)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate deadlines')
    } finally {
      setGenerating(false)
    }
  }

  async function toggleFiled(dl: Deadline) {
    setTogglingId(dl.id)
    try {
      await api.updateDeadline(dl.id, { filed: !dl.filed })
      setDeadlines((prev) => prev.map((d) => (d.id === dl.id ? { ...d, filed: !d.filed } : d)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update deadline')
    } finally {
      setTogglingId(null)
    }
  }

  // Build a month grid for the calendar view.
  const calendar = useMemo(() => {
    const year = monthCursor.getFullYear()
    const month = monthCursor.getMonth()
    const first = new Date(year, month, 1)
    const startOffset = first.getDay()
    const gridStart = new Date(year, month, 1 - startOffset)
    const cells: Array<{ date: Date; inMonth: boolean }> = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      cells.push({ date: d, inMonth: d.getMonth() === month })
    }
    return { year, month, cells }
  }, [monthCursor])

  const todayKey = dayStart(new Date()).toISOString().slice(0, 10)

  if (loading) return <FullPageSpinner label="Loading deadlines..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Filing Deadlines</h1>
          <p className="mt-1 text-sm text-stone-400">
            Weekly certified-payroll filing calendar with overdue and due-soon reminders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <Spinner />}
          <Button onClick={openGenerate} disabled={!projectId}>
            + Generate deadlines
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project before generating its filing calendar."
          icon="🏗️"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total weeks" value={stats.total} />
            <Stat label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? 'red' : 'default'} />
            <Stat label="Due within 7 days" value={stats.dueSoon} tone={stats.dueSoon > 0 ? 'amber' : 'default'} />
            <Stat
              label="Filed"
              value={`${stats.pct}%`}
              tone={stats.pct >= 90 ? 'green' : stats.pct >= 60 ? 'amber' : 'red'}
              hint={`${stats.filed} of ${stats.total} weeks`}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col">
                  <label className="text-xs uppercase tracking-wide text-stone-500">Project</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="mt-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.contract_number ? ` · ${p.contract_number}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs uppercase tracking-wide text-stone-500">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as '' | Status)}
                    className="mt-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">All statuses</option>
                    <option value="overdue">Overdue</option>
                    <option value="due-soon">Due soon</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="filed">Filed</option>
                  </select>
                </div>
              </div>
              <div className="inline-flex overflow-hidden rounded-lg border border-stone-700">
                <button
                  onClick={() => setView('calendar')}
                  className={`px-3 py-2 text-sm ${view === 'calendar' ? 'bg-cyan-500 text-stone-950' : 'bg-stone-900 text-stone-300 hover:bg-stone-800'}`}
                >
                  Calendar
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-cyan-500 text-stone-950' : 'bg-stone-900 text-stone-300 hover:bg-stone-800'}`}
                >
                  List
                </button>
              </div>
            </CardHeader>

            <CardBody className={view === 'list' ? 'p-0' : ''}>
              {error && (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              {deadlines.length === 0 ? (
                <div className="py-10">
                  <EmptyState
                    title="No deadlines"
                    description="Generate the weekly filing calendar for this project's contract dates."
                    icon="📅"
                    action={<Button onClick={openGenerate}>+ Generate deadlines</Button>}
                  />
                </div>
              ) : view === 'calendar' ? (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
                      }
                    >
                      ← Prev
                    </Button>
                    <div className="text-sm font-semibold text-stone-200">
                      {monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
                      }
                    >
                      Next →
                    </Button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs uppercase tracking-wide text-stone-500">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendar.cells.map(({ date, inMonth }, i) => {
                      const key = date.toISOString().slice(0, 10)
                      const dls = byDueDate.get(key) || []
                      const isToday = key === todayKey
                      return (
                        <div
                          key={i}
                          className={`min-h-[78px] rounded-lg border p-1.5 text-left ${
                            inMonth
                              ? 'border-stone-800 bg-stone-950/40'
                              : 'border-stone-900 bg-stone-950/20'
                          } ${isToday ? 'ring-1 ring-cyan-500/60' : ''}`}
                        >
                          <div
                            className={`text-xs ${inMonth ? 'text-stone-400' : 'text-stone-600'} ${isToday ? 'font-bold text-cyan-400' : ''}`}
                          >
                            {date.getDate()}
                          </div>
                          <div className="mt-1 space-y-1">
                            {dls.map((dl) => {
                              const s = statusOf(dl)
                              const meta = STATUS_META[s]
                              return (
                                <button
                                  key={dl.id}
                                  onClick={() => toggleFiled(dl)}
                                  disabled={togglingId === dl.id}
                                  title={`Week ending ${fmtDate(dl.week_ending)} — click to ${dl.filed ? 'unmark' : 'mark'} filed`}
                                  className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${
                                    s === 'filed'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : s === 'overdue'
                                        ? 'bg-red-500/20 text-red-300'
                                        : s === 'due-soon'
                                          ? 'bg-cyan-500/20 text-cyan-300'
                                          : 'bg-sky-500/15 text-sky-300'
                                  }`}
                                >
                                  {dl.filed ? '✓ ' : ''}
                                  WE {(dl.week_ending || '').slice(5, 10)}
                                  <span className="ml-0.5 opacity-70">· {meta.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-stone-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded bg-red-500/60" /> Overdue
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded bg-cyan-500/60" /> Due soon
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded bg-sky-500/60" /> Upcoming
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded bg-emerald-500/60" /> Filed
                    </span>
                    <span className="ml-auto text-stone-500">Click a chip to toggle filed.</span>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-10">
                  <EmptyState title="No matches" description="Adjust your status filter." icon="🔍" />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Week ending</TH>
                      <TH>Due date</TH>
                      <TH>Countdown</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Action</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered
                      .slice()
                      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
                      .map((dl) => {
                        const s = statusOf(dl)
                        const meta = STATUS_META[s]
                        const n = daysUntil(dl.due_date)
                        return (
                          <TR key={dl.id}>
                            <TD className="font-medium text-stone-100">{fmtDate(dl.week_ending)}</TD>
                            <TD>{fmtDate(dl.due_date)}</TD>
                            <TD className="text-stone-400">
                              {dl.filed
                                ? '—'
                                : n < 0
                                  ? `${Math.abs(n)}d overdue`
                                  : n === 0
                                    ? 'Due today'
                                    : `in ${n}d`}
                            </TD>
                            <TD>
                              <Badge tone={meta.tone}>{meta.label}</Badge>
                            </TD>
                            <TD className="text-right">
                              <Button
                                variant={dl.filed ? 'ghost' : 'primary'}
                                onClick={() => toggleFiled(dl)}
                                disabled={togglingId === dl.id}
                              >
                                {togglingId === dl.id
                                  ? '…'
                                  : dl.filed
                                    ? 'Mark unfiled'
                                    : 'Mark filed'}
                              </Button>
                            </TD>
                          </TR>
                        )
                      })}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* Generate modal */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate filing deadlines"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {genError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {genError}
            </div>
          )}
          <p className="text-sm text-stone-400">
            Creates one weekly deadline (per Saturday week-ending) across the range for{' '}
            <span className="text-stone-200">{selectedProject?.name}</span>. Existing weeks are not
            duplicated.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-stone-500">Start date</label>
              <input
                type="date"
                value={genForm.start_date}
                onChange={(e) => setGenForm((f) => ({ ...f, start_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-stone-500">End date</label>
              <input
                type="date"
                value={genForm.end_date}
                onChange={(e) => setGenForm((f) => ({ ...f, end_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">
              Filing due offset (days after week ending)
            </label>
            <input
              type="number"
              min={0}
              max={60}
              value={genForm.due_offset_days}
              onChange={(e) =>
                setGenForm((f) => ({ ...f, due_offset_days: Number(e.target.value) }))
              }
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-stone-500">
              DBA certified payroll is generally due within 7 days of the week ending.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}

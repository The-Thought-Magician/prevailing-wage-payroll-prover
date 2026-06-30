'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Project = { id: string; name: string; county?: string; state?: string }
type Worker = {
  id: string
  full_name: string
  default_classification?: string | null
  is_apprentice?: boolean
}
type PayrollLine = {
  id: string
  project_id: string
  worker_id: string
  determination_id?: string | null
  work_date: string
  week_ending: string
  classification_name: string
  straight_hours: number
  overtime_hours: number
  doubletime_hours: number
  base_rate_paid: number
  fringe_cash_paid: number
  fringe_plan_paid: number
  gross_paid: number
  is_apprentice: boolean
  notes?: string | null
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

// Saturday of the week containing `d` (ISO yyyy-mm-dd) — common construction week-ending.
function weekEndingOf(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return d
  const day = dt.getDay() // 0 Sun .. 6 Sat
  const add = (6 - day + 7) % 7
  dt.setDate(dt.getDate() + add)
  return dt.toISOString().slice(0, 10)
}

// Mon..Sun dates for a week ending on `weekEnding` (Saturday).
function weekDates(weekEnding: string): string[] {
  const end = new Date(weekEnding + 'T00:00:00')
  if (Number.isNaN(end.getTime())) return []
  const monday = new Date(end)
  monday.setDate(end.getDate() - 5)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function LedgerPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [weekEnding, setWeekEnding] = useState<string>(weekEndingOf(todayIso()))
  const [lines, setLines] = useState<PayrollLine[]>([])
  const [linesLoading, setLinesLoading] = useState(false)
  const [search, setSearch] = useState('')

  const [bulkOpen, setBulkOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [editLine, setEditLine] = useState<PayrollLine | null>(null)
  const [singleOpen, setSingleOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadBase = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, w] = await Promise.all([api.getProjects(), api.getWorkers()])
      const pl: Project[] = Array.isArray(p) ? p : []
      setProjects(pl)
      setWorkers(Array.isArray(w) ? w : [])
      if (pl.length && !projectId) setProjectId(pl[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadLines = useCallback(async () => {
    if (!projectId) {
      setLines([])
      return
    }
    setLinesLoading(true)
    try {
      const res = await api.getPayrollLines({ project_id: projectId, week_ending: weekEnding })
      setLines(Array.isArray(res) ? res : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ledger')
    } finally {
      setLinesLoading(false)
    }
  }, [projectId, weekEnding])

  useEffect(() => {
    loadBase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadLines()
  }, [loadLines])

  const workerName = useCallback(
    (id: string) => workers.find((w) => w.id === id)?.full_name ?? 'Unknown worker',
    [workers],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return lines
    return lines.filter((l) => {
      const name = workerName(l.worker_id).toLowerCase()
      return name.includes(q) || l.classification_name.toLowerCase().includes(q)
    })
  }, [lines, search, workerName])

  // Group lines per worker for the week, summing day columns.
  const byWorker = useMemo(() => {
    const map = new Map<string, PayrollLine[]>()
    for (const l of filtered) {
      const arr = map.get(l.worker_id) ?? []
      arr.push(l)
      map.set(l.worker_id, arr)
    }
    return Array.from(map.entries()).map(([wid, arr]) => {
      const st = arr.reduce((s, l) => s + num(l.straight_hours), 0)
      const ot = arr.reduce((s, l) => s + num(l.overtime_hours), 0)
      const dt = arr.reduce((s, l) => s + num(l.doubletime_hours), 0)
      const gross = arr.reduce((s, l) => s + num(l.gross_paid), 0)
      return { workerId: wid, name: workerName(wid), lines: arr, st, ot, dt, gross }
    })
  }, [filtered, workerName])

  const totals = useMemo(() => {
    const st = lines.reduce((s, l) => s + num(l.straight_hours), 0)
    const ot = lines.reduce((s, l) => s + num(l.overtime_hours), 0)
    const dt = lines.reduce((s, l) => s + num(l.doubletime_hours), 0)
    const gross = lines.reduce((s, l) => s + num(l.gross_paid), 0)
    const wkrs = new Set(lines.map((l) => l.worker_id)).size
    return { st, ot, dt, gross, wkrs, count: lines.length }
  }, [lines])

  const projectName = projects.find((p) => p.id === projectId)?.name ?? ''

  async function handleDelete(id: string) {
    if (!confirm('Delete this payroll line?')) return
    setBusy(true)
    try {
      await api.deletePayrollLine(id)
      await loadLines()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <FullPageSpinner label="Loading ledger..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Payroll Ledger</h1>
          <p className="mt-1 text-sm text-slate-500">
            Per-worker, per-day certified-payroll ledger. Enter a full week at once or clone last week.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={!projectId}
            onClick={() => {
              setActionError(null)
              setCloneOpen(true)
            }}
          >
            Clone week
          </Button>
          <Button
            disabled={!projectId || workers.length === 0}
            onClick={() => {
              setActionError(null)
              setBulkOpen(true)
            }}
          >
            Bulk week entry
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col text-xs font-medium text-slate-400">
              Project
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 min-w-[14rem] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                {projects.length === 0 && <option value="">No projects</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-400">
              Week ending (Sat)
              <input
                type="date"
                value={weekEnding}
                onChange={(e) => setWeekEnding(e.target.value)}
                className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </label>
          </div>
          <label className="flex flex-col text-xs font-medium text-slate-400 sm:w-64">
            Search worker / classification
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter..."
              className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
            />
          </label>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Workers" value={totals.wkrs} />
        <Stat label="Lines" value={totals.count} />
        <Stat label="ST hrs" value={totals.st.toFixed(1)} />
        <Stat label="OT hrs" value={totals.ot.toFixed(1)} tone="amber" />
        <Stat label="DT hrs" value={totals.dt.toFixed(1)} tone="amber" />
        <Stat label="Gross" value={money(totals.gross)} tone="green" />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {projectName || 'Ledger'} — week ending {weekEnding}
            </h2>
            <p className="text-xs text-slate-500">{filtered.length} line(s)</p>
          </div>
          {linesLoading && <Spinner />}
        </CardHeader>
        <CardBody>
          {!projectId ? (
            <EmptyState title="No project selected" description="Create a project first, then return here to log payroll." />
          ) : byWorker.length === 0 && !linesLoading ? (
            <EmptyState
              title="No payroll lines this week"
              description="Use Bulk week entry to log a worker's Mon–Sun hours, or clone a prior week."
              action={
                workers.length > 0 ? (
                  <Button onClick={() => setBulkOpen(true)}>Bulk week entry</Button>
                ) : (
                  <span className="text-xs text-slate-500">Add workers to the roster first.</span>
                )
              }
            />
          ) : (
            <div className="space-y-6">
              {byWorker.map((grp) => (
                <div key={grp.workerId} className="rounded-lg border border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{grp.name}</span>
                      {grp.lines.some((l) => l.is_apprentice) && <Badge tone="blue">apprentice</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                      <span>ST {grp.st.toFixed(1)}</span>
                      <span className="text-amber-300">OT {grp.ot.toFixed(1)}</span>
                      <span className="text-amber-300">DT {grp.dt.toFixed(1)}</span>
                      <span className="text-emerald-300">{money(grp.gross)}</span>
                    </div>
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Date</TH>
                        <TH>Classification</TH>
                        <TH className="text-right">ST</TH>
                        <TH className="text-right">OT</TH>
                        <TH className="text-right">DT</TH>
                        <TH className="text-right">Base $/hr</TH>
                        <TH className="text-right">Fringe cash</TH>
                        <TH className="text-right">Fringe plan</TH>
                        <TH className="text-right">Gross</TH>
                        <TH className="text-right">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {grp.lines
                        .slice()
                        .sort((a, b) => a.work_date.localeCompare(b.work_date))
                        .map((l) => (
                          <TR key={l.id}>
                            <TD className="whitespace-nowrap text-slate-200">{l.work_date}</TD>
                            <TD>{l.classification_name}</TD>
                            <TD className="text-right">{num(l.straight_hours).toFixed(1)}</TD>
                            <TD className="text-right text-amber-300">{num(l.overtime_hours).toFixed(1)}</TD>
                            <TD className="text-right text-amber-300">{num(l.doubletime_hours).toFixed(1)}</TD>
                            <TD className="text-right">{money(num(l.base_rate_paid))}</TD>
                            <TD className="text-right">{money(num(l.fringe_cash_paid))}</TD>
                            <TD className="text-right">{money(num(l.fringe_plan_paid))}</TD>
                            <TD className="text-right text-emerald-300">{money(num(l.gross_paid))}</TD>
                            <TD className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1"
                                  onClick={() => {
                                    setActionError(null)
                                    setEditLine(l)
                                    setSingleOpen(true)
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1 text-red-400 hover:text-red-300"
                                  disabled={busy}
                                  onClick={() => handleDelete(l.id)}
                                >
                                  Del
                                </Button>
                              </div>
                            </TD>
                          </TR>
                        ))}
                    </TBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {bulkOpen && (
        <BulkWeekModal
          projectId={projectId}
          weekEnding={weekEnding}
          workers={workers}
          busy={busy}
          error={actionError}
          onClose={() => setBulkOpen(false)}
          onSubmit={async (body) => {
            setBusy(true)
            setActionError(null)
            try {
              await api.bulkCreatePayrollLines(body)
              setBulkOpen(false)
              await loadLines()
            } catch (e) {
              setActionError(e instanceof Error ? e.message : 'Bulk entry failed')
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {cloneOpen && (
        <CloneWeekModal
          projectId={projectId}
          fromWeek={weekEnding}
          busy={busy}
          error={actionError}
          onClose={() => setCloneOpen(false)}
          onSubmit={async (body) => {
            setBusy(true)
            setActionError(null)
            try {
              await api.cloneWeek(body)
              setCloneOpen(false)
              setWeekEnding(body.to_week_ending)
            } catch (e) {
              setActionError(e instanceof Error ? e.message : 'Clone failed')
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {singleOpen && editLine && (
        <EditLineModal
          line={editLine}
          busy={busy}
          error={actionError}
          onClose={() => {
            setSingleOpen(false)
            setEditLine(null)
          }}
          onSubmit={async (body) => {
            setBusy(true)
            setActionError(null)
            try {
              await api.updatePayrollLine(editLine.id, body)
              setSingleOpen(false)
              setEditLine(null)
              await loadLines()
            } catch (e) {
              setActionError(e instanceof Error ? e.message : 'Update failed')
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
    </div>
  )
}

// ----- Bulk week entry: pick a worker, set per-day hours + rates, build day lines -----
function BulkWeekModal({
  projectId,
  weekEnding,
  workers,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  projectId: string
  weekEnding: string
  workers: Worker[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const dates = weekDates(weekEnding)
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? '')
  const selected = workers.find((w) => w.id === workerId)
  const [classification, setClassification] = useState(selected?.default_classification ?? '')
  const [isApprentice, setIsApprentice] = useState<boolean>(!!selected?.is_apprentice)
  const [baseRate, setBaseRate] = useState('0')
  const [fringeCash, setFringeCash] = useState('0')
  const [fringePlan, setFringePlan] = useState('0')
  const [otMult, setOtMult] = useState('1.5')
  const [st, setSt] = useState<string[]>(() => dates.map(() => ''))
  const [ot, setOt] = useState<string[]>(() => dates.map(() => ''))

  useEffect(() => {
    const w = workers.find((x) => x.id === workerId)
    setClassification(w?.default_classification ?? '')
    setIsApprentice(!!w?.is_apprentice)
  }, [workerId, workers])

  const base = num(baseRate)
  const fc = num(fringeCash)
  const fp = num(fringePlan)
  const mult = num(otMult) || 1.5

  const preview = dates.map((d, i) => {
    const sH = num(st[i])
    const oH = num(ot[i])
    const gross = sH * (base + fc + fp) + oH * (base * mult + fc + fp)
    return { date: d, sH, oH, gross }
  })
  const totalGross = preview.reduce((s, p) => s + p.gross, 0)
  const totalHours = preview.reduce((s, p) => s + p.sH + p.oH, 0)

  function submit() {
    const lines = preview
      .filter((p) => p.sH > 0 || p.oH > 0)
      .map((p) => ({
        project_id: projectId,
        worker_id: workerId,
        work_date: p.date,
        week_ending: weekEnding,
        classification_name: classification,
        straight_hours: p.sH,
        overtime_hours: p.oH,
        doubletime_hours: 0,
        base_rate_paid: base,
        fringe_cash_paid: fc,
        fringe_plan_paid: fp,
        gross_paid: Math.round(p.gross * 100) / 100,
        is_apprentice: isApprentice,
      }))
    onSubmit({ project_id: projectId, week_ending: weekEnding, worker_id: workerId, lines })
  }

  const valid = workerId && classification.trim() && preview.some((p) => p.sH > 0 || p.oH > 0)

  return (
    <Modal
      open
      onClose={onClose}
      title="Bulk week entry"
      className="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !valid}>
            {busy ? 'Saving...' : 'Save week'}
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Worker
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Classification
          <input
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
            placeholder="e.g. Electrician (Journeyworker)"
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Base $/hr
          <input
            type="number"
            step="0.01"
            value={baseRate}
            onChange={(e) => setBaseRate(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Fringe cash $/hr
          <input
            type="number"
            step="0.01"
            value={fringeCash}
            onChange={(e) => setFringeCash(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Fringe plan $/hr
          <input
            type="number"
            step="0.01"
            value={fringePlan}
            onChange={(e) => setFringePlan(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          OT multiplier
          <input
            type="number"
            step="0.1"
            value={otMult}
            onChange={(e) => setOtMult(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={isApprentice}
          onChange={(e) => setIsApprentice(e.target.checked)}
          className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-amber-500"
        />
        Apprentice on this work
      </label>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Day</th>
              {dates.map((d, i) => (
                <th key={d} className="px-2 py-2 text-center">
                  {DAYS[i]}
                  <div className="text-[10px] font-normal text-slate-600">{d.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-800">
              <td className="px-3 py-2 text-slate-400">ST hrs</td>
              {dates.map((d, i) => (
                <td key={d} className="px-1 py-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={st[i]}
                    onChange={(e) => setSt((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-center text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </td>
              ))}
            </tr>
            <tr className="border-t border-slate-800">
              <td className="px-3 py-2 text-amber-300">OT hrs</td>
              {dates.map((d, i) => (
                <td key={d} className="px-1 py-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={ot[i]}
                    onChange={(e) => setOt((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-center text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-between text-xs text-slate-400">
        <span>Total hours: {totalHours.toFixed(1)}</span>
        <span className="text-emerald-300">Projected gross: {money(totalGross)}</span>
      </div>
    </Modal>
  )
}

// ----- Clone week -----
function CloneWeekModal({
  projectId,
  fromWeek,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  projectId: string
  fromWeek: string
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: { project_id: string; from_week_ending: string; to_week_ending: string }) => void
}) {
  const [from, setFrom] = useState(fromWeek)
  const nextWeek = (() => {
    const d = new Date(fromWeek + 'T00:00:00')
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })()
  const [to, setTo] = useState(nextWeek)

  return (
    <Modal
      open
      onClose={onClose}
      title="Clone week"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ project_id: projectId, from_week_ending: from, to_week_ending: to })}
            disabled={busy || !from || !to || from === to}
          >
            {busy ? 'Cloning...' : 'Clone'}
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      <p className="mb-3 text-sm text-slate-400">
        Copy every payroll line from one week to another for this project. Useful when the crew works the same
        schedule week over week.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs font-medium text-slate-400">
          From week ending
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          To week ending
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
      </div>
    </Modal>
  )
}

// ----- Edit single line -----
function EditLineModal({
  line,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  line: PayrollLine
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [classification, setClassification] = useState(line.classification_name)
  const [workDate, setWorkDate] = useState(line.work_date)
  const [st, setSt] = useState(String(num(line.straight_hours)))
  const [ot, setOt] = useState(String(num(line.overtime_hours)))
  const [dt, setDt] = useState(String(num(line.doubletime_hours)))
  const [base, setBase] = useState(String(num(line.base_rate_paid)))
  const [fc, setFc] = useState(String(num(line.fringe_cash_paid)))
  const [fp, setFp] = useState(String(num(line.fringe_plan_paid)))
  const [gross, setGross] = useState(String(num(line.gross_paid)))
  const [isApprentice, setIsApprentice] = useState(!!line.is_apprentice)
  const [notes, setNotes] = useState(line.notes ?? '')

  const recalc = () => {
    const g = num(st) * (num(base) + num(fc) + num(fp)) + num(ot) * (num(base) * 1.5 + num(fc) + num(fp)) +
      num(dt) * (num(base) * 2 + num(fc) + num(fp))
    setGross((Math.round(g * 100) / 100).toString())
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit payroll line"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                work_date: workDate,
                classification_name: classification,
                straight_hours: num(st),
                overtime_hours: num(ot),
                doubletime_hours: num(dt),
                base_rate_paid: num(base),
                fringe_cash_paid: num(fc),
                fringe_plan_paid: num(fp),
                gross_paid: num(gross),
                is_apprentice: isApprentice,
                notes,
              })
            }
            disabled={busy || !classification.trim()}
          >
            {busy ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Work date
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="col-span-2 flex flex-col text-xs font-medium text-slate-400 sm:col-span-2">
          Classification
          <input
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          ST hrs
          <input type="number" step="0.5" value={st} onChange={(e) => setSt(e.target.value)} onBlur={recalc} className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none" />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          OT hrs
          <input type="number" step="0.5" value={ot} onChange={(e) => setOt(e.target.value)} onBlur={recalc} className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none" />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          DT hrs
          <input type="number" step="0.5" value={dt} onChange={(e) => setDt(e.target.value)} onBlur={recalc} className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none" />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Base $/hr
          <input type="number" step="0.01" value={base} onChange={(e) => setBase(e.target.value)} onBlur={recalc} className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none" />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Fringe cash $/hr
          <input type="number" step="0.01" value={fc} onChange={(e) => setFc(e.target.value)} onBlur={recalc} className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none" />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Fringe plan $/hr
          <input type="number" step="0.01" value={fp} onChange={(e) => setFp(e.target.value)} onBlur={recalc} className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none" />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Gross paid
          <input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none" />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={isApprentice}
          onChange={(e) => setIsApprentice(e.target.checked)}
          className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-amber-500"
        />
        Apprentice
      </label>
      <label className="mt-3 flex flex-col text-xs font-medium text-slate-400">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
        />
      </label>
    </Modal>
  )
}

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

type Project = { id: string; name: string }
type Finding = {
  id: string
  run_id?: string | null
  project_id: string
  payroll_line_id?: string | null
  worker_id?: string | null
  finding_type: string
  severity: string
  status: string
  message: string
  shortfall: number
  week_ending?: string | null
  assignee?: string | null
  resolution_notes?: string | null
  created_at?: string
  updated_at?: string
}

const STATUSES = ['open', 'in_review', 'resolved', 'waived']

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}
function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}
function severityTone(s: string): 'red' | 'amber' | 'blue' | 'neutral' {
  const v = (s || '').toLowerCase()
  if (v === 'hard' || v === 'critical' || v === 'error' || v === 'high') return 'red'
  if (v === 'warning' || v === 'soft' || v === 'medium') return 'amber'
  if (v === 'info' || v === 'low') return 'blue'
  return 'neutral'
}
function statusTone(s: string): 'green' | 'amber' | 'red' | 'slate' | 'neutral' {
  const v = (s || '').toLowerCase()
  if (v === 'resolved') return 'green'
  if (v === 'open') return 'red'
  if (v === 'in_review') return 'amber'
  if (v === 'waived') return 'slate'
  return 'neutral'
}

export default function FindingsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [listLoading, setListLoading] = useState(false)

  const [projectId, setProjectId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [edit, setEdit] = useState<Finding | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      const p = await api.getProjects()
      setProjects(Array.isArray(p) ? p : [])
    } catch {
      // projects are an optional filter; ignore
    }
  }, [])

  const loadFindings = useCallback(async () => {
    setListLoading(true)
    setError(null)
    try {
      const res = await api.getFindings({
        project_id: projectId || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
      })
      setFindings(Array.isArray(res) ? res : [])
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load findings')
    } finally {
      setListLoading(false)
      setLoading(false)
    }
  }, [projectId, statusFilter, typeFilter])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    loadFindings()
  }, [loadFindings])

  const projectName = useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? '—',
    [projects],
  )

  const types = useMemo(() => {
    const set = new Set<string>()
    findings.forEach((f) => f.finding_type && set.add(f.finding_type))
    return Array.from(set).sort()
  }, [findings])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return findings
    return findings.filter(
      (f) =>
        f.message.toLowerCase().includes(q) ||
        f.finding_type.toLowerCase().includes(q) ||
        (f.assignee ?? '').toLowerCase().includes(q),
    )
  }, [findings, search])

  const stats = useMemo(() => {
    const open = findings.filter((f) => f.status?.toLowerCase() === 'open').length
    const resolved = findings.filter((f) => f.status?.toLowerCase() === 'resolved').length
    const totalShortfall = findings.reduce((s, f) => s + num(f.shortfall), 0)
    const openShortfall = findings
      .filter((f) => f.status?.toLowerCase() !== 'resolved' && f.status?.toLowerCase() !== 'waived')
      .reduce((s, f) => s + num(f.shortfall), 0)
    return { total: findings.length, open, resolved, totalShortfall, openShortfall }
  }, [findings])

  // breakdown by type for a simple horizontal bar chart
  const byType = useMemo(() => {
    const map = new Map<string, number>()
    findings.forEach((f) => map.set(f.finding_type, (map.get(f.finding_type) ?? 0) + 1))
    const rows = Array.from(map.entries()).map(([type, count]) => ({ type, count }))
    rows.sort((a, b) => b.count - a.count)
    const max = Math.max(1, ...rows.map((r) => r.count))
    return { rows, max }
  }, [findings])

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((cur) => {
      if (cur.size === filtered.length) return new Set()
      return new Set(filtered.map((f) => f.id))
    })
  }

  async function bulkResolve() {
    if (selected.size === 0) return
    if (!confirm(`Resolve ${selected.size} finding(s)?`)) return
    setBusy(true)
    setActionError(null)
    try {
      await api.bulkResolveFindings({ ids: Array.from(selected), status: 'resolved' })
      await loadFindings()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Bulk resolve failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <FullPageSpinner label="Loading findings..." />

  const allSelected = filtered.length > 0 && selected.size === filtered.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">Findings &amp; Violations</h1>
        <p className="text-sm text-slate-500">
          Every wage, fringe, overtime, apprentice-ratio and classification violation surfaced by validation. Triage,
          assign and resolve.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total" value={stats.total} />
        <Stat label="Open" value={stats.open} tone={stats.open ? 'red' : 'green'} />
        <Stat label="Resolved" value={stats.resolved} tone="green" />
        <Stat label="Open shortfall" value={money(stats.openShortfall)} tone={stats.openShortfall ? 'amber' : 'green'} />
        <Stat label="Total shortfall" value={money(stats.totalShortfall)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col text-xs font-medium text-slate-400">
              Project
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 min-w-[12rem] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-400">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-400">
              Type
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">All types</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-400 sm:flex-1">
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Message, type, assignee..."
                className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
              />
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">By type</h2>
          </CardHeader>
          <CardBody>
            {byType.rows.length === 0 ? (
              <p className="text-sm text-slate-500">No findings.</p>
            ) : (
              <div className="space-y-2">
                {byType.rows.map((r) => (
                  <div key={r.type}>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span className="truncate">{r.type}</span>
                      <span>{r.count}</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded bg-amber-500" style={{ width: `${(r.count / byType.max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Findings</h2>
            {listLoading && <Spinner />}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{selected.size} selected</span>
              <Button onClick={bulkResolve} disabled={busy}>
                {busy ? 'Working...' : 'Resolve selected'}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardBody>
          {actionError && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {actionError}
            </div>
          )}
          {filtered.length === 0 && !listLoading ? (
            <EmptyState
              title="No findings"
              description="Either everything is compliant, or no validation has run yet. Run prove from the Validation page."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-amber-500"
                    />
                  </TH>
                  <TH>Severity</TH>
                  <TH>Type</TH>
                  <TH>Message</TH>
                  <TH>Project</TH>
                  <TH>Week</TH>
                  <TH className="text-right">Shortfall</TH>
                  <TH>Status</TH>
                  <TH>Assignee</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((f) => (
                  <TR key={f.id}>
                    <TD>
                      <input
                        type="checkbox"
                        checked={selected.has(f.id)}
                        onChange={() => toggle(f.id)}
                        className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-amber-500"
                      />
                    </TD>
                    <TD>
                      <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-slate-300">{f.finding_type}</TD>
                    <TD className="max-w-md text-slate-200">{f.message}</TD>
                    <TD className="whitespace-nowrap text-slate-400">{projectName(f.project_id)}</TD>
                    <TD className="whitespace-nowrap text-slate-400">{f.week_ending ?? '—'}</TD>
                    <TD className="text-right text-amber-300">{num(f.shortfall) ? money(num(f.shortfall)) : '—'}</TD>
                    <TD>
                      <Badge tone={statusTone(f.status)}>{f.status}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-slate-400">{f.assignee || '—'}</TD>
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        className="px-2 py-1"
                        onClick={() => {
                          setActionError(null)
                          setEdit(f)
                        }}
                      >
                        Triage
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {edit && (
        <TriageModal
          finding={edit}
          busy={busy}
          error={actionError}
          onClose={() => setEdit(null)}
          onSubmit={async (body) => {
            setBusy(true)
            setActionError(null)
            try {
              await api.updateFinding(edit.id, body)
              setEdit(null)
              await loadFindings()
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

function TriageModal({
  finding,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  finding: Finding
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [status, setStatus] = useState(finding.status || 'open')
  const [assignee, setAssignee] = useState(finding.assignee ?? '')
  const [notes, setNotes] = useState(finding.resolution_notes ?? '')

  return (
    <Modal
      open
      onClose={onClose}
      title="Triage finding"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ status, assignee, resolution_notes: notes })}
            disabled={busy}
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
      <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
          <span className="text-xs font-medium text-slate-400">{finding.finding_type}</span>
          {num(finding.shortfall) > 0 && (
            <span className="ml-auto text-xs font-semibold text-amber-300">{money(num(finding.shortfall))}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-200">{finding.message}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-400">
          Assignee
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Who owns this?"
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
          />
        </label>
      </div>
      <label className="mt-3 flex flex-col text-xs font-medium text-slate-400">
        Resolution notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="How was this resolved or why is it waived?"
          className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
        />
      </label>
    </Modal>
  )
}

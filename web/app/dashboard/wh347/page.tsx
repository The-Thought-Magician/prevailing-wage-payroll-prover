'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Project {
  id: string
  name?: string
  awarding_agency?: string
  contract_number?: string
}

interface Wh347 {
  id: string
  project_id: string
  week_ending?: string
  payroll_number?: number
  is_final?: boolean
  status?: string
  fringe_method?: string
  lines?: unknown[]
  totals?: Record<string, number> | null
  created_at?: string
}

const statusTone = (s?: string): 'amber' | 'green' | 'red' | 'slate' | 'neutral' => {
  switch ((s || '').toLowerCase()) {
    case 'signed':
      return 'green'
    case 'reopened':
      return 'amber'
    case 'draft':
      return 'slate'
    default:
      return 'neutral'
  }
}

function money(cents?: number) {
  if (cents == null || Number.isNaN(cents)) return '$0.00'
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dollars(n?: number) {
  if (n == null || Number.isNaN(n)) return '$0.00'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function lineCount(w: Wh347): number {
  if (Array.isArray(w.lines)) return w.lines.length
  return 0
}

function grossOf(w: Wh347): number {
  const t = w.totals || {}
  // Tolerate either cents or dollar shaped totals; prefer common keys.
  const v =
    (t as Record<string, number>).gross_paid ??
    (t as Record<string, number>).gross ??
    (t as Record<string, number>).total_gross ??
    0
  return typeof v === 'number' ? v : 0
}

export default function Wh347ListPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wh347s, setWh347s] = useState<Wh347[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  const [projectFilter, setProjectFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const [genOpen, setGenOpen] = useState(false)
  const [genProject, setGenProject] = useState('')
  const [genWeek, setGenWeek] = useState('')
  const [genFringe, setGenFringe] = useState('4a')
  const [genFinal, setGenFinal] = useState(false)
  const [genBusy, setGenBusy] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [docs, projs] = await Promise.all([
        api.getWh347s(projectFilter || undefined),
        api.getProjects(),
      ])
      setWh347s(Array.isArray(docs) ? docs : [])
      setProjects(Array.isArray(projs) ? projs : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load WH-347 documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter])

  const projectName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projects) m.set(p.id, p.name || p.contract_number || p.id)
    return (id: string) => m.get(id) || id
  }, [projects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return wh347s.filter((w) => {
      if (statusFilter && (w.status || '').toLowerCase() !== statusFilter) return false
      if (!q) return true
      const hay = `${projectName(w.project_id)} ${w.week_ending || ''} ${w.payroll_number ?? ''} ${w.status || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [wh347s, statusFilter, search, projectName])

  const stats = useMemo(() => {
    const total = wh347s.length
    const signed = wh347s.filter((w) => (w.status || '').toLowerCase() === 'signed').length
    const draft = wh347s.filter((w) => (w.status || '').toLowerCase() === 'draft').length
    const reopened = wh347s.filter((w) => (w.status || '').toLowerCase() === 'reopened').length
    return { total, signed, draft, reopened }
  }, [wh347s])

  async function submitGenerate() {
    if (!genProject || !genWeek) {
      setGenError('Project and week-ending are required.')
      return
    }
    setGenBusy(true)
    setGenError(null)
    try {
      await api.generateWh347({
        project_id: genProject,
        week_ending: genWeek,
        fringe_method: genFringe,
        is_final: genFinal,
      })
      setGenOpen(false)
      setGenProject('')
      setGenWeek('')
      setGenFringe('4a')
      setGenFinal(false)
      await load()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate WH-347')
    } finally {
      setGenBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this draft WH-347? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await api.deleteWh347(id)
      setWh347s((prev) => prev.filter((w) => w.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">WH-347 Certified Payroll</h1>
          <p className="mt-1 text-sm text-slate-400">
            Generate U.S. DOL form WH-347 from your proven ledger and route each week for the Statement of Compliance.
          </p>
        </div>
        <Button
          onClick={() => {
            setGenProject(projectFilter || (projects[0]?.id ?? ''))
            setGenWeek('')
            setGenError(null)
            setGenOpen(true)
          }}
        >
          Generate WH-347
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Forms" value={stats.total} />
        <Stat label="Signed" value={stats.signed} tone="green" />
        <Stat label="Drafts" value={stats.draft} tone="amber" />
        <Stat label="Reopened" value={stats.reopened} tone="red" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.contract_number || p.id}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="signed">Signed</option>
              <option value="reopened">Reopened</option>
            </select>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search week, payroll #, project…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none sm:w-72"
          />
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <FullPageSpinner label="Loading WH-347 forms…" />
          ) : error ? (
            <div className="p-6">
              <EmptyState
                title="Could not load WH-347 forms"
                description={error}
                action={
                  <Button variant="secondary" onClick={load}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={wh347s.length === 0 ? 'No WH-347 forms yet' : 'No forms match your filters'}
                description={
                  wh347s.length === 0
                    ? 'Generate a certified payroll form from a project week to begin filing.'
                    : 'Try clearing the search or status filter.'
                }
                action={
                  wh347s.length === 0 ? (
                    <Button onClick={() => setGenOpen(true)}>Generate WH-347</Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Project</TH>
                  <TH>Week Ending</TH>
                  <TH className="text-right">Payroll #</TH>
                  <TH className="text-center">Final</TH>
                  <TH>Fringe</TH>
                  <TH className="text-right">Lines</TH>
                  <TH className="text-right">Gross</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((w) => (
                  <TR key={w.id}>
                    <TD className="font-medium text-slate-200">{projectName(w.project_id)}</TD>
                    <TD>{w.week_ending || '—'}</TD>
                    <TD className="text-right tabular-nums">{w.payroll_number ?? '—'}</TD>
                    <TD className="text-center">
                      {w.is_final ? <Badge tone="amber">Final</Badge> : <span className="text-slate-600">—</span>}
                    </TD>
                    <TD className="capitalize">{w.fringe_method || '—'}</TD>
                    <TD className="text-right tabular-nums">{lineCount(w)}</TD>
                    <TD className="text-right tabular-nums">{dollars(grossOf(w))}</TD>
                    <TD>
                      <Badge tone={statusTone(w.status)} className="capitalize">
                        {w.status || 'draft'}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dashboard/wh347/${w.id}`}>
                          <Button variant="secondary" className="px-3 py-1.5">
                            Open
                          </Button>
                        </Link>
                        {(w.status || 'draft').toLowerCase() === 'draft' && (
                          <Button
                            variant="danger"
                            className="px-3 py-1.5"
                            disabled={deletingId === w.id}
                            onClick={() => handleDelete(w.id)}
                          >
                            {deletingId === w.id ? '…' : 'Delete'}
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={genOpen}
        onClose={() => !genBusy && setGenOpen(false)}
        title="Generate WH-347"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGenOpen(false)} disabled={genBusy}>
              Cancel
            </Button>
            <Button onClick={submitGenerate} disabled={genBusy}>
              {genBusy ? 'Generating…' : 'Generate'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Builds the certified payroll form from ledger lines for the selected project week. The next payroll number
            is assigned automatically.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Project</label>
            <select
              value={genProject}
              onChange={(e) => setGenProject(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.contract_number || p.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Week Ending
            </label>
            <input
              type="date"
              value={genWeek}
              onChange={(e) => setGenWeek(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Fringe Method
            </label>
            <select
              value={genFringe}
              onChange={(e) => setGenFringe(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="4a">4(a) — Paid in cash</option>
              <option value="4b">4(b) — Paid to approved plans/funds</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={genFinal}
              onChange={(e) => setGenFinal(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
            />
            Mark as final payroll for this project
          </label>
          {genError && <p className="text-sm text-red-400">{genError}</p>}
        </div>
      </Modal>
    </div>
  )
}

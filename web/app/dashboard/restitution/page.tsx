'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Project {
  id: string
  name?: string
  contract_number?: string
}

interface Worksheet {
  id: string
  project_id: string
  period_start?: string
  period_end?: string
  status?: string
  total_owed?: number
  created_at?: string
}

interface RestitutionItem {
  id: string
  worksheet_id?: string
  worker_id?: string
  worker_name?: string
  full_name?: string
  base_shortfall?: number
  fringe_shortfall?: number
  ot_shortfall?: number
  total_shortfall?: number
  paid?: boolean
  paid_reference?: string
  created_at?: string
}

interface WorksheetDetail extends Worksheet {
  items?: RestitutionItem[]
}

function dollars(n?: number) {
  if (n == null || Number.isNaN(n)) return '$0.00'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusTone(s?: string): 'amber' | 'green' | 'red' | 'slate' | 'neutral' | 'blue' {
  switch ((s || '').toLowerCase()) {
    case 'paid':
    case 'closed':
    case 'resolved':
      return 'green'
    case 'open':
      return 'amber'
    case 'partial':
      return 'blue'
    default:
      return 'slate'
  }
}

function itemName(i: RestitutionItem) {
  return i.worker_name || i.full_name || i.worker_id || '—'
}

export default function RestitutionPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [worksheets, setWorksheets] = useState<Worksheet[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  // generate
  const [genOpen, setGenOpen] = useState(false)
  const [genProject, setGenProject] = useState('')
  const [genStart, setGenStart] = useState('')
  const [genEnd, setGenEnd] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // detail drawer
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<WorksheetDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // pay item
  const [payItem, setPayItem] = useState<RestitutionItem | null>(null)
  const [payRef, setPayRef] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ws, projs] = await Promise.all([
        api.getRestitutionWorksheets(projectFilter || undefined),
        api.getProjects(),
      ])
      setWorksheets(Array.isArray(ws) ? ws : [])
      setProjects(Array.isArray(projs) ? projs : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load restitution worksheets')
    } finally {
      setLoading(false)
    }
  }, [projectFilter])

  useEffect(() => {
    load()
  }, [load])

  const projectName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projects) m.set(p.id, p.name || p.contract_number || p.id)
    return (id: string) => m.get(id) || id
  }, [projects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return worksheets.filter((w) => {
      if (statusFilter && (w.status || '').toLowerCase() !== statusFilter) return false
      if (!q) return true
      const hay = `${projectName(w.project_id)} ${w.period_start || ''} ${w.period_end || ''} ${w.status || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [worksheets, statusFilter, search, projectName])

  const stats = useMemo(() => {
    const totalOwed = worksheets.reduce((a, w) => a + Number(w.total_owed || 0), 0)
    const open = worksheets.filter((w) => (w.status || '').toLowerCase() === 'open').length
    return { count: worksheets.length, totalOwed, open }
  }, [worksheets])

  async function openDetail(id: string) {
    setOpenId(id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const d = await api.getRestitutionWorksheet(id)
      setDetail(d)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load worksheet')
    } finally {
      setDetailLoading(false)
    }
  }

  async function submitGenerate() {
    if (!genProject || !genStart || !genEnd) {
      setGenError('Project, period start and period end are required.')
      return
    }
    setGenBusy(true)
    setGenError(null)
    try {
      await api.generateRestitution({ project_id: genProject, period_start: genStart, period_end: genEnd })
      setGenOpen(false)
      setGenProject('')
      setGenStart('')
      setGenEnd('')
      await load()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate worksheet')
    } finally {
      setGenBusy(false)
    }
  }

  async function submitPay() {
    if (!detail || !payItem) return
    setPayBusy(true)
    setPayError(null)
    try {
      await api.markRestitutionItemPaid(detail.id, payItem.id, { paid: true, paid_reference: payRef.trim() })
      // refresh detail + list (totals/status may change)
      const d = await api.getRestitutionWorksheet(detail.id)
      setDetail(d)
      setPayItem(null)
      setPayRef('')
      await load()
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Failed to mark paid')
    } finally {
      setPayBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this restitution worksheet? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await api.deleteRestitutionWorksheet(id)
      setWorksheets((prev) => prev.filter((w) => w.id !== id))
      if (openId === id) {
        setOpenId(null)
        setDetail(null)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const detailStats = useMemo(() => {
    const items = detail?.items || []
    const owed = items.reduce((a, i) => a + Number(i.total_shortfall || 0), 0)
    const paid = items.filter((i) => i.paid).reduce((a, i) => a + Number(i.total_shortfall || 0), 0)
    const remaining = owed - paid
    return { count: items.length, owed, paid, remaining }
  }, [detail])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Back-Wage Restitution</h1>
          <p className="mt-1 text-sm text-slate-400">
            Build worksheets from validated shortfalls, track back-wage payments per worker, and close out exposure.
          </p>
        </div>
        <Button
          onClick={() => {
            setGenProject(projectFilter || (projects[0]?.id ?? ''))
            setGenStart('')
            setGenEnd('')
            setGenError(null)
            setGenOpen(true)
          }}
        >
          Generate Worksheet
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Worksheets" value={stats.count} />
        <Stat label="Open" value={stats.open} tone="amber" />
        <Stat label="Total Owed" value={dollars(stats.totalOwed)} tone={stats.totalOwed > 0 ? 'red' : 'green'} />
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
              <option value="open">Open</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project or period…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none sm:w-72"
          />
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <FullPageSpinner label="Loading worksheets…" />
          ) : error ? (
            <div className="p-6">
              <EmptyState
                title="Could not load worksheets"
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
                title={worksheets.length === 0 ? 'No restitution worksheets' : 'No worksheets match your filters'}
                description={
                  worksheets.length === 0
                    ? 'Generate a worksheet for a project period to compute owed back wages from findings.'
                    : 'Try clearing the search or status filter.'
                }
                action={
                  worksheets.length === 0 ? (
                    <Button onClick={() => setGenOpen(true)}>Generate Worksheet</Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Project</TH>
                  <TH>Period</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total Owed</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((w) => (
                  <TR key={w.id} className="cursor-pointer" onClick={() => openDetail(w.id)}>
                    <TD className="font-medium text-slate-200">{projectName(w.project_id)}</TD>
                    <TD>
                      {w.period_start || '—'} → {w.period_end || '—'}
                    </TD>
                    <TD>
                      <Badge tone={statusTone(w.status)} className="capitalize">
                        {w.status || 'open'}
                      </Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{dollars(w.total_owed)}</TD>
                    <TD>{w.created_at ? new Date(w.created_at).toLocaleDateString() : '—'}</TD>
                    <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" className="px-3 py-1.5" onClick={() => openDetail(w.id)}>
                          Open
                        </Button>
                        <Button
                          variant="danger"
                          className="px-3 py-1.5"
                          disabled={deletingId === w.id}
                          onClick={() => handleDelete(w.id)}
                        >
                          {deletingId === w.id ? '…' : 'Delete'}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Generate modal */}
      <Modal
        open={genOpen}
        onClose={() => !genBusy && setGenOpen(false)}
        title="Generate Restitution Worksheet"
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
            Aggregates base, fringe, and overtime shortfalls from validation findings across the period into per-worker
            restitution line items.
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Period Start
              </label>
              <input
                type="date"
                value={genStart}
                onChange={(e) => setGenStart(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Period End
              </label>
              <input
                type="date"
                value={genEnd}
                onChange={(e) => setGenEnd(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
          {genError && <p className="text-sm text-red-400">{genError}</p>}
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal
        open={!!openId}
        onClose={() => {
          setOpenId(null)
          setDetail(null)
          setPayItem(null)
        }}
        title="Restitution Worksheet"
        className="max-w-3xl"
      >
        {detailLoading ? (
          <div className="py-8">
            <Spinner label="Loading worksheet…" />
          </div>
        ) : detailError ? (
          <EmptyState title="Could not load worksheet" description={detailError} />
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
              <span className="font-medium text-slate-200">{projectName(detail.project_id)}</span>
              <span>
                {detail.period_start || '—'} → {detail.period_end || '—'}
              </span>
              <Badge tone={statusTone(detail.status)} className="capitalize">
                {detail.status || 'open'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Items" value={detailStats.count} />
              <Stat label="Owed" value={dollars(detailStats.owed)} tone="red" />
              <Stat label="Paid" value={dollars(detailStats.paid)} tone="green" />
              <Stat
                label="Remaining"
                value={dollars(detailStats.remaining)}
                tone={detailStats.remaining > 0 ? 'amber' : 'green'}
              />
            </div>

            {/* progress bar */}
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Payment progress</span>
                <span>
                  {detailStats.owed > 0 ? Math.round((detailStats.paid / detailStats.owed) * 100) : 100}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${detailStats.owed > 0 ? Math.min(100, (detailStats.paid / detailStats.owed) * 100) : 100}%`,
                  }}
                />
              </div>
            </div>

            {(detail.items || []).length === 0 ? (
              <EmptyState
                title="No line items"
                description="No shortfalls were found for this project period."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Worker</TH>
                    <TH className="text-right">Base</TH>
                    <TH className="text-right">Fringe</TH>
                    <TH className="text-right">OT</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {(detail.items || []).map((it) => (
                    <TR key={it.id}>
                      <TD className="font-medium text-slate-200">{itemName(it)}</TD>
                      <TD className="text-right tabular-nums">{dollars(it.base_shortfall)}</TD>
                      <TD className="text-right tabular-nums">{dollars(it.fringe_shortfall)}</TD>
                      <TD className="text-right tabular-nums">{dollars(it.ot_shortfall)}</TD>
                      <TD className="text-right tabular-nums text-slate-100">{dollars(it.total_shortfall)}</TD>
                      <TD>
                        {it.paid ? (
                          <Badge tone="green">
                            Paid{it.paid_reference ? ` · ${it.paid_reference}` : ''}
                          </Badge>
                        ) : (
                          <Badge tone="amber">Unpaid</Badge>
                        )}
                      </TD>
                      <TD className="text-right">
                        {!it.paid && (
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5"
                            onClick={() => {
                              setPayItem(it)
                              setPayRef('')
                              setPayError(null)
                            }}
                          >
                            Mark Paid
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Mark paid modal */}
      <Modal
        open={!!payItem}
        onClose={() => !payBusy && setPayItem(null)}
        title="Record Back-Wage Payment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPayItem(null)} disabled={payBusy}>
              Cancel
            </Button>
            <Button onClick={submitPay} disabled={payBusy}>
              {payBusy ? 'Saving…' : 'Mark Paid'}
            </Button>
          </>
        }
      >
        {payItem && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
              <div className="font-medium text-slate-200">{itemName(payItem)}</div>
              <div className="mt-1 text-slate-400">
                Total owed: <span className="text-slate-100">{dollars(payItem.total_shortfall)}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Payment Reference
              </label>
              <input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Check #, ACH ID, or pay-period reference"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
            {payError && <p className="text-sm text-red-400">{payError}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}

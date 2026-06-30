'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Rate {
  id: string
  classification_name: string
  base_rate: number
  fringe_rate: number
}

interface Determination {
  id: string
  project_id: string | null
  wd_number: string
  modification_number: string | null
  decision_date: string | null
  effective_date: string | null
  locality: string | null
  county: string | null
  state: string | null
  schedule_type: string | null
  source: string | null
  is_active: boolean
  superseded_by: string | null
  created_at: string
  rates?: Rate[]
}

const SCHEDULE_TYPES = ['General', 'Building', 'Heavy', 'Highway', 'Residential']
const SOURCES = ['DOL (Davis-Bacon)', 'State DIR', 'Local Agency', 'Manual Entry']

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
function money(n: number) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none'

export default function DeterminationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [det, setDet] = useState<Determination | null>(null)
  const [allDets, setAllDets] = useState<Determination[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [supersedeOpen, setSupersedeOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // new rate row
  const [newRate, setNewRate] = useState({ classification_name: '', base_rate: '', fringe_rate: '' })
  const [addingRate, setAddingRate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [d, all] = await Promise.all([api.getDetermination(id), api.getDeterminations()])
      setDet(d)
      setAllDets(Array.isArray(all) ? all : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load determination')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (id) load()
  }, [id, load])

  const rates = useMemo<Rate[]>(() => det?.rates ?? [], [det])
  const stats = useMemo(() => {
    const count = rates.length
    const totals = rates.reduce(
      (acc, r) => {
        acc.base += r.base_rate
        acc.fringe += r.fringe_rate
        return acc
      },
      { base: 0, fringe: 0 }
    )
    const avgBase = count ? totals.base / count : 0
    const avgFringe = count ? totals.fringe / count : 0
    const maxTotal = rates.reduce((m, r) => Math.max(m, r.base_rate + r.fringe_rate), 0)
    return { count, avgBase, avgFringe, maxTotal }
  }, [rates])

  // edit form state
  const [form, setForm] = useState<Record<string, string>>({})
  function openEdit() {
    if (!det) return
    setForm({
      wd_number: det.wd_number ?? '',
      modification_number: det.modification_number ?? '',
      decision_date: det.decision_date?.slice(0, 10) ?? '',
      effective_date: det.effective_date?.slice(0, 10) ?? '',
      locality: det.locality ?? '',
      county: det.county ?? '',
      state: det.state ?? '',
      schedule_type: det.schedule_type ?? SCHEDULE_TYPES[0],
      source: det.source ?? SOURCES[0],
    })
    setActionError(null)
    setEditOpen(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!det) return
    setActionError(null)
    if (!form.wd_number?.trim()) {
      setActionError('WD number is required.')
      return
    }
    setBusy(true)
    try {
      await api.updateDetermination(det.id, {
        wd_number: form.wd_number.trim(),
        modification_number: form.modification_number?.trim() || null,
        decision_date: form.decision_date || null,
        effective_date: form.effective_date || null,
        locality: form.locality?.trim() || null,
        county: form.county?.trim() || null,
        state: form.state?.trim() || null,
        schedule_type: form.schedule_type || null,
        source: form.source || null,
      })
      setEditOpen(false)
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update determination')
    } finally {
      setBusy(false)
    }
  }

  async function addRate(e: React.FormEvent) {
    e.preventDefault()
    if (!det) return
    if (!newRate.classification_name.trim()) {
      setActionError('Classification name is required to add a rate.')
      return
    }
    setActionError(null)
    setAddingRate(true)
    try {
      await api.addDeterminationRate(det.id, {
        classification_name: newRate.classification_name.trim(),
        base_rate: Number(newRate.base_rate) || 0,
        fringe_rate: Number(newRate.fringe_rate) || 0,
      })
      setNewRate({ classification_name: '', base_rate: '', fringe_rate: '' })
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add rate')
    } finally {
      setAddingRate(false)
    }
  }

  async function removeRate(rateId: string) {
    if (!det) return
    if (!confirm('Delete this rate row?')) return
    setActionError(null)
    try {
      await api.deleteDeterminationRate(det.id, rateId)
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete rate')
    }
  }

  const [supersededById, setSupersededById] = useState('')
  function openSupersede() {
    setSupersededById('')
    setActionError(null)
    setSupersedeOpen(true)
  }
  async function doSupersede(e: React.FormEvent) {
    e.preventDefault()
    if (!det) return
    setActionError(null)
    setBusy(true)
    try {
      await api.supersedeDetermination(det.id, { superseded_by: supersededById || null })
      setSupersedeOpen(false)
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to supersede')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <FullPageSpinner label="Loading determination..." />

  if (error || !det) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/determinations" className="text-sm text-slate-400 hover:text-amber-300">
          ← Back to determinations
        </Link>
        <EmptyState
          title="Could not load determination"
          description={error ?? 'This wage determination may have been deleted.'}
          action={<Button onClick={load}>Retry</Button>}
        />
      </div>
    )
  }

  const supersedeCandidates = allDets.filter((d) => d.id !== det.id)
  const maxBar = Math.max(stats.maxTotal, 0.01)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/determinations" className="text-sm text-slate-400 hover:text-amber-300">
          ← Back to determinations
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{det.wd_number}</h1>
            {det.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Superseded</Badge>}
            {det.modification_number && <Badge tone="slate">Mod {det.modification_number}</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {[det.locality, det.county, det.state].filter(Boolean).join(', ') || 'No locality set'}
            {det.schedule_type ? ` · ${det.schedule_type}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={openEdit}>
            Edit
          </Button>
          {det.is_active && (
            <Button variant="secondary" onClick={openSupersede}>
              Mark Superseded
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Classifications" value={stats.count} />
        <Stat label="Avg base rate" value={money(stats.avgBase)} />
        <Stat label="Avg fringe rate" value={money(stats.avgFringe)} tone="amber" />
        <Stat label="Highest total wage" value={money(stats.maxTotal)} tone="green" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Schedule Details</h2>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <DetailRow label="Source" value={det.source || '—'} />
            <DetailRow label="Schedule type" value={det.schedule_type || '—'} />
            <DetailRow label="Decision date" value={fmtDate(det.decision_date)} />
            <DetailRow label="Effective date" value={fmtDate(det.effective_date)} />
            <DetailRow label="Locality" value={det.locality || '—'} />
            <DetailRow label="County" value={det.county || '—'} />
            <DetailRow label="State" value={det.state || '—'} />
            <DetailRow
              label="Project"
              value={
                det.project_id ? (
                  <Link
                    href={`/dashboard/projects/${det.project_id}`}
                    className="text-amber-300 hover:underline"
                  >
                    View project →
                  </Link>
                ) : (
                  'Unassigned'
                )
              }
            />
            {det.superseded_by && (
              <DetailRow
                label="Superseded by"
                value={
                  <Link
                    href={`/dashboard/determinations/${det.superseded_by}`}
                    className="text-amber-300 hover:underline"
                  >
                    {allDets.find((d) => d.id === det.superseded_by)?.wd_number ?? 'View →'}
                  </Link>
                }
              />
            )}
            <DetailRow label="Registered" value={fmtDate(det.created_at)} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Wage Distribution</h2>
            <p className="mt-0.5 text-xs text-slate-500">Base vs fringe by classification (per hour)</p>
          </CardHeader>
          <CardBody>
            {rates.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No rates to chart yet.</p>
            ) : (
              <div className="space-y-3">
                {[...rates]
                  .sort((a, b) => b.base_rate + b.fringe_rate - (a.base_rate + a.fringe_rate))
                  .map((r) => {
                    const total = r.base_rate + r.fringe_rate
                    const basePct = (r.base_rate / maxBar) * 100
                    const fringePct = (r.fringe_rate / maxBar) * 100
                    return (
                      <div key={r.id}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="truncate text-slate-300">{r.classification_name}</span>
                          <span className="font-medium text-white">{money(total)}</span>
                        </div>
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full bg-amber-500" style={{ width: `${basePct}%` }} />
                          <div className="h-full bg-sky-500/70" style={{ width: `${fringePct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                <div className="flex gap-4 pt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" /> Base
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500/70" /> Fringe
                  </span>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-white">Classification Rates</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            These rates are the floor each worker in the classification must be paid.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          {rates.length === 0 ? (
            <EmptyState
              title="No rates yet"
              description="Add at least one classification rate so payroll proofs have a wage floor to test against."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Classification</TH>
                  <TH className="text-right">Base $/hr</TH>
                  <TH className="text-right">Fringe $/hr</TH>
                  <TH className="text-right">Total $/hr</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {rates.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium text-slate-200">{r.classification_name}</TD>
                    <TD className="text-right">{money(r.base_rate)}</TD>
                    <TD className="text-right text-amber-300">{money(r.fringe_rate)}</TD>
                    <TD className="text-right font-medium text-white">
                      {money(r.base_rate + r.fringe_rate)}
                    </TD>
                    <TD className="text-right">
                      <button
                        onClick={() => removeRate(r.id)}
                        className="text-sm text-slate-500 hover:text-red-400"
                      >
                        Delete
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}

          <form
            onSubmit={addRate}
            className="grid grid-cols-1 gap-2 border-t border-slate-800 pt-4 sm:grid-cols-[1fr_8rem_8rem_auto]"
          >
            <input
              value={newRate.classification_name}
              onChange={(e) => setNewRate({ ...newRate, classification_name: e.target.value })}
              placeholder="Add classification (e.g. Carpenter)"
              className={inputCls}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={newRate.base_rate}
              onChange={(e) => setNewRate({ ...newRate, base_rate: e.target.value })}
              placeholder="Base"
              className={inputCls}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={newRate.fringe_rate}
              onChange={(e) => setNewRate({ ...newRate, fringe_rate: e.target.value })}
              placeholder="Fringe"
              className={inputCls}
            />
            <Button type="submit" disabled={addingRate}>
              {addingRate ? 'Adding...' : 'Add Rate'}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Modal open={editOpen} onClose={() => !busy && setEditOpen(false)} title="Edit Determination" className="max-w-2xl">
        <form onSubmit={saveEdit} className="space-y-4">
          {actionError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {actionError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="WD Number" required>
              <input value={form.wd_number} onChange={(e) => setForm({ ...form, wd_number: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Modification Number">
              <input
                value={form.modification_number}
                onChange={(e) => setForm({ ...form, modification_number: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Schedule Type">
              <select value={form.schedule_type} onChange={(e) => setForm({ ...form, schedule_type: e.target.value })} className={inputCls}>
                {SCHEDULE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source">
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputCls}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Decision Date">
              <input type="date" value={form.decision_date} onChange={(e) => setForm({ ...form, decision_date: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Effective Date">
              <input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Locality">
              <input value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} className={inputCls} />
            </Field>
            <Field label="County">
              <input value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} className={inputCls} />
            </Field>
            <Field label="State">
              <input value={form.state} maxLength={2} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={supersedeOpen} onClose={() => !busy && setSupersedeOpen(false)} title="Mark Superseded">
        <form onSubmit={doSupersede} className="space-y-4">
          {actionError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {actionError}
            </div>
          )}
          <p className="text-sm text-slate-400">
            This deactivates <span className="font-medium text-slate-200">{det.wd_number}</span>. Optionally link the
            replacement schedule.
          </p>
          <Field label="Replaced by (optional)">
            <select value={supersededById} onChange={(e) => setSupersededById(e.target.value)} className={inputCls}>
              <option value="">No replacement / unknown</option>
              {supersedeCandidates.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.wd_number}
                  {d.modification_number ? ` (Mod ${d.modification_number})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <Button type="button" variant="secondary" onClick={() => setSupersedeOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={busy}>
              {busy ? 'Working...' : 'Mark Superseded'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-200">{value}</span>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">
        {label}
        {required && <span className="text-amber-400"> *</span>}
      </span>
      {children}
    </label>
  )
}

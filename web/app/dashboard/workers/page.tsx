'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface ProgramLevel {
  id: string
  program_id: string
  level_name: string
  period_number: number
  pct_of_journeyworker: number
}

interface Program {
  id: string
  registration_number: string
  sponsor: string
  trade: string
  required_ratio: number
  levels?: ProgramLevel[]
}

interface Worker {
  id: string
  full_name: string
  ssn_last4: string | null
  employee_id: string | null
  address: string | null
  gender: string | null
  ethnicity: string | null
  default_classification: string | null
  is_apprentice: boolean
  program_id: string | null
  program_level_id: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type WorkerForm = {
  full_name: string
  ssn_last4: string
  employee_id: string
  address: string
  gender: string
  ethnicity: string
  default_classification: string
  is_apprentice: boolean
  program_id: string
  program_level_id: string
  is_active: boolean
}

const EMPTY_FORM: WorkerForm = {
  full_name: '',
  ssn_last4: '',
  employee_id: '',
  address: '',
  gender: '',
  ethnicity: '',
  default_classification: '',
  is_apprentice: false,
  program_id: '',
  program_level_id: '',
  is_active: true,
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40'
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500'

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'apprentice' | 'journeyworker'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Worker | null>(null)
  const [form, setForm] = useState<WorkerForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [w, p] = await Promise.all([api.getWorkers(), api.getPrograms()])
      setWorkers(Array.isArray(w) ? w : [])
      setPrograms(Array.isArray(p) ? p : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roster')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const programById = useMemo(() => {
    const m = new Map<string, Program>()
    for (const p of programs) m.set(p.id, p)
    return m
  }, [programs])

  const selectedProgram = form.program_id ? programById.get(form.program_id) : undefined
  const selectedLevels = selectedProgram?.levels ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return workers.filter((w) => {
      if (statusFilter === 'active' && !w.is_active) return false
      if (statusFilter === 'inactive' && w.is_active) return false
      if (typeFilter === 'apprentice' && !w.is_apprentice) return false
      if (typeFilter === 'journeyworker' && w.is_apprentice) return false
      if (!q) return true
      return (
        w.full_name.toLowerCase().includes(q) ||
        (w.employee_id || '').toLowerCase().includes(q) ||
        (w.default_classification || '').toLowerCase().includes(q)
      )
    })
  }, [workers, search, statusFilter, typeFilter])

  const stats = useMemo(() => {
    const active = workers.filter((w) => w.is_active)
    const apprentices = active.filter((w) => w.is_apprentice).length
    const journey = active.length - apprentices
    const ratio = journey > 0 ? apprentices / journey : apprentices > 0 ? Infinity : 0
    return {
      total: workers.length,
      active: active.length,
      apprentices,
      journey,
      ratio,
    }
  }, [workers])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(w: Worker) {
    setEditing(w)
    setForm({
      full_name: w.full_name || '',
      ssn_last4: w.ssn_last4 || '',
      employee_id: w.employee_id || '',
      address: w.address || '',
      gender: w.gender || '',
      ethnicity: w.ethnicity || '',
      default_classification: w.default_classification || '',
      is_apprentice: w.is_apprentice,
      program_id: w.program_id || '',
      program_level_id: w.program_level_id || '',
      is_active: w.is_active,
    })
    setFormError(null)
    setModalOpen(true)
  }

  function patchForm(patch: Partial<WorkerForm>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) {
      setFormError('Full name is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    const body = {
      full_name: form.full_name.trim(),
      ssn_last4: form.ssn_last4.trim() || null,
      employee_id: form.employee_id.trim() || null,
      address: form.address.trim() || null,
      gender: form.gender.trim() || null,
      ethnicity: form.ethnicity.trim() || null,
      default_classification: form.default_classification.trim() || null,
      is_apprentice: form.is_apprentice,
      program_id: form.is_apprentice && form.program_id ? form.program_id : null,
      program_level_id: form.is_apprentice && form.program_level_id ? form.program_level_id : null,
      is_active: form.is_active,
    }
    try {
      if (editing) {
        await api.updateWorker(editing.id, body)
      } else {
        await api.createWorker(body)
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(w: Worker) {
    if (!confirm(`Remove ${w.full_name} from the roster?`)) return
    try {
      await api.deleteWorker(w.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function toggleActive(w: Worker) {
    try {
      await api.updateWorker(w.id, { is_active: !w.is_active })
      setWorkers((prev) => prev.map((x) => (x.id === w.id ? { ...x, is_active: !x.is_active } : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  function programLabel(w: Worker) {
    if (!w.program_id) return null
    const p = programById.get(w.program_id)
    if (!p) return 'Program'
    const lvl = p.levels?.find((l) => l.id === w.program_level_id)
    return lvl ? `${p.trade} · ${lvl.level_name}` : p.trade
  }

  if (loading) return <FullPageSpinner label="Loading worker roster..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Worker Roster</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage certified-payroll workforce and apprentice enrollment against registered programs.
          </p>
        </div>
        <Button onClick={openCreate}>+ Add Worker</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button className="ml-3 underline" onClick={() => load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total Workers" value={stats.total} hint={`${stats.active} active`} />
        <Stat label="Apprentices" value={stats.apprentices} tone="amber" hint="enrolled & active" />
        <Stat label="Journeyworkers" value={stats.journey} tone="green" hint="active" />
        <Stat
          label="Apprentice Ratio"
          value={stats.ratio === Infinity ? '∞' : `${(stats.ratio || 0).toFixed(2)}:1`}
          hint="apprentice ÷ journeyworker"
          tone={stats.ratio > 1 ? 'red' : 'default'}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            className={`${inputCls} sm:max-w-xs`}
            placeholder="Search name, employee ID, classification..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <select
              className={`${inputCls} w-auto`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              className={`${inputCls} w-auto`}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            >
              <option value="all">All types</option>
              <option value="apprentice">Apprentices</option>
              <option value="journeyworker">Journeyworkers</option>
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={workers.length === 0 ? 'No workers yet' : 'No workers match your filters'}
                description={
                  workers.length === 0
                    ? 'Add workers to begin building certified payroll and tracking apprentice ratios.'
                    : 'Adjust the search or filters to see more of your roster.'
                }
                action={workers.length === 0 ? <Button onClick={openCreate}>+ Add Worker</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Employee ID</TH>
                  <TH>Classification</TH>
                  <TH>Type</TH>
                  <TH>Program</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((w) => {
                  const prog = programLabel(w)
                  return (
                    <TR key={w.id}>
                      <TD className="font-medium text-slate-100">
                        {w.full_name}
                        {w.ssn_last4 && <span className="ml-2 text-xs text-slate-500">···{w.ssn_last4}</span>}
                      </TD>
                      <TD>{w.employee_id || <span className="text-slate-600">—</span>}</TD>
                      <TD>{w.default_classification || <span className="text-slate-600">—</span>}</TD>
                      <TD>
                        {w.is_apprentice ? (
                          <Badge tone="amber">Apprentice</Badge>
                        ) : (
                          <Badge tone="blue">Journeyworker</Badge>
                        )}
                      </TD>
                      <TD>
                        {prog ? (
                          <span className="text-slate-300">{prog}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </TD>
                      <TD>
                        <button onClick={() => toggleActive(w)} title="Toggle active">
                          {w.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
                        </button>
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" className="px-2 py-1" onClick={() => openEdit(w)}>
                            Edit
                          </Button>
                          <Button variant="ghost" className="px-2 py-1 text-red-400 hover:text-red-300" onClick={() => onDelete(w)}>
                            Delete
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Worker' : 'Add Worker'}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="worker-form" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Worker'}
            </Button>
          </>
        }
      >
        <form id="worker-form" onSubmit={onSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Full Name *</label>
              <input
                className={inputCls}
                value={form.full_name}
                onChange={(e) => patchForm({ full_name: e.target.value })}
                placeholder="Jordan Rivera"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Employee ID</label>
              <input className={inputCls} value={form.employee_id} onChange={(e) => patchForm({ employee_id: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>SSN (last 4)</label>
              <input
                className={inputCls}
                value={form.ssn_last4}
                maxLength={4}
                inputMode="numeric"
                onChange={(e) => patchForm({ ssn_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Address</label>
              <input className={inputCls} value={form.address} onChange={(e) => patchForm({ address: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Default Classification</label>
              <input
                className={inputCls}
                value={form.default_classification}
                onChange={(e) => patchForm({ default_classification: e.target.value })}
                placeholder="Electrician"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Gender</label>
                <input className={inputCls} value={form.gender} onChange={(e) => patchForm({ gender: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Ethnicity</label>
                <input className={inputCls} value={form.ethnicity} onChange={(e) => patchForm({ ethnicity: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-amber-500"
                checked={form.is_apprentice}
                onChange={(e) => patchForm({ is_apprentice: e.target.checked, program_id: '', program_level_id: '' })}
              />
              <span className="text-sm font-medium text-slate-200">Enrolled as registered apprentice</span>
            </label>

            {form.is_apprentice && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Apprenticeship Program</label>
                  <select
                    className={inputCls}
                    value={form.program_id}
                    onChange={(e) => patchForm({ program_id: e.target.value, program_level_id: '' })}
                  >
                    <option value="">Select program…</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.trade} — {p.registration_number}
                      </option>
                    ))}
                  </select>
                  {programs.length === 0 && (
                    <p className="mt-1 text-xs text-amber-400/80">No programs registered yet. Add one under Apprenticeship Programs.</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Period / Level</label>
                  <select
                    className={inputCls}
                    value={form.program_level_id}
                    onChange={(e) => patchForm({ program_level_id: e.target.value })}
                    disabled={!form.program_id}
                  >
                    <option value="">Select level…</option>
                    {selectedLevels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.level_name} ({Math.round(l.pct_of_journeyworker)}% of journeyworker)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-500"
              checked={form.is_active}
              onChange={(e) => patchForm({ is_active: e.target.checked })}
            />
            <span className="text-sm text-slate-300">Active on payroll</span>
          </label>
        </form>
      </Modal>
    </div>
  )
}

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

interface FringePlan {
  id: string
  name: string
  plan_type: string | null
  provider: string | null
  contribution_basis: string | null
  effective_date: string | null
  end_date: string | null
  created_at?: string
  updated_at?: string
}

type PlanForm = {
  name: string
  plan_type: string
  provider: string
  contribution_basis: string
  effective_date: string
  end_date: string
}

const EMPTY_FORM: PlanForm = {
  name: '',
  plan_type: 'health',
  provider: '',
  contribution_basis: 'hourly',
  effective_date: '',
  end_date: '',
}

const PLAN_TYPES = ['health', 'pension', 'vacation', 'apprenticeship', 'training', 'life', 'disability', 'other']
const BASES = ['hourly', 'monthly', 'annual', 'percentage']

const TYPE_TONE: Record<string, 'amber' | 'green' | 'blue' | 'slate' | 'neutral'> = {
  health: 'green',
  pension: 'blue',
  vacation: 'amber',
  apprenticeship: 'amber',
  training: 'blue',
  life: 'slate',
  disability: 'slate',
  other: 'neutral',
}

const inputCls =
  'w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40'
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500'

function fmtDate(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString()
}

function isActivePlan(p: FringePlan) {
  const now = Date.now()
  const eff = p.effective_date ? new Date(p.effective_date).getTime() : -Infinity
  const end = p.end_date ? new Date(p.end_date).getTime() : Infinity
  return eff <= now && now <= end
}

export default function FringePlansPage() {
  const [plans, setPlans] = useState<FringePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FringePlan | null>(null)
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const p = await api.getFringePlans()
      setPlans(Array.isArray(p) ? p : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fringe plans')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const types = useMemo(() => {
    const s = new Set<string>()
    for (const p of plans) if (p.plan_type) s.add(p.plan_type)
    return Array.from(s).sort()
  }, [plans])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return plans.filter((p) => {
      if (typeFilter !== 'all' && (p.plan_type || '') !== typeFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.provider || '').toLowerCase().includes(q) ||
        (p.plan_type || '').toLowerCase().includes(q)
      )
    })
  }, [plans, search, typeFilter])

  const stats = useMemo(() => {
    const active = plans.filter(isActivePlan).length
    const byType = new Map<string, number>()
    for (const p of plans) {
      const t = p.plan_type || 'other'
      byType.set(t, (byType.get(t) || 0) + 1)
    }
    return { total: plans.length, active, typeCount: byType.size, byType }
  }, [plans])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(p: FringePlan) {
    setEditing(p)
    setForm({
      name: p.name || '',
      plan_type: p.plan_type || 'other',
      provider: p.provider || '',
      contribution_basis: p.contribution_basis || 'hourly',
      effective_date: p.effective_date ? p.effective_date.slice(0, 10) : '',
      end_date: p.end_date ? p.end_date.slice(0, 10) : '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('Plan name is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    const body = {
      name: form.name.trim(),
      plan_type: form.plan_type || null,
      provider: form.provider.trim() || null,
      contribution_basis: form.contribution_basis || null,
      effective_date: form.effective_date || null,
      end_date: form.end_date || null,
    }
    try {
      if (editing) await api.updateFringePlan(editing.id, body)
      else await api.createFringePlan(body)
      setModalOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(p: FringePlan) {
    if (!confirm(`Delete fringe plan "${p.name}"?`)) return
    try {
      await api.deleteFringePlan(p.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  if (loading) return <FullPageSpinner label="Loading fringe plans..." />

  const maxTypeCount = Math.max(1, ...Array.from(stats.byType.values()))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bona-Fide Fringe Plans</h1>
          <p className="mt-1 text-sm text-stone-400">
            Register the bona-fide benefit plans used to credit fringe contributions against the prevailing fringe rate.
          </p>
        </div>
        <Button onClick={openCreate}>+ Add Plan</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button className="ml-3 underline" onClick={() => load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Registered Plans" value={stats.total} />
        <Stat label="Currently Active" value={stats.active} tone="green" hint="within effective window" />
        <Stat label="Benefit Categories" value={stats.typeCount} tone="amber" />
      </div>

      {stats.total > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-stone-200">Plans by Benefit Type</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            {Array.from(stats.byType.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-sm capitalize text-stone-300">{type}</div>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-stone-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400"
                      style={{ width: `${(count / maxTypeCount) * 100}%` }}
                    />
                  </div>
                  <div className="w-8 shrink-0 text-right text-sm font-medium text-stone-200">{count}</div>
                </div>
              ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            className={`${inputCls} sm:max-w-xs`}
            placeholder="Search name, provider, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={`${inputCls} w-auto`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={plans.length === 0 ? 'No fringe plans yet' : 'No plans match your filters'}
                description={
                  plans.length === 0
                    ? 'Register bona-fide plans so plan-paid fringe contributions can be credited during validation.'
                    : 'Adjust the search or filter.'
                }
                action={plans.length === 0 ? <Button onClick={openCreate}>+ Add Plan</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Plan</TH>
                  <TH>Type</TH>
                  <TH>Provider</TH>
                  <TH>Basis</TH>
                  <TH>Effective</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium text-stone-100">{p.name}</TD>
                    <TD>
                      {p.plan_type ? (
                        <Badge tone={TYPE_TONE[p.plan_type] || 'neutral'}>
                          <span className="capitalize">{p.plan_type}</span>
                        </Badge>
                      ) : (
                        <span className="text-stone-600">—</span>
                      )}
                    </TD>
                    <TD>{p.provider || <span className="text-stone-600">—</span>}</TD>
                    <TD className="capitalize">{p.contribution_basis || <span className="text-stone-600">—</span>}</TD>
                    <TD>
                      {fmtDate(p.effective_date)}
                      {p.end_date ? <span className="text-stone-500"> – {fmtDate(p.end_date)}</span> : ''}
                    </TD>
                    <TD>
                      {isActivePlan(p) ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" className="px-2 py-1" onClick={() => openEdit(p)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-red-400 hover:text-red-300"
                          onClick={() => onDelete(p)}
                        >
                          Delete
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Fringe Plan' : 'Add Fringe Plan'}
        className="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="plan-form" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Plan'}
            </Button>
          </>
        }
      >
        <form id="plan-form" onSubmit={onSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</div>
          )}
          <div>
            <label className={labelCls}>Plan Name *</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="IBEW Local 11 Health & Welfare"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Plan Type</label>
              <select
                className={inputCls}
                value={form.plan_type}
                onChange={(e) => setForm((f) => ({ ...f, plan_type: e.target.value }))}
              >
                {PLAN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Contribution Basis</label>
              <select
                className={inputCls}
                value={form.contribution_basis}
                onChange={(e) => setForm((f) => ({ ...f, contribution_basis: e.target.value }))}
              >
                {BASES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Provider</label>
              <input
                className={inputCls}
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                placeholder="Trust fund / carrier name"
              />
            </div>
            <div>
              <label className={labelCls}>Effective Date</label>
              <input
                className={inputCls}
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input
                className={inputCls}
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}

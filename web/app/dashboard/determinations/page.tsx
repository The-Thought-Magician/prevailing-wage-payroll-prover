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
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

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
}

interface Project {
  id: string
  name: string
  county?: string | null
  state?: string | null
}

interface RateRow {
  classification_name: string
  base_rate: string
  fringe_rate: string
}

const SCHEDULE_TYPES = ['General', 'Building', 'Heavy', 'Highway', 'Residential']
const SOURCES = ['DOL (Davis-Bacon)', 'State DIR', 'Local Agency', 'Manual Entry']

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function DeterminationsPage() {
  const [determinations, setDeterminations] = useState<Determination[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'superseded'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const emptyForm = {
    project_id: '',
    wd_number: '',
    modification_number: '',
    decision_date: '',
    effective_date: '',
    locality: '',
    county: '',
    state: '',
    schedule_type: SCHEDULE_TYPES[0],
    source: SOURCES[0],
  }
  const [form, setForm] = useState({ ...emptyForm })
  const [rates, setRates] = useState<RateRow[]>([{ classification_name: '', base_rate: '', fringe_rate: '' }])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [dets, projs] = await Promise.all([api.getDeterminations(), api.getProjects()])
      setDeterminations(Array.isArray(dets) ? dets : [])
      setProjects(Array.isArray(projs) ? projs : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wage determinations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const projectName = (id: string | null) => {
    if (!id) return 'Unassigned'
    return projects.find((p) => p.id === id)?.name ?? 'Unknown project'
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return determinations.filter((d) => {
      if (projectFilter && d.project_id !== projectFilter) return false
      if (statusFilter === 'active' && !d.is_active) return false
      if (statusFilter === 'superseded' && d.is_active) return false
      if (!q) return true
      return (
        d.wd_number.toLowerCase().includes(q) ||
        (d.locality ?? '').toLowerCase().includes(q) ||
        (d.county ?? '').toLowerCase().includes(q) ||
        (d.state ?? '').toLowerCase().includes(q) ||
        (d.modification_number ?? '').toLowerCase().includes(q)
      )
    })
  }, [determinations, search, projectFilter, statusFilter])

  const stats = useMemo(() => {
    const active = determinations.filter((d) => d.is_active).length
    const superseded = determinations.length - active
    const states = new Set(determinations.map((d) => d.state).filter(Boolean)).size
    const assigned = determinations.filter((d) => d.project_id).length
    return { total: determinations.length, active, superseded, states, assigned }
  }, [determinations])

  function openCreate() {
    setForm({ ...emptyForm })
    setRates([{ classification_name: '', base_rate: '', fringe_rate: '' }])
    setFormError(null)
    setModalOpen(true)
  }

  function setRate(i: number, key: keyof RateRow, value: string) {
    setRates((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }
  function addRateRow() {
    setRates((prev) => [...prev, { classification_name: '', base_rate: '', fringe_rate: '' }])
  }
  function removeRateRow(i: number) {
    setRates((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.wd_number.trim()) {
      setFormError('Wage determination number is required.')
      return
    }
    const cleanRates = rates
      .filter((r) => r.classification_name.trim())
      .map((r) => ({
        classification_name: r.classification_name.trim(),
        base_rate: Number(r.base_rate) || 0,
        fringe_rate: Number(r.fringe_rate) || 0,
      }))
    setSaving(true)
    try {
      await api.createDetermination({
        project_id: form.project_id || null,
        wd_number: form.wd_number.trim(),
        modification_number: form.modification_number.trim() || null,
        decision_date: form.decision_date || null,
        effective_date: form.effective_date || null,
        locality: form.locality.trim() || null,
        county: form.county.trim() || null,
        state: form.state.trim() || null,
        schedule_type: form.schedule_type || null,
        source: form.source || null,
        rates: cleanRates,
      })
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create determination')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <FullPageSpinner label="Loading wage determinations..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Wage Determinations</h1>
          <p className="mt-1 text-sm text-slate-400">
            Davis-Bacon and state prevailing-wage schedules that anchor every payroll proof.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Determination</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}{' '}
          <button onClick={load} className="ml-2 underline hover:text-red-200">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total schedules" value={stats.total} hint={`${stats.assigned} assigned to projects`} />
        <Stat label="Active" value={stats.active} tone="green" />
        <Stat label="Superseded" value={stats.superseded} tone="amber" />
        <Stat label="States covered" value={stats.states} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search WD number, locality, county, state..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none sm:max-w-xs"
            />
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-950 p-1 text-xs">
            {(['all', 'active', 'superseded'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${
                  statusFilter === s ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={determinations.length === 0 ? 'No wage determinations yet' : 'No matches'}
                description={
                  determinations.length === 0
                    ? 'Register a Davis-Bacon or state schedule to begin proving prevailing-wage compliance.'
                    : 'Adjust your search or filters to see more results.'
                }
                action={
                  determinations.length === 0 ? (
                    <Button onClick={openCreate}>+ New Determination</Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>WD Number</TH>
                  <TH>Project</TH>
                  <TH>Locality</TH>
                  <TH>Schedule</TH>
                  <TH>Effective</TH>
                  <TH>Status</TH>
                  <TH className="text-right">View</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((d) => (
                  <TR key={d.id}>
                    <TD>
                      <Link
                        href={`/dashboard/determinations/${d.id}`}
                        className="font-medium text-amber-300 hover:underline"
                      >
                        {d.wd_number}
                      </Link>
                      {d.modification_number && (
                        <span className="ml-2 text-xs text-slate-500">Mod {d.modification_number}</span>
                      )}
                    </TD>
                    <TD>{projectName(d.project_id)}</TD>
                    <TD>
                      <div className="text-slate-300">{d.locality || d.county || '—'}</div>
                      {d.state && <div className="text-xs text-slate-500">{d.state}</div>}
                    </TD>
                    <TD>{d.schedule_type || '—'}</TD>
                    <TD>{fmtDate(d.effective_date)}</TD>
                    <TD>
                      {d.is_active ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="amber">Superseded</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/dashboard/determinations/${d.id}`}
                        className="text-sm text-slate-400 hover:text-amber-300"
                      >
                        Open →
                      </Link>
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
        onClose={() => !saving && setModalOpen(false)}
        title="New Wage Determination"
        className="max-w-2xl"
      >
        <form onSubmit={submit} className="space-y-5">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="WD Number" required>
              <input
                value={form.wd_number}
                onChange={(e) => setForm({ ...form, wd_number: e.target.value })}
                placeholder="CA20240001"
                className={inputCls}
              />
            </Field>
            <Field label="Modification Number">
              <input
                value={form.modification_number}
                onChange={(e) => setForm({ ...form, modification_number: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </Field>
            <Field label="Project">
              <select
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Schedule Type">
              <select
                value={form.schedule_type}
                onChange={(e) => setForm({ ...form, schedule_type: e.target.value })}
                className={inputCls}
              >
                {SCHEDULE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Decision Date">
              <input
                type="date"
                value={form.decision_date}
                onChange={(e) => setForm({ ...form, decision_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Effective Date">
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Locality">
              <input
                value={form.locality}
                onChange={(e) => setForm({ ...form, locality: e.target.value })}
                placeholder="Los Angeles Metro"
                className={inputCls}
              />
            </Field>
            <Field label="County">
              <input
                value={form.county}
                onChange={(e) => setForm({ ...form, county: e.target.value })}
                placeholder="Los Angeles"
                className={inputCls}
              />
            </Field>
            <Field label="State">
              <input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="CA"
                maxLength={2}
                className={inputCls}
              />
            </Field>
            <Field label="Source">
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className={inputCls}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Classification Rates
              </span>
              <button
                type="button"
                onClick={addRateRow}
                className="text-xs font-medium text-amber-300 hover:text-amber-200"
              >
                + Add row
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_6rem_6rem_2rem] gap-2 px-1 text-[11px] uppercase tracking-wide text-slate-600">
                <span>Classification</span>
                <span>Base $/hr</span>
                <span>Fringe $/hr</span>
                <span />
              </div>
              {rates.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_6rem_6rem_2rem] gap-2">
                  <input
                    value={r.classification_name}
                    onChange={(e) => setRate(i, 'classification_name', e.target.value)}
                    placeholder="Electrician"
                    className={inputCls}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.base_rate}
                    onChange={(e) => setRate(i, 'base_rate', e.target.value)}
                    placeholder="48.50"
                    className={inputCls}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.fringe_rate}
                    onChange={(e) => setRate(i, 'fringe_rate', e.target.value)}
                    placeholder="22.10"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => removeRateRow(i)}
                    className="text-slate-500 hover:text-red-400"
                    aria-label="Remove row"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner label="Saving..." /> : 'Create Determination'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
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

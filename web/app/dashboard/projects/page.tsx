'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Project = {
  id: string
  company_id?: string
  name: string
  awarding_agency?: string
  contract_number?: string
  role?: string
  county?: string
  state?: string
  coverage?: string
  contract_value_cents?: number
  labor_budget_cents?: number
  status?: string
  filing_cadence?: string
  start_date?: string
  end_date?: string
}

type Company = { id: string; legal_name: string }

const STATUSES = ['active', 'planned', 'closed', 'on_hold']
const COVERAGES = ['davis_bacon', 'state', 'both']
const ROLES = ['prime', 'subcontractor']
const CADENCES = ['weekly', 'biweekly', 'monthly']

function money(cents?: number) {
  if (cents === undefined || cents === null) return '—'
  return (Number(cents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function statusTone(s?: string): 'green' | 'amber' | 'slate' | 'red' {
  switch (s) {
    case 'active':
      return 'green'
    case 'planned':
      return 'amber'
    case 'on_hold':
      return 'red'
    default:
      return 'slate'
  }
}

const emptyForm = {
  company_id: '',
  name: '',
  awarding_agency: '',
  contract_number: '',
  role: 'prime',
  county: '',
  state: '',
  coverage: 'davis_bacon',
  contract_value: '',
  labor_budget: '',
  status: 'active',
  filing_cadence: 'weekly',
  start_date: '',
  end_date: '',
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [coverageFilter, setCoverageFilter] = useState('')

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [p, c] = await Promise.all([api.getProjects(), api.getCompanies()])
      setProjects(Array.isArray(p) ? p : [])
      setCompanies(Array.isArray(c) ? c : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.awarding_agency || ''} ${p.contract_number || ''} ${p.county || ''} ${p.state || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (statusFilter && p.status !== statusFilter) return false
      if (coverageFilter && p.coverage !== coverageFilter) return false
      return true
    })
  }, [projects, search, statusFilter, coverageFilter])

  function openCreate() {
    setForm({ ...emptyForm, company_id: companies[0]?.id || '' })
    setFormError(null)
    setOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.name.trim()) {
      setFormError('Project name is required.')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        awarding_agency: form.awarding_agency.trim() || null,
        contract_number: form.contract_number.trim() || null,
        role: form.role,
        county: form.county.trim() || null,
        state: form.state.trim().toUpperCase() || null,
        coverage: form.coverage,
        status: form.status,
        filing_cadence: form.filing_cadence,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }
      if (form.company_id) body.company_id = form.company_id
      if (form.contract_value !== '') body.contract_value_cents = Math.round(Number(form.contract_value) * 100)
      if (form.labor_budget !== '') body.labor_budget_cents = Math.round(Number(form.labor_budget) * 100)

      const created = await api.createProject(body)
      setProjects((prev) => [created, ...prev])
      setOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <FullPageSpinner label="Loading projects..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">
            Prevailing-wage contracts you track, prove, and file payroll against.
          </p>
        </div>
        <Button onClick={openCreate}>New project</Button>
      </div>

      {error && (
        <Card className="border-red-500/30">
          <CardBody className="flex items-center justify-between">
            <p className="text-sm text-red-300">{error}</p>
            <Button variant="secondary" onClick={load}>
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      {projects.length === 0 && !error ? (
        <EmptyState
          title="No projects yet"
          description="Create a covered project to start tracking wage determinations, payroll, and filings."
          icon="🏗️"
          action={<Button onClick={openCreate}>Create your first project</Button>}
        />
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-center gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, agency, contract #, county..."
                className="flex-1 min-w-[200px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <select
                value={coverageFilter}
                onChange={(e) => setCoverageFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="">All coverage</option>
                {COVERAGES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, '-')}
                  </option>
                ))}
              </select>
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            {filtered.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">No projects match your filters.</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Project</TH>
                    <TH>Awarding agency</TH>
                    <TH>Coverage</TH>
                    <TH>Cadence</TH>
                    <TH className="text-right">Contract value</TH>
                    <TH className="text-right">Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <Link href={`/dashboard/projects/${p.id}`} className="font-medium text-slate-100 hover:text-amber-300">
                          {p.name}
                        </Link>
                        <div className="text-xs text-slate-600">
                          {[p.contract_number, p.county, p.state].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </TD>
                      <TD className="text-slate-400">{p.awarding_agency || '—'}</TD>
                      <TD>
                        <Badge tone="blue">{(p.coverage || 'davis_bacon').replace(/_/g, '-')}</Badge>
                      </TD>
                      <TD className="capitalize text-slate-400">{p.filing_cadence || 'weekly'}</TD>
                      <TD className="text-right tabular-nums text-slate-300">{money(p.contract_value_cents)}</TD>
                      <TD className="text-right">
                        <Badge tone={statusTone(p.status)}>{(p.status || 'active').replace(/_/g, ' ')}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <p className="text-xs text-slate-600">
            {filtered.length} of {projects.length} project{projects.length === 1 ? '' : 's'}
          </p>
        </>
      )}

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="New project"
        footer={
          <>
            <Button variant="ghost" onClick={() => !saving && setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="project-form" disabled={saving}>
              {saving ? 'Creating...' : 'Create project'}
            </Button>
          </>
        }
      >
        <form id="project-form" onSubmit={submit} className="space-y-4">
          {formError && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</p>}

          <Field label="Project name" required>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
              placeholder="Route 9 Bridge Rehabilitation"
            />
          </Field>

          <Field label="Company">
            <select
              value={form.company_id}
              onChange={(e) => setForm({ ...form, company_id: e.target.value })}
              className={inputCls}
            >
              <option value="">— No company —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name}
                </option>
              ))}
            </select>
            {companies.length === 0 && (
              <p className="mt-1 text-xs text-slate-600">
                No companies yet.{' '}
                <Link href="/dashboard/settings" className="text-amber-400 hover:text-amber-300">
                  Add one in Settings
                </Link>
                .
              </p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Awarding agency">
              <input
                value={form.awarding_agency}
                onChange={(e) => setForm({ ...form, awarding_agency: e.target.value })}
                className={inputCls}
                placeholder="State DOT"
              />
            </Field>
            <Field label="Contract number">
              <input
                value={form.contract_number}
                onChange={(e) => setForm({ ...form, contract_number: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="County">
              <input
                value={form.county}
                onChange={(e) => setForm({ ...form, county: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="State">
              <input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className={inputCls}
                maxLength={2}
                placeholder="CA"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Coverage">
              <select
                value={form.coverage}
                onChange={(e) => setForm({ ...form, coverage: e.target.value })}
                className={inputCls}
              >
                {COVERAGES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, '-')}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contract value (USD)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.contract_value}
                onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Labor budget (USD)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.labor_budget}
                onChange={(e) => setForm({ ...form, labor_budget: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={inputCls}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Filing cadence">
              <select
                value={form.filing_cadence}
                onChange={(e) => setForm({ ...form, filing_cadence: e.target.value })}
                className={inputCls}
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="text-amber-400"> *</span>}
      </span>
      {children}
    </label>
  )
}

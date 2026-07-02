'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
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
  crafts?: string[] | null
}

type ProjectHealth = {
  score?: number
  health_score?: number
  open_findings?: number
  hard_findings?: number
  weeks_filed?: number
  weeks_due?: number
  restitution_outstanding?: number
  total_shortfall?: number
  weeks?: WeekRow[]
}

type WeekRow = {
  week_ending?: string
  filed?: boolean
  due_date?: string
  lines?: number
  pass_count?: number
  fail_count?: number
  status?: string
  restitution_outstanding?: number
}

type Determination = {
  id: string
  wd_number?: string
  modification_number?: string
  locality?: string
  county?: string
  state?: string
  schedule_type?: string
  decision_date?: string
  effective_date?: string
  is_active?: boolean
}

const STATUSES = ['active', 'planned', 'closed', 'on_hold']
const CADENCES = ['weekly', 'biweekly', 'monthly']

function money(cents?: number) {
  if (cents === undefined || cents === null) return '—'
  return (Number(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function dollars(n?: number) {
  return Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function num(n?: number) {
  return Number(n ?? 0)
}
function scoreTone(s: number): 'green' | 'amber' | 'red' {
  if (s >= 90) return 'green'
  if (s >= 70) return 'amber'
  return 'red'
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [health, setHealth] = useState<ProjectHealth | null>(null)
  const [determinations, setDeterminations] = useState<Determination[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<Partial<Project>>({})
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [p, h, d] = await Promise.all([
        api.getProject(id),
        api.getProjectHealth(id).catch(() => null),
        api.getDeterminations(id).catch(() => []),
      ])
      setProject(p)
      setHealth(h)
      setDeterminations(Array.isArray(d) ? d : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function openEdit() {
    if (!project) return
    setForm({
      name: project.name,
      awarding_agency: project.awarding_agency || '',
      contract_number: project.contract_number || '',
      county: project.county || '',
      state: project.state || '',
      status: project.status || 'active',
      filing_cadence: project.filing_cadence || 'weekly',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
    })
    setEditError(null)
    setEditOpen(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    setEditError(null)
    if (!form.name || !String(form.name).trim()) {
      setEditError('Project name is required.')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: String(form.name).trim(),
        awarding_agency: form.awarding_agency || null,
        contract_number: form.contract_number || null,
        county: form.county || null,
        state: form.state ? String(form.state).toUpperCase() : null,
        status: form.status,
        filing_cadence: form.filing_cadence,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }
      const updated = await api.updateProject(id, body)
      setProject(updated)
      setEditOpen(false)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to update project')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.deleteProject(id)
      router.push('/dashboard/projects')
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to delete project')
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  const weeks: WeekRow[] = useMemo(() => health?.weeks || [], [health])
  const score = num(health?.score ?? health?.health_score)
  const weeksFiled = num(health?.weeks_filed) || weeks.filter((w) => w.filed).length
  const weeksDue = num(health?.weeks_due) || weeks.length
  const restitution = num(health?.restitution_outstanding ?? health?.total_shortfall)
  const filedPct = weeksDue > 0 ? Math.round((weeksFiled / weeksDue) * 100) : 0

  if (loading) return <FullPageSpinner label="Loading project..." />

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/projects" className="text-sm text-cyan-400 hover:text-cyan-300">
          ← Back to projects
        </Link>
        <Card className="border-red-500/30">
          <CardBody className="flex items-center justify-between">
            <p className="text-sm text-red-300">{error || 'Project not found.'}</p>
            <Button variant="secondary" onClick={load}>
              Retry
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/projects" className="text-sm text-cyan-400 hover:text-cyan-300">
          ← Back to projects
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{project.name}</h1>
              <Badge tone={project.status === 'active' ? 'green' : 'slate'}>
                {(project.status || 'active').replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-stone-500">
              {[project.awarding_agency, project.contract_number, [project.county, project.state].filter(Boolean).join(', ')]
                .filter(Boolean)
                .join(' · ') || 'No contract metadata'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={openEdit}>
              Edit
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Health stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Compliance score"
          value={health ? `${score}%` : '—'}
          tone={!health ? 'default' : scoreTone(score) === 'green' ? 'green' : scoreTone(score) === 'amber' ? 'amber' : 'red'}
          hint={num(health?.hard_findings) > 0 ? `${num(health?.hard_findings)} hard finding(s)` : 'No hard findings'}
        />
        <Stat
          label="Open findings"
          value={num(health?.open_findings)}
          tone={num(health?.open_findings) > 0 ? 'red' : 'green'}
          hint={<Link href={`/dashboard/findings`} className="text-cyan-400 hover:text-cyan-300">View findings →</Link>}
        />
        <Stat
          label="Weeks filed / due"
          value={`${weeksFiled} / ${weeksDue}`}
          tone={filedPct >= 100 ? 'green' : filedPct >= 80 ? 'amber' : 'red'}
          hint={`${filedPct}% filed`}
        />
        <Stat
          label="Restitution outstanding"
          value={dollars(restitution)}
          tone={restitution > 0 ? 'red' : 'green'}
          hint={<Link href={`/dashboard/restitution`} className="text-cyan-400 hover:text-cyan-300">Worksheets →</Link>}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Contract details */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Contract details</h2>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Detail label="Role" value={project.role || '—'} />
            <Detail label="Coverage" value={(project.coverage || 'davis_bacon').replace(/_/g, '-')} />
            <Detail label="Filing cadence" value={project.filing_cadence || 'weekly'} />
            <Detail label="Contract value" value={money(project.contract_value_cents)} />
            <Detail label="Labor budget" value={money(project.labor_budget_cents)} />
            <Detail label="Period" value={`${project.start_date || '—'} → ${project.end_date || '—'}`} />
            {Array.isArray(project.crafts) && project.crafts.length > 0 && (
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Crafts</span>
                <div className="flex flex-wrap gap-1">
                  {project.crafts.map((c) => (
                    <Badge key={c} tone="slate">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Determinations */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Wage determinations</h2>
            <Link href="/dashboard/determinations" className="text-xs font-medium text-cyan-400 hover:text-cyan-300">
              Manage →
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            {determinations.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-stone-500">
                No determinations attached to this project.{' '}
                <Link href="/dashboard/determinations" className="text-cyan-400 hover:text-cyan-300">
                  Add one
                </Link>
                .
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>WD number</TH>
                    <TH>Mod</TH>
                    <TH>Locality</TH>
                    <TH>Schedule</TH>
                    <TH>Effective</TH>
                    <TH className="text-right">Active</TH>
                  </TR>
                </THead>
                <TBody>
                  {determinations.map((d) => (
                    <TR key={d.id}>
                      <TD>
                        <Link href={`/dashboard/determinations/${d.id}`} className="font-medium text-stone-100 hover:text-cyan-300">
                          {d.wd_number || d.id.slice(0, 8)}
                        </Link>
                      </TD>
                      <TD className="text-stone-400">{d.modification_number || '—'}</TD>
                      <TD className="text-stone-400">
                        {[d.locality, d.county, d.state].filter(Boolean).join(', ') || '—'}
                      </TD>
                      <TD className="text-stone-400">{d.schedule_type || '—'}</TD>
                      <TD className="text-stone-400">{d.effective_date || d.decision_date || '—'}</TD>
                      <TD className="text-right">
                        <Badge tone={d.is_active ? 'green' : 'slate'}>{d.is_active ? 'Active' : 'Superseded'}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Weeks */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Weeks filed vs due</h2>
          <div className="flex gap-3 text-xs">
            <Link href="/dashboard/ledger" className="font-medium text-cyan-400 hover:text-cyan-300">
              Ledger →
            </Link>
            <Link href="/dashboard/deadlines" className="font-medium text-cyan-400 hover:text-cyan-300">
              Deadlines →
            </Link>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {weeks.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-stone-500">
              No weekly data yet. Enter payroll in the{' '}
              <Link href="/dashboard/ledger" className="text-cyan-400 hover:text-cyan-300">
                ledger
              </Link>{' '}
              and generate{' '}
              <Link href="/dashboard/deadlines" className="text-cyan-400 hover:text-cyan-300">
                deadlines
              </Link>
              .
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Week ending</TH>
                  <TH>Due date</TH>
                  <TH className="text-right">Lines</TH>
                  <TH className="text-right">Pass / fail</TH>
                  <TH className="text-right">Restitution</TH>
                  <TH className="text-right">Filed</TH>
                </TR>
              </THead>
              <TBody>
                {weeks.map((w, i) => (
                  <TR key={w.week_ending || i}>
                    <TD className="font-medium text-stone-200">{w.week_ending || '—'}</TD>
                    <TD className="text-stone-400">{w.due_date || '—'}</TD>
                    <TD className="text-right tabular-nums text-stone-400">{num(w.lines)}</TD>
                    <TD className="text-right tabular-nums">
                      <span className="text-emerald-400">{num(w.pass_count)}</span>
                      <span className="text-stone-600"> / </span>
                      <span className={num(w.fail_count) > 0 ? 'text-red-300' : 'text-stone-500'}>{num(w.fail_count)}</span>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {num(w.restitution_outstanding) > 0 ? (
                        <span className="text-cyan-300">{dollars(w.restitution_outstanding)}</span>
                      ) : (
                        <span className="text-stone-500">—</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <Badge tone={w.filed ? 'green' : 'amber'}>{w.filed ? 'Filed' : 'Open'}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => !saving && setEditOpen(false)}
        title="Edit project"
        footer={
          <>
            <Button variant="ghost" onClick={() => !saving && setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="edit-project-form" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </>
        }
      >
        <form id="edit-project-form" onSubmit={saveEdit} className="space-y-4">
          {editError && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{editError}</p>}
          <Field label="Project name" required>
            <input value={String(form.name ?? '')} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Awarding agency">
              <input
                value={String(form.awarding_agency ?? '')}
                onChange={(e) => setForm({ ...form, awarding_agency: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Contract number">
              <input
                value={String(form.contract_number ?? '')}
                onChange={(e) => setForm({ ...form, contract_number: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="County">
              <input value={String(form.county ?? '')} onChange={(e) => setForm({ ...form, county: e.target.value })} className={inputCls} />
            </Field>
            <Field label="State">
              <input
                value={String(form.state ?? '')}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className={inputCls}
                maxLength={2}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select value={String(form.status ?? 'active')} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Filing cadence">
              <select
                value={String(form.filing_cadence ?? 'weekly')}
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
                value={String(form.start_date ?? '')}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={String(form.end_date ?? '')}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete project"
        footer={
          <>
            <Button variant="ghost" onClick={() => !deleting && setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete permanently'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-stone-300">
          Delete <span className="font-semibold text-white">{project.name}</span>? This removes the project and its
          associated wage determinations, payroll, findings, and filings. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
        {required && <span className="text-cyan-400"> *</span>}
      </span>
      {children}
    </label>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</span>
      <span className="text-right capitalize text-stone-200">{value}</span>
    </div>
  )
}

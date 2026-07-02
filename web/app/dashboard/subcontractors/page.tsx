'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Project = {
  id: string
  name: string
  awarding_agency?: string
  contract_number?: string
  county?: string
  state?: string
  start_date?: string
  end_date?: string
}

type Subcontractor = {
  id: string
  project_id: string
  name: string
  tier: number
  contact_name?: string | null
  contact_email?: string | null
  created_at?: string
  updated_at?: string
}

type SubFiling = {
  id: string
  subcontractor_id: string
  week_ending: string
  filed: boolean
  filed_at?: string | null
  created_at?: string
}

const TIER_TONES = ['amber', 'blue', 'green', 'slate', 'neutral'] as const

function tierTone(tier: number) {
  return TIER_TONES[Math.min(Math.max(tier - 1, 0), TIER_TONES.length - 1)]
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Build a list of week-ending (Saturday) dates spanning a project's range,
// falling back to a recent 12-week window when no range is present.
function buildWeekEndings(project?: Project): string[] {
  const toSaturday = (d: Date) => {
    const x = new Date(d)
    const day = x.getDay()
    const add = (6 - day + 7) % 7
    x.setDate(x.getDate() + add)
    x.setHours(0, 0, 0, 0)
    return x
  }
  let start: Date
  let end: Date
  if (project?.start_date) {
    start = new Date(project.start_date)
    end = project.end_date ? new Date(project.end_date) : new Date()
  } else {
    end = new Date()
    start = new Date()
    start.setDate(start.getDate() - 7 * 11)
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    end = new Date()
    start = new Date()
    start.setDate(start.getDate() - 7 * 11)
  }
  // Cap to avoid runaway loops.
  let cur = toSaturday(start)
  const last = toSaturday(end)
  const out: string[] = []
  let guard = 0
  while (cur.getTime() <= last.getTime() && guard < 200) {
    out.push(cur.toISOString().slice(0, 10))
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 7)
    guard++
  }
  if (out.length === 0) out.push(toSaturday(new Date()).toISOString().slice(0, 10))
  return out
}

export default function SubcontractorsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [subs, setSubs] = useState<Subcontractor[]>([])
  const [filingsBySub, setFilingsBySub] = useState<Record<string, SubFiling[]>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<string>('')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Subcontractor | null>(null)
  const [form, setForm] = useState({ name: '', tier: 1, contact_name: '', contact_email: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [filingsSub, setFilingsSub] = useState<Subcontractor | null>(null)
  const [togglingWeek, setTogglingWeek] = useState<string | null>(null)

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ps: Project[] = await api.getProjects()
        if (cancelled) return
        setProjects(ps || [])
        if (ps && ps.length > 0) setProjectId(ps[0].id)
        else setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load projects')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function loadSubs(pid: string, initial = false) {
    if (!pid) return
    if (initial) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const list: Subcontractor[] = await api.getSubcontractors(pid)
      const subsList = list || []
      setSubs(subsList)
      // Load filings for each sub in parallel.
      const entries = await Promise.all(
        subsList.map(async (s) => {
          try {
            const f: SubFiling[] = await api.getSubFilings(s.id)
            return [s.id, f || []] as const
          } catch {
            return [s.id, [] as SubFiling[]] as const
          }
        }),
      )
      setFilingsBySub(Object.fromEntries(entries))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subcontractors')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (projectId) loadSubs(projectId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return subs.filter((s) => {
      if (tierFilter && String(s.tier) !== tierFilter) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.contact_name || '').toLowerCase().includes(q) ||
        (s.contact_email || '').toLowerCase().includes(q)
      )
    })
  }, [subs, search, tierFilter])

  const stats = useMemo(() => {
    const totalSubs = subs.length
    const tiers = new Set(subs.map((s) => s.tier)).size
    let filed = 0
    let due = 0
    for (const s of subs) {
      const f = filingsBySub[s.id] || []
      for (const row of f) {
        due++
        if (row.filed) filed++
      }
    }
    const pct = due > 0 ? Math.round((filed / due) * 100) : 0
    return { totalSubs, tiers, filed, due, pct }
  }, [subs, filingsBySub])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', tier: 1, contact_name: '', contact_email: '' })
    setFormError(null)
    setEditorOpen(true)
  }

  function openEdit(s: Subcontractor) {
    setEditing(s)
    setForm({
      name: s.name,
      tier: s.tier,
      contact_name: s.contact_name || '',
      contact_email: s.contact_email || '',
    })
    setFormError(null)
    setEditorOpen(true)
  }

  async function saveSub() {
    if (!form.name.trim()) {
      setFormError('Subcontractor name is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    const body = {
      project_id: projectId,
      name: form.name.trim(),
      tier: Number(form.tier) || 1,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
    }
    try {
      if (editing) await api.updateSubcontractor(editing.id, body)
      else await api.createSubcontractor(body)
      setEditorOpen(false)
      await loadSubs(projectId)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save subcontractor')
    } finally {
      setSaving(false)
    }
  }

  async function removeSub(s: Subcontractor) {
    if (!confirm(`Delete subcontractor "${s.name}"? This removes its filing history.`)) return
    try {
      await api.deleteSubcontractor(s.id)
      await loadSubs(projectId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete subcontractor')
    }
  }

  const weekEndings = useMemo(() => buildWeekEndings(selectedProject), [selectedProject])

  async function toggleFiling(sub: Subcontractor, week: string, filed: boolean) {
    setTogglingWeek(week)
    try {
      await api.upsertSubFiling(sub.id, {
        week_ending: week,
        filed,
        filed_at: filed ? new Date().toISOString() : null,
      })
      const f: SubFiling[] = await api.getSubFilings(sub.id)
      setFilingsBySub((prev) => ({ ...prev, [sub.id]: f || [] }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update filing')
    } finally {
      setTogglingWeek(null)
    }
  }

  function filingMapFor(subId: string): Map<string, SubFiling> {
    const m = new Map<string, SubFiling>()
    for (const f of filingsBySub[subId] || []) m.set(f.week_ending.slice(0, 10), f)
    return m
  }

  if (loading) return <FullPageSpinner label="Loading subcontractors..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Subcontractors</h1>
          <p className="mt-1 text-sm text-stone-400">
            Track lower-tier subs and their weekly certified-payroll filings per project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <Spinner />}
          <Button onClick={openCreate} disabled={!projectId}>
            + Add subcontractor
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project before tracking its subcontractors."
          icon="🏗️"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Subcontractors" value={stats.totalSubs} />
            <Stat label="Tiers in chain" value={stats.tiers} tone="amber" />
            <Stat label="Filings filed" value={`${stats.filed} / ${stats.due}`} tone="green" />
            <Stat
              label="Filing coverage"
              value={`${stats.pct}%`}
              tone={stats.pct >= 90 ? 'green' : stats.pct >= 60 ? 'amber' : 'red'}
              hint="Filed weeks across all subs"
            />
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col">
                <label className="text-xs uppercase tracking-wide text-stone-500">Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.contract_number ? ` · ${p.contract_number}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-xs uppercase tracking-wide text-stone-500">Tier</label>
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  className="mt-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">All tiers</option>
                  {Array.from(new Set(subs.map((s) => s.tier)))
                    .sort((a, b) => a - b)
                    .map((t) => (
                      <option key={t} value={String(t)}>
                        Tier {t}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-1 flex-col">
                <label className="text-xs uppercase tracking-wide text-stone-500">Search</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, contact, or email…"
                  className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {error && (
                <div className="border-b border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}
              {filtered.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyState
                    title={subs.length === 0 ? 'No subcontractors' : 'No matches'}
                    description={
                      subs.length === 0
                        ? 'Add the subs working under this prime contract to track their filings.'
                        : 'Adjust your search or tier filter.'
                    }
                    icon="👷"
                    action={
                      subs.length === 0 ? (
                        <Button onClick={openCreate}>+ Add subcontractor</Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Subcontractor</TH>
                      <TH>Tier</TH>
                      <TH>Contact</TH>
                      <TH className="text-right">Filings filed</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered
                      .slice()
                      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
                      .map((s) => {
                        const f = filingsBySub[s.id] || []
                        const filed = f.filter((x) => x.filed).length
                        return (
                          <TR key={s.id}>
                            <TD className="font-medium text-stone-100">{s.name}</TD>
                            <TD>
                              <Badge tone={tierTone(s.tier)}>Tier {s.tier}</Badge>
                            </TD>
                            <TD>
                              {s.contact_name || '—'}
                              {s.contact_email && (
                                <div className="text-xs text-stone-500">{s.contact_email}</div>
                              )}
                            </TD>
                            <TD className="text-right tabular-nums">
                              {filed} / {f.length || 0}
                            </TD>
                            <TD className="text-right">
                              <div className="inline-flex gap-2">
                                <Button variant="secondary" onClick={() => setFilingsSub(s)}>
                                  Filings
                                </Button>
                                <Button variant="ghost" onClick={() => openEdit(s)}>
                                  Edit
                                </Button>
                                <Button variant="ghost" onClick={() => removeSub(s)}>
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
        </>
      )}

      {/* Create / edit modal */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? 'Edit subcontractor' : 'Add subcontractor'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveSub} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Legal name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              placeholder="Acme Electrical LLC"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Tier</label>
            <select
              value={form.tier}
              onChange={(e) => setForm((f) => ({ ...f, tier: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
            >
              {[1, 2, 3, 4, 5].map((t) => (
                <option key={t} value={t}>
                  Tier {t}
                  {t === 1 ? ' (direct sub to prime)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-stone-500">Contact name</label>
              <input
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-stone-500">Contact email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
                placeholder="jane@acme.com"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Weekly filings modal */}
      <Modal
        open={!!filingsSub}
        onClose={() => setFilingsSub(null)}
        title={filingsSub ? `Weekly filings — ${filingsSub.name}` : 'Weekly filings'}
        className="max-w-2xl"
        footer={
          <Button variant="secondary" onClick={() => setFilingsSub(null)}>
            Close
          </Button>
        }
      >
        {filingsSub && (
          <div className="space-y-3">
            <p className="text-sm text-stone-400">
              Toggle each week to mark this sub&apos;s certified payroll as filed. Week-endings span
              the project&apos;s contract dates (Saturdays).
            </p>
            <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
              {(() => {
                const map = filingMapFor(filingsSub.id)
                return weekEndings.map((wk) => {
                  const row = map.get(wk)
                  const filed = !!row?.filed
                  const busy = togglingWeek === wk
                  return (
                    <div
                      key={wk}
                      className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-stone-200">{wk}</span>
                        {filed ? (
                          <Badge tone="green">Filed</Badge>
                        ) : (
                          <Badge tone="amber">Pending</Badge>
                        )}
                        {row?.filed_at && (
                          <span className="text-xs text-stone-500">{fmtDate(row.filed_at)}</span>
                        )}
                      </div>
                      <Button
                        variant={filed ? 'ghost' : 'primary'}
                        onClick={() => toggleFiling(filingsSub, wk, !filed)}
                        disabled={busy}
                      >
                        {busy ? '…' : filed ? 'Mark unfiled' : 'Mark filed'}
                      </Button>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

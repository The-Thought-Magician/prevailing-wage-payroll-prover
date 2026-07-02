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
  start_date?: string
  end_date?: string
}

type Packet = {
  id: string
  project_id: string
  period_start: string
  period_end: string
  status: string
  manifest?: Manifest | null
  created_at?: string
}

type ManifestSection = {
  label?: string
  count?: number
  items?: Array<Record<string, unknown>>
  [k: string]: unknown
}

type Manifest = Record<string, ManifestSection | unknown>

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function statusTone(s: string): 'green' | 'amber' | 'blue' | 'slate' | 'red' {
  const v = (s || '').toLowerCase()
  if (v === 'ready' || v === 'complete' || v === 'generated') return 'green'
  if (v === 'generating' || v === 'pending') return 'amber'
  if (v === 'failed' || v === 'error') return 'red'
  return 'slate'
}

// Normalize a manifest into countable sections regardless of exact backend shape.
function manifestSections(m?: Manifest | null): Array<{ key: string; label: string; count: number }> {
  if (!m || typeof m !== 'object') return []
  const out: Array<{ key: string; label: string; count: number }> = []
  for (const [key, val] of Object.entries(m)) {
    if (val == null) continue
    let count = 0
    let label = key.replace(/_/g, ' ')
    if (Array.isArray(val)) count = val.length
    else if (typeof val === 'object') {
      const s = val as ManifestSection
      if (typeof s.count === 'number') count = s.count
      else if (Array.isArray(s.items)) count = s.items.length
      else count = Object.keys(s).length
      if (typeof s.label === 'string') label = s.label
    } else if (typeof val === 'number') {
      count = val
    } else {
      continue
    }
    out.push({ key, label: label.replace(/\b\w/g, (c) => c.toUpperCase()), count })
  }
  return out
}

function defaultRange(project?: Project): { start: string; end: string } {
  const today = new Date()
  const end = project?.end_date ? new Date(project.end_date) : today
  let start: Date
  if (project?.start_date) start = new Date(project.start_date)
  else {
    start = new Date(today)
    start.setMonth(start.getMonth() - 3)
  }
  const iso = (d: Date) => (Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10))
  return { start: iso(start), end: iso(end) }
}

export default function AuditPacketsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [packets, setPackets] = useState<Packet[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [genOpen, setGenOpen] = useState(false)
  const [genForm, setGenForm] = useState({ period_start: '', period_end: '' })
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const [detail, setDetail] = useState<Packet | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

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

  async function loadPackets(pid: string, initial = false) {
    if (!pid) return
    if (initial) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const list: Packet[] = await api.getAuditPackets(pid)
      setPackets(list || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit packets')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (projectId) loadPackets(projectId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function openGenerate() {
    const r = defaultRange(selectedProject)
    setGenForm({ period_start: r.start, period_end: r.end })
    setGenError(null)
    setGenOpen(true)
  }

  async function generate() {
    if (!genForm.period_start || !genForm.period_end) {
      setGenError('Both period start and end are required.')
      return
    }
    if (genForm.period_start > genForm.period_end) {
      setGenError('Period start must be on or before period end.')
      return
    }
    setGenerating(true)
    setGenError(null)
    try {
      await api.generateAuditPacket({
        project_id: projectId,
        period_start: genForm.period_start,
        period_end: genForm.period_end,
      })
      setGenOpen(false)
      await loadPackets(projectId)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate packet')
    } finally {
      setGenerating(false)
    }
  }

  async function openDetail(p: Packet) {
    setDetail(p)
    setDetailLoading(true)
    try {
      const full: Packet = await api.getAuditPacket(p.id)
      setDetail(full)
    } catch {
      // keep summary row already shown
    } finally {
      setDetailLoading(false)
    }
  }

  async function removePacket(p: Packet) {
    if (!confirm(`Delete audit packet for ${fmtDate(p.period_start)} – ${fmtDate(p.period_end)}?`))
      return
    try {
      await api.deleteAuditPacket(p.id)
      if (detail?.id === p.id) setDetail(null)
      await loadPackets(projectId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete packet')
    }
  }

  function exportManifest(p: Packet) {
    const blob = new Blob([JSON.stringify(p.manifest ?? p, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-packet-${p.period_start}_${p.period_end}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const stats = useMemo(() => {
    const total = packets.length
    const ready = packets.filter((p) => statusTone(p.status) === 'green').length
    let docs = 0
    for (const p of packets) {
      for (const s of manifestSections(p.manifest)) docs += s.count
    }
    return { total, ready, docs }
  }, [packets])

  if (loading) return <FullPageSpinner label="Loading audit packets..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Packets</h1>
          <p className="mt-1 text-sm text-stone-400">
            Bundle WH-347s, determinations, ledger, fringe, apprenticeship, and restitution into a
            DOL / state-agency audit packet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <Spinner />}
          <Button onClick={openGenerate} disabled={!projectId}>
            + Generate packet
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project before generating audit packets."
          icon="🏗️"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Packets" value={stats.total} />
            <Stat label="Ready" value={stats.ready} tone="green" />
            <Stat label="Documents bundled" value={stats.docs} tone="amber" />
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
                      {p.awarding_agency ? ` · ${p.awarding_agency}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {error && (
                <div className="border-b border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}
              {packets.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyState
                    title="No audit packets"
                    description="Generate a packet for a date range to assemble everything an auditor needs in one bundle."
                    icon="📦"
                    action={<Button onClick={openGenerate}>+ Generate packet</Button>}
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Period</TH>
                      <TH>Status</TH>
                      <TH>Contents</TH>
                      <TH>Created</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {packets
                      .slice()
                      .sort((a, b) => (b.period_end || '').localeCompare(a.period_end || ''))
                      .map((p) => {
                        const secs = manifestSections(p.manifest)
                        return (
                          <TR key={p.id}>
                            <TD className="font-medium text-stone-100">
                              {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
                            </TD>
                            <TD>
                              <Badge tone={statusTone(p.status)}>{p.status || 'unknown'}</Badge>
                            </TD>
                            <TD>
                              {secs.length === 0 ? (
                                <span className="text-stone-500">—</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {secs.slice(0, 4).map((s) => (
                                    <Badge key={s.key} tone="slate">
                                      {s.label}: {s.count}
                                    </Badge>
                                  ))}
                                  {secs.length > 4 && (
                                    <Badge tone="neutral">+{secs.length - 4}</Badge>
                                  )}
                                </div>
                              )}
                            </TD>
                            <TD className="text-stone-400">{fmtDate(p.created_at)}</TD>
                            <TD className="text-right">
                              <div className="inline-flex gap-2">
                                <Button variant="secondary" onClick={() => openDetail(p)}>
                                  View
                                </Button>
                                <Button variant="ghost" onClick={() => exportManifest(p)}>
                                  Export
                                </Button>
                                <Button variant="ghost" onClick={() => removePacket(p)}>
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

      {/* Generate modal */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate audit packet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {genError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {genError}
            </div>
          )}
          <p className="text-sm text-stone-400">
            Bundles all compliance records for{' '}
            <span className="text-stone-200">{selectedProject?.name}</span> within the period below.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-stone-500">Period start</label>
              <input
                type="date"
                value={genForm.period_start}
                onChange={(e) => setGenForm((f) => ({ ...f, period_start: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-stone-500">Period end</label>
              <input
                type="date"
                value={genForm.period_end}
                onChange={(e) => setGenForm((f) => ({ ...f, period_end: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={
          detail
            ? `Packet · ${fmtDate(detail.period_start)} – ${fmtDate(detail.period_end)}`
            : 'Packet'
        }
        className="max-w-2xl"
        footer={
          detail && (
            <>
              <Button variant="ghost" onClick={() => exportManifest(detail)}>
                Export JSON
              </Button>
              <Button variant="secondary" onClick={() => setDetail(null)}>
                Close
              </Button>
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge tone={statusTone(detail.status)}>{detail.status || 'unknown'}</Badge>
              {detailLoading && <Spinner label="Loading manifest…" />}
            </div>
            {(() => {
              const secs = manifestSections(detail.manifest)
              if (secs.length === 0)
                return (
                  <EmptyState
                    title="No manifest contents"
                    description="This packet has no bundled documents in the selected period."
                    icon="📭"
                  />
                )
              return (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {secs.map((s) => (
                    <div
                      key={s.key}
                      className="rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-3"
                    >
                      <div className="text-2xl font-bold text-cyan-400">{s.count}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-stone-500">
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
      </Modal>
    </div>
  )
}

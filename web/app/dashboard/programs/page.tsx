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
  effective_date: string | null
  end_date: string | null
  levels?: ProgramLevel[]
}

type ProgramForm = {
  registration_number: string
  sponsor: string
  trade: string
  required_ratio: string
  effective_date: string
  end_date: string
}

type LevelForm = {
  level_name: string
  period_number: string
  pct_of_journeyworker: string
}

const EMPTY_PROGRAM: ProgramForm = {
  registration_number: '',
  sponsor: '',
  trade: '',
  required_ratio: '1',
  effective_date: '',
  end_date: '',
}

const EMPTY_LEVEL: LevelForm = { level_name: '', period_number: '', pct_of_journeyworker: '' }

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40'
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500'

function fmtDate(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString()
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [progModal, setProgModal] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [progForm, setProgForm] = useState<ProgramForm>(EMPTY_PROGRAM)
  const [savingProg, setSavingProg] = useState(false)
  const [progErr, setProgErr] = useState<string | null>(null)

  const [levelModal, setLevelModal] = useState<Program | null>(null)
  const [levelForm, setLevelForm] = useState<LevelForm>(EMPTY_LEVEL)
  const [savingLevel, setSavingLevel] = useState(false)
  const [levelErr, setLevelErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const p = await api.getPrograms()
      setPrograms(Array.isArray(p) ? p : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load programs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return programs
    return programs.filter(
      (p) =>
        p.trade.toLowerCase().includes(q) ||
        p.sponsor.toLowerCase().includes(q) ||
        p.registration_number.toLowerCase().includes(q),
    )
  }, [programs, search])

  const stats = useMemo(() => {
    const totalLevels = programs.reduce((acc, p) => acc + (p.levels?.length || 0), 0)
    const ratios = programs.map((p) => p.required_ratio).filter((r) => typeof r === 'number')
    const avgRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0
    return { count: programs.length, totalLevels, avgRatio }
  }, [programs])

  function openCreate() {
    setEditing(null)
    setProgForm(EMPTY_PROGRAM)
    setProgErr(null)
    setProgModal(true)
  }

  function openEdit(p: Program) {
    setEditing(p)
    setProgForm({
      registration_number: p.registration_number || '',
      sponsor: p.sponsor || '',
      trade: p.trade || '',
      required_ratio: String(p.required_ratio ?? ''),
      effective_date: p.effective_date ? p.effective_date.slice(0, 10) : '',
      end_date: p.end_date ? p.end_date.slice(0, 10) : '',
    })
    setProgErr(null)
    setProgModal(true)
  }

  async function submitProgram(e: FormEvent) {
    e.preventDefault()
    if (!progForm.trade.trim() || !progForm.registration_number.trim()) {
      setProgErr('Trade and registration number are required.')
      return
    }
    setSavingProg(true)
    setProgErr(null)
    const body = {
      registration_number: progForm.registration_number.trim(),
      sponsor: progForm.sponsor.trim(),
      trade: progForm.trade.trim(),
      required_ratio: Number(progForm.required_ratio) || 0,
      effective_date: progForm.effective_date || null,
      end_date: progForm.end_date || null,
    }
    try {
      if (editing) await api.updateProgram(editing.id, body)
      else await api.createProgram(body)
      setProgModal(false)
      await load()
    } catch (err) {
      setProgErr(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingProg(false)
    }
  }

  async function deleteProgram(p: Program) {
    if (!confirm(`Delete program "${p.trade}" (${p.registration_number}) and all its levels?`)) return
    try {
      await api.deleteProgram(p.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  function openLevel(p: Program) {
    setLevelModal(p)
    const nextPeriod = (p.levels?.reduce((m, l) => Math.max(m, l.period_number), 0) || 0) + 1
    setLevelForm({ ...EMPTY_LEVEL, period_number: String(nextPeriod) })
    setLevelErr(null)
  }

  async function submitLevel(e: FormEvent) {
    e.preventDefault()
    if (!levelModal) return
    if (!levelForm.level_name.trim() || !levelForm.period_number || !levelForm.pct_of_journeyworker) {
      setLevelErr('All level fields are required.')
      return
    }
    setSavingLevel(true)
    setLevelErr(null)
    try {
      await api.addProgramLevel(levelModal.id, {
        level_name: levelForm.level_name.trim(),
        period_number: Number(levelForm.period_number),
        pct_of_journeyworker: Number(levelForm.pct_of_journeyworker),
      })
      setLevelModal(null)
      await load()
    } catch (err) {
      setLevelErr(err instanceof Error ? err.message : 'Add level failed')
    } finally {
      setSavingLevel(false)
    }
  }

  async function deleteLevel(programId: string, levelId: string) {
    if (!confirm('Delete this apprenticeship period?')) return
    try {
      await api.deleteProgramLevel(programId, levelId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  if (loading) return <FullPageSpinner label="Loading apprenticeship programs..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Apprenticeship Programs</h1>
          <p className="mt-1 text-sm text-slate-400">
            Registered programs and their wage-progression periods used to validate apprentice pay rates.
          </p>
        </div>
        <Button onClick={openCreate}>+ Register Program</Button>
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
        <Stat label="Programs" value={stats.count} />
        <Stat label="Defined Periods" value={stats.totalLevels} tone="amber" />
        <Stat label="Avg Required Ratio" value={`${stats.avgRatio.toFixed(2)}:1`} hint="apprentice : journeyworker" />
      </div>

      <div className="max-w-sm">
        <input
          className={inputCls}
          placeholder="Search trade, sponsor, registration #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={programs.length === 0 ? 'No programs registered' : 'No programs match your search'}
          description={
            programs.length === 0
              ? 'Register a DOL/state apprenticeship program to enroll apprentices and validate their progression rates.'
              : 'Try a different search term.'
          }
          action={programs.length === 0 ? <Button onClick={openCreate}>+ Register Program</Button> : undefined}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => {
            const isOpen = expanded[p.id]
            const levels = [...(p.levels || [])].sort((a, b) => a.period_number - b.period_number)
            return (
              <Card key={p.id}>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{p.trade}</h3>
                      <Badge tone="amber">{p.registration_number}</Badge>
                      <Badge tone="slate">{(p.required_ratio ?? 0).toFixed(2)}:1 ratio</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {p.sponsor || 'No sponsor'} · Effective {fmtDate(p.effective_date)}
                      {p.end_date ? ` – ${fmtDate(p.end_date)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="px-3 py-1" onClick={() => openLevel(p)}>
                      + Period
                    </Button>
                    <Button variant="ghost" className="px-3 py-1" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-3 py-1 text-red-400 hover:text-red-300"
                      onClick={() => deleteProgram(p)}
                    >
                      Delete
                    </Button>
                  </div>
                </CardHeader>
                <CardBody>
                  <button
                    className="text-sm font-medium text-amber-400 hover:text-amber-300"
                    onClick={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  >
                    {isOpen ? '▾' : '▸'} {levels.length} progression period{levels.length === 1 ? '' : 's'}
                  </button>

                  {isOpen &&
                    (levels.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        No periods defined yet. Add wage-progression periods so apprentice pay can be validated as a
                        percentage of the journeyworker rate.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {levels.map((l) => (
                          <div key={l.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge tone="blue">Period {l.period_number}</Badge>
                                <span className="text-sm font-medium text-slate-200">{l.level_name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-amber-300">
                                  {Math.round(l.pct_of_journeyworker)}%
                                </span>
                                <button
                                  className="text-xs text-red-400 hover:text-red-300"
                                  onClick={() => deleteLevel(p.id, l.id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
                                style={{ width: `${Math.min(100, Math.max(0, l.pct_of_journeyworker))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {/* Program modal */}
      <Modal
        open={progModal}
        onClose={() => setProgModal(false)}
        title={editing ? 'Edit Program' : 'Register Program'}
        className="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setProgModal(false)} disabled={savingProg}>
              Cancel
            </Button>
            <Button type="submit" form="program-form" disabled={savingProg}>
              {savingProg ? 'Saving...' : editing ? 'Save Changes' : 'Register'}
            </Button>
          </>
        }
      >
        <form id="program-form" onSubmit={submitProgram} className="space-y-4">
          {progErr && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{progErr}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Trade *</label>
              <input
                className={inputCls}
                value={progForm.trade}
                onChange={(e) => setProgForm((f) => ({ ...f, trade: e.target.value }))}
                placeholder="Electrician"
              />
            </div>
            <div>
              <label className={labelCls}>Registration Number *</label>
              <input
                className={inputCls}
                value={progForm.registration_number}
                onChange={(e) => setProgForm((f) => ({ ...f, registration_number: e.target.value }))}
                placeholder="OA-12345"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Sponsor</label>
              <input
                className={inputCls}
                value={progForm.sponsor}
                onChange={(e) => setProgForm((f) => ({ ...f, sponsor: e.target.value }))}
                placeholder="Joint Apprenticeship Training Committee"
              />
            </div>
            <div>
              <label className={labelCls}>Required Ratio (appr : jw)</label>
              <input
                className={inputCls}
                type="number"
                step="0.01"
                min="0"
                value={progForm.required_ratio}
                onChange={(e) => setProgForm((f) => ({ ...f, required_ratio: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Effective</label>
                <input
                  className={inputCls}
                  type="date"
                  value={progForm.effective_date}
                  onChange={(e) => setProgForm((f) => ({ ...f, effective_date: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelCls}>End</label>
                <input
                  className={inputCls}
                  type="date"
                  value={progForm.end_date}
                  onChange={(e) => setProgForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Level modal */}
      <Modal
        open={!!levelModal}
        onClose={() => setLevelModal(null)}
        title={levelModal ? `Add Period · ${levelModal.trade}` : 'Add Period'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLevelModal(null)} disabled={savingLevel}>
              Cancel
            </Button>
            <Button type="submit" form="level-form" disabled={savingLevel}>
              {savingLevel ? 'Adding...' : 'Add Period'}
            </Button>
          </>
        }
      >
        <form id="level-form" onSubmit={submitLevel} className="space-y-4">
          {levelErr && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{levelErr}</div>
          )}
          <div>
            <label className={labelCls}>Level Name *</label>
            <input
              className={inputCls}
              value={levelForm.level_name}
              onChange={(e) => setLevelForm((f) => ({ ...f, level_name: e.target.value }))}
              placeholder="1st Period"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Period Number *</label>
              <input
                className={inputCls}
                type="number"
                min="1"
                value={levelForm.period_number}
                onChange={(e) => setLevelForm((f) => ({ ...f, period_number: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>% of Journeyworker *</label>
              <input
                className={inputCls}
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={levelForm.pct_of_journeyworker}
                onChange={(e) => setLevelForm((f) => ({ ...f, pct_of_journeyworker: e.target.value }))}
                placeholder="50"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}

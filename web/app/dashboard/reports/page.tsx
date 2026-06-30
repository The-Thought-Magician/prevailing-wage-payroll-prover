'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

type Project = { id: string; name: string }
type Row = Record<string, unknown>

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

function usd(cents: unknown): string {
  // values may already be dollars (real) or cents; treat as dollars
  const n = num(cents)
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function usdPrecise(v: unknown): string {
  return num(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function pickLabel(row: Row, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]) !== '') return String(row[k])
  }
  return '—'
}

const AMBER = '#f59e0b'
const SKY = '#38bdf8'
const EMERALD = '#34d399'

function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

type TabKey = 'labor' | 'fringe' | 'apprentice' | 'restitution'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'labor', label: 'Labor by Classification' },
  { key: 'fringe', label: 'Fringe Cash vs Plan' },
  { key: 'apprentice', label: 'Apprentice Utilization' },
  { key: 'restitution', label: 'Restitution Exposure' },
]

export default function ReportsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [tab, setTab] = useState<TabKey>('labor')

  const [labor, setLabor] = useState<Row[]>([])
  const [fringe, setFringe] = useState<Row[]>([])
  const [apprentice, setApprentice] = useState<Row[]>([])
  const [restitution, setRestitution] = useState<Row[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(pid: string) {
    setLoading(true)
    setError(null)
    try {
      const arg = pid || undefined
      const [l, f, a, r] = await Promise.all([
        api.getLaborByClassification(arg),
        api.getFringeCashVsPlan(arg),
        api.getApprenticeUtilization(arg),
        api.getRestitutionExposure(arg),
      ])
      setLabor(Array.isArray(l) ? l : [])
      setFringe(Array.isArray(f) ? f : [])
      setApprentice(Array.isArray(a) ? a : [])
      setRestitution(Array.isArray(r) ? r : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const p = await api.getProjects()
        if (!cancelled) setProjects(Array.isArray(p) ? p : [])
      } catch {
        /* projects optional for filtering */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    load(projectId)
  }, [projectId])

  // Derived: labor
  const laborRows = useMemo(
    () =>
      labor.map((r) => ({
        label: pickLabel(r, ['classification_name', 'classification', 'name']),
        hours: num(r['total_hours'] ?? r['hours'] ?? r['straight_hours']),
        cost: num(r['total_cost'] ?? r['labor_cost'] ?? r['gross_paid'] ?? r['cost']),
        workers: num(r['worker_count'] ?? r['workers']),
      })),
    [labor],
  )
  const laborMaxCost = Math.max(0, ...laborRows.map((r) => r.cost))
  const laborTotalCost = laborRows.reduce((s, r) => s + r.cost, 0)
  const laborTotalHours = laborRows.reduce((s, r) => s + r.hours, 0)

  // Derived: fringe
  const fringeRows = useMemo(
    () =>
      fringe.map((r) => ({
        label: pickLabel(r, ['classification_name', 'classification', 'worker_name', 'name']),
        cash: num(r['fringe_cash'] ?? r['fringe_cash_paid'] ?? r['cash']),
        plan: num(r['fringe_plan'] ?? r['fringe_plan_paid'] ?? r['plan']),
      })),
    [fringe],
  )
  const fringeTotalCash = fringeRows.reduce((s, r) => s + r.cash, 0)
  const fringeTotalPlan = fringeRows.reduce((s, r) => s + r.plan, 0)
  const fringeGrand = fringeTotalCash + fringeTotalPlan

  // Derived: apprentice
  const apprenticeRows = useMemo(
    () =>
      apprentice.map((r) => {
        const appr = num(r['apprentice_hours'] ?? r['apprentice'])
        const journey = num(r['journeyworker_hours'] ?? r['journey_hours'] ?? r['journeyworker'])
        const ratio =
          r['ratio'] !== undefined
            ? num(r['ratio'])
            : journey > 0
              ? appr / journey
              : 0
        const required = num(r['required_ratio'])
        return {
          label: pickLabel(r, ['classification_name', 'classification', 'craft', 'name', 'project_name']),
          appr,
          journey,
          ratio,
          required,
        }
      }),
    [apprentice],
  )

  // Derived: restitution
  const restitutionRows = useMemo(
    () =>
      restitution.map((r) => ({
        label: pickLabel(r, ['worker_name', 'project_name', 'name', 'classification_name']),
        base: num(r['base_shortfall'] ?? r['base']),
        fringeShort: num(r['fringe_shortfall'] ?? r['fringe']),
        ot: num(r['ot_shortfall'] ?? r['ot']),
        total: num(r['total_shortfall'] ?? r['total_owed'] ?? r['total'] ?? r['outstanding']),
        paid: r['paid'] === true || String(r['paid']) === 'true',
      })),
    [restitution],
  )
  const restitutionMax = Math.max(0, ...restitutionRows.map((r) => r.total))
  const restitutionTotal = restitutionRows.reduce((s, r) => s + r.total, 0)
  const restitutionOutstanding = restitutionRows.filter((r) => !r.paid).reduce((s, r) => s + r.total, 0)

  const activeProjectName = projects.find((p) => p.id === projectId)?.name

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Reports &amp; Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Labor distribution, fringe delivery, apprentice utilization, and outstanding restitution exposure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => load(projectId)} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Labor Cost" value={usd(laborTotalCost)} hint={`${laborTotalHours.toLocaleString()} hrs`} />
        <Stat label="Fringe Delivered" value={usd(fringeGrand)} hint="cash + plan" />
        <Stat
          label="Apprentice Crafts"
          value={apprenticeRows.length}
          hint="tracked classifications"
        />
        <Stat
          label="Restitution Outstanding"
          value={usd(restitutionOutstanding)}
          tone={restitutionOutstanding > 0 ? 'red' : 'green'}
          hint={activeProjectName ?? 'all projects'}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <FullPageSpinner label="Loading reports..." />
      ) : (
        <Card>
          {tab === 'labor' && (
            <>
              <CardHeader>
                <h2 className="text-base font-semibold text-white">Labor Cost by Classification</h2>
              </CardHeader>
              <CardBody>
                {laborRows.length === 0 ? (
                  <EmptyState title="No labor data" description="Add payroll lines to populate this report." />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Classification</TH>
                        <TH className="text-right">Hours</TH>
                        <TH className="text-right">Workers</TH>
                        <TH className="text-right">Cost</TH>
                        <TH className="w-1/3">Share</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {laborRows.map((r, i) => (
                        <TR key={i}>
                          <TD className="font-medium text-slate-200">{r.label}</TD>
                          <TD className="text-right">{r.hours.toLocaleString()}</TD>
                          <TD className="text-right">{r.workers || '—'}</TD>
                          <TD className="text-right text-slate-100">{usd(r.cost)}</TD>
                          <TD>
                            <HBar value={r.cost} max={laborMaxCost} color={AMBER} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </>
          )}

          {tab === 'fringe' && (
            <>
              <CardHeader>
                <h2 className="text-base font-semibold text-white">Fringe Cash vs Plan</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Cash {usd(fringeTotalCash)} · Plan {usd(fringeTotalPlan)}
                </p>
              </CardHeader>
              <CardBody>
                {fringeRows.length === 0 ? (
                  <EmptyState title="No fringe data" description="Add payroll lines with fringe amounts." />
                ) : (
                  <div className="space-y-4">
                    {fringeGrand > 0 && (
                      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full"
                          style={{ width: `${(fringeTotalCash / fringeGrand) * 100}%`, backgroundColor: SKY }}
                          title={`Cash ${usd(fringeTotalCash)}`}
                        />
                        <div
                          className="h-full"
                          style={{ width: `${(fringeTotalPlan / fringeGrand) * 100}%`, backgroundColor: EMERALD }}
                          title={`Plan ${usd(fringeTotalPlan)}`}
                        />
                      </div>
                    )}
                    <div className="flex gap-4 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SKY }} /> Cash in lieu
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EMERALD }} /> Bona-fide plan
                      </span>
                    </div>
                    <Table>
                      <THead>
                        <TR>
                          <TH>Group</TH>
                          <TH className="text-right">Cash</TH>
                          <TH className="text-right">Plan</TH>
                          <TH className="text-right">Total</TH>
                          <TH className="w-1/4">Split</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {fringeRows.map((r, i) => {
                          const total = r.cash + r.plan
                          return (
                            <TR key={i}>
                              <TD className="font-medium text-slate-200">{r.label}</TD>
                              <TD className="text-right text-sky-300">{usdPrecise(r.cash)}</TD>
                              <TD className="text-right text-emerald-300">{usdPrecise(r.plan)}</TD>
                              <TD className="text-right text-slate-100">{usdPrecise(total)}</TD>
                              <TD>
                                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                                  {total > 0 && (
                                    <>
                                      <div
                                        className="h-full"
                                        style={{ width: `${(r.cash / total) * 100}%`, backgroundColor: SKY }}
                                      />
                                      <div
                                        className="h-full"
                                        style={{ width: `${(r.plan / total) * 100}%`, backgroundColor: EMERALD }}
                                      />
                                    </>
                                  )}
                                </div>
                              </TD>
                            </TR>
                          )
                        })}
                      </TBody>
                    </Table>
                  </div>
                )}
              </CardBody>
            </>
          )}

          {tab === 'apprentice' && (
            <>
              <CardHeader>
                <h2 className="text-base font-semibold text-white">Apprentice Utilization</h2>
                <p className="mt-0.5 text-xs text-slate-500">Apprentice-to-journeyworker hour ratios.</p>
              </CardHeader>
              <CardBody>
                {apprenticeRows.length === 0 ? (
                  <EmptyState title="No apprentice data" description="No apprentice hours recorded yet." />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Classification</TH>
                        <TH className="text-right">Apprentice hrs</TH>
                        <TH className="text-right">Journeyworker hrs</TH>
                        <TH className="text-right">Ratio</TH>
                        <TH className="text-right">Required</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {apprenticeRows.map((r, i) => {
                        const meets = r.required <= 0 || r.ratio <= r.required + 1e-9
                        return (
                          <TR key={i}>
                            <TD className="font-medium text-slate-200">{r.label}</TD>
                            <TD className="text-right text-amber-300">{r.appr.toLocaleString()}</TD>
                            <TD className="text-right">{r.journey.toLocaleString()}</TD>
                            <TD className="text-right">{r.ratio ? r.ratio.toFixed(2) : '—'}</TD>
                            <TD className="text-right">{r.required ? r.required.toFixed(2) : '—'}</TD>
                            <TD>
                              {r.required > 0 ? (
                                <Badge tone={meets ? 'green' : 'red'}>{meets ? 'Within ratio' : 'Over ratio'}</Badge>
                              ) : (
                                <Badge tone="slate">No target</Badge>
                              )}
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </>
          )}

          {tab === 'restitution' && (
            <>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-white">Restitution Exposure</h2>
                <span className="text-sm text-slate-400">
                  Total {usd(restitutionTotal)} · Outstanding{' '}
                  <span className="text-red-300">{usd(restitutionOutstanding)}</span>
                </span>
              </CardHeader>
              <CardBody>
                {restitutionRows.length === 0 ? (
                  <EmptyState title="No exposure" description="No back-wage shortfalls outstanding." />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Worker / Group</TH>
                        <TH className="text-right">Base</TH>
                        <TH className="text-right">Fringe</TH>
                        <TH className="text-right">OT</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="w-1/4">Exposure</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {restitutionRows.map((r, i) => (
                        <TR key={i}>
                          <TD className="font-medium text-slate-200">{r.label}</TD>
                          <TD className="text-right">{usdPrecise(r.base)}</TD>
                          <TD className="text-right">{usdPrecise(r.fringeShort)}</TD>
                          <TD className="text-right">{usdPrecise(r.ot)}</TD>
                          <TD className="text-right text-slate-100">{usdPrecise(r.total)}</TD>
                          <TD>
                            <HBar value={r.total} max={restitutionMax} color={r.paid ? EMERALD : '#f87171'} />
                          </TD>
                          <TD>
                            <Badge tone={r.paid ? 'green' : 'red'}>{r.paid ? 'Paid' : 'Owed'}</Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

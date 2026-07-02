'use client'

import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

type Project = { id: string; name: string }
type ImportJob = {
  id: string
  project_id: string | null
  import_type: string
  status: string
  total_rows: number | null
  inserted_rows: number | null
  errors: unknown
  created_at: string
}

type ImportType = 'payroll' | 'determination'

const PAYROLL_COLUMNS = [
  'worker_name',
  'employee_id',
  'work_date',
  'week_ending',
  'classification_name',
  'straight_hours',
  'overtime_hours',
  'doubletime_hours',
  'base_rate_paid',
  'fringe_cash_paid',
  'fringe_plan_paid',
  'gross_paid',
  'is_apprentice',
]

const DETERMINATION_COLUMNS = [
  'wd_number',
  'modification_number',
  'classification_name',
  'base_rate',
  'fringe_rate',
  'locality',
  'county',
  'state',
]

const SAMPLE_PAYROLL = `worker_name,employee_id,work_date,week_ending,classification_name,straight_hours,overtime_hours,base_rate_paid,fringe_cash_paid,fringe_plan_paid,gross_paid,is_apprentice
John Carpenter,E-1001,2026-06-01,2026-06-06,Carpenter,8,0,38.50,0,12.40,308.00,false
John Carpenter,E-1001,2026-06-02,2026-06-06,Carpenter,8,2,38.50,0,12.40,385.00,false
Maria Mason,E-1002,2026-06-01,2026-06-06,Bricklayer,8,0,41.20,4.00,8.00,329.60,false
Alex Helper,E-1003,2026-06-01,2026-06-06,Laborer,8,0,24.10,0,5.50,192.80,true`

const SAMPLE_DETERMINATION = `wd_number,modification_number,classification_name,base_rate,fringe_rate,locality,county,state
CA20260012,3,Carpenter,42.10,18.60,Bay Area,Alameda,CA
CA20260012,3,Bricklayer,44.00,16.20,Bay Area,Alameda,CA
CA20260012,3,Laborer,28.75,12.10,Bay Area,Alameda,CA`

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; errors: string[] } {
  const errors: string[] = []
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [], errors: ['File is empty.'] }
  const splitLine = (line: string) => line.split(',').map((c) => c.trim())
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    if (cells.length !== headers.length) {
      errors.push(`Row ${i + 1}: expected ${headers.length} columns, got ${cells.length}.`)
      continue
    }
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = cells[idx]
    })
    rows.push(row)
  }
  return { headers, rows, errors }
}

function statusTone(status: string): 'green' | 'amber' | 'red' | 'slate' {
  const s = (status || '').toLowerCase()
  if (s === 'completed' || s === 'success' || s === 'done') return 'green'
  if (s === 'failed' || s === 'error') return 'red'
  if (s === 'partial' || s === 'pending' || s === 'running') return 'amber'
  return 'slate'
}

function errorCount(errors: unknown): number {
  if (Array.isArray(errors)) return errors.length
  if (errors && typeof errors === 'object') return Object.keys(errors as object).length
  return 0
}

export default function ImportsPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [importType, setImportType] = useState<ImportType>('payroll')
  const [projectId, setProjectId] = useState<string>('')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]))
    return (id: string | null) => (id ? map.get(id) ?? id : '—')
  }, [projects])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [j, p] = await Promise.all([api.getImportJobs(), api.getProjects()])
      setJobs(Array.isArray(j) ? j : [])
      setProjects(Array.isArray(p) ? p : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load import jobs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const parsed = useMemo(() => (csvText.trim() ? parseCsv(csvText) : null), [csvText])
  const expectedColumns = importType === 'payroll' ? PAYROLL_COLUMNS : DETERMINATION_COLUMNS
  const missingColumns = useMemo(() => {
    if (!parsed) return []
    const required = importType === 'payroll'
      ? ['worker_name', 'work_date', 'week_ending', 'classification_name']
      : ['wd_number', 'classification_name', 'base_rate']
    return required.filter((c) => !parsed.headers.includes(c))
  }, [parsed, importType])

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setCsvText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  function loadSample() {
    setCsvText(importType === 'payroll' ? SAMPLE_PAYROLL : SAMPLE_DETERMINATION)
    setFileName(`sample-${importType}.csv`)
  }

  async function submitImport(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    if (!parsed || parsed.rows.length === 0) {
      setError('No valid rows to import.')
      return
    }
    if (missingColumns.length > 0) {
      setError(`Missing required columns: ${missingColumns.join(', ')}`)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const body = { project_id: projectId || null, rows: parsed.rows }
      const job = importType === 'payroll' ? await api.importPayroll(body) : await api.importDetermination(body)
      const inserted = job?.inserted_rows ?? parsed.rows.length
      setNotice(`Imported ${inserted} ${importType} row(s).`)
      setCsvText('')
      setFileName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function runSeed() {
    setNotice(null)
    setError(null)
    setSeeding(true)
    try {
      const res = await api.seedSample()
      const summary = res?.summary
      const bits: string[] = []
      if (res?.company?.legal_name) bits.push(`company ${res.company.legal_name}`)
      if (res?.project?.name) bits.push(`project ${res.project.name}`)
      if (summary && typeof summary === 'object') {
        for (const [k, v] of Object.entries(summary)) bits.push(`${v} ${k}`)
      }
      setNotice(`Sample data provisioned${bits.length ? `: ${bits.join(', ')}` : '.'}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seeding failed.')
    } finally {
      setSeeding(false)
    }
  }

  const totalImported = jobs.reduce((s, j) => s + (j.inserted_rows ?? 0), 0)
  const failedJobs = jobs.filter((j) => statusTone(j.status) === 'red').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Imports</h1>
          <p className="mt-1 text-sm text-stone-500">
            Import payroll and wage-determination CSV data, or provision a demo dataset with intentional violations.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Import Jobs" value={jobs.length} />
        <Stat label="Rows Imported" value={totalImported.toLocaleString()} tone="green" />
        <Stat label="Failed Jobs" value={failedJobs} tone={failedJobs > 0 ? 'red' : 'default'} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Seed Sample Data</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Provisions a demo company, project, wage determination, worker roster, and payroll ledger seeded with
              intentional compliance violations.
            </p>
          </div>
          <Button onClick={runSeed} disabled={seeding}>
            {seeding ? <Spinner label="Seeding..." /> : 'Seed sample dataset'}
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">CSV Import</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={submitImport} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                  Import type
                </label>
                <div className="inline-flex rounded-lg border border-stone-700 bg-stone-800 p-1">
                  {(['payroll', 'determination'] as ImportType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setImportType(t)
                        setCsvText('')
                        setFileName('')
                      }}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                        importType === t ? 'bg-cyan-500 text-stone-950' : 'text-stone-300 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                  Project {importType === 'determination' && <span className="text-stone-600">(optional)</span>}
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">— No project —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-stone-800 bg-stone-950/40 px-4 py-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Expected columns</div>
              <div className="flex flex-wrap gap-1.5">
                {expectedColumns.map((c) => (
                  <code
                    key={c}
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      parsed && parsed.headers.includes(c)
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {c}
                  </code>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-700">
                Choose CSV file
                <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
              </label>
              {fileName && <span className="text-sm text-stone-400">{fileName}</span>}
              <Button type="button" variant="ghost" onClick={loadSample}>
                Use sample {importType} CSV
              </Button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                CSV content
              </label>
              <textarea
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value)
                  setFileName('')
                }}
                rows={8}
                placeholder={`Paste ${importType} CSV here or choose a file...`}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 font-mono text-xs text-stone-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {parsed && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="blue">{parsed.rows.length} valid row(s)</Badge>
                  {parsed.errors.length > 0 && <Badge tone="red">{parsed.errors.length} parse error(s)</Badge>}
                  {missingColumns.length > 0 && (
                    <Badge tone="amber">missing: {missingColumns.join(', ')}</Badge>
                  )}
                </div>
                {parsed.rows.length > 0 && (
                  <div className="rounded-lg border border-stone-800">
                    <Table>
                      <THead>
                        <TR>
                          {parsed.headers.map((h) => (
                            <TH key={h}>{h}</TH>
                          ))}
                        </TR>
                      </THead>
                      <TBody>
                        {parsed.rows.slice(0, 5).map((r, i) => (
                          <TR key={i}>
                            {parsed.headers.map((h) => (
                              <TD key={h}>{r[h]}</TD>
                            ))}
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                    {parsed.rows.length > 5 && (
                      <div className="px-4 py-2 text-xs text-stone-500">
                        Showing first 5 of {parsed.rows.length} rows.
                      </div>
                    )}
                  </div>
                )}
                {parsed.errors.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-red-300">
                    {parsed.errors.slice(0, 8).map((er, i) => (
                      <li key={i}>{er}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={submitting || !parsed || parsed.rows.length === 0 || missingColumns.length > 0}
              >
                {submitting ? <Spinner label="Importing..." /> : `Import ${importType}`}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Import History</h2>
        </CardHeader>
        <CardBody>
          {loading ? (
            <FullPageSpinner label="Loading import jobs..." />
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No imports yet"
              description="Run an import or seed sample data to populate this log."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Type</TH>
                  <TH>Project</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Rows</TH>
                  <TH className="text-right">Inserted</TH>
                  <TH className="text-right">Errors</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {jobs.map((j) => (
                  <TR key={j.id}>
                    <TD className="capitalize text-stone-200">{j.import_type}</TD>
                    <TD>{projectName(j.project_id)}</TD>
                    <TD>
                      <Badge tone={statusTone(j.status)}>{j.status || 'unknown'}</Badge>
                    </TD>
                    <TD className="text-right">{j.total_rows ?? '—'}</TD>
                    <TD className="text-right text-emerald-300">{j.inserted_rows ?? '—'}</TD>
                    <TD className="text-right">
                      {errorCount(j.errors) > 0 ? (
                        <span className="text-red-300">{errorCount(j.errors)}</span>
                      ) : (
                        '0'
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-stone-500">
                      {j.created_at ? new Date(j.created_at).toLocaleString() : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

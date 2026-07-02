'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Wh347Line {
  worker_name?: string
  full_name?: string
  classification_name?: string
  classification?: string
  work_classification?: string
  straight_hours?: number
  overtime_hours?: number
  doubletime_hours?: number
  base_rate_paid?: number
  fringe_cash_paid?: number
  fringe_plan_paid?: number
  gross_paid?: number
  [k: string]: unknown
}

interface Wh347 {
  id: string
  project_id: string
  week_ending?: string
  payroll_number?: number
  is_final?: boolean
  status?: string
  fringe_method?: string
  lines?: Wh347Line[]
  totals?: Record<string, number> | null
  created_at?: string
  updated_at?: string
}

interface Signature {
  id?: string
  wh347_id?: string
  signer_name?: string
  signer_title?: string
  attestation_text?: string
  fringe_method?: string
  signed_ip?: string
  signed_at?: string
  created_at?: string
}

const ATTESTATION =
  'I do hereby state that I pay or supervise the payment of the persons employed on this contract; that during the payroll period all persons employed on said project have been paid the full weekly wages earned, that no rebates have been or will be made either directly or indirectly, and that the wages paid are not less than the applicable wage rates contained in the wage determination incorporated into the contract.'

function dollars(n?: number) {
  if (n == null || Number.isNaN(n)) return '$0.00'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function num(n?: number) {
  if (n == null || Number.isNaN(n)) return '0'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function statusTone(s?: string): 'amber' | 'green' | 'red' | 'slate' | 'neutral' {
  switch ((s || '').toLowerCase()) {
    case 'signed':
      return 'green'
    case 'reopened':
      return 'amber'
    case 'draft':
      return 'slate'
    default:
      return 'neutral'
  }
}

function workerName(l: Wh347Line) {
  return l.worker_name || l.full_name || '—'
}
function classOf(l: Wh347Line) {
  return l.classification_name || l.classification || l.work_classification || '—'
}

export default function Wh347DetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [doc, setDoc] = useState<Wh347 | null>(null)
  const [signature, setSignature] = useState<Signature | null>(null)

  const [signOpen, setSignOpen] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [signFringe, setSignFringe] = useState('cash')
  const [agree, setAgree] = useState(false)
  const [signBusy, setSignBusy] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)

  const [actionBusy, setActionBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const d = await api.getWh347(id)
      setDoc(d)
      setSignFringe(d?.fringe_method || 'cash')
      try {
        const sig = await api.getSignature(id)
        setSignature(sig || null)
      } catch {
        setSignature(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load WH-347')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const lines = useMemo<Wh347Line[]>(() => (Array.isArray(doc?.lines) ? (doc!.lines as Wh347Line[]) : []), [doc])

  const totals = useMemo(() => {
    let straight = 0
    let ot = 0
    let dt = 0
    let gross = 0
    let fringeCash = 0
    let fringePlan = 0
    for (const l of lines) {
      straight += Number(l.straight_hours || 0)
      ot += Number(l.overtime_hours || 0)
      dt += Number(l.doubletime_hours || 0)
      gross += Number(l.gross_paid || 0)
      fringeCash += Number(l.fringe_cash_paid || 0)
      fringePlan += Number(l.fringe_plan_paid || 0)
    }
    const t = doc?.totals || {}
    return {
      straight,
      ot,
      dt,
      fringeCash,
      fringePlan,
      gross: (t as Record<string, number>).gross_paid ?? (t as Record<string, number>).gross ?? gross,
      workers: lines.length,
    }
  }, [lines, doc])

  const status = (doc?.status || 'draft').toLowerCase()
  const isSigned = status === 'signed'

  async function submitSign() {
    if (!signerName.trim() || !signerTitle.trim()) {
      setSignError('Signer name and title are required.')
      return
    }
    if (!agree) {
      setSignError('You must affirm the Statement of Compliance.')
      return
    }
    setSignBusy(true)
    setSignError(null)
    try {
      await api.signCompliance({
        wh347_id: id,
        signer_name: signerName.trim(),
        signer_title: signerTitle.trim(),
        fringe_method: signFringe,
        attestation_text: ATTESTATION,
      })
      setSignOpen(false)
      setAgree(false)
      await load()
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'Failed to sign. Resolve open hard findings first.')
    } finally {
      setSignBusy(false)
    }
  }

  async function handleReopen() {
    if (!id) return
    if (!confirm('Reopen this signed WH-347? The compliance signature will be invalidated.')) return
    setActionBusy(true)
    try {
      await api.reopenWh347(id)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reopen')
    } finally {
      setActionBusy(false)
    }
  }

  if (loading) return <FullPageSpinner label="Loading WH-347…" />

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/wh347" className="text-sm text-cyan-400 hover:text-cyan-300">
          ← Back to WH-347
        </Link>
        <EmptyState
          title="Could not load this WH-347"
          description={error || 'The form was not found.'}
          action={
            <Button variant="secondary" onClick={load}>
              Retry
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/dashboard/wh347" className="text-sm text-cyan-400 hover:text-cyan-300">
            ← Back to WH-347
          </Link>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-bold text-white">
            WH-347 · Payroll #{doc.payroll_number ?? '—'}
            <Badge tone={statusTone(doc.status)} className="capitalize">
              {doc.status || 'draft'}
            </Badge>
            {doc.is_final && <Badge tone="amber">Final</Badge>}
          </h1>
          <p className="mt-1 text-sm text-stone-400">
            Week ending {doc.week_ending || '—'} · Fringe method{' '}
            <span className="uppercase">{doc.fringe_method || 'cash'}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {!isSigned ? (
            <Button
              onClick={() => {
                setSignError(null)
                setSignOpen(true)
              }}
            >
              Sign Statement of Compliance
            </Button>
          ) : (
            <Button variant="secondary" disabled={actionBusy} onClick={handleReopen}>
              {actionBusy ? 'Reopening…' : 'Reopen'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Workers" value={totals.workers} />
        <Stat label="Straight Hrs" value={num(totals.straight)} />
        <Stat label="OT Hrs" value={num(totals.ot)} tone={totals.ot > 0 ? 'amber' : 'default'} />
        <Stat label="Fringe (Cash/Plan)" value={`${dollars(totals.fringeCash)} / ${dollars(totals.fringePlan)}`} />
        <Stat label="Gross Paid" value={dollars(totals.gross)} tone="green" />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Payroll Lines</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Per-worker classification detail as rendered onto the certified payroll form.
          </p>
        </CardHeader>
        <CardBody className="p-0">
          {lines.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No payroll lines"
                description="This WH-347 was generated with no ledger lines for the week."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Worker</TH>
                  <TH>Classification</TH>
                  <TH className="text-right">ST</TH>
                  <TH className="text-right">OT</TH>
                  <TH className="text-right">DT</TH>
                  <TH className="text-right">Base Rate</TH>
                  <TH className="text-right">Fringe Cash</TH>
                  <TH className="text-right">Fringe Plan</TH>
                  <TH className="text-right">Gross</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l, i) => (
                  <TR key={i}>
                    <TD className="font-medium text-stone-200">{workerName(l)}</TD>
                    <TD>{classOf(l)}</TD>
                    <TD className="text-right tabular-nums">{num(l.straight_hours)}</TD>
                    <TD className="text-right tabular-nums">{num(l.overtime_hours)}</TD>
                    <TD className="text-right tabular-nums">{num(l.doubletime_hours)}</TD>
                    <TD className="text-right tabular-nums">{dollars(l.base_rate_paid)}</TD>
                    <TD className="text-right tabular-nums">{dollars(l.fringe_cash_paid)}</TD>
                    <TD className="text-right tabular-nums">{dollars(l.fringe_plan_paid)}</TD>
                    <TD className="text-right tabular-nums text-stone-100">{dollars(l.gross_paid)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Statement of Compliance</h2>
        </CardHeader>
        <CardBody>
          {isSigned && signature ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  Signed and locked
                </div>
                <p className="mt-3 text-sm leading-relaxed text-stone-300">
                  {signature.attestation_text || ATTESTATION}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-stone-500">Signer</div>
                  <div className="mt-1 text-sm text-stone-200">{signature.signer_name || '—'}</div>
                  <div className="text-xs text-stone-500">{signature.signer_title || ''}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-stone-500">Signed</div>
                  <div className="mt-1 text-sm text-stone-200">
                    {signature.signed_at ? new Date(signature.signed_at).toLocaleString() : '—'}
                  </div>
                  <div className="text-xs text-stone-500">
                    Fringe method <span className="uppercase">{signature.fringe_method || doc.fringe_method}</span>
                    {signature.signed_ip ? ` · ${signature.signed_ip}` : ''}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-stone-400">{ATTESTATION}</p>
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-200">
                This form is a draft. Signing locks the WH-347. Signing is blocked while the project week has open hard
                (must-fix) findings.
              </div>
              <Button
                onClick={() => {
                  setSignError(null)
                  setSignOpen(true)
                }}
              >
                Sign Statement of Compliance
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={signOpen}
        onClose={() => !signBusy && setSignOpen(false)}
        title="Sign Statement of Compliance"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSignOpen(false)} disabled={signBusy}>
              Cancel
            </Button>
            <Button onClick={submitSign} disabled={signBusy}>
              {signBusy ? 'Signing…' : 'Sign & Lock'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Signer Name
              </label>
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Jane Contractor"
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Signer Title
              </label>
              <input
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                placeholder="Payroll Officer"
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
              Fringe Method
            </label>
            <select
              value={signFringe}
              onChange={(e) => setSignFringe(e.target.value)}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="cash">4(a) — Paid in cash</option>
              <option value="plan">4(b) — Paid to approved plans/funds</option>
            </select>
          </div>
          <p className="rounded-lg border border-stone-800 bg-stone-950 p-3 text-xs leading-relaxed text-stone-400">
            {ATTESTATION}
          </p>
          <label className="flex items-start gap-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-stone-700 bg-stone-950 text-cyan-500 focus:ring-cyan-500"
            />
            I affirm the Statement of Compliance above and understand this locks the WH-347.
          </label>
          {signError && <p className="text-sm text-red-400">{signError}</p>}
        </div>
      </Modal>
    </div>
  )
}

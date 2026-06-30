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

interface Company {
  id: string
  legal_name: string
  fein: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  signatory_name: string | null
  signatory_title: string | null
  ot_rule_set: string | null
  rate_tolerance_cents: number | null
  created_at?: string
  updated_at?: string
}

interface Plan {
  id: string
  name: string
  price_cents: number
}

interface Subscription {
  id: string
  user_id: string
  plan_id: string
  status: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

interface BillingPlan {
  subscription: Subscription | null
  plan: Plan | null
  stripeEnabled: boolean
}

type CompanyForm = {
  legal_name: string
  fein: string
  address: string
  city: string
  state: string
  zip: string
  signatory_name: string
  signatory_title: string
  ot_rule_set: string
  rate_tolerance_cents: string
}

const EMPTY_FORM: CompanyForm = {
  legal_name: '',
  fein: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  signatory_name: '',
  signatory_title: '',
  ot_rule_set: 'federal_40',
  rate_tolerance_cents: '1',
}

const OT_RULE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'federal_40', label: 'Federal (40 hr/week)', hint: 'OT after 40 hours in a workweek (FLSA / Davis-Bacon).' },
  { value: 'ca_8_40', label: 'California (8 hr/day, 40 hr/week)', hint: 'OT after 8 hr/day or 40 hr/week; 2x after 12 hr/day.' },
  { value: 'daily_8', label: 'Daily 8 (8 hr/day)', hint: 'OT after 8 hours in any single workday.' },
  { value: 'state_prevailing', label: 'State Prevailing Wage', hint: 'OT per applicable state prevailing-wage statute.' },
]

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40'
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500'

function otRuleLabel(value: string | null): string {
  if (!value) return '—'
  return OT_RULE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

function formatMoney(cents: number | null | undefined): string {
  const c = cents ?? 0
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function SettingsPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [billing, setBilling] = useState<BillingPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [billingBusy, setBillingBusy] = useState<'checkout' | 'portal' | null>(null)
  const [billingError, setBillingError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [c, b] = await Promise.all([api.getCompanies(), api.getBillingPlan()])
      setCompanies(Array.isArray(c) ? c : [])
      setBilling(b ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(
      (c) =>
        c.legal_name.toLowerCase().includes(q) ||
        (c.fein || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.state || '').toLowerCase().includes(q),
    )
  }, [companies, search])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(c: Company) {
    setEditing(c)
    setForm({
      legal_name: c.legal_name || '',
      fein: c.fein || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || '',
      zip: c.zip || '',
      signatory_name: c.signatory_name || '',
      signatory_title: c.signatory_title || '',
      ot_rule_set: c.ot_rule_set || 'federal_40',
      rate_tolerance_cents: c.rate_tolerance_cents != null ? String(c.rate_tolerance_cents) : '0',
    })
    setFormError(null)
    setModalOpen(true)
  }

  function patchForm(patch: Partial<CompanyForm>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.legal_name.trim()) {
      setFormError('Legal name is required.')
      return
    }
    const tol = parseInt(form.rate_tolerance_cents, 10)
    if (Number.isNaN(tol) || tol < 0) {
      setFormError('Rate tolerance must be a non-negative whole number of cents.')
      return
    }
    setSaving(true)
    setFormError(null)
    const body = {
      legal_name: form.legal_name.trim(),
      fein: form.fein.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim().toUpperCase() || null,
      zip: form.zip.trim() || null,
      signatory_name: form.signatory_name.trim() || null,
      signatory_title: form.signatory_title.trim() || null,
      ot_rule_set: form.ot_rule_set,
      rate_tolerance_cents: tol,
    }
    try {
      if (editing) {
        await api.updateCompany(editing.id, body)
      } else {
        await api.createCompany(body)
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function onCheckout() {
    setBillingBusy('checkout')
    setBillingError(null)
    try {
      const res = await api.createCheckout()
      if (res?.url) {
        window.location.href = res.url
      } else {
        setBillingError('Checkout session did not return a URL.')
      }
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : 'Could not start checkout. Stripe may not be configured.')
    } finally {
      setBillingBusy(null)
    }
  }

  async function onPortal() {
    setBillingBusy('portal')
    setBillingError(null)
    try {
      const res = await api.createPortal()
      if (res?.url) {
        window.location.href = res.url
      } else {
        setBillingError('Billing portal did not return a URL.')
      }
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : 'Could not open billing portal. Stripe may not be configured.')
    } finally {
      setBillingBusy(null)
    }
  }

  if (loading) return <FullPageSpinner label="Loading settings..." />

  const sub = billing?.subscription
  const plan = billing?.plan
  const stripeEnabled = billing?.stripeEnabled ?? false
  const isPro = (plan?.id || sub?.plan_id) === 'pro'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Company profiles, overtime rule sets, rate-comparison tolerance, and billing.
          </p>
        </div>
        <Button onClick={openCreate}>+ Add Company</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button className="ml-3 underline" onClick={() => load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Companies" value={companies.length} hint="signatory entities" />
        <Stat
          label="Current Plan"
          value={plan?.name ?? (sub?.plan_id ?? 'Free')}
          tone={isPro ? 'amber' : 'default'}
          hint={plan ? formatMoney(plan.price_cents) + '/mo' : 'no active subscription'}
        />
        <Stat
          label="Subscription"
          value={sub?.status ? sub.status : 'none'}
          tone={sub?.status === 'active' ? 'green' : 'default'}
          hint={sub?.current_period_end ? `renews ${new Date(sub.current_period_end).toLocaleDateString()}` : '—'}
        />
        <Stat
          label="Billing"
          value={stripeEnabled ? 'Stripe On' : 'Manual'}
          tone={stripeEnabled ? 'green' : 'default'}
          hint={stripeEnabled ? 'self-serve checkout' : 'Stripe not configured'}
        />
      </div>

      {/* Billing */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Billing & Subscription</h2>
          <p className="mt-1 text-sm text-slate-400">Manage your plan. All compliance features are available; upgrade for higher limits.</p>
        </CardHeader>
        <CardBody className="space-y-4">
          {billingError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {billingError}
            </div>
          )}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="text-lg font-semibold text-white">{plan?.name ?? 'Free'}</div>
              {isPro ? <Badge tone="amber">Pro</Badge> : <Badge tone="slate">Free</Badge>}
              {sub?.status && <Badge tone={sub.status === 'active' ? 'green' : 'neutral'}>{sub.status}</Badge>}
              {plan && <span className="text-sm text-slate-400">{formatMoney(plan.price_cents)}/mo</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {!stripeEnabled ? (
                <Badge tone="neutral">Stripe not configured — billing managed manually</Badge>
              ) : isPro || sub?.stripe_customer_id ? (
                <Button variant="secondary" onClick={onPortal} disabled={billingBusy !== null}>
                  {billingBusy === 'portal' ? 'Opening…' : 'Manage Billing'}
                </Button>
              ) : (
                <Button onClick={onCheckout} disabled={billingBusy !== null}>
                  {billingBusy === 'checkout' ? 'Starting…' : 'Upgrade to Pro'}
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Companies */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Company Profiles</h2>
            <p className="mt-1 text-sm text-slate-400">Signatory details, OT rules, and rate tolerance applied during proof runs.</p>
          </div>
          <input
            className={`${inputCls} sm:max-w-xs`}
            placeholder="Search name, FEIN, city, state..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={companies.length === 0 ? 'No companies yet' : 'No companies match your search'}
                description={
                  companies.length === 0
                    ? 'Add your contracting entity to set its signatory, overtime rule set, and rate-comparison tolerance.'
                    : 'Adjust your search to see more profiles.'
                }
                action={companies.length === 0 ? <Button onClick={openCreate}>+ Add Company</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Legal Name</TH>
                  <TH>FEIN</TH>
                  <TH>Location</TH>
                  <TH>Signatory</TH>
                  <TH>OT Rule</TH>
                  <TH className="text-right">Tolerance</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium text-slate-100">{c.legal_name}</TD>
                    <TD>{c.fein || <span className="text-slate-600">—</span>}</TD>
                    <TD>
                      {c.city || c.state ? (
                        <span className="text-slate-300">
                          {[c.city, c.state].filter(Boolean).join(', ')}
                          {c.zip ? ` ${c.zip}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TD>
                    <TD>
                      {c.signatory_name ? (
                        <span className="text-slate-300">
                          {c.signatory_name}
                          {c.signatory_title && <span className="block text-xs text-slate-500">{c.signatory_title}</span>}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone="blue">{otRuleLabel(c.ot_rule_set)}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums text-slate-300">
                      {formatMoney(c.rate_tolerance_cents)}/hr
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" className="px-2 py-1" onClick={() => openEdit(c)}>
                          Edit
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
        title={editing ? 'Edit Company' : 'Add Company'}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="company-form" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Company'}
            </Button>
          </>
        }
      >
        <form id="company-form" onSubmit={onSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Legal Name *</label>
              <input
                className={inputCls}
                value={form.legal_name}
                onChange={(e) => patchForm({ legal_name: e.target.value })}
                placeholder="Acme Construction LLC"
                required
              />
            </div>
            <div>
              <label className={labelCls}>FEIN</label>
              <input
                className={inputCls}
                value={form.fein}
                onChange={(e) => patchForm({ fein: e.target.value })}
                placeholder="12-3456789"
              />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input className={inputCls} value={form.address} onChange={(e) => patchForm({ address: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input className={inputCls} value={form.city} onChange={(e) => patchForm({ city: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>State</label>
                <input
                  className={inputCls}
                  value={form.state}
                  maxLength={2}
                  onChange={(e) => patchForm({ state: e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2) })}
                  placeholder="CA"
                />
              </div>
              <div>
                <label className={labelCls}>ZIP</label>
                <input
                  className={inputCls}
                  value={form.zip}
                  onChange={(e) => patchForm({ zip: e.target.value })}
                  placeholder="90210"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Statement of Compliance Signatory</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Signatory Name</label>
                <input
                  className={inputCls}
                  value={form.signatory_name}
                  onChange={(e) => patchForm({ signatory_name: e.target.value })}
                  placeholder="Jordan Rivera"
                />
              </div>
              <div>
                <label className={labelCls}>Signatory Title</label>
                <input
                  className={inputCls}
                  value={form.signatory_title}
                  onChange={(e) => patchForm({ signatory_title: e.target.value })}
                  placeholder="Payroll Officer"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Compliance Rules</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Overtime Rule Set</label>
                <select
                  className={inputCls}
                  value={form.ot_rule_set}
                  onChange={(e) => patchForm({ ot_rule_set: e.target.value })}
                >
                  {OT_RULE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {OT_RULE_OPTIONS.find((o) => o.value === form.ot_rule_set)?.hint}
                </p>
              </div>
              <div>
                <label className={labelCls}>Rate Tolerance (cents/hr)</label>
                <input
                  className={inputCls}
                  value={form.rate_tolerance_cents}
                  inputMode="numeric"
                  onChange={(e) => patchForm({ rate_tolerance_cents: e.target.value.replace(/\D/g, '') })}
                  placeholder="1"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Underpayments at or below this per-hour amount won&apos;t flag (rounding allowance). Currently{' '}
                  {formatMoney(parseInt(form.rate_tolerance_cents || '0', 10))}/hr.
                </p>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}

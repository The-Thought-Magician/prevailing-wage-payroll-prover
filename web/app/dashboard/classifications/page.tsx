'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'

interface Alias {
  id: string
  alias: string
}
interface Classification {
  id: string
  canonical_name: string
  craft_group: string | null
  level: string | null
  apprentice_eligible: boolean
  journeyworker_classification: string | null
  created_at: string
  aliases?: Alias[]
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none'

const LEVELS = ['Journeyworker', 'Apprentice', 'Foreman', 'General Foreman', 'Helper']

export default function ClassificationsPage() {
  const [items, setItems] = useState<Classification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [apprenticeOnly, setApprenticeOnly] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // create / edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const emptyForm = {
    canonical_name: '',
    craft_group: '',
    level: LEVELS[0],
    apprentice_eligible: false,
    journeyworker_classification: '',
  }
  const [form, setForm] = useState({ ...emptyForm })

  // alias add state (per-row)
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({})
  const [aliasBusy, setAliasBusy] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getClassifications()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load classifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const groups = useMemo(
    () => Array.from(new Set(items.map((i) => i.craft_group).filter(Boolean))) as string[],
    [items]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((c) => {
      if (groupFilter && c.craft_group !== groupFilter) return false
      if (apprenticeOnly && !c.apprentice_eligible) return false
      if (!q) return true
      const inAlias = (c.aliases ?? []).some((a) => a.alias.toLowerCase().includes(q))
      return (
        c.canonical_name.toLowerCase().includes(q) ||
        (c.craft_group ?? '').toLowerCase().includes(q) ||
        (c.level ?? '').toLowerCase().includes(q) ||
        inAlias
      )
    })
  }, [items, search, groupFilter, apprenticeOnly])

  const stats = useMemo(() => {
    const total = items.length
    const apprentice = items.filter((i) => i.apprentice_eligible).length
    const aliasCount = items.reduce((n, i) => n + (i.aliases?.length ?? 0), 0)
    return { total, apprentice, groups: groups.length, aliasCount }
  }, [items, groups])

  function openCreate() {
    setEditingId(null)
    setForm({ ...emptyForm })
    setFormError(null)
    setModalOpen(true)
  }
  function openEdit(c: Classification) {
    setEditingId(c.id)
    setForm({
      canonical_name: c.canonical_name ?? '',
      craft_group: c.craft_group ?? '',
      level: c.level ?? LEVELS[0],
      apprentice_eligible: !!c.apprentice_eligible,
      journeyworker_classification: c.journeyworker_classification ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.canonical_name.trim()) {
      setFormError('Canonical name is required.')
      return
    }
    const body = {
      canonical_name: form.canonical_name.trim(),
      craft_group: form.craft_group.trim() || null,
      level: form.level || null,
      apprentice_eligible: form.apprentice_eligible,
      journeyworker_classification: form.journeyworker_classification.trim() || null,
    }
    setSaving(true)
    try {
      if (editingId) await api.updateClassification(editingId, body)
      else await api.createClassification(body)
      setModalOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save classification')
    } finally {
      setSaving(false)
    }
  }

  async function removeClassification(c: Classification) {
    if (!confirm(`Delete classification "${c.canonical_name}" and its aliases?`)) return
    setRowError(null)
    try {
      await api.deleteClassification(c.id)
      await load()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to delete classification')
    }
  }

  async function addAlias(c: Classification) {
    const value = (aliasDraft[c.id] ?? '').trim()
    if (!value) return
    setRowError(null)
    setAliasBusy(c.id)
    try {
      await api.addClassificationAlias(c.id, { alias: value })
      setAliasDraft((p) => ({ ...p, [c.id]: '' }))
      await load()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to add alias')
    } finally {
      setAliasBusy(null)
    }
  }

  async function removeAlias(c: Classification, alias: Alias) {
    setRowError(null)
    try {
      await api.deleteClassificationAlias(c.id, alias.id)
      await load()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to delete alias')
    }
  }

  if (loading) return <FullPageSpinner label="Loading classifications..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Classification Catalog</h1>
          <p className="mt-1 text-sm text-slate-400">
            Canonical craft classifications and the payroll aliases that map onto them.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Classification</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}{' '}
          <button onClick={load} className="ml-2 underline hover:text-red-200">
            Retry
          </button>
        </div>
      )}
      {rowError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {rowError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Classifications" value={stats.total} />
        <Stat label="Apprentice-eligible" value={stats.apprentice} tone="amber" />
        <Stat label="Craft groups" value={stats.groups} />
        <Stat label="Mapped aliases" value={stats.aliasCount} tone="green" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, alias, group, level..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none sm:max-w-xs"
            />
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">All craft groups</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={apprenticeOnly}
              onChange={(e) => setApprenticeOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-amber-500"
            />
            Apprentice-eligible only
          </label>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={items.length === 0 ? 'No classifications yet' : 'No matches'}
                description={
                  items.length === 0
                    ? 'Build your craft catalog so payroll classification names normalize against a canonical list.'
                    : 'Adjust your search or filters to see more results.'
                }
                action={items.length === 0 ? <Button onClick={openCreate}>+ New Classification</Button> : undefined}
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {filtered.map((c) => {
                const open = !!expanded[c.id]
                const aliases = c.aliases ?? []
                return (
                  <li key={c.id} className="px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">{c.canonical_name}</span>
                          {c.craft_group && <Badge tone="slate">{c.craft_group}</Badge>}
                          {c.level && <Badge tone="neutral">{c.level}</Badge>}
                          {c.apprentice_eligible && <Badge tone="amber">Apprentice-eligible</Badge>}
                        </div>
                        {c.journeyworker_classification && (
                          <p className="mt-1 text-xs text-slate-500">
                            Journeyworker classification: {c.journeyworker_classification}
                          </p>
                        )}
                        <button
                          onClick={() => setExpanded((p) => ({ ...p, [c.id]: !open }))}
                          className="mt-2 text-xs font-medium text-amber-300 hover:text-amber-200"
                        >
                          {open ? 'Hide' : 'Manage'} aliases ({aliases.length})
                        </button>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="secondary" onClick={() => openEdit(c)}>
                          Edit
                        </Button>
                        <Button variant="ghost" onClick={() => removeClassification(c)}>
                          Delete
                        </Button>
                      </div>
                    </div>

                    {open && (
                      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                        {aliases.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            No aliases yet. Add the spellings payroll imports use so they map here.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {aliases.map((a) => (
                              <span
                                key={a.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
                              >
                                {a.alias}
                                <button
                                  onClick={() => removeAlias(c, a)}
                                  className="text-slate-500 hover:text-red-400"
                                  aria-label={`Remove alias ${a.alias}`}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            addAlias(c)
                          }}
                          className="mt-3 flex gap-2"
                        >
                          <input
                            value={aliasDraft[c.id] ?? ''}
                            onChange={(e) => setAliasDraft((p) => ({ ...p, [c.id]: e.target.value }))}
                            placeholder="Add alias (e.g. Elec., Inside Wireman)"
                            className={inputCls}
                          />
                          <Button type="submit" disabled={aliasBusy === c.id}>
                            {aliasBusy === c.id ? 'Adding...' : 'Add'}
                          </Button>
                        </form>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingId ? 'Edit Classification' : 'New Classification'}
      >
        <form onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <Field label="Canonical Name" required>
            <input
              value={form.canonical_name}
              onChange={(e) => setForm({ ...form, canonical_name: e.target.value })}
              placeholder="Electrician (Inside Wireman)"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Craft Group">
              <input
                value={form.craft_group}
                onChange={(e) => setForm({ ...form, craft_group: e.target.value })}
                placeholder="Electrical"
                className={inputCls}
              />
            </Field>
            <Field label="Level">
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                className={inputCls}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Journeyworker Classification">
            <input
              value={form.journeyworker_classification}
              onChange={(e) => setForm({ ...form, journeyworker_classification: e.target.value })}
              placeholder="Parent journeyworker classification (for apprentices)"
              className={inputCls}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.apprentice_eligible}
              onChange={(e) => setForm({ ...form, apprentice_eligible: e.target.checked })}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-amber-500"
            />
            Apprentice-eligible classification
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner label="Saving..." /> : editingId ? 'Save Changes' : 'Create Classification'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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

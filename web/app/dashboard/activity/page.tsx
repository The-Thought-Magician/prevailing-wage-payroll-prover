'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'

type Activity = {
  id: string
  user_id: string | null
  entity_type: string | null
  entity_id: string | null
  action: string | null
  detail: unknown
  created_at: string
}

function actionTone(action: string | null): 'green' | 'amber' | 'red' | 'blue' | 'slate' {
  const a = (action || '').toLowerCase()
  if (a.includes('create') || a.includes('generate') || a.includes('sign') || a.includes('seed') || a.includes('import'))
    return 'green'
  if (a.includes('delete') || a.includes('reopen') || a.includes('fail')) return 'red'
  if (a.includes('update') || a.includes('edit') || a.includes('resolve')) return 'amber'
  if (a.includes('run') || a.includes('validate') || a.includes('prove')) return 'blue'
  return 'slate'
}

function entityLabel(t: string | null): string {
  if (!t) return 'entity'
  return t.replace(/_/g, ' ')
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'Unknown'
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function detailText(detail: unknown): string | null {
  if (detail == null) return null
  if (typeof detail === 'string') return detail
  try {
    const json = JSON.stringify(detail)
    return json === '{}' || json === '[]' ? null : json
  } catch {
    return null
  }
}

export default function ActivityPage() {
  const [items, setItems] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [entityType, setEntityType] = useState<string>('')
  const [entityId, setEntityId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const query: { entity_type?: string; entity_id?: string } = {}
      if (entityType) query.entity_type = entityType
      if (entityId) query.entity_id = entityId
      const res = await api.getActivity(Object.keys(query).length ? query : undefined)
      setItems(Array.isArray(res) ? res : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entityTypes = useMemo(() => {
    const s = new Set<string>()
    items.forEach((i) => i.entity_type && s.add(i.entity_type))
    return Array.from(s).sort()
  }, [items])

  const actions = useMemo(() => {
    const s = new Set<string>()
    items.forEach((i) => i.action && s.add(i.action))
    return Array.from(s).sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (actionFilter && i.action !== actionFilter) return false
      if (!q) return true
      const hay = [i.action, i.entity_type, i.entity_id, detailText(i.detail)].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [items, search, actionFilter])

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    const groups: { day: string; rows: Activity[] }[] = []
    for (const row of sorted) {
      const key = dayKey(row.created_at)
      const last = groups[groups.length - 1]
      if (last && last.day === key) last.rows.push(row)
      else groups.push({ day: key, rows: [row] })
    }
    return groups
  }, [filtered])

  const todayCount = useMemo(() => {
    const today = new Date().toDateString()
    return items.filter((i) => new Date(i.created_at).toDateString() === today).length
  }, [items])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Activity Trail</h1>
          <p className="mt-1 text-sm text-slate-500">
            Immutable audit log of every create, update, validation, and filing action across the workspace.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total Events" value={items.length} />
        <Stat label="Today" value={todayCount} tone="amber" />
        <Stat label="Entity Types" value={entityTypes.length} />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Filters</h2>
        </CardHeader>
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Entity type (server)
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="">Any type</option>
                {entityTypes.map((t) => (
                  <option key={t} value={t}>
                    {entityLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Entity ID (server)
              </label>
              <input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="Filter by entity id"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Action
              </label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="">Any action</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Search
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search log..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={load} disabled={loading}>
              Apply server filters
            </Button>
            {(entityType || entityId || search || actionFilter) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEntityType('')
                  setEntityId('')
                  setSearch('')
                  setActionFilter('')
                  load()
                }}
              >
                Clear
              </Button>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {filtered.length} of {items.length} shown
            </span>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <FullPageSpinner label="Loading activity..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No activity"
          description={
            items.length === 0
              ? 'Actions you take in the app will appear here.'
              : 'No events match the current filters.'
          }
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.day}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.day}</div>
              <Card>
                <ol className="divide-y divide-slate-800">
                  {group.rows.map((row) => {
                    const detail = detailText(row.detail)
                    return (
                      <li key={row.id} className="flex gap-3 px-5 py-3">
                        <div className="mt-1.5">
                          <span
                            className={`block h-2 w-2 rounded-full ${
                              actionTone(row.action) === 'green'
                                ? 'bg-emerald-400'
                                : actionTone(row.action) === 'red'
                                  ? 'bg-red-400'
                                  : actionTone(row.action) === 'amber'
                                    ? 'bg-amber-400'
                                    : actionTone(row.action) === 'blue'
                                      ? 'bg-sky-400'
                                      : 'bg-slate-500'
                            }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={actionTone(row.action)}>{row.action || 'event'}</Badge>
                            <span className="text-sm font-medium capitalize text-slate-200">
                              {entityLabel(row.entity_type)}
                            </span>
                            {row.entity_id && (
                              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                                {row.entity_id}
                              </code>
                            )}
                            <span className="ml-auto whitespace-nowrap text-xs text-slate-500">
                              {relativeTime(row.created_at)}
                            </span>
                          </div>
                          {detail && (
                            <p className="mt-1 break-words font-mono text-xs text-slate-500">{detail}</p>
                          )}
                          <div className="mt-0.5 text-xs text-slate-600">
                            {row.created_at ? new Date(row.created_at).toLocaleString() : ''}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

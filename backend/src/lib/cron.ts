// ---------------------------------------------------------------------------
// cron.ts — THE ENGINE
//
// Pure, deterministic, self-contained scheduling functions used by routes.
// No external services, no DB access. Everything is computed from the inputs.
//
// "kind" describes how an expression is interpreted:
//   - 'cron'   : a standard 5/6-field cron expression (parsed via cron-parser v5)
//   - 'rate'   : a human "every N minutes|hours|days" expression (arithmetic)
//   - 'oneoff' : a single ISO instant; fires once if it is in the future
// ---------------------------------------------------------------------------

import { CronExpressionParser } from 'cron-parser'

export type ScheduleKind = 'cron' | 'rate' | 'oneoff'

export interface ScheduleJob {
  id: string
  kind: ScheduleKind
  expr: string
  timezone?: string
  resourceId?: string | null
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface CollisionWindow {
  windowStart: string
  windowEnd: string
  jobIds: string[]
  severity: 'low' | 'medium' | 'high'
  resourceId?: string
}

export interface HeatmapBucket {
  bucket: string
  count: number
}

export type DstTrapType = 'double_fire' | 'skip' | 'ambiguous'

export interface DstTrap {
  type: DstTrapType
  atLocal: string
  atUtc: string
}

export interface CoverageWindow {
  start: string
  end: string
  resourceId?: string | null
}

export interface CoverageGap {
  gapStart: string
  gapEnd: string
  durationMinutes: number
  resourceId?: string | null
}

export interface SpreadSuggestion {
  jobId: string
  suggestedExpr: string
  reason: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

const DEFAULT_TZ = 'UTC'

function safeTz(timezone?: string): string {
  return timezone && timezone.trim().length > 0 ? timezone : DEFAULT_TZ
}

// Parse a rate expression like "every 5 minutes" / "every 2 hours" / "every 1 day".
// Returns the interval in milliseconds, or null if it does not parse.
function parseRateMs(expr: string): { ms: number; n: number; unit: string } | null {
  const m = /^\s*every\s+(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\s*$/i.exec(expr)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  const unitRaw = m[2].toLowerCase()
  let ms: number
  let unit: string
  if (unitRaw.startsWith('min')) {
    ms = n * MINUTE_MS
    unit = 'minutes'
  } else if (unitRaw.startsWith('h')) {
    ms = n * HOUR_MS
    unit = 'hours'
  } else {
    ms = n * DAY_MS
    unit = 'days'
  }
  return { ms, n, unit }
}

// Round an ISO instant down to its minute boundary, returned as ISO-UTC.
function minuteBucket(iso: string): string {
  const d = new Date(iso)
  d.setUTCSeconds(0, 0)
  return d.toISOString()
}

// The UTC offset (in minutes) that `timezone` has at instant `date`.
function tzOffsetMinutes(date: Date, timezone: string): number {
  // Format the same instant once as if it were UTC and once in the target zone,
  // then take the difference. This yields the zone's offset from UTC in minutes.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  // Build a UTC timestamp from the wall-clock the zone shows.
  const asUTC = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    map.hour === '24' ? 0 : parseInt(map.hour, 10),
    parseInt(map.minute, 10),
    parseInt(map.second, 10),
  )
  return Math.round((asUTC - date.getTime()) / MINUTE_MS)
}

// ---------------------------------------------------------------------------
// validateExpression
// ---------------------------------------------------------------------------

export function validateExpression(kind: ScheduleKind, expr: string): ValidationResult {
  if (!expr || expr.trim().length === 0) {
    return { valid: false, error: 'Expression is empty' }
  }
  if (kind === 'cron') {
    try {
      CronExpressionParser.parse(expr)
      return { valid: true }
    } catch (e: unknown) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  if (kind === 'rate') {
    const rate = parseRateMs(expr)
    if (!rate) {
      return { valid: false, error: 'Rate must look like "every N minutes|hours|days"' }
    }
    return { valid: true }
  }
  if (kind === 'oneoff') {
    const t = Date.parse(expr)
    if (Number.isNaN(t)) {
      return { valid: false, error: 'One-off must be a valid ISO timestamp' }
    }
    return { valid: true }
  }
  return { valid: false, error: `Unknown kind: ${kind}` }
}

// ---------------------------------------------------------------------------
// describeExpression
// ---------------------------------------------------------------------------

export function describeExpression(kind: ScheduleKind, expr: string, timezone?: string): string {
  const tz = safeTz(timezone)
  const v = validateExpression(kind, expr)
  if (!v.valid) return `Invalid ${kind} expression: ${v.error}`

  if (kind === 'rate') {
    const rate = parseRateMs(expr)!
    return `Every ${rate.n} ${rate.n === 1 ? rate.unit.replace(/s$/, '') : rate.unit} (${tz})`
  }
  if (kind === 'oneoff') {
    return `Once at ${new Date(expr).toISOString()} (${tz})`
  }
  // cron
  const fields = expr.trim().split(/\s+/)
  const [min, hour, dom, month, dow] = fields
  const parts: string[] = []
  if (min === '*' && hour === '*') parts.push('every minute')
  else if (min !== '*' && hour === '*') parts.push(`at minute ${min} of every hour`)
  else if (hour !== '*' && min !== '*') parts.push(`at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`)
  else parts.push(`at minute ${min}, hour ${hour}`)
  if (dom !== '*') parts.push(`on day-of-month ${dom}`)
  if (month !== '*') parts.push(`in month ${month}`)
  if (dow !== '*') parts.push(`on weekday ${dow}`)
  return `${parts.join(', ')} (${tz})`
}

// ---------------------------------------------------------------------------
// nextFirings
// ---------------------------------------------------------------------------

export function nextFirings(
  kind: ScheduleKind,
  expr: string,
  timezone: string | undefined,
  fromISO: string,
  count: number,
): string[] {
  const tz = safeTz(timezone)
  const n = Math.max(0, Math.floor(count))
  if (n === 0) return []
  const from = new Date(fromISO)
  if (Number.isNaN(from.getTime())) return []

  if (kind === 'cron') {
    try {
      const interval = CronExpressionParser.parse(expr, { tz, currentDate: from })
      const out: string[] = []
      for (let i = 0; i < n; i++) {
        const next = interval.next()
        out.push(next.toDate().toISOString())
      }
      return out
    } catch {
      return []
    }
  }

  if (kind === 'rate') {
    const rate = parseRateMs(expr)
    if (!rate) return []
    const out: string[] = []
    let t = from.getTime() + rate.ms
    for (let i = 0; i < n; i++) {
      out.push(new Date(t).toISOString())
      t += rate.ms
    }
    return out
  }

  if (kind === 'oneoff') {
    const t = Date.parse(expr)
    if (Number.isNaN(t)) return []
    if (t > from.getTime()) return [new Date(t).toISOString()]
    return []
  }

  return []
}

// ---------------------------------------------------------------------------
// computeCollisions
//
// Expand every job's firings across the horizon, bucket by minute, and flag any
// minute where the concurrency is >= threshold, OR where >= 2 jobs share the
// same resourceId.
// ---------------------------------------------------------------------------

export function computeCollisions(
  jobs: ScheduleJob[],
  opts: { horizonDays: number; threshold: number },
): CollisionWindow[] {
  const horizonDays = opts.horizonDays > 0 ? opts.horizonDays : 7
  const threshold = opts.threshold > 0 ? opts.threshold : 2
  const fromISO = new Date().toISOString()
  const horizonMs = horizonDays * DAY_MS
  const fromMs = Date.parse(fromISO)

  // bucket(minuteISO) -> { jobIds, resources: Map<resourceId, jobIds[]> }
  const buckets = new Map<string, { jobIds: Set<string>; resources: Map<string, Set<string>> }>()

  for (const job of jobs) {
    // generous fan-out per job; bounded so a "every minute" cron over a long
    // horizon can't blow up unbounded.
    const firings = nextFirings(job.kind, job.expr, job.timezone, fromISO, 5000)
    for (const f of firings) {
      const t = Date.parse(f)
      if (t - fromMs > horizonMs) break
      const b = minuteBucket(f)
      let entry = buckets.get(b)
      if (!entry) {
        entry = { jobIds: new Set(), resources: new Map() }
        buckets.set(b, entry)
      }
      entry.jobIds.add(job.id)
      if (job.resourceId) {
        let rs = entry.resources.get(job.resourceId)
        if (!rs) {
          rs = new Set()
          entry.resources.set(job.resourceId, rs)
        }
        rs.add(job.id)
      }
    }
  }

  const out: CollisionWindow[] = []
  for (const [bucket, entry] of buckets) {
    const concurrency = entry.jobIds.size
    let resourceHit: string | undefined
    for (const [resId, rs] of entry.resources) {
      if (rs.size >= 2) {
        resourceHit = resId
        break
      }
    }
    if (concurrency >= threshold || resourceHit) {
      const start = new Date(bucket)
      const end = new Date(start.getTime() + MINUTE_MS)
      let severity: CollisionWindow['severity'] = 'low'
      if (concurrency >= threshold * 2) severity = 'high'
      else if (concurrency >= threshold) severity = 'medium'
      if (resourceHit && severity === 'low') severity = 'medium'
      out.push({
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        jobIds: Array.from(entry.jobIds).sort(),
        severity,
        ...(resourceHit ? { resourceId: resourceHit } : {}),
      })
    }
  }
  out.sort((a, b) => a.windowStart.localeCompare(b.windowStart))
  return out
}

// ---------------------------------------------------------------------------
// loadHeatmap
//
// Hourly histogram of firings across the horizon.
// ---------------------------------------------------------------------------

export function loadHeatmap(jobs: ScheduleJob[], opts: { horizonDays: number }): HeatmapBucket[] {
  const horizonDays = opts.horizonDays > 0 ? opts.horizonDays : 7
  const fromISO = new Date().toISOString()
  const fromMs = Date.parse(fromISO)
  const horizonMs = horizonDays * DAY_MS

  const counts = new Map<string, number>()
  for (const job of jobs) {
    const firings = nextFirings(job.kind, job.expr, job.timezone, fromISO, 5000)
    for (const f of firings) {
      const t = Date.parse(f)
      if (t - fromMs > horizonMs) break
      const d = new Date(f)
      d.setUTCMinutes(0, 0, 0)
      const key = d.toISOString()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const out: HeatmapBucket[] = Array.from(counts.entries()).map(([bucket, count]) => ({ bucket, count }))
  out.sort((a, b) => a.bucket.localeCompare(b.bucket))
  return out
}

// ---------------------------------------------------------------------------
// dstTraps
//
// Walk the window day-by-day looking for timezone offset changes. A negative
// offset jump (spring forward) creates a "skip" window where wall-clock times
// don't exist; a positive jump (fall back) creates "ambiguous"/"double_fire"
// windows where wall-clock times repeat.
// ---------------------------------------------------------------------------

export function dstTraps(
  kind: ScheduleKind,
  expr: string,
  timezone: string | undefined,
  fromISO: string,
  days: number,
): DstTrap[] {
  const tz = safeTz(timezone)
  const from = new Date(fromISO)
  if (Number.isNaN(from.getTime())) return []
  const span = days > 0 ? days : 7
  const out: DstTrap[] = []

  // Sample the offset hour-by-hour and detect transitions.
  let prev = tzOffsetMinutes(from, tz)
  const totalHours = span * 24
  for (let h = 1; h <= totalHours; h++) {
    const at = new Date(from.getTime() + h * HOUR_MS)
    const cur = tzOffsetMinutes(at, tz)
    if (cur !== prev) {
      const atUtc = at.toISOString()
      // Local wall-clock representation just before transition.
      const atLocal = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(at)
      if (cur > prev) {
        // Spring forward: clocks jump ahead → skipped local times.
        out.push({ type: 'skip', atLocal, atUtc })
      } else {
        // Fall back: clocks repeat → ambiguous + potential double fire.
        out.push({ type: 'ambiguous', atLocal, atUtc })
        out.push({ type: 'double_fire', atLocal, atUtc })
      }
      prev = cur
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// coverageGaps
//
// Given coverage windows (intended on-call / coverage intervals) and the jobs
// that should fire within them, find spans inside the horizon that have no
// scheduled firing for longer than the largest coverage window cadence.
// ---------------------------------------------------------------------------

export function coverageGaps(
  windows: CoverageWindow[],
  jobs: ScheduleJob[],
  opts: { horizonDays: number },
): CoverageGap[] {
  const horizonDays = opts.horizonDays > 0 ? opts.horizonDays : 7
  const fromISO = new Date().toISOString()
  const fromMs = Date.parse(fromISO)
  const horizonMs = horizonDays * DAY_MS
  const endMs = fromMs + horizonMs

  // Collect all firing instants in range, sorted.
  const firings: number[] = []
  for (const job of jobs) {
    for (const f of nextFirings(job.kind, job.expr, job.timezone, fromISO, 5000)) {
      const t = Date.parse(f)
      if (t > endMs) break
      firings.push(t)
    }
  }
  firings.sort((a, b) => a - b)

  const out: CoverageGap[] = []
  // For each coverage window, intersect with horizon and look for spans with no firing.
  const effectiveWindows: CoverageWindow[] =
    windows.length > 0 ? windows : [{ start: fromISO, end: new Date(endMs).toISOString(), resourceId: null }]

  for (const w of effectiveWindows) {
    const ws = Math.max(fromMs, Date.parse(w.start))
    const we = Math.min(endMs, Date.parse(w.end))
    if (Number.isNaN(ws) || Number.isNaN(we) || we <= ws) continue
    const inWindow = firings.filter((t) => t >= ws && t <= we)
    let cursor = ws
    for (const t of inWindow) {
      if (t - cursor > MINUTE_MS) {
        out.push({
          gapStart: new Date(cursor).toISOString(),
          gapEnd: new Date(t).toISOString(),
          durationMinutes: Math.round((t - cursor) / MINUTE_MS),
          resourceId: w.resourceId ?? null,
        })
      }
      cursor = Math.max(cursor, t)
    }
    if (we - cursor > MINUTE_MS) {
      out.push({
        gapStart: new Date(cursor).toISOString(),
        gapEnd: new Date(we).toISOString(),
        durationMinutes: Math.round((we - cursor) / MINUTE_MS),
        resourceId: w.resourceId ?? null,
      })
    }
  }
  out.sort((a, b) => a.gapStart.localeCompare(b.gapStart))
  return out
}

// ---------------------------------------------------------------------------
// autoSpread
//
// For jobs that collide above threshold, propose a shifted expression that
// staggers each colliding job by a deterministic per-index minute offset.
// ---------------------------------------------------------------------------

export function autoSpread(jobs: ScheduleJob[], opts: { threshold: number }): SpreadSuggestion[] {
  const threshold = opts.threshold > 0 ? opts.threshold : 2
  const collisions = computeCollisions(jobs, { horizonDays: 7, threshold })
  const suggestions: SpreadSuggestion[] = []
  const seen = new Set<string>()

  for (const col of collisions) {
    // Keep the first job on its slot; shift the rest by +1, +2, ... minutes.
    const offenders = col.jobIds.slice(1)
    for (let i = 0; i < offenders.length; i++) {
      const jobId = offenders[i]
      if (seen.has(jobId)) continue
      const job = jobs.find((j) => j.id === jobId)
      if (!job) continue
      const offset = (i + 1) % 60
      let suggestedExpr = job.expr
      let reason = `Job collides with ${col.jobIds.length} others at ${col.windowStart}`
      if (job.kind === 'cron') {
        const fields = job.expr.trim().split(/\s+/)
        if (fields.length >= 5) {
          fields[0] = String(offset)
          suggestedExpr = fields.join(' ')
          reason += `; shift minute field to ${offset} to stagger`
        }
      } else if (job.kind === 'rate') {
        reason += `; stagger start by ${offset} minute(s)`
      }
      suggestions.push({ jobId, suggestedExpr, reason })
      seen.add(jobId)
    }
  }
  return suggestions
}

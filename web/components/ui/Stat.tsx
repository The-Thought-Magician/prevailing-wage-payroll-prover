import type { ReactNode } from 'react'

interface StatProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'amber' | 'green' | 'red'
  className?: string
}

const valueTones = {
  default: 'text-white',
  amber: 'text-amber-400',
  green: 'text-emerald-400',
  red: 'text-red-400',
}

export function Stat({ label, value, hint, tone = 'default', className = '' }: StatProps) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${valueTones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export default Stat

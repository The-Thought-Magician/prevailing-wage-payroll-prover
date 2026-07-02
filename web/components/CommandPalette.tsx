'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type CommandItem = { label: string; href: string; group: string }

export default function CommandPalette({ items }: { items: CommandItem[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q) || i.href.toLowerCase().includes(q)
    )
  }, [query, items])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/70 px-4 pt-24 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-stone-800 bg-stone-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-stone-800 px-4 py-3">
          <span className="text-stone-500">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const item = filtered[activeIndex]
                if (item) go(item.href)
              }
            }}
            placeholder="Jump to a record, filing, or page..."
            className="w-full bg-transparent text-sm text-stone-100 placeholder-stone-500 outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-stone-500">No matching pages.</div>
          )}
          {filtered.map((item, idx) => (
            <button
              key={item.href}
              onClick={() => go(item.href)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                idx === activeIndex ? 'bg-cyan-500/10 text-cyan-300' : 'text-stone-300'
              }`}
            >
              <span>{item.label}</span>
              <span className="text-xs text-stone-600">{item.group}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-stone-800 px-4 py-2 text-xs text-stone-600">
          Enter to navigate. Esc to close.
        </div>
      </div>
    </div>
  )
}

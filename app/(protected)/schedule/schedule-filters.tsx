'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X, Calendar } from 'lucide-react'
import type { Company } from '@/lib/types/database'

type Props = {
  companies: Pick<Company, 'id' | 'code' | 'name'>[]
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tutti' },
  { value: 'pending', label: 'Pendenti' },
  { value: 'scheduled', label: 'Programmati' },
  { value: 'paid', label: 'Pagati' },
]

const FLOW_OPTIONS = [
  { value: '', label: 'Tutti' },
  { value: 'out', label: 'Uscite' },
  { value: 'in', label: 'Entrate' },
]

function todayISO() {
  return new Date().toISOString().split('T')[0]
}
function addDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const PERIOD_PRESETS = [
  { label: 'Scadute', from: '2000-01-01', to: todayISO() },
  { label: '7 giorni', from: todayISO(), to: addDays(7) },
  { label: '30 giorni', from: todayISO(), to: addDays(30) },
  { label: '90 giorni', from: todayISO(), to: addDays(90) },
  { label: 'Tutti', from: '', to: '' },
]

export default function ScheduleFilters({ companies }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const tab           = sp.get('tab')            ?? 'schedule'
  const company       = sp.get('company')        ?? ''
  const status        = sp.get('status')         ?? ''
  const flow          = sp.get('flow')           ?? ''
  const from          = sp.get('from')           ?? ''
  const to            = sp.get('to')             ?? ''
  const supplierId    = sp.get('supplier_id')    ?? ''
  const supplierLabel = sp.get('supplier_label') ?? ''

  const [searchVal, setSearchVal] = useState(sp.get('q') ?? '')
  const [fromLocal, setFromLocal] = useState(from)
  const [toLocal,   setToLocal]   = useState(to)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Sync local date state when URL changes (e.g. preset buttons or X)
  useEffect(() => { setFromLocal(from) }, [from])
  useEffect(() => { setToLocal(to) }, [to])

  const push = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v)
      else params.delete(k)
    })
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }, [sp, pathname, router])

  function handleSearch(val: string) {
    setSearchVal(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => push({ q: val }), 400)
  }

  function clearSearch() {
    setSearchVal('')
    clearTimeout(debounceRef.current)
    push({ q: '' })
  }

  const activePeriod = PERIOD_PRESETS.find(p => p.from === from && p.to === to)?.label ?? null

  return (
    <div className="space-y-3 mb-5">
      {/* Row 1: company + tab toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={company}
          onChange={e => push({ company: e.target.value })}
          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Tutte le società</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex rounded-lg overflow-hidden border border-zinc-700 ml-auto">
          {[
            { value: 'schedule', label: 'Scadenzario' },
            { value: 'suppliers', label: 'Fornitori' },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => push({ tab: t.value })}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active supplier filter chip */}
      {tab === 'schedule' && supplierId && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Fornitore:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600/20 border border-indigo-500/40 rounded-full text-xs text-indigo-300">
            {supplierLabel || supplierId}
            <button
              onClick={() => push({ supplier_id: '', supplier_label: '' })}
              className="hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      {/* Search (only for schedule tab) */}
      {tab === 'schedule' && (
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchVal}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Cerca fornitore..."
            className="w-full pl-8 pr-8 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {searchVal && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Row 2: status + flow + period (only for schedule tab) */}
      {tab === 'schedule' && (
        <div className="flex items-center gap-4 flex-wrap">
          {/* Status chips */}
          <div className="flex gap-1">
            {STATUS_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => push({ status: o.value })}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  status === o.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-700" />

          {/* Flow chips */}
          <div className="flex gap-1">
            {FLOW_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => push({ flow: o.value })}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  flow === o.value
                    ? 'bg-zinc-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-700" />

          {/* Period presets */}
          <div className="flex gap-1">
            {PERIOD_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => push({ from: p.from, to: p.to })}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  activePeriod === p.label
                    ? 'bg-zinc-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-700" />

          {/* Date range inputs */}
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <input
              type="date"
              value={fromLocal}
              onChange={e => setFromLocal(e.target.value)}
              onBlur={e => push({ from: e.target.value })}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-zinc-600 text-xs">→</span>
            <input
              type="date"
              value={toLocal}
              onChange={e => setToLocal(e.target.value)}
              onBlur={e => push({ to: e.target.value })}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {(fromLocal || toLocal) && (
              <button
                onClick={() => push({ from: '', to: '' })}
                title="Azzera filtro date"
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

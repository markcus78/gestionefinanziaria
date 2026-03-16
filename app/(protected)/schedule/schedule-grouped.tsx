'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import RowActions from './row-actions'
import type { PaymentScheduleItem, PaymentStatus } from '@/lib/types/database'

type Props = {
  rows: PaymentScheduleItem[]
  today: string
  companyCodeMap?: Record<string, string>
  showCompany?: boolean
}

type DayGroup   = { date: string; rows: PaymentScheduleItem[] }
type MonthGroup = { year: number; month: number; days: DayGroup[] }
type YearGroup  = { year: number; months: MonthGroup[] }

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function StatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; cls: string }> = {
    pending:   { label: 'Pendente',    cls: 'bg-amber-500/20 text-amber-400' },
    scheduled: { label: 'Programmato', cls: 'bg-blue-500/20 text-blue-400' },
    paid:      { label: 'Pagato',      cls: 'bg-emerald-500/20 text-emerald-400' },
    postponed: { label: 'Posticipato', cls: 'bg-purple-500/20 text-purple-400' },
    disputed:  { label: 'Contestato',  cls: 'bg-red-500/20 text-red-400' },
    cancelled: { label: 'Annullato',   cls: 'bg-zinc-700 text-zinc-400' },
  }
  const { label, cls } = map[status] ?? map.pending
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>
}

function PriorityBadge({ score }: { score: number | null }) {
  if (score === null) return null
  const cls =
    score >= 12 ? 'bg-red-500/20 text-red-400' :
    score >= 8  ? 'bg-orange-500/20 text-orange-400' :
    score >= 5  ? 'bg-amber-500/20 text-amber-400' :
                  'bg-zinc-700 text-zinc-400'
  return <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${cls}`}>{score}</span>
}

function groupSummary(rows: PaymentScheduleItem[]) {
  const out = rows.filter(r => r.flow_type === 'out').reduce((s, r) => s + Math.abs(r.amount_cents), 0)
  const inc = rows.filter(r => r.flow_type === 'in').reduce((s, r) => s + Math.abs(r.amount_cents), 0)
  return { out, inc }
}

function SummaryLine({ rows, compact }: { rows: PaymentScheduleItem[]; compact?: boolean }) {
  const { out, inc } = groupSummary(rows)
  return (
    <span className={`${compact ? 'text-xs' : 'text-xs'} text-zinc-400 ml-3`}>
      {out > 0 && <span className="text-red-400">-{formatEur(out)}</span>}
      {out > 0 && inc > 0 && <span className="mx-1 text-zinc-600">/</span>}
      {inc > 0 && <span className="text-emerald-400">+{formatEur(inc)}</span>}
    </span>
  )
}

function buildGroups(rows: PaymentScheduleItem[]): YearGroup[] {
  const yearMap = new Map<number, Map<string, Map<string, PaymentScheduleItem[]>>>()

  for (const row of rows) {
    const [yearStr, monthStr, dayStr] = row.due_date.split('-')
    const year  = parseInt(yearStr)
    const month = parseInt(monthStr)
    const monthKey = `${yearStr}-${monthStr}`
    const dayKey   = row.due_date

    if (!yearMap.has(year)) yearMap.set(year, new Map())
    const monthMap = yearMap.get(year)!
    if (!monthMap.has(monthKey)) monthMap.set(monthKey, new Map())
    const dayMap = monthMap.get(monthKey)!
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, [])
    dayMap.get(dayKey)!.push(row)
  }

  const years: YearGroup[] = []
  for (const [year, monthMap] of Array.from(yearMap).sort((a, b) => a[0] - b[0])) {
    const months: MonthGroup[] = []
    for (const [monthKey, dayMap] of Array.from(monthMap).sort((a, b) => a[0].localeCompare(b[0]))) {
      const month = parseInt(monthKey.split('-')[1])
      const days: DayGroup[] = []
      for (const [date, dayRows] of Array.from(dayMap).sort((a, b) => a[0].localeCompare(b[0]))) {
        days.push({ date, rows: dayRows })
      }
      months.push({ year, month, days })
    }
    years.push({ year, months })
  }
  return years
}

function RowsTable({
  rows,
  today,
  showDate,
  showCompany,
  companyCodeMap,
  navigateSupplier,
}: {
  rows: PaymentScheduleItem[]
  today: string
  showDate: boolean
  showCompany?: boolean
  companyCodeMap?: Record<string, string>
  navigateSupplier: (item: PaymentScheduleItem) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/80">
            {showDate && <th className="text-left px-3 py-2 text-zinc-500 font-medium">Data</th>}
            {showCompany && <th className="text-left px-3 py-2 text-zinc-500 font-medium">Soc.</th>}
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Fornitore</th>
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Documento</th>
            <th className="text-right px-3 py-2 text-zinc-500 font-medium">Importo</th>
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Stato</th>
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Tipo</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map(item => {
            const isOverdue = showDate && item.due_date < today
            const isNear    = showDate && !isOverdue && item.due_date <= (() => {
              const d = new Date(today); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]
            })()
            const dateClass = isOverdue ? 'text-red-400' : isNear ? 'text-amber-400' : 'text-zinc-300'
            return (
              <tr key={item.id} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
                {showDate && (
                  <td className={`px-3 py-2 font-medium tabular-nums ${dateClass}`}>
                    {new Date(item.due_date + 'T00:00:00').toLocaleDateString('it-IT')}
                  </td>
                )}
                {showCompany && (
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 font-medium">
                      {companyCodeMap?.[item.company_id] ?? '—'}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2 max-w-44">
                  {item.supplier_name ? (
                    <button
                      onClick={() => navigateSupplier(item)}
                      className="text-zinc-200 block truncate hover:text-indigo-300 hover:underline text-left w-full"
                    >
                      {item.supplier_name}
                    </button>
                  ) : item.account_description ? (
                    <span className="text-zinc-400 block truncate italic">{item.account_description}</span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                  {item.is_intercompany && <span className="text-amber-400 text-xs">IC</span>}
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {item.document_type && (
                    <span className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-300 mr-1">{item.document_type}</span>
                  )}
                  {item.document_number ? (
                    <span className="font-mono">{item.document_number}</span>
                  ) : item.account_code && !item.supplier_name ? (
                    <span className="text-zinc-600 font-mono">{item.account_code}</span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className={`px-3 py-2 text-right font-medium tabular-nums ${item.flow_type === 'out' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {item.flow_type === 'out' ? '-' : '+'}{formatEur(Math.abs(item.amount_cents))}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={item.status} />
                  {item.paid_date && (
                    <span className="text-zinc-500 ml-1">
                      {new Date(item.paid_date + 'T00:00:00').toLocaleDateString('it-IT')}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${item.entry_type === 'accounting' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                    {item.entry_type === 'accounting' ? 'cont.' : 'imp.'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <RowActions item={item} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ScheduleGrouped({ rows, today, companyCodeMap, showCompany }: Props) {
  const currentYear  = parseInt(today.slice(0, 4))
  const currentMonth = parseInt(today.slice(5, 7))

  const router   = useRouter()
  const pathname = usePathname()
  const sp       = useSearchParams()

  const groupBy = (sp.get('groupBy') ?? 'day') as 'year' | 'month' | 'day'

  const navigateSupplier = useCallback((item: PaymentScheduleItem) => {
    const params = new URLSearchParams(sp.toString())
    if (item.supplier_id) {
      params.set('supplier_id',    item.supplier_id)
      params.set('supplier_label', item.supplier_name ?? '')
    } else if (item.supplier_name) {
      params.set('q', item.supplier_name)
    } else {
      return
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }, [sp, pathname, router])

  const [openYears,  setOpenYears]  = useState<Set<number>>(new Set([currentYear]))
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set([`${currentYear}-${String(currentMonth).padStart(2,'0')}`]))
  const [openDays,   setOpenDays]   = useState<Set<string>>(new Set([today]))

  function toggleYear(year: number) {
    setOpenYears(prev => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year); else next.add(year)
      return next
    })
  }
  function toggleMonth(key: string) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function toggleDay(key: string) {
    setOpenDays(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const groups = buildGroups(rows)

  if (groups.length === 0) return null

  // ── groupBy='year' ──────────────────────────────────────────────────────────
  if (groupBy === 'year') {
    return (
      <div className="space-y-2">
        {groups.map(yg => {
          const yearOpen = openYears.has(yg.year)
          const allYearRows = yg.months.flatMap(m => m.days.flatMap(d => d.rows))
          return (
            <div key={yg.year} className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleYear(yg.year)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-zinc-700/40 transition-colors"
              >
                <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${yearOpen ? 'rotate-90' : ''}`} />
                <span className="font-semibold text-zinc-100 text-sm">{yg.year}</span>
                <SummaryLine rows={allYearRows} />
                <span className="ml-auto text-xs text-zinc-500">{allYearRows.length} voci</span>
              </button>
              {yearOpen && (
                <div className="border-t border-zinc-700 bg-zinc-900">
                  <RowsTable rows={allYearRows} today={today} showDate showCompany={showCompany} companyCodeMap={companyCodeMap} navigateSupplier={navigateSupplier} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── groupBy='month' ─────────────────────────────────────────────────────────
  if (groupBy === 'month') {
    return (
      <div className="space-y-2">
        {groups.map(yg => {
          const yearOpen = openYears.has(yg.year)
          const allYearRows = yg.months.flatMap(m => m.days.flatMap(d => d.rows))
          return (
            <div key={yg.year} className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleYear(yg.year)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-zinc-700/40 transition-colors"
              >
                <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${yearOpen ? 'rotate-90' : ''}`} />
                <span className="font-semibold text-zinc-100 text-sm">{yg.year}</span>
                <SummaryLine rows={allYearRows} />
                <span className="ml-auto text-xs text-zinc-500">{allYearRows.length} voci</span>
              </button>

              {yearOpen && (
                <div className="border-t border-zinc-700">
                  {yg.months.map(mg => {
                    const monthKey  = `${mg.year}-${String(mg.month).padStart(2,'0')}`
                    const monthOpen = openMonths.has(monthKey)
                    const allMonthRows = mg.days.flatMap(d => d.rows)
                    return (
                      <div key={monthKey} className="border-b border-zinc-700/50 last:border-0">
                        <button
                          onClick={() => toggleMonth(monthKey)}
                          className="w-full flex items-center gap-2 px-4 pl-8 py-2.5 text-left border-l-2 border-indigo-500/40 hover:bg-zinc-700/30 transition-colors"
                        >
                          <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${monthOpen ? 'rotate-90' : ''}`} />
                          <span className="font-medium text-zinc-200 text-sm">
                            {MONTH_NAMES[mg.month - 1]} {mg.year}
                          </span>
                          <SummaryLine rows={allMonthRows} compact />
                          <span className="ml-auto text-xs text-zinc-500">{allMonthRows.length} voci</span>
                        </button>

                        {monthOpen && (
                          <div className="bg-zinc-900 border-l border-zinc-700 ml-4">
                            <RowsTable rows={allMonthRows} today={today} showDate showCompany={showCompany} companyCodeMap={companyCodeMap} navigateSupplier={navigateSupplier} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── groupBy='day' (default) ─────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {groups.map(yg => {
        const yearOpen = openYears.has(yg.year)
        const allYearRows = yg.months.flatMap(m => m.days.flatMap(d => d.rows))
        return (
          <div key={yg.year} className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
            {/* Year header */}
            <button
              onClick={() => toggleYear(yg.year)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-zinc-700/40 transition-colors"
            >
              <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${yearOpen ? 'rotate-90' : ''}`} />
              <span className="font-semibold text-zinc-100 text-sm">{yg.year}</span>
              <SummaryLine rows={allYearRows} />
              <span className="ml-auto text-xs text-zinc-500">{allYearRows.length} voci</span>
            </button>

            {yearOpen && (
              <div className="border-t border-zinc-700">
                {yg.months.map(mg => {
                  const monthKey  = `${mg.year}-${String(mg.month).padStart(2,'0')}`
                  const monthOpen = openMonths.has(monthKey)
                  const allMonthRows = mg.days.flatMap(d => d.rows)
                  return (
                    <div key={monthKey} className="border-b border-zinc-700/50 last:border-0">
                      {/* Month header */}
                      <button
                        onClick={() => toggleMonth(monthKey)}
                        className="w-full flex items-center gap-2 px-4 pl-8 py-2.5 text-left border-l-2 border-indigo-500/40 hover:bg-zinc-700/30 transition-colors"
                      >
                        <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${monthOpen ? 'rotate-90' : ''}`} />
                        <span className="font-medium text-zinc-200 text-sm">
                          {MONTH_NAMES[mg.month - 1]} {mg.year}
                        </span>
                        <SummaryLine rows={allMonthRows} compact />
                        <span className="ml-auto text-xs text-zinc-500">{allMonthRows.length} voci</span>
                      </button>

                      {monthOpen && (
                        <div>
                          {mg.days.map(dg => {
                            const dayOpen = openDays.has(dg.date)
                            const dayLabel = new Date(dg.date + 'T00:00:00').toLocaleDateString('it-IT', {
                              day: '2-digit', month: 'short'
                            })
                            const isOverdue = dg.date < today
                            const isToday   = dg.date === today
                            return (
                              <div key={dg.date} className="border-t border-zinc-700/30">
                                {/* Day header */}
                                <button
                                  onClick={() => toggleDay(dg.date)}
                                  className="w-full flex items-center gap-2 px-4 pl-12 py-2 text-left bg-zinc-900/50 border-l border-zinc-700 hover:bg-zinc-800/40 transition-colors"
                                >
                                  <ChevronRight className={`w-3 h-3 text-zinc-500 transition-transform ${dayOpen ? 'rotate-90' : ''}`} />
                                  <span className={`text-xs font-medium ${isOverdue ? 'text-red-400' : isToday ? 'text-indigo-300' : 'text-zinc-300'}`}>
                                    {dayLabel}
                                    {isToday && <span className="ml-1 text-indigo-400 font-normal">(oggi)</span>}
                                  </span>
                                  <SummaryLine rows={dg.rows} compact />
                                  <span className="ml-auto text-xs text-zinc-600">{dg.rows.length}</span>
                                </button>

                                {dayOpen && (
                                  <div className="bg-zinc-900 border-l border-zinc-700 ml-4">
                                    <RowsTable rows={dg.rows} today={today} showDate={false} showCompany={showCompany} companyCodeMap={companyCodeMap} navigateSupplier={navigateSupplier} />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { TreasuryDay } from '@/lib/treasury-calc'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatDate(iso: string, isToday: boolean) {
  const d = new Date(iso + 'T00:00:00')
  const label = d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })
  return isToday ? `${label} (oggi)` : label
}

type Props = {
  timeline: TreasuryDay[]
  threshold: number
  today: string
}

export default function TimelineTab({ timeline, threshold, today }: Props) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const maxOutflow = Math.max(...timeline.map(d => d.outflow), 1)
  const maxInflow  = Math.max(...timeline.map(d => d.inflowCertain + d.inflowForecast), 1)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[140px_1fr_1fr_1fr_120px] gap-0 border-b border-zinc-800 bg-zinc-900/80">
        {['Data', 'Incassi certi', 'Incassi previsti', 'Uscite', 'Saldo'].map((h, i) => (
          <div key={i} className={`px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide ${i >= 1 ? 'text-right' : ''}`}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div>
        {timeline.map(day => {
          const isToday    = day.date === today
          const isExpanded = expandedDate === day.date
          const belowThreshold = threshold > 0 && day.balance < threshold
          const hasPayments = day.payments.length > 0
          const totalInflow = day.inflowCertain + day.inflowForecast

          return (
            <div key={day.date} className={`border-b border-zinc-800/50 last:border-0 ${isToday ? 'bg-blue-500/5' : ''}`}>
              {/* Main row */}
              <div
                className={`grid grid-cols-[140px_1fr_1fr_1fr_120px] gap-0 hover:bg-zinc-800/20 ${hasPayments ? 'cursor-pointer' : ''}`}
                onClick={() => hasPayments && setExpandedDate(isExpanded ? null : day.date)}
              >
                {/* Data */}
                <div className="px-3 py-2.5 flex items-center gap-1.5">
                  {hasPayments ? (
                    isExpanded
                      ? <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
                  ) : <span className="w-3" />}
                  <span className={`text-xs tabular-nums ${isToday ? 'font-semibold text-blue-400' : 'text-zinc-400'}`}>
                    {formatDate(day.date, isToday)}
                  </span>
                </div>

                {/* Incassi certi */}
                <div className="px-3 py-2.5 flex items-center justify-end gap-2">
                  {day.inflowCertain > 0 ? (
                    <>
                      <div className="flex-1 flex justify-end">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500/60"
                          style={{ width: `${Math.round((day.inflowCertain / maxInflow) * 80)}%`, minWidth: 2 }}
                        />
                      </div>
                      <span className="text-xs text-emerald-400 tabular-nums font-medium w-20 text-right">
                        +{formatEur(day.inflowCertain)}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-700 w-20 text-right">—</span>
                  )}
                </div>

                {/* Incassi previsti */}
                <div className="px-3 py-2.5 flex items-center justify-end gap-2">
                  {day.inflowForecast > 0 ? (
                    <>
                      <div className="flex-1 flex justify-end">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500/25"
                          style={{ width: `${Math.round((day.inflowForecast / maxInflow) * 80)}%`, minWidth: 2 }}
                        />
                      </div>
                      <span className="text-xs text-emerald-600 tabular-nums w-20 text-right">
                        +{formatEur(day.inflowForecast)}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-700 w-20 text-right">—</span>
                  )}
                </div>

                {/* Uscite */}
                <div className="px-3 py-2.5 flex items-center justify-end gap-2">
                  {day.outflow > 0 ? (
                    <>
                      <div className="flex-1 flex justify-end">
                        <div
                          className="h-1.5 rounded-full bg-red-500/50"
                          style={{ width: `${Math.round((day.outflow / maxOutflow) * 80)}%`, minWidth: 2 }}
                        />
                      </div>
                      <span className="text-xs text-red-400 tabular-nums w-20 text-right">
                        -{formatEur(day.outflow)}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-700 w-20 text-right">—</span>
                  )}
                </div>

                {/* Saldo */}
                <div className="px-3 py-2.5 text-right">
                  <span className={`text-xs font-semibold tabular-nums ${
                    belowThreshold ? 'text-red-400' :
                    day.balance < 0 ? 'text-red-500' :
                    'text-zinc-200'
                  }`}>
                    {formatEur(day.balance)}
                  </span>
                  {belowThreshold && (
                    <span className="ml-1 text-red-500 text-xs">⚠</span>
                  )}
                </div>
              </div>

              {/* Expanded: dettaglio uscite */}
              {isExpanded && day.payments.length > 0 && (
                <div className="border-t border-zinc-800/50 bg-zinc-800/20">
                  {day.payments.map(p => (
                    <div key={p.id} className="grid grid-cols-[140px_1fr_auto] gap-2 px-8 py-1.5 border-b border-zinc-800/30 last:border-0">
                      <div className="flex items-center gap-1.5">
                        {p.isCritical && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                        <span className="text-xs text-zinc-300 truncate">
                          {p.supplierName ?? p.accountDescription ?? '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.category && (
                          <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">
                            {p.category.replace('_', ' ')}
                          </span>
                        )}
                        {p.isIntercompany && (
                          <span className="text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded">IC</span>
                        )}
                        {(p.priorityOverride ?? p.priorityScore ?? 0) > 0 && (
                          <span className="text-xs text-zinc-500">
                            P{p.priorityOverride ?? p.priorityScore}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-red-400 font-medium tabular-nums">
                        -{formatEur(p.amountCents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: totali 30 giorni */}
      <div className="border-t border-zinc-700 grid grid-cols-[140px_1fr_1fr_1fr_120px] gap-0 bg-zinc-800/40">
        <div className="px-3 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide">30 giorni</div>
        <div className="px-3 py-2.5 text-right text-xs font-semibold text-emerald-400 tabular-nums">
          +{formatEur(timeline.reduce((s, d) => s + d.inflowCertain, 0))}
        </div>
        <div className="px-3 py-2.5 text-right text-xs font-semibold text-emerald-600 tabular-nums">
          +{formatEur(timeline.reduce((s, d) => s + d.inflowForecast, 0))}
        </div>
        <div className="px-3 py-2.5 text-right text-xs font-semibold text-red-400 tabular-nums">
          -{formatEur(timeline.reduce((s, d) => s + d.outflow, 0))}
        </div>
        <div className="px-3 py-2.5 text-right text-xs font-semibold text-zinc-200 tabular-nums">
          {formatEur(timeline[timeline.length - 1]?.balance ?? 0)}
        </div>
      </div>
    </div>
  )
}

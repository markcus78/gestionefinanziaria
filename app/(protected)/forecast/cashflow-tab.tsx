'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertRevenueForecast } from './actions'
import type { ForecastMonth } from './page'

type Company = { id: string; code: string; name: string; minimum_cash_threshold_cents: number }

type Props = {
  forecastMonths: ForecastMonth[]
  initialBalance: number
  threshold: number
  company: Company | null
  view: 'single' | 'consolidated'
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function parseCents(val: string): number {
  const n = parseFloat(val.replace(',', '.').replace(/[^\d.]/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

export default function CashflowTab({ forecastMonths, initialBalance, threshold, company, view }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const canEdit = view === 'single' && !!company

  // Valori incassi editabili: keyed by "year-month"
  const [revenueValues, setRevenueValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const m of forecastMonths) {
      const key = `${m.year}-${m.month}`
      init[key] = m.revenueForecasted > 0 ? String(m.revenueForecasted / 100) : ''
    }
    return init
  })

  const [saving, setSaving] = useState<string | null>(null)

  // Calcolo client-side: netFlow e balanceEnd aggiornati al volo durante l'editing
  let running = initialBalance
  const computed = forecastMonths.map(m => {
    const key = `${m.year}-${m.month}`
    const revenue = canEdit ? parseCents(revenueValues[key] ?? '0') : m.revenueForecasted
    const netFlow = revenue - m.outflowScheduled
    running += netFlow
    return { ...m, revenueLocal: revenue, netFlow, balanceEnd: running }
  })

  function handleBlur(year: number, month: number) {
    if (!canEdit || !company) return
    const key = `${year}-${month}`
    const cents = parseCents(revenueValues[key] ?? '0')
    setSaving(key)
    startTransition(async () => {
      await upsertRevenueForecast(company.id, year, month, cents)
      setSaving(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Header cards: saldo proiettato per mese */}
      <div className="grid grid-cols-6 gap-3">
        {computed.map(m => {
          const isNegative     = m.balanceEnd < 0
          const belowThreshold = !isNegative && threshold > 0 && m.balanceEnd < threshold
          const colorBase = isNegative
            ? 'bg-red-500/10 border-red-500/30'
            : belowThreshold
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-emerald-500/10 border-emerald-500/30'
          const colorText = isNegative
            ? 'text-red-400'
            : belowThreshold
            ? 'text-amber-400'
            : 'text-emerald-400'
          const colorValue = isNegative
            ? 'text-red-300'
            : belowThreshold
            ? 'text-amber-300'
            : 'text-emerald-300'
          return (
            <div key={`${m.year}-${m.month}`} className={`rounded-xl border p-3 ${colorBase}`}>
              <div className={`text-xs font-medium mb-1 ${colorText}`}>{m.label}</div>
              <div className={`text-sm font-semibold tabular-nums ${colorValue}`}>
                {formatEur(m.balanceEnd)}
              </div>
              {m.netFlow !== 0 && (
                <div className={`text-xs tabular-nums mt-0.5 ${m.netFlow >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {m.netFlow >= 0 ? '+' : ''}{formatEur(m.netFlow)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tabella cashflow */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide w-44 min-w-[10rem]">
                Voce
              </th>
              {computed.map(m => (
                <th key={`${m.year}-${m.month}`} className="text-right px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide min-w-[8rem]">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Incassi previsti — editabile in vista singola */}
            <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
              <td className="px-4 py-2.5 text-zinc-200 font-medium">
                Incassi previsti
                {!canEdit && view === 'single' && (
                  <span className="ml-1 text-xs text-zinc-600">(seleziona società)</span>
                )}
              </td>
              {computed.map(m => {
                const key = `${m.year}-${m.month}`
                return (
                  <td key={key} className="px-3 py-2 text-right">
                    {canEdit ? (
                      <div className="inline-flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={revenueValues[key] ?? ''}
                          onChange={e => setRevenueValues(v => ({ ...v, [key]: e.target.value }))}
                          onBlur={() => handleBlur(m.year, m.month)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          placeholder="0"
                          className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-right text-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                        />
                        {saving === key && <span className="text-xs text-zinc-500">…</span>}
                      </div>
                    ) : (
                      <span className="text-zinc-300 tabular-nums">
                        {m.revenueForecasted > 0
                          ? formatEur(m.revenueForecasted)
                          : <span className="text-zinc-600">—</span>
                        }
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>

            {/* Uscite programmate — sola lettura */}
            <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
              <td className="px-4 py-2.5 text-zinc-400">Uscite programmate</td>
              {computed.map(m => (
                <td key={`${m.year}-${m.month}`} className="px-3 py-2.5 text-right text-red-300/80 tabular-nums">
                  {m.outflowScheduled > 0
                    ? formatEur(m.outflowScheduled)
                    : <span className="text-zinc-600">—</span>
                  }
                </td>
              ))}
            </tr>

          </tbody>

          <tfoot>
            {/* Flusso netto */}
            <tr className="border-t border-zinc-700">
              <td className="px-4 py-2.5 text-zinc-300 font-semibold">Flusso netto</td>
              {computed.map(m => (
                <td key={`${m.year}-${m.month}`} className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                  m.netFlow >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {(m.netFlow >= 0 ? '+' : '') + formatEur(m.netFlow)}
                </td>
              ))}
            </tr>

            {/* Saldo fine mese */}
            <tr className="border-t border-zinc-700 bg-zinc-800/40">
              <td className="px-4 py-3 text-zinc-100 font-bold">Saldo fine mese</td>
              {computed.map(m => {
                const bad = m.balanceEnd < 0 || (threshold > 0 && m.balanceEnd < threshold)
                return (
                  <td key={`${m.year}-${m.month}`} className={`px-3 py-3 text-right font-bold tabular-nums ${
                    bad ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {formatEur(m.balanceEnd)}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

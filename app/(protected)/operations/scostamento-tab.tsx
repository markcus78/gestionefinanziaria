'use client'

import { distributeForecast, calcExpectedCumulated, calcMonthProjection } from '@/lib/treasury-calc'
import type { CollectionWithChannel } from '@/lib/types/database'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatPct(v: number) {
  return (v >= 0 ? '+' : '') + new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%'
}

type Props = {
  collections: CollectionWithChannel[]
  forecastCents: number
  year: number
  month: number
  today: string
}

export default function ScostamentoTab({ collections, forecastCents, year, month, today }: Props) {
  if (forecastCents === 0) {
    return (
      <div className="py-12 text-center text-zinc-500 text-sm">
        Inserisci prima il budget mensile in <span className="text-zinc-300">Previsione 6 mesi</span>
      </div>
    )
  }

  const todayDay = new Date(today + 'T00:00:00').getDate()
  const todayMonth = new Date(today + 'T00:00:00').getMonth() + 1
  const todayYear = new Date(today + 'T00:00:00').getFullYear()
  const isCurrentMonth = todayYear === year && todayMonth === month

  // Giorno limite per la tabella: ieri (se mese corrente), o ultimo giorno del mese
  const lastDay = new Date(year, month, 0).getDate()
  const upToDay = isCurrentMonth ? Math.min(todayDay - 1, lastDay) : lastDay
  const displayUpToDay = isCurrentMonth ? todayDay : lastDay

  // Incasso reale totale fino a upToDay incluso
  const pad = (n: number) => String(n).padStart(2, '0')
  const cutoffDate = `${year}-${pad(month)}-${pad(displayUpToDay)}`

  const realByDay = new Map<number, number>()
  for (const c of collections) {
    const d = new Date(c.collection_date + 'T00:00:00')
    if (d.getMonth() + 1 === month && d.getFullYear() === year) {
      const day = d.getDate()
      if (day <= (isCurrentMonth ? todayDay : lastDay)) {
        realByDay.set(day, (realByDay.get(day) ?? 0) + c.gross_amount_cents)
      }
    }
  }

  const realCumulated = Array.from(realByDay.values()).reduce((s, v) => s + v, 0)
  const expectedCumulated = calcExpectedCumulated(forecastCents, year, month, isCurrentMonth ? todayDay : lastDay)
  const projection = calcMonthProjection(realCumulated, year, month, isCurrentMonth ? todayDay : lastDay)

  const projPct = forecastCents > 0 ? projection / forecastCents : 0

  // Distribuzione giornaliera algoritmo
  const dailyAlgo = distributeForecast(forecastCents, 'subscription', null, year, month)

  // Righe tabella: giorni 1..upToDay
  const rows: {
    day: number
    date: string
    previsto: number
    reale: number
    delta: number
    deltaPct: number | null
  }[] = []

  let cumPrevisto = 0
  let cumReale = 0

  for (let d = 1; d <= upToDay; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`
    const previsto = dailyAlgo.get(dateStr) ?? 0
    const reale = realByDay.get(d) ?? 0
    const delta = reale - previsto
    const deltaPct = previsto > 0 ? (delta / previsto) * 100 : null
    cumPrevisto += previsto
    cumReale += reale
    rows.push({ day: d, date: dateStr, previsto, reale, delta, deltaPct })
  }

  return (
    <div className="space-y-5">
      {/* 3 card header */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Atteso ad oggi (algoritmo)</p>
          <p className="text-lg font-semibold text-zinc-100 tabular-nums">{formatEur(expectedCumulated)}</p>
          <p className="text-xs text-zinc-600 mt-1">fino al {isCurrentMonth ? `giorno ${todayDay}` : `giorno ${lastDay}`}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Reale ad oggi</p>
          <p className="text-lg font-semibold text-zinc-100 tabular-nums">{formatEur(realCumulated)}</p>
          {expectedCumulated > 0 && (
            <p className={`text-xs mt-1 tabular-nums ${
              realCumulated >= expectedCumulated ? 'text-emerald-400' :
              realCumulated >= expectedCumulated * 0.75 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {formatPct(((realCumulated - expectedCumulated) / expectedCumulated) * 100)} vs atteso
            </p>
          )}
        </div>
        <div className={`border rounded-xl p-4 ${
          projPct >= 1    ? 'bg-emerald-500/10 border-emerald-500/30' :
          projPct >= 0.75 ? 'bg-amber-500/10 border-amber-500/30' :
                            'bg-red-500/10 border-red-500/30'
        }`}>
          <p className="text-xs text-zinc-500 mb-1">Proiezione fine mese</p>
          <p className={`text-lg font-semibold tabular-nums ${
            projPct >= 1    ? 'text-emerald-400' :
            projPct >= 0.75 ? 'text-amber-400' : 'text-red-400'
          }`}>
            {formatEur(projection)}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            budget: {formatEur(forecastCents)} · {Math.round(projPct * 100)}%
          </p>
        </div>
      </div>

      {/* Tabella giornaliera */}
      {upToDay < 1 ? (
        <div className="py-8 text-center text-zinc-500 text-sm">
          Nessun giorno passato da analizzare
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60">
                <th className="text-left py-2.5 px-4 text-xs text-zinc-500 font-medium w-24">Data</th>
                <th className="text-right py-2.5 px-4 text-xs text-zinc-500 font-medium">Previsto</th>
                <th className="text-right py-2.5 px-4 text-xs text-zinc-500 font-medium">Reale</th>
                <th className="text-right py-2.5 px-4 text-xs text-zinc-500 font-medium">Delta €</th>
                <th className="text-right py-2.5 px-4 text-xs text-zinc-500 font-medium">Delta %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isGreen = row.reale > row.previsto * 1.1
                const isRed   = row.reale < row.previsto * 0.75
                return (
                  <tr
                    key={row.day}
                    className={`border-b border-zinc-800/50 transition-colors ${
                      isGreen ? 'bg-emerald-500/5' :
                      isRed   ? 'bg-red-500/5' : 'bg-transparent'
                    }`}
                  >
                    <td className="py-2 px-4 text-zinc-400 tabular-nums">
                      {new Date(row.date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="py-2 px-4 text-right text-zinc-300 tabular-nums">{formatEur(row.previsto)}</td>
                    <td className={`py-2 px-4 text-right tabular-nums font-medium ${
                      isGreen ? 'text-emerald-400' : isRed ? 'text-red-400' : 'text-zinc-200'
                    }`}>
                      {formatEur(row.reale)}
                    </td>
                    <td className={`py-2 px-4 text-right tabular-nums ${
                      row.delta > 0 ? 'text-emerald-400' : row.delta < 0 ? 'text-red-400' : 'text-zinc-500'
                    }`}>
                      {row.delta > 0 ? '+' : ''}{formatEur(row.delta)}
                    </td>
                    <td className={`py-2 px-4 text-right tabular-nums ${
                      row.deltaPct === null ? 'text-zinc-600' :
                      row.deltaPct > 0 ? 'text-emerald-400' : row.deltaPct < 0 ? 'text-red-400' : 'text-zinc-500'
                    }`}>
                      {row.deltaPct !== null ? formatPct(row.deltaPct) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-700 bg-zinc-900/80">
                <td className="py-2.5 px-4 text-xs text-zinc-400 font-medium">Totale cumulato</td>
                <td className="py-2.5 px-4 text-right text-zinc-200 tabular-nums font-medium">{formatEur(cumPrevisto)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums font-medium text-zinc-100">{formatEur(cumReale)}</td>
                <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${
                  cumReale - cumPrevisto > 0 ? 'text-emerald-400' :
                  cumReale - cumPrevisto < 0 ? 'text-red-400' : 'text-zinc-500'
                }`}>
                  {cumReale - cumPrevisto > 0 ? '+' : ''}{formatEur(cumReale - cumPrevisto)}
                </td>
                <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${
                  cumPrevisto > 0
                    ? (cumReale >= cumPrevisto ? 'text-emerald-400' : cumReale >= cumPrevisto * 0.75 ? 'text-amber-400' : 'text-red-400')
                    : 'text-zinc-600'
                }`}>
                  {cumPrevisto > 0 ? formatPct(((cumReale - cumPrevisto) / cumPrevisto) * 100) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

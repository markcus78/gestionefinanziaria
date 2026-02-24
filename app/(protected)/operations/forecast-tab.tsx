'use client'

import { useState, useTransition } from 'react'
import { upsertForecast } from './actions'
import type { ChannelConfig, CollectionWithChannel, MonthlyRevenueForecast } from '@/lib/types/database'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function parseCents(val: string): number {
  const n = parseFloat(val.replace(',', '.'))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

type Props = {
  companyId: string
  channelConfigs: ChannelConfig[]
  forecasts: MonthlyRevenueForecast[]
  collections: CollectionWithChannel[]
  year: number
  month: number
}

export default function ForecastTab({ companyId, channelConfigs, forecasts, collections, year, month }: Props) {
  const [, startTransition] = useTransition()

  // Mappa channelId → valore input (in euro, stringa)
  const initialValues: Record<string, string> = {}
  for (const f of forecasts) {
    if (f.channel_id) {
      initialValues[f.channel_id] = (f.forecast_gross_cents / 100).toFixed(2)
    }
  }
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [saving, setSaving] = useState<string | null>(null)

  // Mappa channelId → totale incassato nel mese
  const collectedByChannel: Record<string, number> = {}
  for (const c of collections) {
    if (!collectedByChannel[c.channel_id]) collectedByChannel[c.channel_id] = 0
    collectedByChannel[c.channel_id] += c.gross_amount_cents
  }

  function handleBlur(channelId: string) {
    const cents = parseCents(values[channelId] ?? '0')
    setSaving(channelId)
    startTransition(async () => {
      await upsertForecast(companyId, channelId, year, month, cents)
      setSaving(null)
    })
  }

  if (channelConfigs.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500 text-sm">
          Nessun canale abilitato per questa società.
          Abilitali in <span className="text-indigo-400">Impostazioni → Canali</span>.
        </p>
      </div>
    )
  }

  const totalForecast = channelConfigs.reduce((s, cc) => {
    return s + parseCents(values[cc.channel_id] ?? '0')
  }, 0)
  const totalCollected = channelConfigs.reduce((s, cc) => {
    return s + (collectedByChannel[cc.channel_id] ?? 0)
  }, 0)
  const totalDelta = totalCollected - totalForecast
  const totalPct = totalForecast > 0 ? Math.round((totalCollected / totalForecast) * 100) : null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/80">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Canale</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Forecast (€)</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Incassato (€)</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Delta</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">%</th>
          </tr>
        </thead>
        <tbody>
          {channelConfigs.map(cc => {
            const forecastCents = parseCents(values[cc.channel_id] ?? '0')
            const collectedCents = collectedByChannel[cc.channel_id] ?? 0
            const delta = collectedCents - forecastCents
            const pct = forecastCents > 0 ? Math.round((collectedCents / forecastCents) * 100) : null

            return (
              <tr key={cc.channel_id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                <td className="px-4 py-2.5 text-zinc-200 font-medium">
                  {cc.cash_channels.name}
                  {saving === cc.channel_id && (
                    <span className="ml-2 text-xs text-zinc-500">salvando…</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={values[cc.channel_id] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [cc.channel_id]: e.target.value }))}
                      onBlur={() => handleBlur(cc.channel_id)}
                      placeholder="0,00"
                      className="w-28 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-right text-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-zinc-500 text-xs">€</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-300 tabular-nums">
                  {collectedCents > 0 ? formatEur(collectedCents) : <span className="text-zinc-600">—</span>}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                  delta >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {forecastCents > 0 || collectedCents > 0
                    ? (delta >= 0 ? '+' : '') + formatEur(delta)
                    : <span className="text-zinc-600">—</span>
                  }
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {pct !== null ? (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      pct >= 100 ? 'bg-emerald-500/20 text-emerald-400' :
                      pct >= 75  ? 'bg-amber-500/20 text-amber-400' :
                                   'bg-red-500/20 text-red-400'
                    }`}>
                      {pct}%
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-700 bg-zinc-800/40">
            <td className="px-4 py-2.5 text-xs font-semibold text-zinc-300 uppercase tracking-wide">Totale</td>
            <td className="px-4 py-2.5 text-right text-zinc-200 font-semibold tabular-nums">
              {formatEur(totalForecast)}
            </td>
            <td className="px-4 py-2.5 text-right text-zinc-200 font-semibold tabular-nums">
              {formatEur(totalCollected)}
            </td>
            <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
              totalDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {(totalDelta >= 0 ? '+' : '') + formatEur(totalDelta)}
            </td>
            <td className="px-4 py-2.5 text-right">
              {totalPct !== null ? (
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                  totalPct >= 100 ? 'bg-emerald-500/20 text-emerald-400' :
                  totalPct >= 75  ? 'bg-amber-500/20 text-amber-400' :
                                    'bg-red-500/20 text-red-400'
                }`}>
                  {totalPct}%
                </span>
              ) : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

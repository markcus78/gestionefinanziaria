'use client'

import type { NettingHistoryItem } from './page'

type Props = {
  history: NettingHistoryItem[]
}

interface NettingDetails {
  pairs: Array<{
    company_a_code: string
    company_b_code: string
    gross_a_to_b_cents: number
    gross_b_to_a_cents: number
    net_cents: number
    net_direction: 'a_to_b' | 'b_to_a' | 'zero'
  }>
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function parseDetails(raw: Record<string, unknown> | null): NettingDetails | null {
  if (!raw) return null
  try {
    const pairs = raw.pairs as NettingDetails['pairs']
    if (!Array.isArray(pairs)) return null
    return { pairs }
  } catch {
    return null
  }
}

export default function StoricoTab({ history }: Props) {
  if (history.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500 text-sm">Nessun netting registrato.</p>
        <p className="text-zinc-600 text-xs mt-1">I netting eseguiti appariranno qui.</p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Data</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Coppie</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Dettaglio netto</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Importo compensato</th>
          </tr>
        </thead>
        <tbody>
          {history.map(item => {
            const details = parseDetails(item.details)
            return (
              <tr key={item.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                <td className="px-4 py-3 text-zinc-200 font-medium whitespace-nowrap">
                  {formatDate(item.netting_date)}
                </td>
                <td className="px-3 py-3">
                  {details ? (
                    <div className="flex flex-wrap gap-1">
                      {details.pairs.map((p, i) => (
                        <span key={i} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">
                          {p.company_a_code} ↔ {p.company_b_code}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-zinc-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {details ? (
                    <div className="space-y-0.5">
                      {details.pairs.map((p, i) => {
                        const netAbs = p.net_cents
                        const dir = p.net_direction
                        if (dir === 'zero' || netAbs === 0) {
                          return (
                            <div key={i} className="text-xs text-emerald-500">
                              {p.company_a_code} ↔ {p.company_b_code}: saldo zero
                            </div>
                          )
                        }
                        const payer    = dir === 'a_to_b' ? p.company_a_code : p.company_b_code
                        const receiver = dir === 'a_to_b' ? p.company_b_code : p.company_a_code
                        return (
                          <div key={i} className="text-xs text-zinc-400">
                            <span className="text-amber-400 font-semibold tabular-nums">{formatEur(netAbs)}</span>
                            {' '}{payer} → {receiver}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-zinc-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {item.total_compensated_cents != null ? (
                    <span className="text-emerald-400 font-semibold tabular-nums">
                      {formatEur(item.total_compensated_cents)}
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

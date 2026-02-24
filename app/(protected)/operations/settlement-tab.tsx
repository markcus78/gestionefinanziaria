'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { markSettled } from './actions'
import type { CollectionWithChannel } from '@/lib/types/database'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function payoutStatus(settlementDate: string) {
  const today = new Date().toISOString().split('T')[0]
  if (settlementDate < today) return 'late'
  if (settlementDate === today) return 'today'
  return 'upcoming'
}

type Props = {
  pendingSettlements: CollectionWithChannel[]
}

export default function SettlementTab({ pendingSettlements }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [settling, setSettling] = useState<string | null>(null)

  function handleSettle(id: string) {
    setSettling(id)
    startTransition(async () => {
      await markSettled(id)
      setSettling(null)
      router.refresh()
    })
  }

  if (pendingSettlements.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
        </div>
        <p className="text-zinc-300 text-sm font-medium">Tutto liquidato</p>
        <p className="text-zinc-500 text-sm mt-1">Nessun payout in attesa.</p>
      </div>
    )
  }

  const lateCount = pendingSettlements.filter(
    r => r.settlement_expected_date && payoutStatus(r.settlement_expected_date) === 'late'
  ).length

  const totalNet = pendingSettlements.reduce((s, r) => s + r.net_amount_cents, 0)

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-zinc-400">
          {pendingSettlements.length} payout in attesa
          {' · '}
          <span className="text-emerald-400 font-medium">{formatEur(totalNet)} netto</span>
        </span>
        {lateCount > 0 && (
          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
            {lateCount} in ritardo
          </span>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Canale</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Data incasso</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Lordo</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Comm.</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Netto</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Payout previsto</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {pendingSettlements.map(row => {
              const status = row.settlement_expected_date
                ? payoutStatus(row.settlement_expected_date)
                : 'upcoming'

              return (
                <tr key={row.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                  <td className="px-4 py-2.5 text-zinc-200 font-medium">
                    {row.cash_channels.name}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 tabular-nums">
                    {formatDate(row.collection_date)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-300 tabular-nums">
                    {formatEur(row.gross_amount_cents)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-400 tabular-nums">
                    {row.commission_cents > 0 ? formatEur(row.commission_cents) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-400 font-semibold tabular-nums">
                    {formatEur(row.net_amount_cents)}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.settlement_expected_date ? (
                      <span className={`text-sm font-medium ${
                        status === 'late'    ? 'text-red-400' :
                        status === 'today'   ? 'text-amber-400' :
                                              'text-zinc-300'
                      }`}>
                        {formatDate(row.settlement_expected_date)}
                        {status === 'late'  && <span className="ml-1 text-xs">(in ritardo)</span>}
                        {status === 'today' && <span className="ml-1 text-xs">(oggi)</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleSettle(row.id)}
                      disabled={settling === row.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50 ml-auto"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {settling === row.id ? 'Salvataggio…' : 'Liquidato'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

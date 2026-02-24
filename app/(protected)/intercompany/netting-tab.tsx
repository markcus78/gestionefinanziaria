'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { executeNettingPair } from './actions'
import type { NettingPair } from './page'

type Props = {
  pairs: NettingPair[]
  unmappedCount: number
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

export default function NettingTab({ pairs, unmappedCount }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [executing, setExecuting] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function handleExecute(pair: NettingPair) {
    const allIds = [...pair.a_to_b_item_ids, ...pair.b_to_a_item_ids]
    const netAbs = Math.abs(pair.net_cents)
    const netDir = pair.net_cents > 0 ? 'a_to_b' : pair.net_cents < 0 ? 'b_to_a' : 'zero'

    setExecuting(pair.key)
    setErrors(e => { const n = { ...e }; delete n[pair.key]; return n })

    startTransition(async () => {
      const result = await executeNettingPair(allIds, {
        company_a_code: pair.company_a.code,
        company_b_code: pair.company_b.code,
        gross_a_to_b_cents: pair.a_to_b_cents,
        gross_b_to_a_cents: pair.b_to_a_cents,
        net_cents: netAbs,
        net_direction: netDir,
      })
      setExecuting(null)
      if (result?.error) {
        setErrors(e => ({ ...e, [pair.key]: result.error! }))
      } else {
        router.refresh()
      }
    })
  }

  if (pairs.length === 0) {
    return (
      <div className="space-y-3">
        {unmappedCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {unmappedCount} partite con controparte non mappata — non incluse nel netting.
          </div>
        )}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
          <p className="text-zinc-300 text-sm font-medium">Nessuna posizione da nettare</p>
          <p className="text-zinc-600 text-xs mt-1">Tutte le partite intercompany sono già state regolate.</p>
        </div>
      </div>
    )
  }

  // Totale compensabile su tutte le coppie
  const totalCompensable = pairs.reduce(
    (s, p) => s + 2 * Math.min(p.a_to_b_cents, p.b_to_a_cents), 0
  )
  const totalNet = pairs.reduce((s, p) => s + Math.abs(p.net_cents), 0)

  return (
    <div className="space-y-4">
      {unmappedCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {unmappedCount} partite con controparte non mappata — non incluse nel netting.
        </div>
      )}

      {/* Riepilogo globale */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <div className="text-xs text-zinc-500 mb-1">Coppie da nettare</div>
          <div className="text-lg font-bold text-zinc-100">{pairs.length}</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
          <div className="text-xs text-emerald-500 mb-1">Importo compensabile</div>
          <div className="text-lg font-bold text-emerald-400">{formatEur(totalCompensable)}</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
          <div className="text-xs text-amber-500 mb-1">Pagamenti netti residui</div>
          <div className="text-lg font-bold text-amber-400">{formatEur(totalNet)}</div>
        </div>
      </div>

      {/* Schede per coppia */}
      <div className="space-y-3">
        {pairs.map(pair => {
          const isExec    = executing === pair.key
          const errMsg    = errors[pair.key]
          const netAbs    = Math.abs(pair.net_cents)
          const isANet    = pair.net_cents >= 0
          const payer     = isANet ? pair.company_a : pair.company_b
          const receiver  = isANet ? pair.company_b : pair.company_a
          const compensated = 2 * Math.min(pair.a_to_b_cents, pair.b_to_a_cents)
          const totalItems = pair.a_to_b_item_ids.length + pair.b_to_a_item_ids.length

          return (
            <div key={pair.key} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start gap-4">
                {/* Info coppia */}
                <div className="flex-1 space-y-3">
                  {/* Header coppia */}
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm font-bold text-zinc-100">
                      {pair.company_a.code}
                    </span>
                    <span className="text-zinc-600 text-sm">↔</span>
                    <span className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm font-bold text-zinc-100">
                      {pair.company_b.code}
                    </span>
                    <span className="text-xs text-zinc-600 ml-1">
                      {totalItems} partite
                    </span>
                  </div>

                  {/* Flussi lordi */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
                      <div className="text-zinc-500 mb-0.5">
                        {pair.company_a.code} → {pair.company_b.code}
                      </div>
                      <div className="text-red-300 font-semibold tabular-nums">
                        {formatEur(pair.a_to_b_cents)}
                      </div>
                      <div className="text-zinc-600">{pair.a_to_b_item_ids.length} partite</div>
                    </div>
                    <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
                      <div className="text-zinc-500 mb-0.5">
                        {pair.company_b.code} → {pair.company_a.code}
                      </div>
                      <div className="text-red-300 font-semibold tabular-nums">
                        {formatEur(pair.b_to_a_cents)}
                      </div>
                      <div className="text-zinc-600">{pair.b_to_a_item_ids.length} partite</div>
                    </div>
                  </div>

                  {/* Risultato netting */}
                  <div className="flex items-center gap-4 text-sm border-t border-zinc-800 pt-3">
                    {compensated > 0 && (
                      <div>
                        <span className="text-zinc-500">Compensato: </span>
                        <span className="text-emerald-400 font-semibold tabular-nums">
                          {formatEur(compensated)}
                        </span>
                      </div>
                    )}
                    <div>
                      {netAbs === 0 ? (
                        <span className="text-emerald-400 font-semibold">Saldo zero — nessun pagamento netto</span>
                      ) : (
                        <>
                          <span className="text-zinc-400">Pagamento netto: </span>
                          <span className="text-amber-400 font-bold tabular-nums">{formatEur(netAbs)}</span>
                          <span className="text-zinc-400"> da </span>
                          <span className="text-zinc-100 font-semibold">{payer.code}</span>
                          <span className="text-zinc-400"> a </span>
                          <span className="text-zinc-100 font-semibold">{receiver.code}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {errMsg && (
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-1.5">
                      Errore: {errMsg}
                    </div>
                  )}
                </div>

                {/* Pulsante esecuzione */}
                <button
                  onClick={() => handleExecute(pair)}
                  disabled={!!executing}
                  className="shrink-0 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {isExec ? 'Esecuzione…' : 'Esegui netting'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import type { ICRow } from './page'

type Props = {
  icRows: ICRow[]
  unmappedCount: number
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Da pagare',  cls: 'bg-amber-500/20 text-amber-400' },
  scheduled: { label: 'Pianificato', cls: 'bg-blue-500/20 text-blue-400' },
  postponed: { label: 'Posticipato', cls: 'bg-zinc-500/20 text-zinc-400' },
  disputed:  { label: 'Contestato', cls: 'bg-red-500/20 text-red-400' },
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PartiteTab({ icRows, unmappedCount }: Props) {
  const today = new Date().toISOString().split('T')[0]

  if (icRows.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500 text-sm">Nessuna partita intercompany attiva.</p>
        <p className="text-zinc-600 text-xs mt-1">Le partite vengono rilevate automaticamente all&apos;importazione degli XLS.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {unmappedCount > 0 && (
        <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-400">
          {unmappedCount} partite con controparte non mappata (es. GIMS) — escluse dal calcolo netting.
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Società</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Flusso</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Controparte</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Descrizione</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Scadenza</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Importo</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Stato</th>
            </tr>
          </thead>
          <tbody>
            {icRows.map(row => {
              const isOut     = row.flow_type === 'out'
              const isOverdue = row.due_date < today
              const st = STATUS_LABELS[row.status] ?? { label: row.status, cls: 'bg-zinc-700 text-zinc-400' }
              const desc = row.account_description || row.supplier_name || '—'

              return (
                <tr key={row.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                  <td className="px-4 py-2.5 font-medium text-zinc-200">{row.company_code}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      isOut ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {isOut ? 'Uscita' : 'Entrata'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.counterpart_code
                      ? <span className="text-zinc-200 font-medium">{row.counterpart_code}</span>
                      : <span className="text-amber-400 text-xs">? non mappata</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-zinc-400 max-w-xs truncate" title={desc}>{desc}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${
                    isOverdue ? 'text-red-400 font-semibold' : 'text-zinc-400'
                  }`}>
                    {formatDate(row.due_date)}
                    {isOverdue && <span className="ml-1">⚠</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                    isOut ? 'text-red-300' : 'text-emerald-300'
                  }`}>
                    {isOut ? '–' : '+'}{formatEur(row.amount_cents)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${st.cls}`}>
                      {st.label}
                    </span>
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

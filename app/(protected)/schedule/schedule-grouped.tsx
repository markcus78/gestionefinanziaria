'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import RowActions from './row-actions'
import type { PaymentScheduleItem, PaymentStatus } from '@/lib/types/database'

type Props = {
  rows: PaymentScheduleItem[]
  today: string
  companyCodeMap?: Record<string, string>
  showCompany?: boolean
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

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

export default function ScheduleGrouped({ rows, today, companyCodeMap, showCompany }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const sp       = useSearchParams()

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

  if (rows.length === 0) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80">
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Scadenza</th>
              {showCompany && <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Soc.</th>}
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Fornitore</th>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Documento</th>
              <th className="text-right px-3 py-2.5 text-zinc-400 font-medium">Importo</th>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Stato</th>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Tipo</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map(item => {
              const isOverdue = item.due_date < today && item.status !== 'paid' && item.status !== 'cancelled'
              const isNear    = !isOverdue && item.due_date <= (() => {
                const d = new Date(today); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]
              })() && item.status !== 'paid' && item.status !== 'cancelled'
              const dateClass = isOverdue ? 'text-red-400 font-semibold' : isNear ? 'text-amber-400' : item.status === 'paid' || item.status === 'cancelled' ? 'text-zinc-500' : 'text-zinc-300'
              return (
                <tr key={item.id} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
                  <td className={`px-3 py-2 font-mono tabular-nums ${dateClass}`}>
                    {new Date(item.due_date + 'T00:00:00').toLocaleDateString('it-IT')}
                    {item.postponed_to && (
                      <span className="ml-1 text-purple-400">
                        → {new Date(item.postponed_to + 'T00:00:00').toLocaleDateString('it-IT')}
                      </span>
                    )}
                  </td>
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
    </div>
  )
}

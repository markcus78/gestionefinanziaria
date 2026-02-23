'use client'

import { useState, useTransition } from 'react'
import { updateSupplier } from './actions'
import type { SupplierRegistry, SupplierCategory } from '@/lib/types/database'
import type { SupplierAgg } from './page'

type Props = {
  suppliers: SupplierRegistry[]
  agg: Record<string, SupplierAgg>
}

const CATEGORIES: { value: SupplierCategory | ''; label: string }[] = [
  { value: '', label: '— nessuna —' },
  { value: 'utenze', label: 'Utenze' },
  { value: 'stipendi', label: 'Stipendi' },
  { value: 'tributi_f24', label: 'Tributi / F24' },
  { value: 'leasing_noleggio', label: 'Leasing / Noleggio' },
  { value: 'affitti', label: 'Affitti' },
  { value: 'fornitori_bar', label: 'Fornitori bar' },
  { value: 'professionisti', label: 'Professionisti' },
  { value: 'manutenzione', label: 'Manutenzione' },
  { value: 'forniture', label: 'Forniture' },
  { value: 'assicurazioni', label: 'Assicurazioni' },
  { value: 'intercompany', label: 'Intercompany' },
  { value: 'altro', label: 'Altro' },
]

function fmtAmt(cents: number) {
  if (cents === 0) return null
  return new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(cents / 100)
}

function AmtCell({ cents, warn }: { cents: number; warn?: boolean }) {
  const txt = fmtAmt(cents)
  if (!txt) return <span className="text-zinc-700">—</span>
  return <span className={warn ? 'text-red-400 font-medium' : 'text-zinc-300'}>{txt}</span>
}

function SupplierRow({ supplier, supplierAgg }: { supplier: SupplierRegistry; supplierAgg: SupplierAgg }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function update(data: Parameters<typeof updateSupplier>[1]) {
    setError(null)
    startTransition(async () => {
      const res = await updateSupplier(supplier.id, data)
      if (res.error) setError(res.error)
    })
  }

  return (
    <tr className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
      <td className="px-3 py-2.5 text-zinc-200 max-w-48 text-sm">
        <span className="block truncate">{supplier.supplier_name}</span>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </td>
      <td className="px-3 py-2.5 text-zinc-500 text-xs font-mono">
        {supplier.supplier_code ?? '—'}
      </td>
      <td className="px-3 py-2.5">
        <select
          defaultValue={supplier.category ?? ''}
          onChange={e => update({ category: (e.target.value as SupplierCategory) || null })}
          disabled={isPending}
          className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        >
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          defaultChecked={supplier.is_critical}
          onChange={e => update({ is_critical: e.target.checked })}
          disabled={isPending}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-red-500 focus:ring-red-500 focus:ring-1 disabled:opacity-50 cursor-pointer"
        />
      </td>
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          defaultChecked={supplier.accepts_postponement ?? false}
          onChange={e => update({ accepts_postponement: e.target.checked })}
          disabled={isPending}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-1 disabled:opacity-50 cursor-pointer"
        />
      </td>
      {/* Aggregated amounts */}
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        <AmtCell cents={supplierAgg.overdueCents} warn />
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        <AmtCell cents={supplierAgg.due7dCents} />
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        <AmtCell cents={supplierAgg.due30dCents} />
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        <AmtCell cents={supplierAgg.due90dCents} />
      </td>
    </tr>
  )
}

export default function SuppliersTab({ suppliers, agg }: Props) {
  if (!suppliers.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
        <p className="text-zinc-500 text-sm">
          Nessun fornitore trovato. Importa prima uno scadenzario XLS.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-200">Fornitori</p>
        <p className="text-xs text-zinc-500">{suppliers.length} fornitori</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-3 py-2 text-zinc-400 font-medium">Nome fornitore</th>
              <th className="text-left px-3 py-2 text-zinc-400 font-medium">Codice</th>
              <th className="text-left px-3 py-2 text-zinc-400 font-medium">Categoria</th>
              <th className="text-center px-3 py-2 text-zinc-400 font-medium">Critico</th>
              <th className="text-center px-3 py-2 text-zinc-400 font-medium">Posticipo</th>
              <th className="text-right px-3 py-2 text-red-400 font-medium">Scaduto</th>
              <th className="text-right px-3 py-2 text-zinc-400 font-medium">7 gg</th>
              <th className="text-right px-3 py-2 text-zinc-400 font-medium">30 gg</th>
              <th className="text-right px-3 py-2 text-zinc-400 font-medium">90 gg</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map(s => (
              <SupplierRow
                key={s.id}
                supplier={s}
                supplierAgg={agg[s.id] ?? { overdueCents: 0, due7dCents: 0, due30dCents: 0, due90dCents: 0 }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

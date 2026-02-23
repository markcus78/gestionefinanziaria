'use client'

import { useState, useTransition } from 'react'
import { updateSupplier } from './actions'
import type { SupplierRegistry, SupplierCategory } from '@/lib/types/database'

type Props = {
  suppliers: SupplierRegistry[]
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

function SupplierRow({ supplier }: { supplier: SupplierRegistry }) {
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
      <td className="px-3 py-2.5 text-zinc-200 max-w-56 truncate text-sm">
        {supplier.supplier_name}
        {error && <span className="text-xs text-red-400 ml-2">{error}</span>}
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
    </tr>
  )
}

export default function SuppliersTab({ suppliers }: Props) {
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
              <th className="text-center px-3 py-2 text-zinc-400 font-medium">Accetta posticipo</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map(s => (
              <SupplierRow key={s.id} supplier={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

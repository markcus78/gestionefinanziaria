'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, BarChart2, Check, X } from 'lucide-react'
import { updatePriorityOverride } from './actions'
import { simulatePaymentsFromTimeline, priorityOf, type PaymentItem, type TreasuryDay } from '@/lib/treasury-calc'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatDateShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
}

function priorityColor(priority: number) {
  if (priority >= 12) return 'bg-red-500/20 text-red-400'
  if (priority >= 8)  return 'bg-orange-500/20 text-orange-400'
  if (priority >= 5)  return 'bg-amber-500/20 text-amber-400'
  return 'bg-zinc-700 text-zinc-400'
}

// ── PriorityEditor ─────────────────────────────────────────────────────────────

function PriorityEditor({ payment }: { payment: PaymentItem }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(payment.priorityOverride ?? ''))

  const current = priorityOf(payment)

  function save() {
    const n = val === '' ? null : Math.min(10, Math.max(1, parseInt(val)))
    startTransition(async () => {
      await updatePriorityOverride(payment.id, n)
      router.refresh()
    })
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`px-1.5 py-0.5 rounded text-xs font-bold ${priorityColor(current)} cursor-pointer hover:opacity-80`}
        title="Clicca per modificare priorità"
      >
        {current || '—'}
        {payment.priorityOverride != null && <span className="ml-0.5 text-[10px] opacity-60">✏</span>}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={1}
        max={10}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        autoFocus
        className="w-10 px-1 py-0.5 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-200 text-center focus:outline-none"
        placeholder="1-10"
      />
      <button onClick={save} className="text-emerald-400 hover:text-emerald-300"><Check className="w-3 h-3" /></button>
      <button onClick={() => setEditing(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

type Company = { id: string; code: string }

type Props = {
  payments: PaymentItem[]
  timeline: TreasuryDay[]
  initialBalance: number
  today: string
  view: 'single' | 'consolidated'
  companies: Company[]
}

export default function PaymentsTab({ payments, timeline, initialBalance, today, view, companies }: Props) {
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple')
  const [filter, setFilter] = useState<'all' | 'overdue' | 'critical'>('all')

  // Mappa data → saldo fine giornata (per modalità semplice)
  const balanceByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of timeline) map.set(d.date, d.balance)
    return map
  }, [timeline])

  // Simulazione avanzata
  const simResult = useMemo(() => {
    if (mode !== 'advanced') return {}
    return simulatePaymentsFromTimeline(timeline, payments, initialBalance)
  }, [mode, timeline, payments, initialBalance])

  // Ordina: priority decrescente → data crescente
  const sorted = useMemo(() =>
    [...payments].sort((a, b) => {
      const pa = priorityOf(a), pb = priorityOf(b)
      if (pb !== pa) return pb - pa
      return a.dueDate.localeCompare(b.dueDate)
    })
  , [payments])

  // Filtra
  const filtered = sorted.filter(p => {
    if (filter === 'overdue') return p.dueDate < today
    if (filter === 'critical') return p.isCritical
    return true
  })

  // Mappa companyId → code (per consolidato)
  const companyCodeMap = Object.fromEntries(companies.map(c => [c.id, c.code]))

  // Semplice: colore copertura
  function coverageColor(p: PaymentItem): string {
    const bal = balanceByDate.get(p.dueDate) ?? (timeline[timeline.length - 1]?.balance ?? 0)
    if (bal >= p.amountCents) return 'text-emerald-400'
    if (bal >= 0) return 'text-amber-400'
    return 'text-red-400'
  }

  function coverageLabel(p: PaymentItem): string {
    const bal = balanceByDate.get(p.dueDate) ?? (timeline[timeline.length - 1]?.balance ?? 0)
    if (bal >= p.amountCents) return '✓ Coperto'
    if (bal >= 0) return '~ Parziale'
    return '✗ Scoperto'
  }

  // Avanzata
  function advancedLabel(p: PaymentItem): { text: string; color: string } {
    if (mode !== 'advanced') return { text: '', color: '' }
    const date = simResult[p.id]
    if (!date) return { text: 'Non coperto', color: 'text-red-400' }
    if (date === p.dueDate) return { text: '✓ Coperto', color: 'text-emerald-400' }
    if (date > p.dueDate) return { text: `Dal ${formatDateShort(date)}`, color: 'text-amber-400' }
    return { text: `Dal ${formatDateShort(date)}`, color: 'text-zinc-400' }
  }

  const totalOut = filtered.reduce((s, p) => s + p.amountCents, 0)
  const overdueCount = payments.filter(p => p.dueDate < today).length

  if (payments.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500 text-sm">Nessun pagamento in scadenza nei prossimi 60 giorni.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filtri */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {[
            { id: 'all', label: `Tutti (${payments.length})` },
            { id: 'overdue', label: `Scaduti (${overdueCount})` },
            { id: 'critical', label: `Critici (${payments.filter(p => p.isCritical).length})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as typeof filter)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Modalità */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 ml-auto">
          <button
            onClick={() => setMode('simple')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'simple' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Zap className="w-3 h-3" />
            Semplice
          </button>
          <button
            onClick={() => setMode('advanced')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'advanced' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart2 className="w-3 h-3" />
            Simulazione
          </button>
        </div>
      </div>

      {mode === 'advanced' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-400">
          <BarChart2 className="w-3.5 h-3.5 shrink-0" />
          Simulazione: pagamenti assegnati in ordine di priorità, su saldo incassi previsti. I pagamenti ordinati più in basso potrebbero slittare.
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-zinc-400">
        <span>{filtered.length} pagamenti · <span className="text-red-400 font-medium">{formatEur(totalOut)}</span> totali</span>
        {overdueCount > 0 && <span className="text-red-400">{overdueCount} scaduti</span>}
      </div>

      {/* Tabella */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80">
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide w-8">P</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Fornitore</th>
              {view === 'consolidated' && (
                <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide w-16">Soc.</th>
              )}
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Categoria</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Scadenza</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Importo</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Copertura</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const isOverdue  = p.dueDate < today
              const adv        = advancedLabel(p)

              return (
                <tr key={p.id} className={`border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20 ${isOverdue ? 'bg-red-500/3' : ''}`}>
                  {/* Priorità (editabile) */}
                  <td className="px-3 py-2">
                    <PriorityEditor payment={p} />
                  </td>

                  {/* Fornitore */}
                  <td className="px-3 py-2 max-w-44">
                    <div className="flex items-center gap-1.5">
                      {p.isCritical && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Critico" />
                      )}
                      <span className="text-zinc-200 truncate text-xs">
                        {p.supplierName ?? p.accountDescription ?? '—'}
                      </span>
                    </div>
                    {p.isIntercompany && (
                      <span className="text-xs text-amber-500 ml-3">IC</span>
                    )}
                  </td>

                  {/* Società (consolidato) */}
                  {view === 'consolidated' && (
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {companyCodeMap[p.companyId] ?? '—'}
                    </td>
                  )}

                  {/* Categoria */}
                  <td className="px-3 py-2">
                    {p.category ? (
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                        {p.category.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>

                  {/* Scadenza */}
                  <td className="px-3 py-2">
                    <span className={`text-xs tabular-nums font-mono ${isOverdue ? 'text-red-400 font-semibold' : 'text-zinc-300'}`}>
                      {formatDateShort(p.dueDate)}
                    </span>
                    {isOverdue && <span className="ml-1 text-red-500 text-xs">!</span>}
                  </td>

                  {/* Importo */}
                  <td className="px-3 py-2 text-right text-xs text-red-400 font-medium tabular-nums">
                    -{formatEur(p.amountCents)}
                  </td>

                  {/* Copertura */}
                  <td className="px-3 py-2 text-right">
                    {mode === 'simple' ? (
                      <span className={`text-xs font-medium ${coverageColor(p)}`}>
                        {coverageLabel(p)}
                      </span>
                    ) : (
                      <span className={`text-xs font-medium ${adv.color}`}>
                        {adv.text}
                      </span>
                    )}
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

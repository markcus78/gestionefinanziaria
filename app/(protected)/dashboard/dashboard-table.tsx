'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, Clock, CalendarCheck, RotateCcw, Loader2 } from 'lucide-react'
import { markPaid, markPostponed, markScheduled, resetToPending } from './actions'
import type { PaymentStatus } from '@/lib/types/database'

type Row = {
  id: string
  company_id: string
  supplier_name: string | null
  account_description: string | null
  amount_cents: number
  status: PaymentStatus
  document_type: string | null
  document_number: string | null
  due_date: string
}

type Props = {
  rows: Row[]
  today: string
  companyMap: Record<string, string>
  windowTotal: number
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; cls: string }> = {
    pending:   { label: 'Pendente',    cls: 'bg-amber-500/20 text-amber-400' },
    scheduled: { label: 'Programmato', cls: 'bg-blue-500/20 text-blue-400' },
    paid:      { label: 'Pagato',      cls: 'bg-emerald-500/20 text-emerald-400' },
    partial:   { label: 'Parziale',    cls: 'bg-cyan-500/20 text-cyan-400' },
    postponed: { label: 'Posticipato', cls: 'bg-purple-500/20 text-purple-400' },
    disputed:  { label: 'Contestato',  cls: 'bg-red-500/20 text-red-400' },
    cancelled: { label: 'Annullato',   cls: 'bg-zinc-700 text-zinc-400' },
  }
  const { label, cls } = map[status] ?? map.pending
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>
}

function formatDate(dateStr: string, today: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const t = new Date(today + 'T00:00:00')
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff === -1) return 'Ieri'
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

function dateCellCls(dateStr: string, today: string) {
  if (dateStr < today) return 'text-red-400 font-semibold'
  if (dateStr === today) return 'text-amber-400 font-semibold'
  return 'text-zinc-400'
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group">
      {children}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-zinc-700 text-zinc-100 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
        {label}
      </span>
    </div>
  )
}

function RowActions({ item }: { item: Row }) {
  const router = useRouter()
  const [showPaid, setShowPaid] = useState(false)
  const [showPostpone, setShowPostpone] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const canMarkPaid = ['pending', 'scheduled', 'postponed', 'partial'].includes(item.status)
  const canPostpone = ['pending', 'scheduled', 'partial'].includes(item.status)
  const canSchedule = ['pending', 'postponed', 'partial'].includes(item.status)
  const canReset    = ['paid', 'scheduled', 'postponed', 'partial'].includes(item.status)

  function run(fn: () => Promise<{ error?: string; success?: boolean }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-0.5">
      {error && <span className="text-xs text-red-400 mr-1">{error}</span>}

      {isPending
        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500 mx-1" />
        : (
          <>
            {canSchedule && (
              <Tooltip label="Programma">
                <button
                  onClick={() => run(() => markScheduled(item.id))}
                  className="p-1 text-blue-400 hover:bg-zinc-800 rounded transition-colors"
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}
            {canMarkPaid && (
              <Tooltip label="Segna pagato">
                <button
                  onClick={() => setShowPaid(true)}
                  className="p-1 text-emerald-400 hover:bg-zinc-800 rounded transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}
            {canPostpone && (
              <Tooltip label="Posticipa">
                <button
                  onClick={() => setShowPostpone(true)}
                  className="p-1 text-amber-400 hover:bg-zinc-800 rounded transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}
            {canReset && (
              <Tooltip label="Ripristina">
                <button
                  onClick={() => run(() => resetToPending(item.id))}
                  className="p-1 text-zinc-400 hover:bg-zinc-800 rounded transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}
          </>
        )
      }

      {showPaid && (
        <PaidModal
          item={item}
          onClose={() => setShowPaid(false)}
          onConfirm={(date, cents) => {
            setShowPaid(false)
            run(() => markPaid(item.id, date, cents))
          }}
        />
      )}
      {showPostpone && (
        <PostponeModal
          item={item}
          onClose={() => setShowPostpone(false)}
          onConfirm={(date, notes) => {
            setShowPostpone(false)
            run(() => markPostponed(item.id, date, notes))
          }}
        />
      )}
    </div>
  )
}

function PaidModal({
  item, onClose, onConfirm,
}: {
  item: Row
  onClose: () => void
  onConfirm: (date: string, cents: number) => void
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState(
    (Math.abs(item.amount_cents) / 100).toFixed(2)
  )
  const displayAmount = formatEur(Math.abs(item.amount_cents))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cents = Math.round(parseFloat(amount) * 100)
    if (isNaN(cents) || cents <= 0) return
    onConfirm(date, cents)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Segna come pagato</h3>
        <p className="text-xs text-zinc-400 mb-4 truncate">{item.supplier_name} — {displayAmount}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Data pagamento</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Importo pagato (€)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg font-medium"
            >
              Conferma
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg"
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PostponeModal({
  item, onClose, onConfirm,
}: {
  item: Row
  onClose: () => void
  onConfirm: (date: string, notes: string) => void
}) {
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    onConfirm(date, notes)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Posticipa scadenza</h3>
        <p className="text-xs text-zinc-400 mb-4 truncate">{item.supplier_name}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Nuova data scadenza</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Note (opzionale)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Motivo posticipo..."
              className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg font-medium"
            >
              Conferma
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg"
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function DashboardTable({ rows, today, companyMap, windowTotal }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400">
            <th className="text-left px-4 py-2.5 font-medium">Data</th>
            <th className="text-left px-4 py-2.5 font-medium">Soc.</th>
            <th className="text-left px-4 py-2.5 font-medium">Fornitore / Descrizione</th>
            <th className="text-left px-4 py-2.5 font-medium">Documento</th>
            <th className="text-right px-4 py-2.5 font-medium">Importo</th>
            <th className="text-left px-4 py-2.5 font-medium">Stato</th>
            <th className="text-center px-4 py-2.5 font-medium">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(item => (
            <tr key={item.id} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
              <td className={`px-4 py-2.5 tabular-nums ${dateCellCls(item.due_date, today)}`}>
                {formatDate(item.due_date, today)}
              </td>
              <td className="px-4 py-2.5">
                <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">
                  {companyMap[item.company_id] ?? '—'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-zinc-200 max-w-xs truncate">
                {item.supplier_name || item.account_description || '—'}
              </td>
              <td className="px-4 py-2.5 text-zinc-500 font-mono">
                {item.document_number || '—'}
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums text-red-400">
                -{formatEur(Math.abs(item.amount_cents))}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-4 py-2.5">
                <RowActions item={item} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-700 bg-zinc-800/50">
            <td colSpan={4} className="px-4 py-2.5 text-xs text-zinc-400 font-medium">Totale</td>
            <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-red-400">
              -{formatEur(windowTotal)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

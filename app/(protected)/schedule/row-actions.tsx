'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { MoreHorizontal, CreditCard, Clock, CalendarCheck, RotateCcw, Loader2 } from 'lucide-react'
import { markPaid, markPostponed, markScheduled, resetToPending } from './actions'
import type { PaymentScheduleItem } from '@/lib/types/database'

function todayISO() {
  return new Date().toISOString().split('T')[0]
}
function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

type Props = { item: PaymentScheduleItem }

export default function RowActions({ item }: Props) {
  const [open, setOpen] = useState(false)
  const [showPaid, setShowPaid] = useState(false)
  const [showPostpone, setShowPostpone] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const canMarkPaid = ['pending', 'scheduled', 'postponed'].includes(item.status)
  const canPostpone = ['pending', 'scheduled'].includes(item.status)
  const canSchedule = ['pending', 'postponed'].includes(item.status)
  const canReset = ['paid', 'scheduled', 'postponed'].includes(item.status)

  function run(fn: () => Promise<{ error?: string; success?: boolean }>) {
    setError(null)
    setOpen(false)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
    })
  }

  return (
    <div className="relative" ref={menuRef}>
      {error && (
        <span className="text-xs text-red-400 mr-2">{error}</span>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
      >
        {isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <MoreHorizontal className="w-3.5 h-3.5" />
        }
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-20 min-w-40 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 text-sm">
          {canSchedule && (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={() => run(() => markScheduled(item.id))}
            >
              <CalendarCheck className="w-3.5 h-3.5 text-blue-400" />
              Programma
            </button>
          )}
          {canMarkPaid && (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={() => { setOpen(false); setShowPaid(true) }}
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
              Segna pagato
            </button>
          )}
          {canPostpone && (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={() => { setOpen(false); setShowPostpone(true) }}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Posticipa
            </button>
          )}
          {canReset && (
            <>
              <div className="my-1 border-t border-zinc-800" />
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                onClick={() => run(() => resetToPending(item.id))}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Ripristina
              </button>
            </>
          )}
        </div>
      )}

      {/* Paid modal */}
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

      {/* Postpone modal */}
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
  item: PaymentScheduleItem
  onClose: () => void
  onConfirm: (date: string, cents: number) => void
}) {
  const [date, setDate] = useState(todayISO())
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
  item: PaymentScheduleItem
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

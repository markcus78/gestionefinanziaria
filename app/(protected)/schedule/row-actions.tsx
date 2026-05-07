'use client'

import { useState, useTransition } from 'react'
import { CreditCard, Clock, CalendarCheck, RotateCcw, Loader2, Shield, Scissors } from 'lucide-react'
import { markPaid, markPostponed, markScheduled, resetToPending, toggleRepaymentPlan, markPartiallyPaid } from './actions'
import type { PaymentScheduleItem } from '@/lib/types/database'

function todayISO() {
  return new Date().toISOString().split('T')[0]
}
function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
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

type Props = { item: PaymentScheduleItem }

export default function RowActions({ item }: Props) {
  const [showPaid, setShowPaid] = useState(false)
  const [showPartial, setShowPartial] = useState(false)
  const [showPostpone, setShowPostpone] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const canMarkPaid = ['pending', 'scheduled', 'postponed'].includes(item.status)
  const canPostpone = ['pending', 'scheduled'].includes(item.status)
  const canSchedule = ['pending', 'postponed'].includes(item.status)
  const canReset    = ['paid', 'scheduled', 'postponed'].includes(item.status)

  function run(fn: () => Promise<{ error?: string; success?: boolean }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
    })
  }

  return (
    <div className="flex items-center gap-0.5">
      {error && <span className="text-xs text-red-400 mr-1">{error}</span>}

      {isPending
        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500 mx-1" />
        : (
          <>
            <Tooltip label={item.is_repayment_plan ? "Rimuovi piano di rientro" : "Piano di rientro"}>
              <button
                onClick={() => run(() => toggleRepaymentPlan(item.id, !item.is_repayment_plan))}
                className={`p-1 rounded transition-colors ${
                  item.is_repayment_plan
                    ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
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
            {canMarkPaid && (
              <Tooltip label="Acconto parziale">
                <button
                  onClick={() => setShowPartial(true)}
                  className="p-1 text-orange-400 hover:bg-zinc-800 rounded transition-colors"
                >
                  <Scissors className="w-3.5 h-3.5" />
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
      {showPartial && (
        <PartialPaidModal
          item={item}
          onClose={() => setShowPartial(false)}
          onConfirm={(date, cents, residualDate) => {
            setShowPartial(false)
            run(() => markPartiallyPaid(item.id, date, cents, residualDate))
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

function PartialPaidModal({
  item, onClose, onConfirm,
}: {
  item: PaymentScheduleItem
  onClose: () => void
  onConfirm: (date: string, cents: number, residualDate: string) => void
}) {
  const totalCents = Math.abs(item.amount_cents)
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [residualDate, setResidualDate] = useState('')
  const [err, setErr] = useState('')

  const paidCents = Math.round(parseFloat(amount || '0') * 100)
  const residualCents = totalCents - paidCents

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (isNaN(paidCents) || paidCents <= 0) return setErr('Inserisci un importo valido')
    if (paidCents >= totalCents) return setErr('Per il saldo totale usa "Segna pagato"')
    if (!residualDate) return setErr('Inserisci la data per il saldo residuo')
    onConfirm(date, paidCents, residualDate)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Pagamento parziale (acconto)</h3>
        <p className="text-xs text-zinc-400 mb-4 truncate">
          {item.supplier_name} — totale {formatEur(totalCents)}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Data acconto</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Importo acconto (€)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={(totalCents / 100 - 0.01).toFixed(2)}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={`Max ${formatEur(totalCents - 1)}`}
              required
              className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Riepilogo residuo */}
          {paidCents > 0 && paidCents < totalCents && (
            <div className="px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <p className="text-xs text-orange-300">
                Residuo da saldare: <span className="font-semibold tabular-nums">{formatEur(residualCents)}</span>
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Nuova scadenza per il saldo</label>
            <input
              type="date"
              value={residualDate}
              onChange={e => setResidualDate(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-sm rounded-lg font-medium"
            >
              Conferma acconto
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

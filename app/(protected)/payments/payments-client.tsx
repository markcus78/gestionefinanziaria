'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, ChevronRight, ChevronDown } from 'lucide-react'
import {
  markPaid,
  markPartiallyPaid,
  markPostponed,
  markScheduled,
  resetToPending,
  createUrgentPayment,
} from './actions'

const formatEur = (cents: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)

type PaymentStatus = 'pending' | 'scheduled' | 'paid' | 'partial' | 'postponed' | 'disputed' | 'cancelled'

type Payment = {
  id: string
  company_id: string
  supplier_name: string | null
  account_description: string | null
  due_date: string
  amount_cents: number
  status: PaymentStatus
  entry_type: string
  commitment_type: string | null
  paid_amount_cents: number | null
  paid_date: string | null
  postponed_to: string | null
  postpone_notes: string | null
}

type Company = {
  id: string
  code: string
  name: string
}

type ModalState =
  | { type: 'markPaid'; payment: Payment }
  | { type: 'partialPay'; payment: Payment }
  | { type: 'postpone'; payment: Payment }
  | { type: 'urgent' }
  | null

type Props = {
  companies: Company[]
  payments: Payment[]
  today: string
  initialCompany: string
}

// ── Utility UI ────────────────────────────────────────────────────────────────

function ModalWrapper({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-zinc-100 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500'

// ── Badge ────────────────────────────────────────────────────────────────────

function StatusBadge({ payment }: { payment: Payment }) {
  const paid = payment.paid_amount_cents ?? 0

  switch (payment.status) {
    case 'pending':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Da pagare</span>
    case 'scheduled':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300">Programmato</span>
    case 'postponed':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300">Posticipato</span>
    case 'partial':
      return (
        <span
          className="text-xs px-2 py-0.5 rounded-full bg-cyan-900/60 text-cyan-300"
          title={paid > 0 ? `Già pagato ${formatEur(paid)}` : undefined}
        >
          Parziale {paid > 0 ? `(–${formatEur(paid)})` : ''}
        </span>
      )
    case 'paid':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/60 text-green-300">Pagato</span>
    default:
      return <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">{payment.status}</span>
  }
}

function TypeBadge({ entryType }: { entryType: string }) {
  return entryType === 'commitment'
    ? <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-400">Imp</span>
    : <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">Cont</span>
}

// ── Row ───────────────────────────────────────────────────────────────────────

function PaymentRow({
  payment,
  companies,
  view,
  onAction,
}: {
  payment: Payment
  companies: Company[]
  view: 'single' | 'consolidated'
  onAction: (action: 'paid' | 'partial' | 'postpone' | 'schedule' | 'reset', payment: Payment) => void
}) {
  const { status } = payment
  const company = companies.find(c => c.id === payment.company_id)
  const amountCents = Math.abs(payment.amount_cents)

  const canSchedule = status === 'pending' || status === 'postponed' || status === 'partial'
  const canPay = status === 'pending' || status === 'scheduled' || status === 'postponed' || status === 'partial'
  const canPostpone = status === 'pending' || status === 'scheduled' || status === 'postponed' || status === 'partial'
  const canReset = status === 'paid' || status === 'scheduled' || status === 'partial'

  const dateFmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
      <td className="px-3 py-2.5 text-sm text-zinc-300 whitespace-nowrap">
        {dateFmt(payment.due_date)}
        {payment.postponed_to && (
          <div className="text-xs text-amber-400">→ {dateFmt(payment.postponed_to)}</div>
        )}
      </td>
      {view === 'consolidated' && (
        <td className="px-3 py-2.5 text-xs text-zinc-500">{company?.code ?? '—'}</td>
      )}
      <td className="px-3 py-2.5 text-sm text-zinc-100 max-w-[160px] truncate">
        {payment.supplier_name ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-sm text-zinc-400 max-w-[200px] truncate">
        {payment.account_description ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-sm text-zinc-100 text-right font-medium whitespace-nowrap">
        {formatEur(amountCents)}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge payment={payment} />
      </td>
      <td className="px-3 py-2.5">
        <TypeBadge entryType={payment.entry_type} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 justify-end flex-wrap">
          {canSchedule && (
            <button
              onClick={() => onAction('schedule', payment)}
              className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Programma
            </button>
          )}
          {canPay && (
            <>
              <button
                onClick={() => onAction('paid', payment)}
                className="text-xs px-2 py-1 rounded bg-green-900/60 text-green-300 hover:bg-green-900 transition-colors"
              >
                Paga
              </button>
              <button
                onClick={() => onAction('partial', payment)}
                className="text-xs px-2 py-1 rounded bg-blue-900/60 text-blue-300 hover:bg-blue-900 transition-colors"
              >
                Parziale
              </button>
            </>
          )}
          {canPostpone && (
            <button
              onClick={() => onAction('postpone', payment)}
              className="text-xs px-2 py-1 rounded bg-amber-900/60 text-amber-300 hover:bg-amber-900 transition-colors"
            >
              Posticipa
            </button>
          )}
          {canReset && (
            <button
              onClick={() => onAction('reset', payment)}
              className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title,
  titleClass,
  payments,
  companies,
  view,
  onAction,
  defaultOpen = true,
}: {
  title: string
  titleClass: string
  payments: Payment[]
  companies: Company[]
  view: 'single' | 'consolidated'
  onAction: (action: 'paid' | 'partial' | 'postpone' | 'schedule' | 'reset', payment: Payment) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const total = payments.reduce((s, p) => s + Math.abs(p.amount_cents), 0)

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          {open
            ? <ChevronDown className="w-4 h-4 text-zinc-500" />
            : <ChevronRight className="w-4 h-4 text-zinc-500" />
          }
          <span className={`font-semibold text-sm ${titleClass}`}>{title}</span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{payments.length}</span>
        </div>
        <span className="text-sm font-medium text-zinc-300">{formatEur(total)}</span>
      </button>

      {open && payments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Data</th>
                {view === 'consolidated' && (
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Soc</th>
                )}
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Fornitore</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Descrizione</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Importo</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Stato</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Tipo</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  companies={companies}
                  view={view}
                  onAction={onAction}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && payments.length === 0 && (
        <p className="px-4 py-3 text-sm text-zinc-600 italic">Nessun pagamento</p>
      )}
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────────

function ModalMarkPaid({
  payment,
  today,
  onClose,
}: {
  payment: Payment
  today: string
  onClose: () => void
}) {
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState(String(Math.abs(payment.amount_cents) / 100).replace('.', ','))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleSubmit() {
    const amountCents = Math.round(parseFloat(amount.replace(',', '.')) * 100)
    if (isNaN(amountCents) || amountCents <= 0) { setError('Importo non valido'); return }
    startTransition(async () => {
      const res = await markPaid(payment.id, date, amountCents)
      if ('error' in res) { setError(String(res.error)); return }
      router.refresh()
      onClose()
    })
  }

  return (
    <ModalWrapper title="Segna pagato" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Data pagamento">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Importo pagato (€)">
          <input type="text" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg disabled:opacity-50"
          >
            {isPending ? 'Salvataggio…' : 'Conferma'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

function ModalPartialPay({
  payment,
  today,
  onClose,
}: {
  payment: Payment
  today: string
  onClose: () => void
}) {
  const router = useRouter()
  const currentCents = Math.abs(payment.amount_cents)
  const alreadyPaid = payment.paid_amount_cents ?? 0
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const paidCents = Math.round(parseFloat(amount.replace(',', '.') || '0') * 100)
  const residualCents = Math.max(0, currentCents - paidCents)

  function handleSubmit() {
    if (isNaN(paidCents) || paidCents <= 0) { setError('Importo non valido'); return }
    if (paidCents >= currentCents) { setError('Per il totale usa "Paga"'); return }
    startTransition(async () => {
      const res = await markPartiallyPaid(payment.id, date, paidCents)
      if ('error' in res) { setError(String(res.error)); return }
      router.refresh()
      onClose()
    })
  }

  return (
    <ModalWrapper title="Pagamento parziale" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-sm text-zinc-400 space-y-0.5">
          <div>
            Importo da pagare:{' '}
            <span className="text-zinc-100 font-medium">{formatEur(currentCents)}</span>
          </div>
          {alreadyPaid > 0 && (
            <div className="text-xs text-zinc-500">
              Già pagato in precedenza: {formatEur(alreadyPaid)}
            </div>
          )}
        </div>
        <Field label="Data pagamento">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Importo pagato ora (€)">
          <input
            type="text"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0,00"
            className={inputCls}
          />
        </Field>
        {paidCents > 0 && paidCents < currentCents && (
          <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-3 py-2 text-sm text-cyan-300">
            Residuo dopo questo pagamento: <span className="font-medium">{formatEur(residualCents)}</span>
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {isPending ? 'Salvataggio…' : 'Conferma'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

function ModalPostpone({
  payment,
  onClose,
}: {
  payment: Payment
  onClose: () => void
}) {
  const router = useRouter()
  const [date, setDate] = useState(payment.postponed_to ?? '')
  const [notes, setNotes] = useState(payment.postpone_notes ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleSubmit() {
    if (!date) { setError('Inserisci la nuova data'); return }
    startTransition(async () => {
      const res = await markPostponed(payment.id, date, notes)
      if ('error' in res) { setError(String(res.error)); return }
      router.refresh()
      onClose()
    })
  }

  return (
    <ModalWrapper title="Posticipa pagamento" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nuova data scadenza">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Note (opzionale)">
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 text-white rounded-lg disabled:opacity-50"
          >
            {isPending ? 'Salvataggio…' : 'Posticipa'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

function ModalUrgent({
  companies,
  today,
  onClose,
}: {
  companies: Company[]
  today: string
  onClose: () => void
}) {
  const router = useRouter()
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [supplier, setSupplier] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleSubmit() {
    if (!supplier.trim()) { setError('Inserisci il fornitore'); return }
    const amountCents = Math.round(parseFloat(amount.replace(',', '.')) * 100)
    if (isNaN(amountCents) || amountCents <= 0) { setError('Importo non valido'); return }
    if (!date) { setError('Inserisci la data'); return }
    startTransition(async () => {
      const res = await createUrgentPayment({
        company_id: companyId,
        supplier_name: supplier,
        description,
        amount_cents: amountCents,
        due_date: date,
        notes,
      })
      if ('error' in res) { setError(String(res.error)); return }
      router.refresh()
      onClose()
    })
  }

  return (
    <ModalWrapper title="Pagamento urgente" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Società">
          <select value={companyId} onChange={e => setCompanyId(e.target.value)} className={inputCls}>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Fornitore">
          <input
            type="text"
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
            placeholder="Nome fornitore"
            className={inputCls}
          />
        </Field>
        <Field label="Descrizione (opzionale)">
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Importo (€)">
            <input
              type="text"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0,00"
              className={inputCls}
            />
          </Field>
          <Field label="Data scadenza">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Note (opzionale)">
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 text-sm bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg disabled:opacity-50"
          >
            {isPending ? 'Salvataggio…' : 'Crea pagamento'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PaymentsClient({ companies, payments, today, initialCompany }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [modal, setModal] = useState<ModalState>(null)
  const [, startTransition] = useTransition()

  const view = (sp.get('view') ?? 'single') as 'single' | 'consolidated'
  const companyCode = sp.get('company') || initialCompany

  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    router.push(`/payments?${params.toString()}`)
  }

  const company = (companyCode ? companies.find(c => c.code === companyCode) : null) ?? companies[0] ?? null

  const filtered = view === 'consolidated'
    ? payments
    : payments.filter(p => p.company_id === company?.id)

  const overdue   = filtered.filter(p => p.due_date < today && p.status !== 'paid')
  const dueToday  = filtered.filter(p => p.due_date === today)
  const upcoming  = filtered.filter(p => p.due_date > today)

  function handleAction(
    action: 'paid' | 'partial' | 'postpone' | 'schedule' | 'reset',
    payment: Payment
  ) {
    if (action === 'paid') {
      setModal({ type: 'markPaid', payment })
    } else if (action === 'partial') {
      setModal({ type: 'partialPay', payment })
    } else if (action === 'postpone') {
      setModal({ type: 'postpone', payment })
    } else if (action === 'schedule') {
      startTransition(async () => {
        await markScheduled(payment.id)
        router.refresh()
      })
    } else if (action === 'reset') {
      startTransition(async () => {
        await resetToPending(payment.id)
        router.refresh()
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Toggle single/consolidato */}
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            <button
              onClick={() => navigate({ view: 'single' })}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'single' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Singola
            </button>
            <button
              onClick={() => navigate({ view: 'consolidated' })}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'consolidated' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Consolidato
            </button>
          </div>

          {/* Selettore società (solo single) */}
          {view === 'single' && (
            <div className="flex gap-1">
              {companies.map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate({ company: c.code })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    company?.id === c.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setModal({ type: 'urgent' })}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Pagamento urgente
        </button>
      </div>

      {/* Sezioni */}
      <Section
        title="Scaduto"
        titleClass="text-red-400"
        payments={overdue}
        companies={companies}
        view={view}
        onAction={handleAction}
        defaultOpen={true}
      />
      <Section
        title="Oggi"
        titleClass="text-zinc-100"
        payments={dueToday}
        companies={companies}
        view={view}
        onAction={handleAction}
        defaultOpen={true}
      />
      <Section
        title="Prossimi 15 giorni"
        titleClass="text-blue-300"
        payments={upcoming}
        companies={companies}
        view={view}
        onAction={handleAction}
        defaultOpen={true}
      />

      {/* Modals */}
      {modal?.type === 'markPaid' && (
        <ModalMarkPaid payment={modal.payment} today={today} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'partialPay' && (
        <ModalPartialPay payment={modal.payment} today={today} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'postpone' && (
        <ModalPostpone payment={modal.payment} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'urgent' && (
        <ModalUrgent companies={companies} today={today} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

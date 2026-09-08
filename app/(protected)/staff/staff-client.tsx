'use client'

import { Fragment, useState, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Upload, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, X, Pencil, Save, Trash2 } from 'lucide-react'
import { parseSalaryFile, parseInstructorsFile, parsePivaFile } from '@/lib/salary-parser'
import type { SalaryItem } from '@/lib/salary-parser'
import { markStaffPaid, resetStaffToPending, saveBudget, importStaffItems, importStaffTaxItem, deleteStaffTransaction, updateStaffTotal } from './actions'

type Company = { id: string; code: string; name: string }

type StaffTransaction = {
  id: string
  paid_date: string | null
  amount_cents: number
  note: string | null
  is_reconstructed: boolean
}

type StaffItem = {
  id: string
  company_id: string
  supplier_name: string | null
  account_description: string | null
  due_date: string
  amount_cents: number
  status: string
  commitment_type: string | null
  paid_amount_cents: number | null
  paid_date: string | null
  reference_month: string | null
  payment_transactions: StaffTransaction[] | null
}

/** Residuo da pagare: amount_cents è sempre il totale, paid_amount_cents la somma dei movimenti. */
function residualOf(item: StaffItem) {
  return Math.max(0, Math.abs(item.amount_cents) - (item.paid_amount_cents ?? 0))
}

function formatDay(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT')
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function parseCents(val: string) {
  return Math.round(parseFloat(val.replace(',', '.')) * 100)
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
  return `${months[m - 1]} ${y}`
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'paid') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-900/50 text-emerald-400 border border-emerald-800">Pagato</span>
  }
  if (status === 'partial') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-cyan-900/50 text-cyan-400 border border-cyan-800">Parziale</span>
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-900/50 text-amber-400 border border-amber-800">Da pagare</span>
}

function DeltaBadge({ budget, actual }: { budget: number; actual: number }) {
  if (!budget) return null
  const delta = actual - budget
  if (delta === 0) return <span className="text-xs text-zinc-500">= budget</span>
  const isOver = delta > 0
  return (
    <span className={`text-xs font-medium ${isOver ? 'text-red-400' : 'text-emerald-400'}`}>
      {isOver ? '+' : '-'}{formatEur(Math.abs(delta))}
    </span>
  )
}

function CategoryTotals({ items }: { items: StaffItem[] }) {
  if (!items.length) return null
  const totale   = items.reduce((s, i) => s + Math.abs(i.amount_cents), 0)
  const pagato   = items.reduce((s, i) => s + (i.paid_amount_cents ?? 0), 0)
  const residuo  = items.reduce((s, i) => s + residualOf(i), 0)
  return (
    <div className="flex items-center gap-4 text-xs tabular-nums">
      <span className="text-zinc-500">Totale <span className="text-red-400 font-medium">{formatEur(totale)}</span></span>
      <span className="text-zinc-500">Pagato <span className="text-emerald-400 font-medium">{formatEur(pagato)}</span></span>
      <span className="text-zinc-500">Residuo <span className={`font-medium ${residuo > 0 ? 'text-cyan-400' : 'text-zinc-600'}`}>{formatEur(residuo)}</span></span>
    </div>
  )
}

// ── TYPE LABELS ─────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  salary_item: 'Stipendio',
  extra_item: 'Extra',
  collab_item: 'Istruttore',
  piva_item: 'P.IVA',
}

// ── BUDGET INPUT ────────────────────────────────────────────────────────────

function BudgetRow({
  label, budgetCents, companyId, month, category, actualTotal,
}: {
  label: string
  budgetCents: number
  companyId: string
  month: string
  category: 'dipendenti' | 'collaboratori' | 'f24'
  actualTotal: number
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(budgetCents ? (budgetCents / 100).toFixed(2) : '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const cents = parseCents(value)
    if (isNaN(cents) || cents <= 0) return
    setSaving(true)
    const res = await saveBudget(companyId, month, category, cents)
    setSaving(false)
    if ('error' in res) return alert(String(res.error))
    setEditing(false)
    router.refresh()
  }

  if (!editing && budgetCents > 0) {
    return (
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-zinc-500">{label}:</span>
        <span className="text-sm font-medium text-zinc-300 tabular-nums">{formatEur(budgetCents)}</span>
        {actualTotal > 0 && <DeltaBadge budget={budgetCents} actual={actualTotal} />}
        <button onClick={() => { setValue((budgetCents / 100).toFixed(2)); setEditing(true) }}
          className="p-1 text-zinc-500 hover:text-zinc-300">
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs text-zinc-500">{label}:</span>
      <input type="number" step="0.01" placeholder="0.00" value={value}
        onChange={e => setValue(e.target.value)}
        className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 w-28 focus:outline-none focus:ring-1 focus:ring-violet-500" />
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded disabled:opacity-50">
        <Save className="w-3 h-3" /> {saving ? '...' : 'Salva'}
      </button>
      {editing && (
        <button onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Annulla</button>
      )}
    </div>
  )
}

// ── UPLOAD + PREVIEW COMPONENT ──────────────────────────────────────────────

function UploadSection({
  label, fileRef, disabled, parser, onConfirm, loading, err, setErr,
}: {
  label: string
  fileRef: React.RefObject<HTMLInputElement | null>
  disabled: boolean
  parser: (buf: ArrayBuffer) => SalaryItem[]
  onConfirm: (items: SalaryItem[], dueDate: string) => void
  loading: boolean
  err: string
  setErr: (v: string) => void
}) {
  const [preview, setPreview] = useState<SalaryItem[] | null>(null)
  const [dueDate, setDueDate] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = parser(ev.target!.result as ArrayBuffer)
        if (!parsed.length) { setErr('Nessuna voce trovata nel file'); return }
        setPreview(parsed)
        setErr('')
      } catch (error) { setErr(String(error)) }
    }
    reader.readAsArrayBuffer(file)
  }

  function reset() {
    setPreview(null)
    setDueDate('')
    if (fileRef.current) fileRef.current.value = ''
  }

  if (!preview) {
    return (
      <div className="inline-flex flex-col">
        <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
          disabled ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
        }`}>
          <Upload className="w-3.5 h-3.5" /> {label}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={disabled}
            onChange={e => { setErr(''); handleFile(e) }} />
        </label>
        {err && <span className="text-xs text-red-400 mt-1">{err}</span>}
      </div>
    )
  }

  return (
    <div className="space-y-3 bg-zinc-800/30 rounded-lg p-3">
      <p className="text-xs text-zinc-400 font-medium">{label} — anteprima</p>
      <div className="bg-zinc-800/50 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-zinc-700">
            <th className="text-left px-3 py-1.5 text-zinc-400">Nominativo</th>
            <th className="text-right px-3 py-1.5 text-zinc-400">Importo</th>
          </tr></thead>
          <tbody>
            {preview.map((item, i) => (
              <tr key={i} className="border-b border-zinc-700/40 last:border-0">
                <td className="px-3 py-1 text-zinc-300">{item.name}</td>
                <td className="px-3 py-1 text-right text-zinc-200 tabular-nums">{formatEur(item.amountCents)}</td>
              </tr>
            ))}
            <tr className="border-t border-zinc-600">
              <td className="px-3 py-1.5 text-zinc-400 font-medium">{preview.length} voci</td>
              <td className="px-3 py-1.5 text-right text-red-400 font-medium tabular-nums">
                {formatEur(preview.reduce((s, i) => s + i.amountCents, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Data pagamento</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
        <button onClick={reset} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg">Annulla</button>
        <button onClick={() => { if (!dueDate) { setErr('Inserisci la data'); return }; onConfirm(preview, dueDate); reset() }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-lg disabled:opacity-50">
          <Check className="w-3.5 h-3.5" /> {loading ? 'Importazione...' : `Conferma (${preview.length})`}
        </button>
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}
    </div>
  )
}

// -- MOVIMENTI ---------------------------------------------------------------

function MovementsRow({ item, colSpan, onDeleteTx }: {
  item: StaffItem
  colSpan: number
  onDeleteTx: (txId: string) => void
}) {
  const txs = [...(item.payment_transactions ?? [])].sort((a, b) => {
    if (!a.paid_date) return -1
    if (!b.paid_date) return 1
    return a.paid_date.localeCompare(b.paid_date)
  })

  return (
    <tr className="border-b border-zinc-700/40 bg-zinc-900/40">
      <td colSpan={colSpan} className="px-3 py-2">
        {txs.length === 0 ? (
          <p className="text-xs text-zinc-500 italic">Nessun pagamento registrato</p>
        ) : (
          <div className="space-y-1">
            {txs.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 text-xs">
                <span className="text-zinc-500 w-16 shrink-0">
                  {txs.length === 1 ? 'Pagamento' : i === txs.length - 1 ? 'Saldo' : 'Acconto'}
                </span>
                <span className={`w-24 shrink-0 tabular-nums ${t.paid_date ? 'text-zinc-300' : 'text-zinc-600 italic'}`}>
                  {formatDay(t.paid_date) ?? 'data n.d.'}
                </span>
                <span className="w-24 shrink-0 text-right text-emerald-400 tabular-nums">{formatEur(t.amount_cents)}</span>
                {t.is_reconstructed && (
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[10px]">ricostruito</span>
                )}
                <span className="text-zinc-600 truncate">{t.note}</span>
                <button onClick={() => onDeleteTx(t.id)}
                  className="ml-auto p-1 text-zinc-600 hover:text-red-400 shrink-0" title="Elimina movimento">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

// -- ITEMS TABLE -------------------------------------------------------------

function TotalCell({ item, onEditTotal }: { item: StaffItem; onEditTotal: (id: string, cents: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  function save() {
    const cents = parseCents(value)
    if (isNaN(cents) || cents <= 0) return
    setEditing(false)
    onEditTotal(item.id, cents)
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-1 group">
        <span className="text-red-400 tabular-nums">{formatEur(Math.abs(item.amount_cents))}</span>
        <button
          onClick={() => { setValue((Math.abs(item.amount_cents) / 100).toFixed(2)); setEditing(true) }}
          className="p-0.5 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100"
          title="Correggi importo totale">
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input type="number" step="0.01" value={value} autoFocus
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="w-24 px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 text-right focus:outline-none focus:ring-1 focus:ring-violet-500" />
      <button onClick={save} className="p-0.5 text-emerald-400 hover:text-emerald-300"><Save className="w-3 h-3" /></button>
      <button onClick={() => setEditing(false)} className="p-0.5 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>
    </div>
  )
}

function ItemsTable({ items, onPay, onReset, onDeleteTx, onEditTotal }: {
  items: StaffItem[]
  onPay: (item: StaffItem) => void
  onReset: (id: string) => void
  onDeleteTx: (txId: string) => void
  onEditTotal: (id: string, cents: number) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!items.length) return null
  return (
    <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-zinc-700">
          <th className="text-left px-3 py-2 text-zinc-400 font-medium">Nominativo</th>
          <th className="text-right px-3 py-2 text-zinc-400 font-medium">Totale</th>
          <th className="text-right px-3 py-2 text-zinc-400 font-medium">Pagato</th>
          <th className="text-right px-3 py-2 text-zinc-400 font-medium">Residuo</th>
          <th className="text-center px-3 py-2 text-zinc-400 font-medium">Tipo</th>
          <th className="text-center px-3 py-2 text-zinc-400 font-medium">Stato</th>
          <th className="px-3 py-2"></th>
        </tr></thead>
        <tbody>
          {items.map(item => {
            const paid = item.paid_amount_cents ?? 0
            const residual = residualOf(item)
            const txCount = (item.payment_transactions ?? []).length
            const isOpen = expanded.has(item.id)
            return (
              <Fragment key={item.id}>
                <tr className="border-b border-zinc-700/40">
                  <td className="px-3 py-2 text-zinc-300">
                    <button onClick={() => toggle(item.id)}
                      className="flex items-center gap-1.5 hover:text-zinc-100 text-left"
                      title={txCount ? `${txCount} movimenti registrati` : 'Nessun movimento'}>
                      <ChevronDown className={`w-3 h-3 text-zinc-600 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                      {item.supplier_name}
                      {txCount > 1 && <span className="px-1 rounded bg-zinc-700 text-zinc-400 text-[10px]">{txCount}</span>}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right"><TotalCell item={item} onEditTotal={onEditTotal} /></td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                    {paid > 0 ? formatEur(paid) : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cyan-400">
                    {residual > 0 ? formatEur(residual) : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-700 text-zinc-300">
                      {TYPE_LABEL[item.commitment_type ?? ''] ?? item.commitment_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center"><StatusBadge status={item.status} /></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {residual > 0 && (
                        <button onClick={() => onPay(item)}
                          className="px-2 py-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 rounded-lg border border-emerald-800">
                          Paga
                        </button>
                      )}
                      {paid > 0 && (
                        <button onClick={() => onReset(item.id)}
                          className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                          Reset
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && <MovementsRow item={item} colSpan={7} onDeleteTx={onDeleteTx} />}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function StaffClient({
  companies, items, selectedMonth, initialCompany, today,
}: {
  companies: Company[]
  items: StaffItem[]
  selectedMonth: string
  initialCompany: string
  today: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const companyCode = initialCompany || companies[0]?.code || ''
  const selectedCompany = companies.find(c => c.code === companyCode) ?? companies[0]
  const companyId = selectedCompany?.id ?? ''

  // ── Data filtering ──────────────────────────────────────────────────────────
  const companyItems = items.filter(i => i.company_id === companyId)
  const budgetItems  = companyItems.filter(i => i.account_description === 'Budget previsto')
  const actualItems  = companyItems.filter(i => i.account_description !== 'Budget previsto')

  const dipBudget = budgetItems.find(i => i.commitment_type === 'salary_item')
  const colBudget = budgetItems.find(i => i.commitment_type === 'collab_item')
  const f24Budget = budgetItems.find(i => i.commitment_type === 'tax_item')

  const salaryItems = actualItems.filter(i => i.commitment_type === 'salary_item')
  const extraItems  = actualItems.filter(i => i.commitment_type === 'extra_item')
  const collabItems = actualItems.filter(i => i.commitment_type === 'collab_item')
  const pivaItems   = actualItems.filter(i => i.commitment_type === 'piva_item')
  const taxItem     = actualItems.find(i => i.commitment_type === 'tax_item') ?? null

  const dipActualTotal = [...salaryItems, ...extraItems].reduce((s, i) => s + Math.abs(i.amount_cents), 0)
  const colActualTotal = [...collabItems, ...pivaItems].reduce((s, i) => s + Math.abs(i.amount_cents), 0)
  const f24ActualCents = taxItem ? Math.abs(taxItem.amount_cents) : 0

  const totalBudget  = (dipBudget ? Math.abs(dipBudget.amount_cents) : 0) + (colBudget ? Math.abs(colBudget.amount_cents) : 0) + (f24Budget ? Math.abs(f24Budget.amount_cents) : 0)
  const totalActual  = dipActualTotal + colActualTotal + f24ActualCents
  const personCount  = salaryItems.length + extraItems.length + collabItems.length + pivaItems.length
  const paidCents    = actualItems.reduce((s, i) => s + (i.paid_amount_cents ?? 0), 0)
  const residualTotal = actualItems.reduce((s, i) => s + residualOf(i), 0)

  const isAppiae = selectedCompany?.code === 'APPIAE'

  function navigate(params: Record<string, string>) {
    const p = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([k, v]) => p.set(k, v))
    startTransition(() => router.push('?' + p.toString()))
  }

  // ── Modal Paga ────────────────────────────────────────────────────────────
  const [payingItem, setPayingItem] = useState<StaffItem | null>(null)
  const [payDate, setPayDate]       = useState(today)
  const [payAmount, setPayAmount]   = useState('')
  const [payErr, setPayErr]         = useState('')
  const [paying, setPaying]         = useState(false)

  function openPayModal(item: StaffItem) {
    setPayingItem(item)
    setPayDate(today)
    setPayAmount((residualOf(item) / 100).toFixed(2))
    setPayErr('')
  }

  async function handlePay() {
    if (!payingItem) return
    const amountCents = parseCents(payAmount)
    if (isNaN(amountCents) || amountCents <= 0) { setPayErr('Importo non valido'); return }
    if (!payDate) { setPayErr('Data obbligatoria'); return }
    setPaying(true)
    const res = await markStaffPaid(payingItem.id, payDate, amountCents)
    setPaying(false)
    if ('error' in res) { setPayErr(String(res.error)); return }
    setPayingItem(null)
    router.refresh()
  }

  async function handleReset(id: string) {
    const res = await resetStaffToPending(id)
    if ('error' in res) { alert(String(res.error)); return }
    router.refresh()
  }

  async function handleDeleteTx(txId: string) {
    const res = await deleteStaffTransaction(txId)
    if ('error' in res) { alert(String(res.error)); return }
    router.refresh()
  }

  async function handleEditTotal(id: string, totalCents: number) {
    const res = await updateStaffTotal(id, totalCents)
    if ('error' in res) { alert(String(res.error)); return }
    router.refresh()
  }

  // ── Import handlers ───────────────────────────────────────────────────────
  const [importLoading, setImportLoading] = useState(false)
  const [importErr, setImportErr]         = useState('')
  const salRef   = useRef<HTMLInputElement | null>(null)
  const extRef   = useRef<HTMLInputElement | null>(null)
  const colRef   = useRef<HTMLInputElement | null>(null)
  const pivaRef  = useRef<HTMLInputElement | null>(null)

  async function handleImport(parsed: SalaryItem[], dueDate: string, type: 'salary_item' | 'extra_item' | 'collab_item' | 'piva_item') {
    if (!companyId) { setImportErr('Seleziona una società'); return }
    setImportLoading(true)
    const res = await importStaffItems(companyId, selectedMonth, type, parsed, dueDate)
    setImportLoading(false)
    if ('error' in res) { setImportErr(String(res.error)); return }
    router.refresh()
  }

  // ── F24 ───────────────────────────────────────────────────────────────────
  const [f24Amount, setF24Amount]     = useState('')
  const [f24DueDate, setF24DueDate]   = useState('')
  const [f24Err, setF24Err]           = useState('')
  const [f24Saving, setF24Saving]     = useState(false)
  const [f24Editing, setF24Editing]   = useState(false)

  async function handleSaveF24() {
    const amountCents = parseCents(f24Amount)
    if (isNaN(amountCents) || amountCents <= 0) { setF24Err('Importo non valido'); return }
    if (!f24DueDate) { setF24Err('Data obbligatoria'); return }
    if (!companyId) { setF24Err('Seleziona una società'); return }
    setF24Saving(true)
    const res = await importStaffTaxItem(companyId, selectedMonth, amountCents, f24DueDate)
    setF24Saving(false)
    if ('error' in res) { setF24Err(String(res.error)); return }
    setF24Editing(false)
    setF24Amount('')
    setF24DueDate('')
    router.refresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Selettore società + navigatore mese */}
      <div className="flex items-center gap-2 flex-wrap">
        {companies.map(c => (
          <button key={c.code} onClick={() => navigate({ company: c.code })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              c.code === companyCode ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100'
            }`}>
            {c.code}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => navigate({ month: addMonths(selectedMonth, -1) })}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-zinc-200 w-40 text-center">{toMonthLabel(selectedMonth)}</span>
          <button onClick={() => navigate({ month: addMonths(selectedMonth, 1) })}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Persone</p>
          <p className="text-2xl font-semibold text-zinc-100">{personCount}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Budget previsto</p>
          <p className="text-xl font-semibold text-zinc-300 tabular-nums">{totalBudget > 0 ? formatEur(totalBudget) : '—'}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Effettivo</p>
          <p className="text-xl font-semibold text-red-400 tabular-nums">{totalActual > 0 ? formatEur(totalActual) : '—'}</p>
          {totalBudget > 0 && totalActual > 0 && (
            <DeltaBadge budget={totalBudget} actual={totalActual} />
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Pagato</p>
          <p className="text-xl font-semibold text-emerald-400 tabular-nums">{formatEur(paidCents)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Residuo da pagare</p>
          <p className={`text-xl font-semibold tabular-nums ${residualTotal > 0 ? 'text-cyan-400' : 'text-zinc-600'}`}>
            {formatEur(residualTotal)}
          </p>
        </div>
      </div>

      {/* ── CARD DIPENDENTI ──────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200">Dipendenti</h3>
          <CategoryTotals items={[...salaryItems, ...extraItems]} />
        </div>

        <BudgetRow label="Budget previsto" budgetCents={dipBudget ? Math.abs(dipBudget.amount_cents) : 0}
          companyId={companyId} month={selectedMonth} category="dipendenti" actualTotal={dipActualTotal} />

        <ItemsTable items={[...salaryItems, ...extraItems]} onPay={openPayModal} onReset={handleReset}
          onDeleteTx={handleDeleteTx} onEditTotal={handleEditTotal} />

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <UploadSection label="Distinta netti" fileRef={salRef} disabled={!companyId}
            parser={parseSalaryFile} loading={importLoading} err={importErr} setErr={setImportErr}
            onConfirm={(items, dueDate) => handleImport(items, dueDate, 'salary_item')} />
          <UploadSection label="Extra" fileRef={extRef} disabled={!companyId}
            parser={parseSalaryFile} loading={importLoading} err={importErr} setErr={setImportErr}
            onConfirm={(items, dueDate) => handleImport(items, dueDate, 'extra_item')} />
        </div>
      </div>

      {/* ── CARD COLLABORATORI/ISTRUTTORI (solo APPIAE) ──────────────────── */}
      {isAppiae && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-200">Collaboratori / Istruttori</h3>
            <CategoryTotals items={[...collabItems, ...pivaItems]} />
          </div>

          <BudgetRow label="Budget previsto" budgetCents={colBudget ? Math.abs(colBudget.amount_cents) : 0}
            companyId={companyId} month={selectedMonth} category="collaboratori" actualTotal={colActualTotal} />

          <ItemsTable items={[...collabItems, ...pivaItems]} onPay={openPayModal} onReset={handleReset}
            onDeleteTx={handleDeleteTx} onEditTotal={handleEditTotal} />

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <UploadSection label="Istruttori" fileRef={colRef} disabled={!companyId}
              parser={parseInstructorsFile} loading={importLoading} err={importErr} setErr={setImportErr}
              onConfirm={(items, dueDate) => handleImport(items, dueDate, 'collab_item')} />
            <UploadSection label="Istruttori P.IVA" fileRef={pivaRef} disabled={!companyId}
              parser={parsePivaFile} loading={importLoading} err={importErr} setErr={setImportErr}
              onConfirm={(items, dueDate) => handleImport(items, dueDate, 'piva_item')} />
          </div>
        </div>
      )}

      {/* ── CARD F24 ─────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200">F24</h3>
          <CategoryTotals items={taxItem ? [taxItem] : []} />
        </div>

        <BudgetRow label="Budget previsto" budgetCents={f24Budget ? Math.abs(f24Budget.amount_cents) : 0}
          companyId={companyId} month={selectedMonth} category="f24" actualTotal={f24ActualCents} />

        {taxItem && !f24Editing ? (
          <>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Importo</p>
                <p className="text-sm font-medium text-red-400 tabular-nums">{formatEur(f24ActualCents)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Scadenza</p>
                <p className="text-sm text-zinc-300">{taxItem.due_date}</p>
              </div>
              {(taxItem.paid_amount_cents ?? 0) > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Pagato</p>
                  <p className="text-sm font-medium text-emerald-400 tabular-nums">{formatEur(taxItem.paid_amount_cents ?? 0)}</p>
                </div>
              )}
              {residualOf(taxItem) > 0 && (taxItem.paid_amount_cents ?? 0) > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Residuo</p>
                  <p className="text-sm font-medium text-cyan-400 tabular-nums">{formatEur(residualOf(taxItem))}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Stato</p>
                <StatusBadge status={taxItem.status} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => {
                setF24Amount((f24ActualCents / 100).toFixed(2))
                setF24DueDate(taxItem.due_date)
                setF24Editing(true)
                setF24Err('')
              }} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg">
                <Pencil className="w-3.5 h-3.5" /> Modifica
              </button>
              {residualOf(taxItem) > 0 && (
                <button onClick={() => openPayModal(taxItem)}
                  className="px-3 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 rounded-lg border border-emerald-800">
                  Paga
                </button>
              )}
              {(taxItem.paid_amount_cents ?? 0) > 0 && (
                <button onClick={() => handleReset(taxItem.id)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                  Reset
                </button>
              )}
            </div>
          </div>
          {(taxItem.payment_transactions ?? []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 mb-1.5">Movimenti</p>
              <table className="w-full"><tbody>
                <MovementsRow item={taxItem} colSpan={1} onDeleteTx={handleDeleteTx} />
              </tbody></table>
            </div>
          )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Importo reale (€)</label>
                <input type="number" step="0.01" placeholder="0.00" value={f24Amount}
                  onChange={e => setF24Amount(e.target.value)}
                  className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500 w-36" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Scadenza</label>
                <input type="date" value={f24DueDate} onChange={e => setF24DueDate(e.target.value)}
                  className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500" />
              </div>
              <div className="flex gap-2">
                {f24Editing && (
                  <button onClick={() => { setF24Editing(false); setF24Err('') }}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg">
                    Annulla
                  </button>
                )}
                <button onClick={handleSaveF24} disabled={f24Saving || !companyId}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-50">
                  <Check className="w-4 h-4" /> {f24Saving ? 'Salvando...' : 'Salva F24'}
                </button>
              </div>
            </div>
            {f24Err && <p className="text-red-400 text-xs">{f24Err}</p>}
          </div>
        )}
      </div>

      {/* ── Modal Paga ───────────────────────────────────────────────────── */}
      {payingItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-100">Registra pagamento</h3>
              <button onClick={() => setPayingItem(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-400 mb-4">{payingItem.supplier_name}</p>
            <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-sm text-zinc-400 mb-3 space-y-0.5">
              <div>
                Residuo da pagare:{' '}
                <span className="text-zinc-100 font-medium">{formatEur(residualOf(payingItem))}</span>
              </div>
              {(payingItem.paid_amount_cents ?? 0) > 0 && (
                <div className="text-xs text-zinc-500">
                  Totale {formatEur(Math.abs(payingItem.amount_cents))} · già pagato {formatEur(payingItem.paid_amount_cents ?? 0)}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Data pagamento</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Importo (€)</label>
                <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500" />
              </div>
              {(() => {
                const cents = Math.round(parseFloat((payAmount || '0').replace(',', '.')) * 100)
                const current = residualOf(payingItem)
                if (cents > 0 && cents < current) {
                  return (
                    <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-3 py-2 text-xs text-cyan-300">
                      Pagamento parziale — residuo dopo: <span className="font-medium">{formatEur(current - cents)}</span>
                    </div>
                  )
                }
                return null
              })()}
            </div>
            {payErr && <p className="text-red-400 text-xs mt-2">{payErr}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPayingItem(null)}
                className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg">Annulla</button>
              <button onClick={handlePay} disabled={paying}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-50">
                <Check className="w-4 h-4" /> {paying ? 'Salvando...' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

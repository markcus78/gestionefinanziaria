'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Upload, RefreshCw, ChevronLeft, ChevronRight, X, Pencil, Save } from 'lucide-react'
import { parseSalaryFile, parseInstructorsFile, parsePivaFile } from '@/lib/salary-parser'
import type { SalaryItem } from '@/lib/salary-parser'
import { markStaffPaid, resetStaffToPending, saveBudget, importStaffItems, importStaffTaxItem } from './actions'

type Company = { id: string; code: string; name: string }

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

// ── ITEMS TABLE ─────────────────────────────────────────────────────────────

function ItemsTable({ items, onPay, onReset }: {
  items: StaffItem[]
  onPay: (item: StaffItem) => void
  onReset: (id: string) => void
}) {
  if (!items.length) return null
  return (
    <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-zinc-700">
          <th className="text-left px-3 py-2 text-zinc-400 font-medium">Nominativo</th>
          <th className="text-right px-3 py-2 text-zinc-400 font-medium">Importo</th>
          <th className="text-center px-3 py-2 text-zinc-400 font-medium">Tipo</th>
          <th className="text-center px-3 py-2 text-zinc-400 font-medium">Stato</th>
          <th className="px-3 py-2"></th>
        </tr></thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-zinc-700/40 last:border-0">
              <td className="px-3 py-2 text-zinc-300">{item.supplier_name}</td>
              <td className="px-3 py-2 text-right text-red-400 tabular-nums">{formatEur(Math.abs(item.amount_cents))}</td>
              <td className="px-3 py-2 text-center">
                <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-700 text-zinc-300">
                  {TYPE_LABEL[item.commitment_type ?? ''] ?? item.commitment_type}
                </span>
              </td>
              <td className="px-3 py-2 text-center"><StatusBadge status={item.status} /></td>
              <td className="px-3 py-2 text-right">
                {item.status === 'paid' ? (
                  <button onClick={() => onReset(item.id)}
                    className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                    Reset
                  </button>
                ) : (
                  <button onClick={() => onPay(item)}
                    className="px-2 py-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 rounded-lg border border-emerald-800">
                    Paga
                  </button>
                )}
              </td>
            </tr>
          ))}
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
  const paidCents    = actualItems.filter(i => i.status === 'paid').reduce((s, i) => s + Math.abs(i.paid_amount_cents ?? i.amount_cents), 0)

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
    setPayAmount((Math.abs(item.amount_cents) / 100).toFixed(2))
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
    await resetStaffToPending(id)
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
      <div className="grid grid-cols-4 gap-3">
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
      </div>

      {/* ── CARD DIPENDENTI ──────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200">Dipendenti</h3>
          {dipActualTotal > 0 && (
            <span className="text-sm font-medium text-red-400 tabular-nums">{formatEur(dipActualTotal)}</span>
          )}
        </div>

        <BudgetRow label="Budget previsto" budgetCents={dipBudget ? Math.abs(dipBudget.amount_cents) : 0}
          companyId={companyId} month={selectedMonth} category="dipendenti" actualTotal={dipActualTotal} />

        <ItemsTable items={[...salaryItems, ...extraItems]} onPay={openPayModal} onReset={handleReset} />

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
            {colActualTotal > 0 && (
              <span className="text-sm font-medium text-red-400 tabular-nums">{formatEur(colActualTotal)}</span>
            )}
          </div>

          <BudgetRow label="Budget previsto" budgetCents={colBudget ? Math.abs(colBudget.amount_cents) : 0}
            companyId={companyId} month={selectedMonth} category="collaboratori" actualTotal={colActualTotal} />

          <ItemsTable items={[...collabItems, ...pivaItems]} onPay={openPayModal} onReset={handleReset} />

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
          {f24ActualCents > 0 && (
            <span className="text-sm font-medium text-red-400 tabular-nums">{formatEur(f24ActualCents)}</span>
          )}
        </div>

        <BudgetRow label="Budget previsto" budgetCents={f24Budget ? Math.abs(f24Budget.amount_cents) : 0}
          companyId={companyId} month={selectedMonth} category="f24" actualTotal={f24ActualCents} />

        {taxItem && !f24Editing ? (
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
              {taxItem.status === 'paid' ? (
                <button onClick={() => handleReset(taxItem.id)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                  Reset
                </button>
              ) : (
                <button onClick={() => openPayModal(taxItem)}
                  className="px-3 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 rounded-lg border border-emerald-800">
                  Paga
                </button>
              )}
            </div>
          </div>
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

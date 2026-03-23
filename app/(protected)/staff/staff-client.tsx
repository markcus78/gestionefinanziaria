'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Upload, RefreshCw, ChevronLeft, ChevronRight, X, Pencil } from 'lucide-react'
import { parseSalaryFile } from '@/lib/salary-parser'
import type { SalaryItem } from '@/lib/salary-parser'
import { importSalaryItems, importTaxItem } from '@/app/(protected)/impegni/salary-actions'
import { markStaffPaid, resetStaffToPending } from './actions'

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

const formatEur = (cents: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)

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
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-900/50 text-emerald-400 border border-emerald-800">
        Pagato
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-900/50 text-amber-400 border border-amber-800">
      Da pagare
    </span>
  )
}

// ── Sotto-sezione Dipendenti / Collaboratori ───────────────────────────────────

function PersonSection({
  title, type, items, preview, dueDate, setDueDate, loading, err, setErr,
  fileRef, companyId, onFileChange, onImport, onReimport, onPay, onReset,
}: {
  title: string
  type: 'salary_item' | 'collab_item'
  items: StaffItem[]
  preview: SalaryItem[] | null
  dueDate: string
  setDueDate: (v: string) => void
  loading: boolean
  err: string
  setErr: (v: string) => void
  fileRef: React.RefObject<HTMLInputElement | null>
  companyId: string
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>, type: 'salary_item' | 'collab_item') => void
  onImport: () => void
  onReimport: () => void
  onPay: (item: StaffItem) => void
  onReset: (id: string) => void | Promise<void>
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-200 mb-4">{title}</h3>

      {/* Tabella items esistenti */}
      {items.length > 0 && !preview && (
        <div className="mb-4">
          <div className="bg-zinc-800/50 rounded-lg overflow-hidden mb-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Nominativo</th>
                  <th className="text-right px-3 py-2 text-zinc-400 font-medium">Importo</th>
                  <th className="text-center px-3 py-2 text-zinc-400 font-medium">Scadenza</th>
                  <th className="text-center px-3 py-2 text-zinc-400 font-medium">Stato</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-zinc-700/40 last:border-0">
                    <td className="px-3 py-2 text-zinc-300">{item.supplier_name}</td>
                    <td className="px-3 py-2 text-right text-red-400 tabular-nums">
                      {formatEur(Math.abs(item.amount_cents))}
                    </td>
                    <td className="px-3 py-2 text-center text-zinc-400">{item.due_date}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.status === 'paid' ? (
                        <button
                          onClick={() => onReset(item.id)}
                          className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                        >
                          Reset
                        </button>
                      ) : (
                        <button
                          onClick={() => onPay(item)}
                          className="px-2 py-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 rounded-lg border border-emerald-800"
                        >
                          Paga
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={onReimport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reimporta
          </button>
        </div>
      )}

      {/* Upload o preview */}
      {!preview ? (
        <div className="flex items-center gap-3">
          <label className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
            !companyId ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
          }`}>
            <Upload className="w-4 h-4" />
            {items.length > 0 ? 'Carica nuovo Excel' : 'Carica Excel'}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={!companyId}
              onChange={e => { setErr(''); onFileChange(e, type) }}
            />
          </label>
          {!companyId && <span className="text-xs text-zinc-500">Seleziona prima una società</span>}
          {err && <span className="text-xs text-red-400">{err}</span>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Nominativo</th>
                  <th className="text-right px-3 py-2 text-zinc-400 font-medium">Importo</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item, i) => (
                  <tr key={i} className="border-b border-zinc-700/40 last:border-0">
                    <td className="px-3 py-1.5 text-zinc-300">{item.name}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-200 tabular-nums">{formatEur(item.amountCents)}</td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-600">
                  <td className="px-3 py-1.5 text-zinc-400 font-medium">{preview.length} nominativi</td>
                  <td className="px-3 py-1.5 text-right text-red-400 font-medium tabular-nums">
                    {formatEur(preview.reduce((s, item) => s + item.amountCents, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Data pagamento *</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div className="flex gap-2 self-end">
              <button
                onClick={onReimport}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg"
              >
                Annulla
              </button>
              <button
                onClick={onImport}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {loading ? 'Importazione...' : `Conferma (${preview.length} voci)`}
              </button>
            </div>
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
      )}
    </div>
  )
}

// ── Sezione F24 ───────────────────────────────────────────────────────────────

function F24Section({
  taxItem, f24Amount, setF24Amount, f24DueDate, setF24DueDate, f24Err, setF24Err,
  f24Saving, f24Editing, setF24Editing, companyId, onSave, onPay, onReset,
}: {
  taxItem: StaffItem | null
  f24Amount: string
  setF24Amount: (v: string) => void
  f24DueDate: string
  setF24DueDate: (v: string) => void
  f24Err: string
  setF24Err: (v: string) => void
  f24Saving: boolean
  f24Editing: boolean
  setF24Editing: (v: boolean) => void
  companyId: string
  onSave: () => void
  onPay: (item: StaffItem) => void
  onReset: (id: string) => void | Promise<void>
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-200 mb-4">F24</h3>

      {taxItem && !f24Editing ? (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Importo</p>
              <p className="text-sm font-medium text-red-400 tabular-nums">{formatEur(Math.abs(taxItem.amount_cents))}</p>
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
            <button
              onClick={() => {
                setF24Amount((Math.abs(taxItem.amount_cents) / 100).toFixed(2))
                setF24DueDate(taxItem.due_date)
                setF24Editing(true)
                setF24Err('')
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg"
            >
              <Pencil className="w-3.5 h-3.5" /> Modifica
            </button>
            {taxItem.status === 'paid' ? (
              <button
                onClick={() => onReset(taxItem.id)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
              >
                Reset
              </button>
            ) : (
              <button
                onClick={() => onPay(taxItem)}
                className="px-3 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 rounded-lg border border-emerald-800"
              >
                Paga
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Importo (€)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={f24Amount}
                onChange={e => setF24Amount(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500 w-36"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Data scadenza</label>
              <input
                type="date"
                value={f24DueDate}
                onChange={e => setF24DueDate(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div className="flex gap-2">
              {f24Editing && (
                <button
                  onClick={() => { setF24Editing(false); setF24Err('') }}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg"
                >
                  Annulla
                </button>
              )}
              <button
                onClick={onSave}
                disabled={f24Saving || !companyId}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {f24Saving ? 'Salvando...' : 'Salva F24'}
              </button>
            </div>
          </div>
          {!companyId && <p className="text-xs text-zinc-500">Seleziona prima una società</p>}
          {f24Err && <p className="text-red-400 text-xs">{f24Err}</p>}
        </div>
      )}
    </div>
  )
}

// ── Componente principale ─────────────────────────────────────────────────────

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

  const companyItems = items.filter(i => i.company_id === selectedCompany?.id)
  const salaryItems  = companyItems.filter(i => i.commitment_type === 'salary_item')
  const collabItems  = companyItems.filter(i => i.commitment_type === 'collab_item')
  const taxItem      = companyItems.find(i => i.commitment_type === 'tax_item') ?? null

  const personCount  = salaryItems.length + collabItems.length
  const totalCents   = companyItems.reduce((s, i) => s + Math.abs(i.amount_cents), 0)
  const paidCents    = companyItems
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + Math.abs(i.paid_amount_cents ?? i.amount_cents), 0)
  const pendingCents = totalCents - paidCents

  function navigate(params: Record<string, string>) {
    const p = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([k, v]) => p.set(k, v))
    startTransition(() => router.push('?' + p.toString()))
  }

  // ── Modal Paga ───────────────────────────────────────────────────────────────
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
    const amountCents = Math.round(parseFloat(payAmount.replace(',', '.')) * 100)
    if (isNaN(amountCents) || amountCents <= 0) { setPayErr('Importo non valido'); return }
    if (!payDate) { setPayErr('Data obbligatoria'); return }
    setPaying(true)
    const res = await markStaffPaid(payingItem.id, payDate, amountCents)
    setPaying(false)
    if ('error' in res) { setPayErr(String(res.error)); return }
    setPayingItem(null)
    router.refresh()
  }

  // ── Import dipendenti ────────────────────────────────────────────────────────
  const [salPreview, setSalPreview] = useState<SalaryItem[] | null>(null)
  const [salDueDate, setSalDueDate] = useState('')
  const [salErr, setSalErr]         = useState('')
  const [salLoading, setSalLoading] = useState(false)
  const salRef = useRef<HTMLInputElement | null>(null)

  // ── Import collaboratori ─────────────────────────────────────────────────────
  const [colPreview, setColPreview] = useState<SalaryItem[] | null>(null)
  const [colDueDate, setColDueDate] = useState('')
  const [colErr, setColErr]         = useState('')
  const [colLoading, setColLoading] = useState(false)
  const colRef = useRef<HTMLInputElement | null>(null)

  // ── F24 ──────────────────────────────────────────────────────────────────────
  const [f24Amount, setF24Amount]   = useState('')
  const [f24DueDate, setF24DueDate] = useState('')
  const [f24Err, setF24Err]         = useState('')
  const [f24Saving, setF24Saving]   = useState(false)
  const [f24Editing, setF24Editing] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, type: 'salary_item' | 'collab_item') {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = parseSalaryFile(ev.target!.result as ArrayBuffer)
        if (type === 'salary_item') { setSalPreview(parsed); setSalErr('') }
        else                        { setColPreview(parsed); setColErr('') }
      } catch (err) {
        if (type === 'salary_item') setSalErr(String(err))
        else                        setColErr(String(err))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport(type: 'salary_item' | 'collab_item') {
    const preview  = type === 'salary_item' ? salPreview  : colPreview
    const dueDate  = type === 'salary_item' ? salDueDate  : colDueDate
    const setErr   = type === 'salary_item' ? setSalErr   : setColErr
    const setLoading = type === 'salary_item' ? setSalLoading : setColLoading

    if (!preview?.length) return setErr('Nessuna voce valida trovata nel file')
    if (!dueDate)          return setErr('Inserisci la data di pagamento')
    if (!selectedCompany?.id) return setErr('Seleziona prima una società')

    setLoading(true)
    const res = await importSalaryItems(selectedCompany.id, selectedMonth, type, preview, dueDate)
    setLoading(false)
    if (res.error) { setErr(res.error); return }

    if (type === 'salary_item') { setSalPreview(null); if (salRef.current) salRef.current.value = '' }
    else                        { setColPreview(null); if (colRef.current) colRef.current.value = '' }
    router.refresh()
  }

  async function handleSaveF24() {
    const amountCents = Math.round(parseFloat(f24Amount.replace(',', '.')) * 100)
    if (isNaN(amountCents) || amountCents <= 0) { setF24Err('Importo non valido'); return }
    if (!f24DueDate)          { setF24Err('Data obbligatoria'); return }
    if (!selectedCompany?.id) { setF24Err('Seleziona prima una società'); return }

    setF24Saving(true)
    const res = await importTaxItem(selectedCompany.id, selectedMonth, amountCents, f24DueDate)
    setF24Saving(false)
    if (res.error) { setF24Err(res.error); return }
    setF24Editing(false)
    setF24Amount('')
    setF24DueDate('')
    router.refresh()
  }

  async function handleReset(id: string) {
    await resetStaffToPending(id)
    router.refresh()
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Selettore società + navigatore mese */}
      <div className="flex items-center gap-2 flex-wrap">
        {companies.map(c => (
          <button
            key={c.code}
            onClick={() => navigate({ company: c.code })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              c.code === companyCode
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {c.code}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => navigate({ month: addMonths(selectedMonth, -1) })}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-zinc-200 w-40 text-center">
            {toMonthLabel(selectedMonth)}
          </span>
          <button
            onClick={() => navigate({ month: addMonths(selectedMonth, 1) })}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
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
          <p className="text-xs text-zinc-500 mb-1">Da pagare</p>
          <p className="text-xl font-semibold text-amber-400">{formatEur(pendingCents)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Pagato</p>
          <p className="text-xl font-semibold text-emerald-400">{formatEur(paidCents)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Totale mese</p>
          <p className="text-xl font-semibold text-zinc-200">{formatEur(totalCents)}</p>
        </div>
      </div>

      {/* Sezione Dipendenti */}
      <PersonSection
        title="Dipendenti"
        type="salary_item"
        items={salaryItems}
        preview={salPreview}
        dueDate={salDueDate}
        setDueDate={setSalDueDate}
        loading={salLoading}
        err={salErr}
        setErr={setSalErr}
        fileRef={salRef}
        companyId={selectedCompany?.id ?? ''}
        onFileChange={handleFileChange}
        onImport={() => handleImport('salary_item')}
        onReimport={() => { setSalPreview(null); if (salRef.current) salRef.current.value = '' }}
        onPay={openPayModal}
        onReset={handleReset}
      />

      {/* Sezione Collaboratori */}
      <PersonSection
        title="Collaboratori"
        type="collab_item"
        items={collabItems}
        preview={colPreview}
        dueDate={colDueDate}
        setDueDate={setColDueDate}
        loading={colLoading}
        err={colErr}
        setErr={setColErr}
        fileRef={colRef}
        companyId={selectedCompany?.id ?? ''}
        onFileChange={handleFileChange}
        onImport={() => handleImport('collab_item')}
        onReimport={() => { setColPreview(null); if (colRef.current) colRef.current.value = '' }}
        onPay={openPayModal}
        onReset={handleReset}
      />

      {/* Sezione F24 */}
      <F24Section
        taxItem={taxItem}
        f24Amount={f24Amount}
        setF24Amount={setF24Amount}
        f24DueDate={f24DueDate}
        setF24DueDate={setF24DueDate}
        f24Err={f24Err}
        setF24Err={setF24Err}
        f24Saving={f24Saving}
        f24Editing={f24Editing}
        setF24Editing={setF24Editing}
        companyId={selectedCompany?.id ?? ''}
        onSave={handleSaveF24}
        onPay={openPayModal}
        onReset={handleReset}
      />

      {/* Modal Paga */}
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
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Importo (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>
            {payErr && <p className="text-red-400 text-xs mt-2">{payErr}</p>}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setPayingItem(null)}
                className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg"
              >
                Annulla
              </button>
              <button
                onClick={handlePay}
                disabled={paying}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {paying ? 'Salvando...' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useState, useTransition, useRef, useEffect } from 'react'
import {
  Plus, X, Pencil, Ban, Trash2, Check, Calendar,
  Repeat, Users, Upload, RefreshCw, ListPlus, Scale,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createCommitment, updateCommitment, cancelCommitment, deleteCommitment, createCommitmentBatch, createRecurringCommitments } from './actions'
import type { CommitmentInput } from './actions'
import { createTemplate, updateTemplate, deleteTemplate, generateMonth } from './templates-actions'
import type { TemplateInput } from './templates-actions'
import { importSalaryItems, importTaxItem } from './salary-actions'
import { parseSalaryFile } from '@/lib/salary-parser'
import type { SalaryItem } from '@/lib/salary-parser'
import type { PaymentScheduleItem, PaymentStatus, RecurringTemplate, CommitmentType } from '@/lib/types/database'
import type { Company } from '@/lib/types/database'

// ── Costanti ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '',          label: 'Tutti' },
  { value: 'pending',   label: 'Attivi' },
  { value: 'cancelled', label: 'Annullati' },
]

const FLOW_OPTIONS = [
  { value: '',    label: 'Tutti' },
  { value: 'out', label: 'Uscite' },
  { value: 'in',  label: 'Entrate' },
]

const COMMITMENT_TYPE_BADGE: Partial<Record<NonNullable<PaymentScheduleItem['commitment_type']>, { label: string; cls: string }>> = {
  forecast:     { label: 'Previsione',    cls: 'bg-indigo-500/20 text-indigo-400' },
  salary_item:  { label: 'Dipendente',   cls: 'bg-blue-500/20 text-blue-400' },
  collab_item:  { label: 'Collaboratore', cls: 'bg-purple-500/20 text-purple-400' },
  tax_item:     { label: 'F24',          cls: 'bg-orange-500/20 text-orange-400' },
}

const STATUS_BADGE: Record<PaymentStatus, { label: string; cls: string }> = {
  pending:   { label: 'Attivo',      cls: 'bg-amber-500/20 text-amber-400' },
  scheduled: { label: 'Programmato', cls: 'bg-blue-500/20 text-blue-400' },
  paid:      { label: 'Pagato',      cls: 'bg-emerald-500/20 text-emerald-400' },
  postponed: { label: 'Posticipato', cls: 'bg-purple-500/20 text-purple-400' },
  disputed:  { label: 'Contestato',  cls: 'bg-red-500/20 text-red-400' },
  cancelled: { label: 'Annullato',   cls: 'bg-zinc-700 text-zinc-400' },
}

const CATEGORY_LABELS: Record<RecurringTemplate['category'], string> = {
  salary:        'Stipendi',
  collaborators: 'Collaboratori',
  tax:           'Tributi/F24',
  utility:       'Utenze',
  other:         'Altro',
}

const CATEGORY_COLORS: Record<RecurringTemplate['category'], string> = {
  salary:        'bg-blue-500/20 text-blue-400',
  collaborators: 'bg-purple-500/20 text-purple-400',
  tax:           'bg-red-500/20 text-red-400',
  utility:       'bg-yellow-500/20 text-yellow-400',
  other:         'bg-zinc-700 text-zinc-400',
}

const FREQ_LABELS: Record<RecurringTemplate['frequency'], string> = {
  monthly:   'Mensile',
  quarterly: 'Trimestrale',
  annual:    'Annuale',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function parseCents(val: string): number {
  const n = parseFloat(val.replace(',', '.'))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  items: PaymentScheduleItem[]
  companies: Pick<Company, 'id' | 'code' | 'name'>[]
  templates: RecurringTemplate[]
  matchedIds: string[]
}

// ────────────────────────────────────────────────────────────────────────────
// CommitmentsSection
// ────────────────────────────────────────────────────────────────────────────

type FormState = {
  company_id: string
  supplier_name: string
  account_description: string
  due_date: string
  amount: string
  flow_type: 'in' | 'out'
  notes: string
  is_recurring: boolean
  frequency: 'monthly' | 'quarterly' | 'annual'
  months_ahead: number
}

const EMPTY_FORM: FormState = {
  company_id: '',
  supplier_name: '',
  account_description: '',
  due_date: '',
  amount: '',
  flow_type: 'out',
  notes: '',
  is_recurring: false,
  frequency: 'monthly',
  months_ahead: 12,
}

type BatchRow = {
  id: string
  company_id: string
  supplier_name: string
  account_description: string
  due_date: string
  amount: string
  flow_type: 'in' | 'out'
}

function CommitmentsSection({
  items,
  companies,
  matchedIds,
}: {
  items: PaymentScheduleItem[]
  companies: Pick<Company, 'id' | 'code' | 'name'>[]
  matchedIds: string[]
}) {
  const matchedSet = new Set(matchedIds)
  const router    = useRouter()
  const pathname  = usePathname()
  const sp        = useSearchParams()
  const [, startTransition] = useTransition()

  const companyId = sp.get('company') ?? ''
  const status    = sp.get('status')  ?? 'pending'
  const flow      = sp.get('flow')    ?? ''
  const from      = sp.get('from')    ?? ''
  const to        = sp.get('to')      ?? ''

  const [fromLocal, setFromLocal] = useState(from)
  const [toLocal,   setToLocal]   = useState(to)

  const push = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v)
      else params.delete(k)
    })
    router.push(`${pathname}?${params.toString()}`)
  }, [sp, pathname, router])

  // ── Modal nuovo impegno ───────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]           = useState<FormState>(EMPTY_FORM)
  const [formErr, setFormErr]     = useState('')
  const [saving, setSaving]       = useState(false)

  function openModal() {
    setForm({ ...EMPTY_FORM, company_id: companyId, due_date: today() })
    setFormErr('')
    setModalOpen(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company_id)    return setFormErr('Seleziona la società')
    if (!form.supplier_name) return setFormErr('Inserisci fornitore/descrizione')
    if (!form.due_date)      return setFormErr('Inserisci la data')
    const amountCents = parseCents(form.amount)
    if (amountCents <= 0)    return setFormErr('Inserisci un importo valido')
    if (form.is_recurring && (form.months_ahead < 1 || form.months_ahead > 24))
      return setFormErr('Mesi da generare: valore tra 1 e 24')

    setSaving(true)
    const raw = form.flow_type === 'out' ? -amountCents : amountCents
    const input: CommitmentInput = {
      company_id: form.company_id,
      supplier_name: form.supplier_name,
      account_description: form.account_description || null,
      due_date: form.due_date,
      amount_cents: raw,
      flow_type: form.flow_type,
      notes: form.notes || null,
    }

    if (form.is_recurring) {
      const res = await createRecurringCommitments(input, form.frequency, form.months_ahead)
      setSaving(false)
      if ('error' in res) return setFormErr(res.error)
      setModalOpen(false)
      router.refresh()
    } else {
      const res = await createCommitment(input)
      setSaving(false)
      if ('error' in res) return setFormErr(res.error)
      setModalOpen(false)
      router.refresh()
    }
  }

  // ── Modal inserimento multiplo ────────────────────────────────────────────
  const [batchOpen, setBatchOpen]   = useState(false)
  const [batchRows, setBatchRows]   = useState<BatchRow[]>([])
  const [batchErr, setBatchErr]     = useState('')
  const [batchSaving, setBatchSaving] = useState(false)

  function openBatch() {
    setBatchRows([{
      id: crypto.randomUUID(),
      company_id: companyId,
      supplier_name: '',
      account_description: '',
      due_date: today(),
      amount: '',
      flow_type: 'out',
    }])
    setBatchErr('')
    setBatchOpen(true)
  }

  function addBatchRow() {
    const last = batchRows[batchRows.length - 1]
    setBatchRows(prev => [...prev, {
      id: crypto.randomUUID(),
      company_id: last?.company_id ?? companyId,
      supplier_name: '',
      account_description: '',
      due_date: last?.due_date ?? today(),
      amount: '',
      flow_type: last?.flow_type ?? 'out',
    }])
  }

  function updateBatchRow(id: string, field: keyof BatchRow, value: string) {
    setBatchRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function removeBatchRow(id: string) {
    setBatchRows(prev => prev.filter(r => r.id !== id))
  }

  async function handleBatchSave() {
    const valid = batchRows.filter(r =>
      r.company_id && r.supplier_name && r.due_date && parseCents(r.amount) > 0
    )
    if (!valid.length) return setBatchErr('Compila almeno una riga valida (società, fornitore, data, importo)')

    setBatchSaving(true)
    const payload: CommitmentInput[] = valid.map(r => {
      const amountCents = parseCents(r.amount)
      return {
        company_id: r.company_id,
        supplier_name: r.supplier_name,
        account_description: r.account_description || null,
        due_date: r.due_date,
        amount_cents: r.flow_type === 'out' ? -amountCents : amountCents,
        flow_type: r.flow_type as 'in' | 'out',
        notes: null,
      }
    })

    const res = await createCommitmentBatch(payload)
    setBatchSaving(false)
    if ('error' in res) return setBatchErr(res.error)
    setBatchOpen(false)
    router.refresh()
  }

  // ── Editing inline ────────────────────────────────────────────────────────
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editForm, setEditForm]     = useState<FormState>(EMPTY_FORM)
  const [editErr, setEditErr]       = useState('')
  const [editSaving, setEditSaving] = useState(false)

  function startEdit(item: PaymentScheduleItem) {
    setEditingId(item.id)
    setEditForm({
      company_id: item.company_id,
      supplier_name: item.supplier_name ?? '',
      account_description: item.account_description ?? '',
      due_date: item.due_date,
      amount: (Math.abs(item.amount_cents) / 100).toFixed(2),
      flow_type: item.flow_type,
      notes: item.postpone_notes ?? '',
      is_recurring: false,
      frequency: 'monthly',
      months_ahead: 12,
    })
    setEditErr('')
  }

  async function handleUpdate(id: string) {
    if (!editForm.supplier_name) return setEditErr('Campo obbligatorio')
    const amountCents = parseCents(editForm.amount)
    if (amountCents <= 0) return setEditErr('Importo non valido')

    setEditSaving(true)
    const raw = editForm.flow_type === 'out' ? -amountCents : amountCents
    const res = await updateCommitment(id, {
      supplier_name: editForm.supplier_name,
      account_description: editForm.account_description || null,
      due_date: editForm.due_date,
      amount_cents: raw,
      flow_type: editForm.flow_type,
      notes: editForm.notes || null,
    })
    setEditSaving(false)
    if ('error' in res) return setEditErr(res.error)
    setEditingId(null)
    router.refresh()
  }

  async function handleCancel(id: string) {
    startTransition(async () => {
      await cancelCommitment(id)
      router.refresh()
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminare definitivamente questo impegno?')) return
    startTransition(async () => {
      await deleteCommitment(id)
      router.refresh()
    })
  }

  const totalOut = items.filter(r => r.flow_type === 'out').reduce((s, r) => s + Math.abs(r.amount_cents), 0)
  const totalIn  = items.filter(r => r.flow_type === 'in').reduce((s, r) => s + Math.abs(r.amount_cents), 0)

  return (
    <div>
      {/* Filtri + azioni */}
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={companyId}
              onChange={e => push({ company: e.target.value })}
              className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Tutte le società</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-1">
              {STATUS_OPTIONS.map(o => (
                <button key={o.value} onClick={() => push({ status: o.value })}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${status === o.value ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-zinc-700" />
            <div className="flex gap-1">
              {FLOW_OPTIONS.map(o => (
                <button key={o.value} onClick={() => push({ flow: o.value })}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${flow === o.value ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-zinc-700" />
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              <input type="date" value={fromLocal}
                onChange={e => setFromLocal(e.target.value)}
                onBlur={e => push({ from: e.target.value })}
                className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <span className="text-zinc-600 text-xs">→</span>
              <input type="date" value={toLocal}
                onChange={e => setToLocal(e.target.value)}
                onBlur={e => push({ to: e.target.value })}
                className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              {(fromLocal || toLocal) && (
                <button onClick={() => { setFromLocal(''); setToLocal(''); push({ from: '', to: '' }) }}
                  className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 self-start">
          <button onClick={openBatch}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg transition-colors">
            <ListPlus className="w-4 h-4" />
            Multiplo
          </button>
          <button onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
            Nuovo
          </button>
        </div>
      </div>

      {/* Summary */}
      {items.length > 0 && (
        <div className="flex items-center gap-5 mb-4 text-xs text-zinc-400">
          <span>{items.length} voci</span>
          {(flow === '' || flow === 'out') && totalOut > 0 && (
            <span>Uscite: <span className="text-red-400 font-medium">{formatEur(totalOut)}</span></span>
          )}
          {(flow === '' || flow === 'in') && totalIn > 0 && (
            <span>Entrate: <span className="text-emerald-400 font-medium">{formatEur(totalIn)}</span></span>
          )}
        </div>
      )}

      {/* Tabella */}
      {items.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-zinc-500 text-sm">
            {!companyId && !status && !flow && !from && !to
              ? 'Nessun impegno presente. Crea il primo con "+ Nuovo".'
              : 'Nessun risultato con i filtri applicati.'}
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Data</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Fornitore / Descrizione</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Società</th>
                  <th className="text-right px-3 py-2.5 text-zinc-400 font-medium">Importo</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Stato</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const company = companies.find(c => c.id === item.company_id)
                  const isEditing = editingId === item.id
                  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.pending

                  if (isEditing) {
                    return (
                      <tr key={item.id} className="border-b border-zinc-800/40 bg-zinc-800/30">
                        <td className="px-3 py-2">
                          <input type="date" value={editForm.due_date}
                            onChange={e => setEditForm(p => ({ ...p, due_date: e.target.value }))}
                            className="w-32 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <input type="text" value={editForm.supplier_name} placeholder="Fornitore*"
                              onChange={e => setEditForm(p => ({ ...p, supplier_name: e.target.value }))}
                              className="w-48 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            <input type="text" value={editForm.account_description} placeholder="Descrizione"
                              onChange={e => setEditForm(p => ({ ...p, account_description: e.target.value }))}
                              className="w-48 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-400 focus:outline-none" />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select value={editForm.flow_type}
                            onChange={e => setEditForm(p => ({ ...p, flow_type: e.target.value as 'in' | 'out' }))}
                            className="px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-200 focus:outline-none">
                            <option value="out">Uscita</option>
                            <option value="in">Entrata</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" step="0.01" value={editForm.amount}
                            onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))}
                            className="w-28 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-right text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        </td>
                        <td className="px-3 py-2">
                          {editErr && <span className="text-red-400">{editErr}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleUpdate(item.id)} disabled={editSaving}
                              className="p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50" title="Salva">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300" title="Annulla modifica">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={item.id} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
                      <td className={`px-3 py-2 font-mono ${
                        item.status !== 'cancelled' && item.due_date < today()
                          ? 'text-red-400 font-semibold'
                          : 'text-zinc-300'
                      }`}>
                        {new Date(item.due_date + 'T00:00:00').toLocaleDateString('it-IT')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-zinc-200">{item.supplier_name ?? '—'}</span>
                          {item.commitment_type && COMMITMENT_TYPE_BADGE[item.commitment_type] && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${COMMITMENT_TYPE_BADGE[item.commitment_type]!.cls}`}>
                              {COMMITMENT_TYPE_BADGE[item.commitment_type]!.label}
                            </span>
                          )}
                          {matchedSet.has(item.id) && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-500/20 text-orange-400">
                              Già in scadenzario
                            </span>
                          )}
                        </div>
                        {item.account_description && (
                          <div className="text-zinc-500 mt-0.5">{item.account_description}</div>
                        )}
                        {item.reference_month && (
                          <div className="text-zinc-600 mt-0.5 font-mono">{item.reference_month}</div>
                        )}
                        {item.postpone_notes && (
                          <div className="text-zinc-600 mt-0.5 italic">{item.postpone_notes}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{company?.code ?? '—'}</td>
                      <td className={`px-3 py-2 text-right font-medium tabular-nums ${
                        item.flow_type === 'out' ? 'text-red-400' : 'text-emerald-400'
                      }`}>
                        {item.flow_type === 'out' ? '-' : '+'}{formatEur(Math.abs(item.amount_cents))}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {item.status !== 'cancelled' && (
                            <>
                              <button onClick={() => startEdit(item)}
                                className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700" title="Modifica">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleCancel(item.id)}
                                className="p-1.5 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700" title="Annulla impegno">
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                              {matchedSet.has(item.id) && (
                                <button onClick={() => handleCancel(item.id)}
                                  className="px-2 py-1 rounded text-xs font-medium text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 transition-colors" title="Annulla perché già presente in scadenzario">
                                  Annulla duplicato
                                </button>
                              )}
                            </>
                          )}
                          <button onClick={() => handleDelete(item.id)}
                            className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-700" title="Elimina">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal nuovo impegno */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-zinc-100">Nuovo impegno</h2>
              <button onClick={() => setModalOpen(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Società *</label>
                <select value={form.company_id} onChange={e => setForm(p => ({ ...p, company_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value="">Seleziona...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Fornitore / Controparte *</label>
                <input type="text" value={form.supplier_name} placeholder="Es. Enel, Affitto ufficio..."
                  onChange={e => setForm(p => ({ ...p, supplier_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Descrizione aggiuntiva</label>
                <input type="text" value={form.account_description} placeholder="Facoltativo"
                  onChange={e => setForm(p => ({ ...p, account_description: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Data scadenza *</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Tipo</label>
                  <select value={form.flow_type} onChange={e => setForm(p => ({ ...p, flow_type: e.target.value as 'in' | 'out' }))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="out">Uscita</option>
                    <option value="in">Entrata</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Importo (€) *</label>
                <input type="number" min="0" step="0.01" value={form.amount} placeholder="0.00"
                  onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Note</label>
                <input type="text" value={form.notes} placeholder="Facoltativo"
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>

              {/* Ricorrente */}
              <div className="border border-zinc-700 rounded-lg p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={e => setForm(p => ({ ...p, is_recurring: e.target.checked }))}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                  />
                  <span className="text-sm text-zinc-200 flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5 text-zinc-400" />
                    Ripeti
                  </span>
                </label>
                {form.is_recurring && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Frequenza</label>
                      <select
                        value={form.frequency}
                        onChange={e => setForm(p => ({ ...p, frequency: e.target.value as FormState['frequency'] }))}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="monthly">Mensile</option>
                        <option value="quarterly">Trimestrale</option>
                        <option value="annual">Annuale</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Per quanti mesi</label>
                      <input
                        type="number" min="1" max="24" step="1"
                        value={form.months_ahead}
                        onChange={e => setForm(p => ({ ...p, months_ahead: parseInt(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {formErr && <p className="text-red-400 text-xs">{formErr}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
                  Annulla
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Salvataggio...' : form.is_recurring ? `Crea ${form.months_ahead} voci` : 'Crea impegno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal inserimento multiplo */}
      {batchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-5xl p-6 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-zinc-100">Inserimento multiplo</h2>
              <button onClick={() => setBatchOpen(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5" /></button>
            </div>

            <div className="overflow-x-auto flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left px-2 py-2 text-zinc-400 font-medium">Società *</th>
                    <th className="text-left px-2 py-2 text-zinc-400 font-medium">Fornitore / Descrizione *</th>
                    <th className="text-left px-2 py-2 text-zinc-400 font-medium">Data *</th>
                    <th className="text-left px-2 py-2 text-zinc-400 font-medium">Importo * (€)</th>
                    <th className="text-left px-2 py-2 text-zinc-400 font-medium">Tipo</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map(row => (
                    <tr key={row.id} className="border-b border-zinc-800/40">
                      <td className="px-2 py-1.5">
                        <select value={row.company_id} onChange={e => updateBatchRow(row.id, 'company_id', e.target.value)}
                          className="w-32 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none">
                          <option value="">—</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-col gap-1">
                          <input type="text" value={row.supplier_name} placeholder="Fornitore*"
                            onChange={e => updateBatchRow(row.id, 'supplier_name', e.target.value)}
                            className="w-44 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          <input type="text" value={row.account_description} placeholder="Descrizione"
                            onChange={e => updateBatchRow(row.id, 'account_description', e.target.value)}
                            className="w-44 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-400 focus:outline-none" />
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="date" value={row.due_date}
                          onChange={e => updateBatchRow(row.id, 'due_date', e.target.value)}
                          className="w-32 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="0.01" value={row.amount} placeholder="0.00"
                          onChange={e => updateBatchRow(row.id, 'amount', e.target.value)}
                          className="w-28 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-right text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={row.flow_type} onChange={e => updateBatchRow(row.id, 'flow_type', e.target.value)}
                          className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none">
                          <option value="out">Uscita</option>
                          <option value="in">Entrata</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        {batchRows.length > 1 && (
                          <button onClick={() => removeBatchRow(row.id)} className="p-1 text-zinc-500 hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4">
              <button onClick={addBatchRow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Aggiungi riga
              </button>
              <div className="flex items-center gap-3">
                {batchErr && <span className="text-red-400 text-xs">{batchErr}</span>}
                <button onClick={() => setBatchOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg">
                  Annulla
                </button>
                <button onClick={handleBatchSave} disabled={batchSaving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg disabled:opacity-50">
                  {batchSaving ? 'Salvataggio...' : `Salva ${batchRows.filter(r => r.supplier_name && parseCents(r.amount) > 0).length} voci`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// TemplatesSection
// ────────────────────────────────────────────────────────────────────────────

type TForm = {
  company_id: string
  name: string
  category: RecurringTemplate['category']
  amount: string
  flow_type: 'in' | 'out'
  frequency: RecurringTemplate['frequency']
  day_of_month: string
  notes: string
}

const EMPTY_TFORM: TForm = {
  company_id: '',
  name: '',
  category: 'other',
  amount: '',
  flow_type: 'out',
  frequency: 'monthly',
  day_of_month: '1',
  notes: '',
}

function TemplatesSection({
  templates,
  companies,
}: {
  templates: RecurringTemplate[]
  companies: Pick<Company, 'id' | 'code' | 'name'>[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [companyId, setCompanyId] = useState('')
  const [tModalOpen, setTModalOpen] = useState(false)
  const [editingT, setEditingT] = useState<RecurringTemplate | null>(null)
  const [tForm, setTForm] = useState<TForm>(EMPTY_TFORM)
  const [tFormErr, setTFormErr] = useState('')
  const [tSaving, setTSaving] = useState(false)

  const [genMonth, setGenMonth] = useState(currentYearMonth())
  const [selectedTIds, setSelectedTIds] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState('')

  const filtered     = companyId ? templates.filter(t => t.company_id === companyId) : templates
  const activeFiltered = filtered.filter(t => t.active)

  function openCreate() {
    setEditingT(null)
    setTForm({ ...EMPTY_TFORM, company_id: companyId })
    setTFormErr('')
    setTModalOpen(true)
  }

  function openEdit(t: RecurringTemplate) {
    setEditingT(t)
    setTForm({
      company_id: t.company_id,
      name: t.name,
      category: t.category,
      amount: t.amount_cents != null ? (t.amount_cents / 100).toFixed(2) : '',
      flow_type: t.flow_type,
      frequency: t.frequency,
      day_of_month: String(t.day_of_month),
      notes: t.notes ?? '',
    })
    setTFormErr('')
    setTModalOpen(true)
  }

  async function handleTSave(e: React.FormEvent) {
    e.preventDefault()
    if (!tForm.company_id) return setTFormErr('Seleziona la società')
    if (!tForm.name)       return setTFormErr('Inserisci il nome')

    const amountCents = tForm.amount ? parseCents(tForm.amount) : null
    if (tForm.amount && (!amountCents || amountCents <= 0)) return setTFormErr('Importo non valido')

    const day = parseInt(tForm.day_of_month)
    if (isNaN(day) || day < 1 || day > 31) return setTFormErr('Giorno non valido (1-31)')

    setTSaving(true)
    const input: TemplateInput = {
      company_id: tForm.company_id,
      name: tForm.name,
      category: tForm.category,
      amount_cents: amountCents,
      flow_type: tForm.flow_type,
      frequency: tForm.frequency,
      day_of_month: day,
      notes: tForm.notes || null,
    }

    const res = editingT
      ? await updateTemplate(editingT.id, input)
      : await createTemplate(input)

    setTSaving(false)
    if ('error' in res) return setTFormErr(res.error)
    setTModalOpen(false)
    router.refresh()
  }

  async function handleTDelete(id: string) {
    if (!confirm('Eliminare definitivamente questo template?')) return
    startTransition(async () => {
      await deleteTemplate(id)
      router.refresh()
    })
  }

  async function handleToggleActive(t: RecurringTemplate) {
    startTransition(async () => {
      await updateTemplate(t.id, { active: !t.active })
      router.refresh()
    })
  }

  async function handleGenerate() {
    if (!selectedTIds.size) return
    const [yearStr, monthStr] = genMonth.split('-')
    setGenerating(true)
    setGenMsg('')
    const res = await generateMonth(Array.from(selectedTIds), parseInt(yearStr), parseInt(monthStr))
    setGenerating(false)
    if (res.error) { setGenMsg('Errore: ' + res.error); return }
    setGenMsg(`${res.created} ${res.created === 1 ? 'voce creata' : 'voci create'} per ${genMonth}`)
    router.refresh()
  }

  function toggleTId(id: string) {
    const next = new Set(selectedTIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedTIds(next)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <select value={companyId} onChange={e => setCompanyId(e.target.value)}
          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none">
          <option value="">Tutte le società</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Nuovo template
        </button>
      </div>

      {/* Lista template */}
      {filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-zinc-500 text-sm">Nessun template. Crea il primo con &quot;+ Nuovo template&quot;.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Nome</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Categoria</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Importo stima</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Giorno</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Frequenza</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Stato</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const company = companies.find(c => c.id === t.company_id)
                  return (
                    <tr key={t.id} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
                      <td className="px-3 py-2">
                        <div className="text-zinc-200">{t.name}</div>
                        <div className="text-zinc-500">{company?.code}</div>
                        {t.notes && <div className="text-zinc-600 italic mt-0.5">{t.notes}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[t.category]}`}>
                          {CATEGORY_LABELS[t.category]}
                        </span>
                      </td>
                      <td className={`px-3 py-2 font-medium tabular-nums ${t.flow_type === 'out' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {t.amount_cents != null
                          ? `${t.flow_type === 'out' ? '-' : '+'}${formatEur(t.amount_cents)}`
                          : <span className="text-zinc-500 font-normal italic">variabile</span>}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{t.day_of_month}°</td>
                      <td className="px-3 py-2 text-zinc-400">{FREQ_LABELS[t.frequency]}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${t.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-500'}`}>
                          {t.active ? 'Attivo' : 'Inattivo'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(t)}
                            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700" title="Modifica">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleToggleActive(t)}
                            className={`p-1.5 rounded hover:bg-zinc-700 text-xs ${t.active ? 'text-zinc-400 hover:text-amber-400' : 'text-zinc-500 hover:text-emerald-400'}`}
                            title={t.active ? 'Disattiva' : 'Attiva'}>
                            {t.active ? <Ban className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleTDelete(t.id)}
                            className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-700" title="Elimina">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pannello Genera mese */}
      {activeFiltered.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <Repeat className="w-4 h-4 text-indigo-400" /> Genera mese
          </h3>
          <div className="flex items-start gap-6 flex-wrap">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Mese di riferimento</label>
              <input type="month" value={genMonth} onChange={e => setGenMonth(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div className="flex-1 min-w-48">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-zinc-400">Template da generare</label>
                <button onClick={() => setSelectedTIds(selectedTIds.size === activeFiltered.length ? new Set() : new Set(activeFiltered.map(t => t.id)))}
                  className="text-xs text-indigo-400 hover:text-indigo-300">
                  {selectedTIds.size === activeFiltered.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
                </button>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {activeFiltered.map(t => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedTIds.has(t.id)} onChange={() => toggleTId(t.id)}
                      className="rounded border-zinc-600 bg-zinc-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900" />
                    <span className="text-xs text-zinc-300">{t.name}</span>
                    {t.amount_cents != null && (
                      <span className={`text-xs ${t.flow_type === 'out' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {formatEur(t.amount_cents)}
                      </span>
                    )}
                    <span className="text-xs text-zinc-600">({companies.find(c => c.id === t.company_id)?.code})</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <button onClick={handleGenerate} disabled={generating || !selectedTIds.size}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
              {generating ? 'Generazione...' : `Genera ${selectedTIds.size > 0 ? `(${selectedTIds.size})` : ''}`}
            </button>
            {genMsg && (
              <span className={`text-xs ${genMsg.startsWith('Errore') ? 'text-red-400' : 'text-emerald-400'}`}>
                {genMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Modal crea/modifica template */}
      {tModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-zinc-100">{editingT ? 'Modifica template' : 'Nuovo template'}</h2>
              <button onClick={() => setTModalOpen(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleTSave} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Società *</label>
                <select value={tForm.company_id} onChange={e => setTForm(p => ({ ...p, company_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value="">Seleziona...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Nome *</label>
                <input type="text" value={tForm.name} placeholder="Es. Enel WT, Affitto ufficio..."
                  onChange={e => setTForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Categoria</label>
                  <select value={tForm.category} onChange={e => setTForm(p => ({ ...p, category: e.target.value as RecurringTemplate['category'] }))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    {(Object.keys(CATEGORY_LABELS) as RecurringTemplate['category'][]).map(k => (
                      <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Tipo</label>
                  <select value={tForm.flow_type} onChange={e => setTForm(p => ({ ...p, flow_type: e.target.value as 'in' | 'out' }))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="out">Uscita</option>
                    <option value="in">Entrata</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Importo stima (€) — lascia vuoto se variabile</label>
                <input type="number" min="0" step="0.01" value={tForm.amount} placeholder="0.00 (opzionale)"
                  onChange={e => setTForm(p => ({ ...p, amount: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Frequenza</label>
                  <select value={tForm.frequency} onChange={e => setTForm(p => ({ ...p, frequency: e.target.value as RecurringTemplate['frequency'] }))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="monthly">Mensile</option>
                    <option value="quarterly">Trimestrale</option>
                    <option value="annual">Annuale</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Giorno del mese (1-31)</label>
                  <input type="number" min="1" max="31" value={tForm.day_of_month}
                    onChange={e => setTForm(p => ({ ...p, day_of_month: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Note</label>
                <input type="text" value={tForm.notes} placeholder="Facoltativo"
                  onChange={e => setTForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              {tFormErr && <p className="text-red-400 text-xs">{tFormErr}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setTModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
                  Annulla
                </button>
                <button type="submit" disabled={tSaving}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
                  {tSaving ? 'Salvataggio...' : (editingT ? 'Salva' : 'Crea template')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// SalarySection
// ────────────────────────────────────────────────────────────────────────────

type SalarySubsection = 'salary_item' | 'collab_item'

function SalarySection({
  items,
  companies,
}: {
  items: PaymentScheduleItem[]
  companies: Pick<Company, 'id' | 'code' | 'name'>[]
}) {
  const router = useRouter()

  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [refMonth, setRefMonth]   = useState(currentYearMonth())

  // Filtro voci esistenti per tipo/mese/società
  const filterItems = (type: CommitmentType) =>
    items.filter(i =>
      i.commitment_type === type &&
      i.reference_month === refMonth &&
      (!companyId || i.company_id === companyId)
    )

  const salaryItems  = filterItems('salary_item')
  const collabItems  = filterItems('collab_item')
  const taxItem      = filterItems('tax_item')[0]

  // ── Stato upload dipendenti ───────────────────────────────────────────────
  const [salPreview, setSalPreview]     = useState<SalaryItem[] | null>(null)
  const [salDueDate, setSalDueDate]     = useState('')
  const [salLoading, setSalLoading]     = useState(false)
  const [salErr, setSalErr]             = useState('')
  const salRef = useRef<HTMLInputElement>(null)

  // ── Stato upload collaboratori ────────────────────────────────────────────
  const [colPreview, setColPreview]     = useState<SalaryItem[] | null>(null)
  const [colDueDate, setColDueDate]     = useState('')
  const [colLoading, setColLoading]     = useState(false)
  const [colErr, setColErr]             = useState('')
  const colRef = useRef<HTMLInputElement>(null)

  // ── Stato F24 ─────────────────────────────────────────────────────────────
  const [f24Amount, setF24Amount]     = useState('')
  const [f24DueDate, setF24DueDate]   = useState('')
  const [f24Saving, setF24Saving]     = useState(false)
  const [f24Err, setF24Err]           = useState('')
  const [f24Editing, setF24Editing]   = useState(false)

  function startF24Edit() {
    setF24Amount(taxItem ? (Math.abs(taxItem.amount_cents) / 100).toFixed(2) : '')
    setF24DueDate(taxItem?.due_date ?? '')
    setF24Editing(true)
    setF24Err('')
  }

  function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
    type: SalarySubsection,
  ) {
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

  async function handleImport(type: SalarySubsection) {
    if (!companyId || !refMonth) return

    const preview  = type === 'salary_item' ? salPreview  : colPreview
    const dueDate  = type === 'salary_item' ? salDueDate  : colDueDate
    const setLoading = type === 'salary_item' ? setSalLoading : setColLoading
    const setErr     = type === 'salary_item' ? setSalErr     : setColErr
    const setPreview = type === 'salary_item' ? setSalPreview : setColPreview
    const ref        = type === 'salary_item' ? salRef        : colRef

    if (!preview?.length) return setErr('Nessuna voce valida trovata nel file')
    if (!dueDate)          return setErr('Inserisci la data di pagamento')

    setLoading(true)
    const res = await importSalaryItems(companyId, refMonth, type, preview, dueDate)
    setLoading(false)
    if (res.error) { setErr(res.error); return }
    setPreview(null)
    if (ref.current) ref.current.value = ''
    router.refresh()
  }

  async function handleF24Save() {
    if (!companyId || !refMonth) return
    const amountCents = parseCents(f24Amount)
    if (amountCents <= 0) return setF24Err('Inserisci un importo valido')
    if (!f24DueDate)      return setF24Err('Inserisci la data di scadenza')

    setF24Saving(true)
    const res = await importTaxItem(companyId, refMonth, amountCents, f24DueDate)
    setF24Saving(false)
    if (res.error) { setF24Err(res.error); return }
    setF24Editing(false)
    router.refresh()
  }

  const monthLabel = new Date(refMonth + '-01').toLocaleDateString('it-IT', { year: 'numeric', month: 'long' })

  return (
    <div className="space-y-6">
      {/* Selettori */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Società</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none">
            <option value="">Seleziona...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Mese di riferimento</label>
          <input type="month" value={refMonth} onChange={e => setRefMonth(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
      </div>

      {/* Sezione Dipendenti */}
      <SalarySubSection
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
        monthLabel={monthLabel}
        companyId={companyId}
        refMonth={refMonth}
        onFileChange={handleFileChange}
        onImport={handleImport}
        onReimport={() => { setSalPreview(null); if (salRef.current) salRef.current.value = ''; }}
      />

      {/* Sezione Collaboratori */}
      <SalarySubSection
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
        monthLabel={monthLabel}
        companyId={companyId}
        refMonth={refMonth}
        onFileChange={handleFileChange}
        onImport={handleImport}
        onReimport={() => { setColPreview(null); if (colRef.current) colRef.current.value = ''; }}
      />

      {/* Sezione F24 */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-zinc-200 mb-4">F24 — {monthLabel}</h3>

        {taxItem && !f24Editing ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-red-400 font-medium tabular-nums">
                -{formatEur(Math.abs(taxItem.amount_cents))}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Scadenza: {new Date(taxItem.due_date + 'T00:00:00').toLocaleDateString('it-IT')}
              </div>
            </div>
            <button onClick={startF24Edit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg">
              <Pencil className="w-3.5 h-3.5" /> Modifica
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Importo (€) *</label>
                <input type="number" min="0" step="0.01" value={f24Amount} placeholder="0.00"
                  onChange={e => setF24Amount(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Data scadenza *</label>
                <input type="date" value={f24DueDate}
                  onChange={e => setF24DueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
            </div>
            {f24Err && <p className="text-red-400 text-xs">{f24Err}</p>}
            <div className="flex gap-3">
              {(taxItem || f24Editing) && (
                <button onClick={() => { setF24Editing(false); setF24Err('') }}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg">
                  Annulla
                </button>
              )}
              <button onClick={handleF24Save} disabled={f24Saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg disabled:opacity-50">
                {f24Saving ? 'Salvataggio...' : 'Salva F24'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sotto-sezione riutilizzabile per Dipendenti/Collaboratori ─────────────────

function SalarySubSection({
  title, type, items, preview, dueDate, setDueDate, loading, err, setErr,
  fileRef, monthLabel, companyId, refMonth, onFileChange, onImport, onReimport,
}: {
  title: string
  type: SalarySubsection
  items: PaymentScheduleItem[]
  preview: SalaryItem[] | null
  dueDate: string
  setDueDate: (v: string) => void
  loading: boolean
  err: string
  setErr: (v: string) => void
  fileRef: React.RefObject<HTMLInputElement | null>
  monthLabel: string
  companyId: string
  refMonth: string
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>, type: SalarySubsection) => void
  onImport: (type: SalarySubsection) => void
  onReimport: () => void
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
        <Users className="w-4 h-4 text-zinc-400" /> {title} — {monthLabel}
      </h3>

      {/* Voci esistenti */}
      {items.length > 0 && !preview && (
        <div className="mb-4">
          <div className="bg-zinc-800/50 rounded-lg overflow-hidden mb-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Nominativo</th>
                  <th className="text-right px-3 py-2 text-zinc-400 font-medium">Importo</th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-b border-zinc-700/40 last:border-0">
                    <td className="px-3 py-1.5 text-zinc-300">{i.supplier_name}</td>
                    <td className="px-3 py-1.5 text-right text-red-400 tabular-nums">
                      -{formatEur(Math.abs(i.amount_cents))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-600">
                  <td className="px-3 py-1.5 text-zinc-400 font-medium">Totale</td>
                  <td className="px-3 py-1.5 text-right text-red-400 font-medium tabular-nums">
                    -{formatEur(items.reduce((s, i) => s + Math.abs(i.amount_cents), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button onClick={onReimport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg">
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
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              disabled={!companyId}
              onChange={e => { setErr(''); onFileChange(e, type) }} />
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
                    -{formatEur(preview.reduce((s, i) => s + i.amountCents, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Data pagamento *</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-2 self-end">
              <button onClick={onReimport}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg">
                Annulla
              </button>
              <button onClick={() => onImport(type)} disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg disabled:opacity-50">
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

// ────────────────────────────────────────────────────────────────────────────
// ReconciliationSection
// ────────────────────────────────────────────────────────────────────────────

function ReconciliationSection({
  companies,
}: {
  companies: Pick<Company, 'id' | 'code' | 'name'>[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [month, setMonth]         = useState(currentYearMonth())
  const [commitments, setCommitments] = useState<PaymentScheduleItem[]>([])
  const [accounting,  setAccounting]  = useState<PaymentScheduleItem[]>([])
  const [loading, setLoading] = useState(false)

  async function fetchData(cId: string, m: string) {
    if (!cId || !m) return
    setLoading(true)
    const supabase = createClient()
    const [year, mo] = m.split('-').map(Number)
    const dateFrom = `${m}-01`
    const dateTo   = `${m}-${String(new Date(year, mo, 0).getDate()).padStart(2, '0')}`

    const [{ data: c }, { data: a }] = await Promise.all([
      supabase
        .from('payment_schedule')
        .select('*')
        .eq('company_id', cId)
        .eq('entry_type', 'commitment')
        .eq('flow_type', 'out')
        .in('status', ['pending', 'scheduled'])
        .gte('due_date', dateFrom)
        .lte('due_date', dateTo)
        .order('due_date'),
      supabase
        .from('payment_schedule')
        .select('*')
        .eq('company_id', cId)
        .eq('entry_type', 'accounting')
        .eq('flow_type', 'out')
        .not('status', 'in', '("paid","cancelled")')
        .gte('due_date', dateFrom)
        .lte('due_date', dateTo)
        .order('due_date'),
    ])
    setCommitments((c ?? []) as PaymentScheduleItem[])
    setAccounting((a ?? []) as PaymentScheduleItem[])
    setLoading(false)
  }

  useEffect(() => { fetchData(companyId, month) }, [companyId, month])

  async function handleCancel(id: string) {
    startTransition(async () => {
      await cancelCommitment(id)
      await fetchData(companyId, month)
      router.refresh()
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminare definitivamente questo impegno?')) return
    startTransition(async () => {
      await deleteCommitment(id)
      await fetchData(companyId, month)
      router.refresh()
    })
  }

  const monthLabel      = new Date(month + '-01').toLocaleDateString('it-IT', { year: 'numeric', month: 'long' })
  const totalCommitments = commitments.reduce((s, i) => s + Math.abs(i.amount_cents), 0)
  const totalAccounting  = accounting.reduce((s, i) => s + Math.abs(i.amount_cents), 0)

  return (
    <div className="space-y-5">
      {/* Selettori */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Società</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none">
            <option value="">Seleziona...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Mese</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <button onClick={() => fetchData(companyId, month)}
          className="self-end p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg" title="Ricarica">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {!companyId ? (
        <p className="text-zinc-500 text-sm">Seleziona una società per visualizzare la riconciliazione.</p>
      ) : loading ? (
        <p className="text-zinc-500 text-sm">Caricamento...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">

          {/* Colonna sinistra: Impegni previsti */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Impegni previsti</h3>
                <p className="text-xs text-zinc-500">{commitments.length} voci · {monthLabel}</p>
              </div>
              {totalCommitments > 0 && (
                <span className="text-sm font-medium text-red-400 tabular-nums">-{formatEur(totalCommitments)}</span>
              )}
            </div>
            {commitments.length === 0 ? (
              <p className="px-4 py-8 text-zinc-600 text-xs text-center">Nessun impegno attivo per questo mese.</p>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {commitments.map(item => {
                  const ctBadge = item.commitment_type ? COMMITMENT_TYPE_BADGE[item.commitment_type] : null
                  return (
                    <div key={item.id} className="px-4 py-2.5 flex items-center gap-2 hover:bg-zinc-800/20">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-zinc-200 truncate">{item.supplier_name ?? '—'}</span>
                          {ctBadge && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${ctBadge.cls}`}>
                              {ctBadge.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-zinc-500 font-mono">
                            {new Date(item.due_date + 'T00:00:00').toLocaleDateString('it-IT')}
                          </span>
                          <span className="text-xs font-medium text-red-400 tabular-nums">
                            -{formatEur(Math.abs(item.amount_cents))}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleCancel(item.id)}
                          className="p-1.5 rounded text-zinc-500 hover:text-amber-400 hover:bg-zinc-700" title="Annulla impegno">
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700" title="Elimina">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Colonna destra: Scadenzario */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Fatture reali (scadenzario)</h3>
                <p className="text-xs text-zinc-500">{accounting.length} voci · {monthLabel}</p>
              </div>
              {totalAccounting > 0 && (
                <span className="text-sm font-medium text-red-400 tabular-nums">-{formatEur(totalAccounting)}</span>
              )}
            </div>
            {accounting.length === 0 ? (
              <p className="px-4 py-8 text-zinc-600 text-xs text-center">Nessuna fattura in scadenzario per questo mese.</p>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {accounting.map(item => (
                  <div key={item.id} className="px-4 py-2.5">
                    <div className="text-xs text-zinc-200 truncate">{item.supplier_name ?? '—'}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-zinc-500 font-mono">
                        {new Date(item.due_date + 'T00:00:00').toLocaleDateString('it-IT')}
                      </span>
                      <span className="text-xs font-medium text-red-400 tabular-nums">
                        -{formatEur(Math.abs(item.amount_cents))}
                      </span>
                      {item.document_number && (
                        <span className="text-xs text-zinc-600 truncate">{item.document_number}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────────────────

const TABS = [
  { value: 'commitments',    label: 'Impegni',          icon: Calendar },
  { value: 'templates',      label: 'Costi ricorrenti', icon: Repeat },
  { value: 'salary',         label: 'Stipendi',         icon: Users },
  { value: 'reconciliation', label: 'Riconciliazione',  icon: Scale },
]

export default function ImpegniClient({ items, companies, templates, matchedIds }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const sp       = useSearchParams()

  const activeTab = sp.get('tab') ?? 'commitments'

  function switchTab(tab: string) {
    const params = new URLSearchParams(sp.toString())
    if (tab === 'commitments') params.delete('tab')
    else params.set('tab', tab)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Impegni</h1>
        <div className="flex gap-1 bg-zinc-800/60 p-1 rounded-lg">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.value}
                onClick={() => switchTab(tab.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'commitments' && (
        <CommitmentsSection items={items} companies={companies} matchedIds={matchedIds} />
      )}
      {activeTab === 'templates' && (
        <TemplatesSection templates={templates} companies={companies} />
      )}
      {activeTab === 'salary' && (
        <SalarySection items={items} companies={companies} />
      )}
      {activeTab === 'reconciliation' && (
        <ReconciliationSection companies={companies} />
      )}
    </div>
  )
}

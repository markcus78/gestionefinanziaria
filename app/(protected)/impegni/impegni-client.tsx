'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { Plus, X, Pencil, Ban, Trash2, Check, Calendar } from 'lucide-react'
import { createCommitment, updateCommitment, cancelCommitment, deleteCommitment } from './actions'
import type { PaymentScheduleItem, PaymentStatus } from '@/lib/types/database'
import type { Company } from '@/lib/types/database'

type Props = {
  items: PaymentScheduleItem[]
  companies: Pick<Company, 'id' | 'code' | 'name'>[]
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function parseCents(val: string): number {
  const n = parseFloat(val.replace(',', '.'))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '',          label: 'Tutti' },
  { value: 'pending',   label: 'Attivi' },
  { value: 'cancelled', label: 'Annullati' },
]

const FLOW_OPTIONS: { value: string; label: string }[] = [
  { value: '',    label: 'Tutti' },
  { value: 'out', label: 'Uscite' },
  { value: 'in',  label: 'Entrate' },
]

const STATUS_BADGE: Record<PaymentStatus, { label: string; cls: string }> = {
  pending:   { label: 'Attivo',      cls: 'bg-amber-500/20 text-amber-400' },
  scheduled: { label: 'Programmato', cls: 'bg-blue-500/20 text-blue-400' },
  paid:      { label: 'Pagato',      cls: 'bg-emerald-500/20 text-emerald-400' },
  postponed: { label: 'Posticipato', cls: 'bg-purple-500/20 text-purple-400' },
  disputed:  { label: 'Contestato',  cls: 'bg-red-500/20 text-red-400' },
  cancelled: { label: 'Annullato',   cls: 'bg-zinc-700 text-zinc-400' },
}

type FormState = {
  company_id: string
  supplier_name: string
  account_description: string
  due_date: string
  amount: string
  flow_type: 'in' | 'out'
  notes: string
}

const EMPTY_FORM: FormState = {
  company_id: '',
  supplier_name: '',
  account_description: '',
  due_date: '',
  amount: '',
  flow_type: 'out',
  notes: '',
}

export default function ImpegniClient({ items, companies }: Props) {
  const router    = useRouter()
  const pathname  = usePathname()
  const sp        = useSearchParams()
  const [, startTransition] = useTransition()

  // ── Filtri ────────────────────────────────────────────────────────────────
  const companyId = sp.get('company') ?? ''
  const status    = sp.get('status')  ?? ''
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
    setForm({ ...EMPTY_FORM, company_id: companyId, due_date: new Date().toISOString().split('T')[0] })
    setFormErr('')
    setModalOpen(true)
  }

  function handleFormChange(k: keyof FormState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company_id)    return setFormErr('Seleziona la società')
    if (!form.supplier_name) return setFormErr('Inserisci fornitore/descrizione')
    if (!form.due_date)      return setFormErr('Inserisci la data')
    const amountCents = parseCents(form.amount)
    if (amountCents <= 0)    return setFormErr('Inserisci un importo valido')

    setSaving(true)
    const raw = form.flow_type === 'out' ? -amountCents : amountCents
    const res = await createCommitment({
      company_id: form.company_id,
      supplier_name: form.supplier_name,
      account_description: form.account_description || null,
      due_date: form.due_date,
      amount_cents: raw,
      flow_type: form.flow_type,
      notes: form.notes || null,
    })
    setSaving(false)
    if ('error' in res) return setFormErr(res.error)
    setModalOpen(false)
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

  // ── Azioni ────────────────────────────────────────────────────────────────
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

  // ── Totali ────────────────────────────────────────────────────────────────
  const totalOut = items.filter(r => r.flow_type === 'out').reduce((s, r) => s + Math.abs(r.amount_cents), 0)
  const totalIn  = items.filter(r => r.flow_type === 'in').reduce((s, r) => s + Math.abs(r.amount_cents), 0)

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Impegni</h1>
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuovo impegno
        </button>
      </div>

      {/* Filtri */}
      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={companyId}
            onChange={e => push({ company: e.target.value })}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Tutte le società</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Status chips */}
          <div className="flex gap-1">
            {STATUS_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => push({ status: o.value })}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  status === o.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-700" />

          {/* Flow chips */}
          <div className="flex gap-1">
            {FLOW_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => push({ flow: o.value })}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  flow === o.value
                    ? 'bg-zinc-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-700" />

          {/* Date range */}
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <input
              type="date"
              value={fromLocal}
              onChange={e => setFromLocal(e.target.value)}
              onBlur={e => push({ from: e.target.value })}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-zinc-600 text-xs">→</span>
            <input
              type="date"
              value={toLocal}
              onChange={e => setToLocal(e.target.value)}
              onBlur={e => push({ to: e.target.value })}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {(fromLocal || toLocal) && (
              <button
                onClick={() => { setFromLocal(''); setToLocal(''); push({ from: '', to: '' }) }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
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
              ? 'Nessun impegno presente. Crea il primo con "+ Nuovo impegno".'
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
                          <input
                            type="date"
                            value={editForm.due_date}
                            onChange={e => setEditForm(p => ({ ...p, due_date: e.target.value }))}
                            className="w-32 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <input
                              type="text"
                              value={editForm.supplier_name}
                              onChange={e => setEditForm(p => ({ ...p, supplier_name: e.target.value }))}
                              placeholder="Fornitore*"
                              className="w-48 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <input
                              type="text"
                              value={editForm.account_description}
                              onChange={e => setEditForm(p => ({ ...p, account_description: e.target.value }))}
                              placeholder="Descrizione"
                              className="w-48 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={editForm.flow_type}
                            onChange={e => setEditForm(p => ({ ...p, flow_type: e.target.value as 'in' | 'out' }))}
                            className="px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-200 focus:outline-none"
                          >
                            <option value="out">Uscita</option>
                            <option value="in">Entrata</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editForm.amount}
                            onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))}
                            className="w-28 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-right text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {editErr && <span className="text-red-400">{editErr}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleUpdate(item.id)}
                              disabled={editSaving}
                              className="p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                              title="Salva"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                              title="Annulla modifica"
                            >
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
                        item.status !== 'cancelled' && item.due_date < new Date().toISOString().split('T')[0]
                          ? 'text-red-400 font-semibold'
                          : 'text-zinc-300'
                      }`}>
                        {new Date(item.due_date + 'T00:00:00').toLocaleDateString('it-IT')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-zinc-200">{item.supplier_name ?? '—'}</div>
                        {item.account_description && (
                          <div className="text-zinc-500 mt-0.5">{item.account_description}</div>
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
                              <button
                                onClick={() => startEdit(item)}
                                className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                                title="Modifica"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCancel(item.id)}
                                className="p-1.5 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700"
                                title="Annulla impegno"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-700"
                            title="Elimina"
                          >
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
              <button onClick={() => setModalOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Società *</label>
                <select
                  value={form.company_id}
                  onChange={e => handleFormChange('company_id', e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Seleziona...</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Fornitore / Controparte *</label>
                <input
                  type="text"
                  value={form.supplier_name}
                  onChange={e => handleFormChange('supplier_name', e.target.value)}
                  placeholder="Es. Enel, Affitto ufficio..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Descrizione aggiuntiva</label>
                <input
                  type="text"
                  value={form.account_description}
                  onChange={e => handleFormChange('account_description', e.target.value)}
                  placeholder="Facoltativo"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Data scadenza *</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => handleFormChange('due_date', e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Tipo</label>
                  <select
                    value={form.flow_type}
                    onChange={e => handleFormChange('flow_type', e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="out">Uscita</option>
                    <option value="in">Entrata</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Importo (€) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={e => handleFormChange('amount', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Note</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => handleFormChange('notes', e.target.value)}
                  placeholder="Facoltativo"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {formErr && <p className="text-red-400 text-xs">{formErr}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Salvataggio...' : 'Crea impegno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Check, X } from 'lucide-react'
import { createRequest, approveRequest, rejectRequest, deleteRequest } from './actions'

export type SpendRequest = {
  id: string
  company_id: string
  supplier_id: string | null
  supplier_name: string
  description: string
  amount_cents: number
  expected_date: string
  requested_by: string | null
  notes: string | null
  status: 'in_attesa' | 'approvata' | 'respinta'
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  commitment_id: string | null
  created_at: string
}
type Company = { id: string; code: string; name: string }
type Supplier = { id: string; company_id: string; supplier_name: string }

const inputCls = 'px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}
function parseCents(v: string): number {
  const s = v.trim().replace(/\s/g, '')
  const n = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
function ddmmyyyy(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—'
}

function NewRequest({ companies, suppliers }: { companies: Company[]; suppliers: Supplier[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ company_id: '', supplier: '', description: '', amount: '', expected_date: '', requested_by: '', notes: '' })
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const list = suppliers.filter(s => s.company_id === f.company_id)

  function save() {
    const sup = list.find(s => s.supplier_name === f.supplier.trim())
    setErr(null)
    startTransition(async () => {
      const res = await createRequest({
        company_id: f.company_id, supplier_id: sup?.id ?? null, supplier_name: f.supplier,
        description: f.description, amount_cents: parseCents(f.amount), expected_date: f.expected_date,
        requested_by: f.requested_by.trim() || null, notes: f.notes.trim() || null,
      })
      if ('error' in res) setErr(res.error)
      else { setOpen(false); setF({ company_id: f.company_id, supplier: '', description: '', amount: '', expected_date: '', requested_by: '', notes: '' }); router.refresh() }
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500">
        <Plus className="w-4 h-4" /> Nuova richiesta
      </button>
    )
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <select value={f.company_id} onChange={e => setF(p => ({ ...p, company_id: e.target.value, supplier: '' }))} className={inputCls}>
          <option value="">Società…</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div>
          <input list="req-sup" value={f.supplier} onChange={e => setF(p => ({ ...p, supplier: e.target.value }))}
            placeholder={f.company_id ? 'Fornitore (scrivi: te lo suggerisce)' : 'prima la società'} disabled={!f.company_id} className={`${inputCls} w-full`} />
          <datalist id="req-sup">{list.map(s => <option key={s.id} value={s.supplier_name} />)}</datalist>
        </div>
        <input value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} placeholder="Cosa si chiede" className={inputCls} />
        <input value={f.amount} onChange={e => setF(p => ({ ...p, amount: e.target.value }))} placeholder="Importo €" className={`${inputCls} text-right`} />
        <input type="date" value={f.expected_date} onChange={e => setF(p => ({ ...p, expected_date: e.target.value }))} className={inputCls} title="Quando si pagherebbe" />
        <input value={f.requested_by} onChange={e => setF(p => ({ ...p, requested_by: e.target.value }))} placeholder="Chi lo chiede" className={inputCls} />
      </div>
      <input value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} placeholder="Note (facoltative)" className={`${inputCls} w-full`} />
      <p className="text-xs text-zinc-500">
        Se il fornitore non è nell&apos;elenco si può scrivere lo stesso: l&apos;impegno resterà senza collegamento finché non si sceglie quello giusto.
      </p>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={isPending} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">Salva richiesta</button>
        <button onClick={() => setOpen(false)} className="text-sm text-zinc-400 hover:text-zinc-200">Annulla</button>
        {err && <span className="text-sm text-red-400">{err}</span>}
      </div>
    </div>
  )
}

function RequestRow({ r, code }: { r: SpendRequest; code: string }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const run = (fn: () => Promise<{ error: string } | { ok: true }>) => startTransition(async () => {
    setErr(null)
    const res = await fn()
    if ('error' in res) setErr(res.error)
    else router.refresh()
  })
  return (
    <tr className="border-b border-zinc-800/60 last:border-0 align-top">
      <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-medium text-zinc-400">{code}</span></td>
      <td className="px-3 py-2.5 text-sm">
        <div className="text-zinc-200">{r.supplier_name}{!r.supplier_id && <span className="ml-2 text-[10px] text-amber-400">non in elenco</span>}</div>
        <div className="text-xs text-zinc-400">{r.description}</div>
        {r.notes && <div className="text-xs text-zinc-500">{r.notes}</div>}
      </td>
      <td className="px-3 py-2.5 text-xs text-zinc-400">{r.requested_by ?? '—'}</td>
      <td className="px-3 py-2.5 text-xs text-zinc-400">{ddmmyyyy(r.expected_date)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-sm text-zinc-200">{formatEur(r.amount_cents)}</td>
      <td className="px-3 py-2.5">
        {r.status === 'in_attesa' ? (
          <div className="flex flex-col gap-1.5 items-end">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="nota (facoltativa)" className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-100 w-48" />
            <div className="flex gap-2">
              <button onClick={() => run(() => approveRequest(r.id, note.trim() || null))} disabled={isPending}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-emerald-700 text-white hover:bg-emerald-600"><Check className="w-3.5 h-3.5" /> Approva</button>
              <button onClick={() => run(() => rejectRequest(r.id, note.trim() || null))} disabled={isPending}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600"><X className="w-3.5 h-3.5" /> Respingi</button>
              <button onClick={() => run(() => deleteRequest(r.id))} disabled={isPending} className="text-xs text-zinc-500 hover:text-red-400">elimina</button>
            </div>
            {err && <span className="text-xs text-red-400">{err}</span>}
          </div>
        ) : (
          <div className="text-xs text-right">
            <span className={r.status === 'approvata' ? 'text-emerald-400' : 'text-zinc-500'}>
              {r.status === 'approvata' ? 'Approvata: è diventata un impegno' : 'Respinta'}
            </span>
            <div className="text-zinc-500">{r.decided_by} · {ddmmyyyy(r.decided_at?.slice(0, 10) ?? null)}</div>
            {r.decision_note && <div className="text-zinc-500">{r.decision_note}</div>}
          </div>
        )}
      </td>
    </tr>
  )
}

export default function RichiesteClient({ companies, suppliers, requests }: {
  companies: Company[]; suppliers: Supplier[]; requests: SpendRequest[]
}) {
  const [show, setShow] = useState<'in_attesa' | 'decise'>('in_attesa')
  const codeOf = (id: string) => companies.find(c => c.id === id)?.code ?? ''
  const pending = requests.filter(r => r.status === 'in_attesa')
  const list = show === 'in_attesa' ? pending : requests.filter(r => r.status !== 'in_attesa').reverse()
  const totPending = pending.reduce((s, r) => s + r.amount_cents, 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Spese chieste e non ancora autorizzate. Non entrano nella cassa: la Tesoreria le mostra a parte, così si vede quanto pesano prima di decidere.
        Approvata, la richiesta diventa un impegno; quando arriva la fattura dallo scadenzario, l&apos;impegno si chiude nella fattura.
      </p>
      <NewRequest companies={companies} suppliers={suppliers} />
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        {([['in_attesa', `In attesa (${pending.length} · ${formatEur(totPending)})`], ['decise', 'Decise']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setShow(k)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${show === k ? 'bg-indigo-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}>{l}</button>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 text-[11px] text-zinc-500 uppercase tracking-wide">
              <th className="text-left px-3 py-2 font-medium">Soc.</th>
              <th className="text-left px-3 py-2 font-medium">Fornitore e richiesta</th>
              <th className="text-left px-3 py-2 font-medium">Chi chiede</th>
              <th className="text-left px-3 py-2 font-medium">Quando</th>
              <th className="text-right px-3 py-2 font-medium">Importo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0
              ? <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-zinc-500">Nessuna richiesta</td></tr>
              : list.map(r => <RequestRow key={r.id} r={r} code={codeOf(r.company_id)} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

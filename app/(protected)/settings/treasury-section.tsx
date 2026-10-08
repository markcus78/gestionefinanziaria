'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { updateEstimate, createEstimate, updateBacklogBefore, updateGroupThreshold } from './actions'
import type { Company, TreasuryEstimate } from '@/lib/types/database'

const KIND_LABEL: Record<TreasuryEstimate['kind'], string> = {
  incasso: 'Incasso', muro: 'Muro (100%)', automatico: 'Automatico', fornitori: 'Fornitori',
}

const inputCls = 'px-2 py-1 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500'

function EstimateRow({ e }: { e: TreasuryEstimate }) {
  const router = useRouter()
  const [monthly, setMonthly] = useState((e.monthly_cents / 100).toFixed(0))
  const [p1, setP1] = useState(String(Number(e.pct_d1)))
  const [p2, setP2] = useState(String(Number(e.pct_d2)))
  const [p3, setP3] = useState(String(Number(e.pct_d3)))
  const [active, setActive] = useState(e.active)
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(nextActive = active) {
    const m = parseFloat(monthly.replace(',', '.'))
    const pct: [number, number, number] = [parseFloat(p1), parseFloat(p2), parseFloat(p3)]
    if (!Number.isFinite(m) || pct.some(x => !Number.isFinite(x))) { setMsg('Valori non validi'); return }
    setMsg(null)
    startTransition(async () => {
      const res = await updateEstimate(e.id, Math.round(m * 100), pct, nextActive)
      if ('error' in res) setMsg(String(res.error))
      else { setMsg('Salvato'); router.refresh() }
    })
  }

  return (
    <tr className={`border-b border-zinc-800/50 last:border-0 ${active ? '' : 'opacity-50'}`}>
      <td className="px-3 py-2 text-sm text-zinc-200">
        {e.label}
        {e.notes && <div className="text-[11px] text-zinc-500">{e.notes}</div>}
      </td>
      <td className="px-3 py-2 text-xs text-zinc-400">{KIND_LABEL[e.kind]}</td>
      <td className="px-3 py-2 text-right"><input value={monthly} onChange={ev => setMonthly(ev.target.value)} className={`${inputCls} w-24 text-right`} /></td>
      <td className="px-3 py-2 text-right"><input value={p1} onChange={ev => setP1(ev.target.value)} className={`${inputCls} w-14 text-right`} /></td>
      <td className="px-3 py-2 text-right"><input value={p2} onChange={ev => setP2(ev.target.value)} className={`${inputCls} w-14 text-right`} /></td>
      <td className="px-3 py-2 text-right"><input value={p3} onChange={ev => setP3(ev.target.value)} className={`${inputCls} w-14 text-right`} /></td>
      <td className="px-3 py-2 text-xs text-zinc-500">{e.replaced_by.length ? 'sì' : '—'}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-3 justify-end">
          <button onClick={() => save()} disabled={isPending} className="text-xs text-indigo-400 hover:text-indigo-300">Salva</button>
          <button onClick={() => { setActive(!active); save(!active) }} disabled={isPending} className="text-xs text-zinc-500 hover:text-zinc-300">
            {active ? 'Disattiva' : 'Attiva'}
          </button>
          {msg && <span className={`text-xs ${msg === 'Salvato' ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
        </div>
      </td>
    </tr>
  )
}

function NewEstimate({ companyId }: { companyId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<TreasuryEstimate['kind']>('automatico')
  const [monthly, setMonthly] = useState('0')
  const [split, setSplit] = useState<'terzi' | 'd2'>('terzi')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 px-3 py-2">
        <Plus className="w-3.5 h-3.5" /> Nuova voce
      </button>
    )
  }

  function save() {
    const m = parseFloat(monthly.replace(',', '.'))
    if (!Number.isFinite(m)) { setError('Importo non valido'); return }
    const pct: [number, number, number] = split === 'd2' ? [0, 100, 0] : [33.34, 33.33, 33.33]
    setError(null)
    startTransition(async () => {
      const res = await createEstimate({ companyId, label, kind, monthlyCents: Math.round(m * 100), pct })
      if ('error' in res) setError(String(res.error))
      else { setOpen(false); setLabel(''); router.refresh() }
    })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nome voce" className={`${inputCls} w-56`} />
      <select value={kind} onChange={e => setKind(e.target.value as TreasuryEstimate['kind'])} className={inputCls}>
        {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input value={monthly} onChange={e => setMonthly(e.target.value)} className={`${inputCls} w-24 text-right`} />
      <select value={split} onChange={e => setSplit(e.target.value as 'terzi' | 'd2')} className={inputCls}>
        <option value="terzi">Un terzo per decade</option>
        <option value="d2">Tutto nella 2ª decade</option>
      </select>
      <button onClick={save} disabled={isPending} className="px-3 py-1 text-xs rounded bg-indigo-700 text-zinc-100 hover:bg-indigo-600">Aggiungi</button>
      <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Annulla</button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

function BacklogRow({ company }: { company: Company }) {
  const router = useRouter()
  const [date, setDate] = useState(company.backlog_before ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setMsg(null)
    startTransition(async () => {
      const res = await updateBacklogBefore(company.id, date || null)
      if ('error' in res) setMsg(String(res.error))
      else { setMsg('Salvato'); router.refresh() }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-sm text-zinc-200">{company.code}</span>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
      <button onClick={save} disabled={isPending} className="text-xs text-indigo-400 hover:text-indigo-300">Salva</button>
      {date && <button onClick={() => setDate('')} className="text-xs text-zinc-500 hover:text-zinc-300">nessun taglio</button>}
      {msg && <span className={`text-xs ${msg === 'Salvato' ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
    </div>
  )
}

export function TreasurySection({
  companies, estimates, groupThresholdCents,
}: {
  companies: Company[]
  estimates: TreasuryEstimate[]
  groupThresholdCents: number
}) {
  const router = useRouter()
  const [threshold, setThreshold] = useState((groupThresholdCents / 100).toFixed(0))
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function saveThreshold() {
    const n = parseFloat(threshold.replace(',', '.'))
    if (!Number.isFinite(n)) { setMsg('Importo non valido'); return }
    startTransition(async () => {
      const res = await updateGroupThreshold(Math.round(n * 100))
      if ('error' in res) setMsg(String(res.error))
      else { setMsg('Salvato'); router.refresh() }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-medium text-zinc-100">Tesoreria a decadi</h2>
        <p className="text-sm text-zinc-400 mt-0.5">
          Uscite e incassi stimati al mese, con la quota per ogni decade (1-10, 11-20, 21-fine mese).
          Le voci con «sostituibile» si azzerano nel mese in cui arrivano le righe reali dallo Staff.
        </p>
      </div>

      {companies.map(c => {
        const list = estimates.filter(e => e.company_id === c.id)
        if (list.length === 0 && c.treasury_block === 'WT_ARIES' && c.code !== 'WT') return null
        return (
          <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 text-sm font-medium text-zinc-200">
              {c.code === 'WT' ? 'WT e Aries' : c.code}
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] text-zinc-500 uppercase tracking-wide">
                  <th className="text-left px-3 py-2 font-medium">Voce</th>
                  <th className="text-left px-3 py-2 font-medium">Tipo</th>
                  <th className="text-right px-3 py-2 font-medium">€ al mese</th>
                  <th className="text-right px-3 py-2 font-medium">% D1</th>
                  <th className="text-right px-3 py-2 font-medium">% D2</th>
                  <th className="text-right px-3 py-2 font-medium">% D3</th>
                  <th className="text-left px-3 py-2 font-medium">Sostituibile</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map(e => <EstimateRow key={e.id} e={e} />)}
              </tbody>
            </table>
            <NewEstimate companyId={c.id} />
          </div>
        )
      })}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Data di taglio dell&apos;arretrato</p>
        <p className="text-xs text-zinc-500">
          Le fatture dello scadenzario con scadenza precedente a questa data restano fuori dal cruscotto, come debito arretrato da decidere a parte.
        </p>
        {companies.map(c => <BacklogRow key={c.id} company={c} />)}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center gap-3">
        <span className="text-sm text-zinc-200">Soglia minima di cassa del gruppo</span>
        <input value={threshold} onChange={e => setThreshold(e.target.value)} className={`${inputCls} w-28 text-right`} />
        <button onClick={saveThreshold} disabled={isPending} className="text-xs text-indigo-400 hover:text-indigo-300">Salva</button>
        {msg && <span className={`text-xs ${msg === 'Salvato' ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
      </div>
    </div>
  )
}

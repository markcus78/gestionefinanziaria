'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { updateEstimate, createEstimate, updateBacklogBefore, updateGroupThreshold, payProForma } from './actions'
import type { Company, TreasuryEstimate } from '@/lib/types/database'

const KIND_LABEL: Record<TreasuryEstimate['kind'], string> = {
  incasso: 'Incasso', muro: 'Muro (100%)', automatico: 'Automatico', fornitori: 'Fornitori',
}

// Come si divide il mese fra le decadi; per altre divisioni si scrivono le tre % sulla riga
const SPLITS = {
  terzi: { label: 'Un terzo per decade', pct: [33.34, 33.33, 33.33] as [number, number, number] },
  d1: { label: 'Tutto nella 1ª decade (1-10)', pct: [100, 0, 0] as [number, number, number] },
  d2: { label: 'Tutto nella 2ª decade (11-20)', pct: [0, 100, 0] as [number, number, number] },
  d3: { label: 'Tutto nella 3ª decade (21-fine)', pct: [0, 0, 100] as [number, number, number] },
}

export type SupplierOption = { id: string; company_id: string; supplier_name: string }

// Le stime che hanno un fornitore: tutte le uscite tranne quelle che non passano dallo scadenzario
// (personale, F24, tributi, finanziamenti: si chiudono con le righe vere dello Staff o degli Impegni)
function takesSupplier(e: Pick<TreasuryEstimate, 'kind' | 'replaced_by'>) {
  return e.kind !== 'incasso' && e.replaced_by.length === 0
}

// Fornitore scelto dall'elenco della società: si scrive e il browser suggerisce i nomi
function SupplierInput({ value, onChange, suppliers, listId, placeholder }: {
  value: string; onChange: (v: string) => void; suppliers: SupplierOption[]; listId: string; placeholder: string
}) {
  return (
    <>
      <input list={listId} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} w-52`} />
      <datalist id={listId}>{suppliers.map(s => <option key={s.id} value={s.supplier_name} />)}</datalist>
    </>
  )
}

function supplierIdOf(name: string, suppliers: SupplierOption[]): string | null | 'invalid' {
  const n = name.trim()
  if (!n) return null
  return suppliers.find(s => s.supplier_name === n)?.id ?? 'invalid'
}

const inputCls = 'px-2 py-1 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500'

function EstimateRow({ e, suppliers }: { e: TreasuryEstimate; suppliers: SupplierOption[] }) {
  const router = useRouter()
  const [supplier, setSupplier] = useState(suppliers.find(s => s.id === e.supplier_id)?.supplier_name ?? '')
  const [monthly, setMonthly] = useState((e.monthly_cents / 100).toFixed(0))
  const [p1, setP1] = useState(String(Number(e.pct_d1)))
  const [p2, setP2] = useState(String(Number(e.pct_d2)))
  const [p3, setP3] = useState(String(Number(e.pct_d3)))
  const [active, setActive] = useState(e.active)
  const [msg, setMsg] = useState<string | null>(null)
  const [pf, setPf] = useState<{ amount: string; date: string } | null>(null)

  // Pro forma pagata: il fornitore fattura dopo e la contabilità chiude la fattura già pagata,
  // quindi nello scadenzario non arriva mai. Si registra qui: impegno pagato che consuma la stima.
  function savePf() {
    if (!pf) return
    const s = pf.amount.trim().replace(/\s/g, '')
    const n = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s)
    if (!Number.isFinite(n) || n <= 0) { setMsg('Importo non valido'); return }
    if (!pf.date) { setMsg('Data obbligatoria'); return }
    setMsg(null)
    startTransition(async () => {
      const res = await payProForma(e.id, Math.round(n * 100), pf.date)
      if ('error' in res) setMsg(String(res.error))
      else { setPf(null); setMsg('Pro forma registrata'); router.refresh() }
    })
  }
  const [isPending, startTransition] = useTransition()

  function save(nextActive = active) {
    const m = parseFloat(monthly.replace(',', '.'))
    const pct: [number, number, number] = [parseFloat(p1), parseFloat(p2), parseFloat(p3)]
    if (!Number.isFinite(m) || pct.some(x => !Number.isFinite(x))) { setMsg('Valori non validi'); return }
    const sid = takesSupplier(e) ? supplierIdOf(supplier, suppliers) : undefined
    if (sid === 'invalid') { setMsg('Fornitore non in elenco: sceglilo fra quelli suggeriti'); return }
    setMsg(null)
    startTransition(async () => {
      const res = await updateEstimate(e.id, Math.round(m * 100), pct, nextActive, sid)
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
      <td className="px-3 py-2">
        {takesSupplier(e)
          ? <SupplierInput value={supplier} onChange={setSupplier} suppliers={suppliers} listId={`sup-${e.id}`}
              placeholder={e.kind === 'fornitori' ? 'vuoto = altri fornitori' : 'nessuno'} />
          : <span className="text-[11px] text-zinc-600">righe di Staff/Impegni</span>}
      </td>
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
          {e.supplier_id && e.kind !== 'incasso' && !pf && (
            <button onClick={() => setPf({ amount: '', date: new Date().toISOString().slice(0, 10) })} className="text-xs text-sky-400 hover:text-sky-300"
              title="Pagata su pro forma: la fattura non passerà dallo scadenzario">Pagata pro forma</button>
          )}
          {msg && <span className={`text-xs ${msg === 'Salvato' || msg === 'Pro forma registrata' ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
        </div>
        {pf && (
          <div className="flex items-center gap-2 justify-end mt-2">
            <span className="text-[11px] text-zinc-500">Pro forma pagata:</span>
            <input value={pf.amount} onChange={ev => setPf({ ...pf, amount: ev.target.value })} placeholder="€" className={`${inputCls} w-24 text-right`} />
            <input type="date" value={pf.date} onChange={ev => setPf({ ...pf, date: ev.target.value })} className={inputCls} />
            <button onClick={savePf} disabled={isPending} className="text-xs text-sky-400 hover:text-sky-300">Registra</button>
            <button onClick={() => setPf(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Annulla</button>
          </div>
        )}
      </td>
    </tr>
  )
}

function NewEstimate({ companyId, suppliers }: { companyId: string; suppliers: SupplierOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [supplier, setSupplier] = useState('')
  const [kind, setKind] = useState<TreasuryEstimate['kind']>('automatico')
  const [monthly, setMonthly] = useState('0')
  const [split, setSplit] = useState<keyof typeof SPLITS>('terzi')
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
    const pct = SPLITS[split].pct
    const sid = kind === 'incasso' ? null : supplierIdOf(supplier, suppliers)
    if (sid === 'invalid') { setError('Fornitore non in elenco: sceglilo fra quelli suggeriti'); return }
    setError(null)
    startTransition(async () => {
      const res = await createEstimate({ companyId, label: label || supplier, kind, monthlyCents: Math.round(m * 100), pct, supplierId: sid })
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
      {kind !== 'incasso' && (
        <SupplierInput value={supplier} onChange={setSupplier} suppliers={suppliers} listId={`sup-new-${companyId}`} placeholder="Fornitore (dall'elenco)" />
      )}
      <input value={monthly} onChange={e => setMonthly(e.target.value)} className={`${inputCls} w-24 text-right`} />
      <select value={split} onChange={e => setSplit(e.target.value as keyof typeof SPLITS)} className={inputCls}>
        {Object.entries(SPLITS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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

// Le stime: una sezione a sé accanto a Scadenzario e Impegni (regola di Marco, 14/10/2026)
export function EstimatesSection({
  companies, estimates, suppliers,
}: {
  companies: Company[]
  estimates: TreasuryEstimate[]
  suppliers: SupplierOption[]
}) {
  // una scheda per società: WT e Aries sono due società distinte, anche se in Tesoreria stanno nello stesso blocco
  const shown = companies
  const [tab, setTab] = useState(shown[0]?.id ?? '')
  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        {shown.map(c => (
          <button key={c.id} onClick={() => setTab(c.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === c.id ? 'bg-indigo-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}>
            {c.code}
            <span className="ml-1.5 text-xs text-zinc-500">{estimates.filter(e => e.company_id === c.id && e.active).length}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-zinc-400">
        Uscite e incassi stimati al mese, con la quota per ogni decade (1-10, 11-20, 21-fine mese).
        Le voci con un fornitore si riducono man mano che arrivano le sue fatture del mese (stima − arrivate);
        quelle di tipo Fornitori senza fornitore valgono per tutti gli altri fornitori. Se un fornitore si paga su pro forma
        (la fattura poi non passa dallo scadenzario), il pagamento si registra con «Pagata pro forma» e consuma la stima. Le voci «sostituibili»
        (personale, F24) si azzerano nel mese in cui arrivano le righe reali dallo Staff.
      </p>
      {shown.filter(c => c.id === tab).map(c => {
        const list = estimates.filter(e => e.company_id === c.id)
        return (
          <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 text-sm font-medium text-zinc-200">
              {c.name}
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] text-zinc-500 uppercase tracking-wide">
                  <th className="text-left px-3 py-2 font-medium">Voce</th>
                  <th className="text-left px-3 py-2 font-medium">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium">Fornitore</th>
                  <th className="text-right px-3 py-2 font-medium">€ al mese</th>
                  <th className="text-right px-3 py-2 font-medium">% D1</th>
                  <th className="text-right px-3 py-2 font-medium">% D2</th>
                  <th className="text-right px-3 py-2 font-medium">% D3</th>
                  <th className="text-left px-3 py-2 font-medium">Sostituibile</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map(e => <EstimateRow key={e.id} e={e} suppliers={suppliers.filter(s => s.company_id === c.id)} />)}
              </tbody>
            </table>
            <NewEstimate companyId={c.id} suppliers={suppliers.filter(s => s.company_id === c.id)} />
          </div>
        )
      })}

    </div>
  )
}

export function TreasurySection({
  companies, groupThresholdCents,
}: {
  companies: Company[]
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
          Le stime si gestiscono nella sezione <a href="/stime" className="text-indigo-400 hover:text-indigo-300">Stime</a>, accanto a Scadenzario e Impegni.
        </p>
      </div>

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

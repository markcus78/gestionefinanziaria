'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { BlockSpace, LineState } from '@/lib/decadi'
import {
  createOrRefreshPlan, setSupplierPlan, setPlanStatus, createTransfer, deleteTransfer, setTransferPaid, paySupplier, payRow,
} from './actions'
import { markInstallmentPaid } from '../treasury/actions'

export type PianoProps = {
  today: string
  i: number
  tabs: { i: number; label: string; running: boolean }[]
  decade: { month: string; idx: number; from: string; to: string; label: string }
  plan: { id: string; status: 'bozza' | 'approvato'; approvedBy: string | null; approvedAt: string | null } | null
  blocks: { code: string; label: string; space: BlockSpace; suggested: number; receiverId: string | null }[]
  suppliers: {
    key: string; supplierKey: string; companyId: string; company: string; name: string; dovuto: number; oldest: string | null
    invoices: number; reference: number; lineId: string | null; planned: number; priority: number | null; paid: number; state: LineState
    rowIds: string[]
  }[]
  perIntero: {
    kind: string; label: string; company: string; companyId: string | null; cents: number; date: string | null; rowId: string | null
    installmentId: string | null; estimate: boolean; late: boolean; automatic: boolean
  }[]
  transfers: { id: string; from: string; to: string; cents: number; dueDate: string; paidDate: string | null; notes: string | null }[]
  debts: { company: string; cents: number }[]
  offPlan: { company: string; name: string; cents: number; why: 'non_nel_piano' | 'oltre'; dates: string[] }[]
  paidList: { id: string; date: string; company: string; name: string; cents: number; inPlan: boolean }[]
  running: boolean
  hasPlan: boolean
  importClosed: { name: string; cents: number }[]
  balanceDate: Record<string, string | null>
  appiaeId: string | null
  dueInputs: { companyId: string; supplierKey: string; name: string }[]
  pct: number
}

const eur = (c: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c / 100)
const dt = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—')
const toCents = (s: string) => Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100)
const pctTxt = (p: number) => `${(Math.round(p * 1000) / 10).toLocaleString('it-IT')}%`

const STATE: Record<LineState, { label: string; cls: string }> = {
  da_pagare: { label: '⏳ da pagare', cls: 'text-zinc-400' },
  in_parte: { label: '⏳ in parte', cls: 'text-amber-300' },
  pagato: { label: '✅ pagato', cls: 'text-emerald-400' },
  scoperto: { label: '🔴 scoperto', cls: 'text-red-400' },
  oltre: { label: '⚠️ oltre il deciso', cls: 'text-orange-400' },
}

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<{ error?: string } | { success: true }>, after?: () => void) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if ('error' in r && r.error) setError(r.error)
      else { after?.(); router.refresh() }
    })
  }
  return { pending, error, run }
}

// Form «Pagato»: data vera (oggi di default) e importo; avviso se la data è già dentro il saldo della banca
function PayForm({ defaultCents, balanceDate, today, onPay, onClose }: {
  defaultCents: number; balanceDate: string | null; today: string
  onPay: (date: string, cents: number) => void; onClose: () => void
}) {
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState((defaultCents / 100).toFixed(2).replace('.', ','))
  const cents = toCents(amount)
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200" />
      <input value={amount} onChange={e => setAmount(e.target.value)} className="w-28 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-right text-zinc-200" />
      <button disabled={!(cents > 0) || !date} onClick={() => onPay(date, cents)} className="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40">Registra</button>
      <button onClick={onClose} className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200">Annulla</button>
      {balanceDate && date <= balanceDate && (
        <span className="text-[11px] text-amber-400">Attenzione: il saldo della banca è del {dt(balanceDate)}, un pagamento con questa data è già dentro il saldo.</span>
      )}
    </div>
  )
}

export default function PianoClient(p: PianoProps) {
  const act = useAction()
  const [paying, setPaying] = useState<string | null>(null)
  const editable = p.plan?.status === 'bozza'
  const planLabel = `Piano ${p.decade.month}-D${p.decade.idx}`
  const totalPlanned = p.suppliers.reduce((s, x) => s + x.planned, 0)
  const spazio = p.blocks.reduce((s, b) => s + b.space.spazio, 0)

  return (
    <div className="space-y-6">
      {/* Decadi */}
      <div className="flex flex-wrap items-center gap-2">
        {p.tabs.map(t => (
          <Link key={t.i} href={`/piano?d=${t.i}`}
            className={`px-4 py-1.5 rounded-md text-sm ${t.i === p.i ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}>
            {t.label}{t.running ? ' (in corso)' : ' (da pianificare)'}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm">
          {!p.plan && (
            <button disabled={act.pending} onClick={() => act.run(() => createOrRefreshPlan(p.decade.month, p.decade.idx, p.dueInputs))}
              className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">Crea il piano della decade</button>
          )}
          {p.plan && (
            <>
              <span className={p.plan.status === 'approvato' ? 'text-emerald-400' : 'text-amber-300'}>
                {p.plan.status === 'approvato'
                  ? `Piano approvato${p.plan.approvedBy ? ` da ${p.plan.approvedBy}` : ''}${p.plan.approvedAt ? ` il ${dt(p.plan.approvedAt.slice(0, 10))}` : ''}`
                  : 'Piano in bozza'}
              </span>
              {editable && (
                <>
                  <button disabled={act.pending} onClick={() => act.run(() => createOrRefreshPlan(p.decade.month, p.decade.idx, p.dueInputs))}
                    className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">Aggiorna l&apos;elenco dei fornitori</button>
                  <button disabled={act.pending} onClick={() => act.run(() => setPlanStatus(p.plan!.id, 'approvato', p.suppliers.filter(s => s.lineId).map(s => ({ lineId: s.lineId!, rowIds: s.rowIds }))))}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">Approva il piano</button>
                </>
              )}
              {!editable && (
                <button disabled={act.pending} onClick={() => act.run(() => setPlanStatus(p.plan!.id, 'bozza'))}
                  className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50">Riapri per modificare</button>
              )}
            </>
          )}
        </div>
      </div>
      {act.error && <p className="text-sm text-red-400">{act.error}</p>}

      {/* 1. Il conto della decade, blocco per blocco */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-200 mb-2">1 · Il conto della decade {p.decade.label}</h2>
        <p className="text-xs text-zinc-500 mb-3">Si parte da Hangar, poi WT e Aries, per ultima Appiae, che fa le provviste. «Per intero» = muro, automatiche, F24 da recuperare, quote dell&apos;arretrato, impegni e fatture sotto 300 €.</p>
        <div className="grid md:grid-cols-3 gap-3">
          {p.blocks.map(b => <BlockCard key={b.code} b={b} p={p} act={act} />)}
        </div>
      </section>

      {/* 2. Provviste */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-200 mb-2">2 · Provviste fra società</h2>
        {p.transfers.length === 0 && <p className="text-xs text-zinc-500">Nessuna provvista per questa decade.</p>}
        {p.transfers.length > 0 && (
          <table className="w-full text-sm">
            <tbody>
              {p.transfers.map(x => (
                <tr key={x.id} className="border-t border-zinc-800">
                  <td className="py-1.5 text-zinc-200">{x.from === 'APPIAE' ? 'Provvista' : 'Restituzione'} {x.from} → {x.to}</td>
                  <td className="py-1.5 text-right font-mono text-zinc-200">{eur(x.cents)}</td>
                  <td className="py-1.5 px-3 text-zinc-400">entro il {dt(x.dueDate)}</td>
                  <td className="py-1.5 text-right">
                    {x.paidDate
                      ? <span className="text-emerald-400 text-xs">✅ fatta il {dt(x.paidDate)} <button className="ml-2 text-zinc-500 hover:text-zinc-300" onClick={() => act.run(() => setTransferPaid(x.id, null))}>annulla</button></span>
                      : paying === `t:${x.id}`
                        ? <PayForm defaultCents={x.cents} balanceDate={null} today={p.today} onClose={() => setPaying(null)}
                            onPay={date => act.run(() => setTransferPaid(x.id, date), () => setPaying(null))} />
                        : <span className="flex justify-end gap-2">
                            <button className="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => setPaying(`t:${x.id}`)}>Fatta</button>
                            <button className="px-2 py-1 text-xs text-zinc-500 hover:text-red-400" onClick={() => act.run(() => deleteTransfer(x.id))}>elimina</button>
                          </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {p.debts.length > 0 && (
          <p className="text-xs text-zinc-500 mt-2">Debito verso Appiae per le provviste fatte: {p.debts.map(d => `${d.company} ${eur(d.cents)}`).join(' · ')}</p>
        )}
      </section>

      {/* 3. Fornitori */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-zinc-200">3 · Fornitori: chi paghiamo e quanto</h2>
          <span className="text-xs text-zinc-400">Deciso <b className="text-zinc-200">{eur(totalPlanned)}</b> · spazio di tutto il gruppo {eur(spazio)}</span>
        </div>
        <p className="text-xs text-zinc-500 mb-2">
          Fornitori sopra 300 € con qualcosa da pagare entro il {dt(p.decade.to)}. L&apos;importo copre le fatture dalla più vecchia. «Riferimento» = quanto toccherebbe con la percentuale uguale per tutti ({pctTxt(p.pct)}).
          {!p.plan && ' Crea il piano per decidere.'}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="text-left py-1 w-14">Ordine</th><th className="text-left">Società</th><th className="text-left">Fornitore</th>
                <th className="text-right">Dovuto</th><th className="text-right">Dal</th><th className="text-right">Riferimento</th>
                <th className="text-right">Paghiamo</th><th className="text-right">Pagato</th><th className="text-right">Stato</th><th></th>
              </tr>
            </thead>
            <tbody>
              {p.suppliers.map(s => (
                <SupplierRow key={s.key} s={s} p={p} editable={editable} act={act} planLabel={planLabel}
                  paying={paying === `s:${s.key}`} setPaying={v => setPaying(v ? `s:${s.key}` : null)} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Si paga per intero */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-200 mb-2">4 · Da pagare per intero, in ordine di data</h2>
        <p className="text-xs text-zinc-500 mb-2">Si aggiornano da soli: le stime diventano righe vere quando arrivano i file e le fatture.</p>
        <table className="w-full text-sm">
          <tbody>
            {p.perIntero.map((x, n) => {
              const id = `r:${x.rowId ?? x.installmentId ?? n}`
              return (
                <tr key={id} className="border-t border-zinc-800 align-top">
                  <td className="py-1.5 text-xs text-zinc-500 w-40">{x.kind}</td>
                  <td className="py-1.5 text-xs text-zinc-400 w-20">{x.company}</td>
                  <td className="py-1.5 text-zinc-200">{x.label}{x.estimate && <span className="text-xs text-zinc-500"> (stima)</span>}</td>
                  <td className={`py-1.5 px-3 text-right text-xs ${x.late ? 'text-red-400' : 'text-zinc-400'}`}>{dt(x.date)}{x.late ? ' scaduta' : ''}</td>
                  <td className="py-1.5 text-right font-mono text-zinc-200">{eur(x.cents)}</td>
                  <td className="py-1.5 pl-3 text-right w-[340px]">
                    {x.automatic ? <span className="text-xs text-zinc-500">esce da sola</span>
                      : x.estimate ? <span className="text-xs text-zinc-500">stima</span>
                      : paying === id
                        ? <PayForm defaultCents={x.cents} balanceDate={x.companyId ? p.balanceDate[x.companyId] : null} today={p.today} onClose={() => setPaying(null)}
                            onPay={(date, cents) => act.run(() => x.installmentId ? markInstallmentPaid(x.installmentId, date) : payRow(x.rowId!, date, cents, planLabel), () => setPaying(null))} />
                        : <button className="px-2 py-1 text-xs rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setPaying(id)}>Pagato</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {/* 5. Controllo */}
      {p.running && !p.hasPlan && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-200 mb-2">5 · Controllo</h2>
          <p className="text-xs text-zinc-500">Questa decade non ha un piano: il controllo comincia dalla prima decade pianificata.</p>
        </section>
      )}
      {p.running && p.hasPlan && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-200 mb-2">5 · Controllo: il piano è stato rispettato?</h2>
          {p.importClosed.length > 0 && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 mb-3">
              <p className="text-sm text-amber-300 mb-1">Fatture del piano chiuse dall&apos;import senza un pagamento registrato</p>
              <p className="text-xs text-zinc-400 mb-1">Risultano pagate in contabilità ma qui non c&apos;è il pagamento: contano come pagate. Se il bonifico è uscito, va registrato con la data vera, altrimenti il saldo calcolato non lo vede.</p>
              {p.importClosed.map((x, n) => <p key={n} className="text-sm text-zinc-200">{x.name}: {eur(x.cents)}</p>)}
            </div>
          )}
          {p.offPlan.length === 0
            ? <p className="text-xs text-emerald-400">Nessun pagamento fuori piano.</p>
            : (
              <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3 mb-3">
                <p className="text-sm text-orange-300 mb-1">⚠️ Pagamenti fuori piano</p>
                {p.offPlan.map(o => (
                  <p key={o.company + o.name} className="text-sm text-zinc-200">
                    {o.company} · {o.name}: {eur(o.cents)} {o.why === 'oltre' ? 'oltre l’importo deciso' : 'senza essere nel piano'} ({o.dates.map(dt).join(', ')})
                  </p>
                ))}
              </div>
            )}
          <details className="text-sm">
            <summary className="text-xs text-zinc-400 cursor-pointer">Pagamenti registrati nella decade ({p.paidList.length})</summary>
            <table className="w-full mt-2">
              <tbody>
                {p.paidList.map(x => (
                  <tr key={x.id} className="border-t border-zinc-800">
                    <td className="py-1 text-xs text-zinc-400 w-16">{dt(x.date)}</td>
                    <td className="py-1 text-xs text-zinc-400 w-20">{x.company}</td>
                    <td className="py-1 text-zinc-200">{x.name}</td>
                    <td className="py-1 text-right font-mono text-zinc-200">{eur(x.cents)}</td>
                    <td className="py-1 pl-3 text-xs text-right">{x.inPlan ? <span className="text-zinc-500">ok</span> : <span className="text-orange-400">fuori piano</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}
    </div>
  )
}

function BlockCard({ b, p, act }: { b: PianoProps['blocks'][number]; p: PianoProps; act: ReturnType<typeof useAction> }) {
  const s = b.space
  const [amount, setAmount] = useState(b.suggested ? String(Math.round(b.suggested / 100)) : '')
  const [due, setDue] = useState(s.primaUscita && s.primaUscita > p.decade.from ? s.primaUscita : p.decade.from)
  const row = (label: string, c: number, strong = false) => (
    <div className="flex justify-between text-xs"><span className="text-zinc-400">{label}</span>
      <span className={`font-mono ${c < 0 ? 'text-red-400' : 'text-zinc-200'} ${strong ? 'font-semibold' : ''}`}>{eur(c)}</span></div>
  )
  const canGive = b.receiverId && p.appiaeId
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
      <p className="text-sm font-semibold text-zinc-100 mb-1">{b.label}</p>
      {row('Saldo a inizio decade', s.inizio)}
      {row('+ Incassi previsti', s.incassi)}
      {row('− Da pagare per intero', -s.perIntero)}
      {row('− Soglia minima', -s.soglia)}
      {row('= Spazio per i fornitori', s.spazio, true)}
      {row('− Fornitori decisi', -s.fornitori)}
      {row('= Saldo a fine decade', s.fine, true)}
      {s.fabbisogno > 0 && <p className="text-xs text-red-400 pt-1">Fabbisogno: {eur(s.fabbisogno)}{s.primaUscita ? ` (prima uscita il ${dt(s.primaUscita)})` : ''}</p>}
      {canGive && (
        <div className="pt-2 border-t border-zinc-800 mt-2">
          <p className="text-[11px] text-zinc-500 mb-1">{b.code === 'WT_ARIES' ? 'Provvista da Appiae ad Aries (paga per WT)' : 'Provvista da Appiae'}</p>
          <div className="flex gap-1 items-center">
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="€" className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-right text-zinc-200" />
            <input type="date" value={due} onChange={e => setDue(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-xs text-zinc-200" />
            <button disabled={act.pending || !(toCents(amount) > 0)}
              onClick={() => act.run(() => createTransfer({ month: p.decade.month, idx: p.decade.idx, fromCompanyId: p.appiaeId!, toCompanyId: b.receiverId!, cents: toCents(amount), dueDate: due }))}
              className="px-2 py-1 text-xs rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40">Crea</button>
            <button disabled={act.pending || !(toCents(amount) > 0)} title="Il blocco restituisce ad Appiae"
              onClick={() => act.run(() => createTransfer({ month: p.decade.month, idx: p.decade.idx, fromCompanyId: b.receiverId!, toCompanyId: p.appiaeId!, cents: toCents(amount), dueDate: due }))}
              className="px-2 py-1 text-xs rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40">Restituisce</button>
          </div>
          {b.suggested > 0 && <p className="text-[11px] text-zinc-500 mt-1">Suggerita {eur(b.suggested)}: quello che manca per restare sopra la soglia.</p>}
        </div>
      )}
    </div>
  )
}

function SupplierRow({ s, p, editable, act, planLabel, paying, setPaying }: {
  s: PianoProps['suppliers'][number]; p: PianoProps; editable: boolean; act: ReturnType<typeof useAction>; planLabel: string
  paying: boolean; setPaying: (v: boolean) => void
}) {
  const [amount, setAmount] = useState(s.planned ? String(Math.round(s.planned / 100)) : '')
  const [prio, setPrio] = useState(s.priority ? String(s.priority) : '')
  const save = () => {
    if (!s.lineId) return
    const cents = amount.trim() === '' ? 0 : toCents(amount)
    const pr = parseInt(prio || '0', 10) || 1
    if (cents === s.planned && pr === s.priority) return
    act.run(() => setSupplierPlan(s.lineId!, cents, pr))
  }
  const st = STATE[s.state]
  return (
    <>
      <tr className="border-t border-zinc-800">
        <td className="py-1.5">
          {editable && s.lineId
            ? <input value={prio} onChange={e => setPrio(e.target.value)} onBlur={save} onKeyDown={e => e.key === 'Enter' && save()} className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-xs text-center text-zinc-200" />
            : <span className="text-xs text-zinc-400">{s.priority ?? '—'}</span>}
        </td>
        <td className="text-xs text-zinc-400">{s.company}</td>
        <td className="text-zinc-200">{s.name}{!s.lineId && p.plan && <span className="text-[11px] text-amber-400"> nuovo: «Aggiorna l&apos;elenco»</span>}</td>
        <td className="text-right font-mono text-zinc-200">{eur(s.dovuto)}</td>
        <td className="text-right text-xs text-zinc-400 px-2">{dt(s.oldest)}</td>
        <td className="text-right font-mono text-xs text-zinc-500">{eur(s.reference)}</td>
        <td className="text-right">
          {editable && s.lineId
            ? <input value={amount} onChange={e => setAmount(e.target.value)} onBlur={save} onKeyDown={e => e.key === 'Enter' && save()} placeholder="0" className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs text-right text-zinc-200" />
            : <span className="font-mono text-zinc-200">{s.lineId ? eur(s.planned) : '—'}</span>}
        </td>
        <td className="text-right font-mono text-xs text-zinc-300">{s.paid ? eur(s.paid) : '—'}</td>
        <td className={`text-right text-xs ${st.cls}`}>{s.lineId && s.planned > 0 ? st.label : s.paid ? STATE.oltre.label : ''}</td>
        <td className="text-right pl-2">
          {p.running && s.lineId && s.planned > s.paid && !paying && (
            <button className="px-2 py-1 text-xs rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setPaying(true)}>Pagato</button>
          )}
        </td>
      </tr>
      {paying && (
        <tr><td colSpan={10} className="pb-2">
          <PayForm defaultCents={s.planned - s.paid} balanceDate={p.balanceDate[s.companyId]} today={p.today} onClose={() => setPaying(false)}
            onPay={(date, cents) => act.run(() => paySupplier({ companyId: s.companyId, rowIds: s.rowIds, paidDate: date, cents, planLabel }), () => setPaying(false))} />
        </td></tr>
      )}
    </>
  )
}

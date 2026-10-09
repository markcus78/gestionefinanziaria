'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { saveBacklogDecision, saveBacklogPlan, markInstallmentPaid } from './actions'
import { splitPlan, type BacklogCreditor, type BacklogDecision, type Decade, type DecadeIdx } from '@/lib/decadi'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

const DECISION_LABEL: Record<BacklogDecision, string> = {
  da_decidere: 'Da decidere',
  pagare: 'Pagare',
  dilazionare: 'Dilazionare',
  stralcio: 'Stralcio',
  non_si_paga: 'Non si paga',
}
const DECISION_STYLE: Record<BacklogDecision, string> = {
  da_decidere: 'bg-amber-500/15 text-amber-400',
  pagare: 'bg-emerald-500/15 text-emerald-400',
  dilazionare: 'bg-blue-500/15 text-blue-400',
  stralcio: 'bg-violet-500/15 text-violet-400',
  non_si_paga: 'bg-zinc-700/50 text-zinc-400',
}

function formatEur(cents: number, dec = 0) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: dec }).format(cents / 100)
}
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
function decadeLabel(month: string, idx: number) {
  const [y, m] = month.split('-').map(Number)
  return `${MESI[m - 1]} ${String(y).slice(2)} D${idx}`
}
function parseCents(s: string) {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

type Quote = { month: string; idx: DecadeIdx; cents: number }

function Editor({ c, decades, today }: { c: BacklogCreditor; decades: Decade[]; today: string }) {
  const router = useRouter()
  const [decision, setDecision] = useState<BacklogDecision>(c.decision)
  const [agreed, setAgreed] = useState(c.agreedCents !== null ? (c.agreedCents / 100).toFixed(2).replace('.', ',') : '')
  const [notes, setNotes] = useState(c.notes ?? '')
  const unpaid = c.installments.filter(q => !q.paidAt)
  const [quotes, setQuotes] = useState<Quote[]>(unpaid.map(q => ({ month: q.month, idx: q.idx, cents: q.cents })))
  const [n, setN] = useState(String(Math.max(1, unpaid.length || (c.decision === 'pagare' ? 1 : 6))))
  const starts = splitPlan(18, 18, decades[0])
  const [start, setStart] = useState(`${decades[0].month}|${decades[0].idx}`)
  const [paidDate, setPaidDate] = useState(today)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const decided = decision === 'pagare' || decision === 'dilazionare' || decision === 'stralcio'
  const agreedCents = parseCents(agreed)
  const target = decision === 'stralcio' && agreedCents !== null ? Math.max(0, agreedCents - c.paidCents) : c.residualCents
  const planned = quotes.reduce((s, q) => s + q.cents, 0)

  function run(fn: () => Promise<{ error?: string } | { success: true }>, ok: string) {
    setMsg(null)
    startTransition(async () => {
      const res = await fn()
      if ('error' in res && res.error) setMsg({ ok: false, text: res.error })
      else { setMsg({ ok: true, text: ok }); router.refresh() }
    })
  }

  function saveDecision() {
    run(() => saveBacklogDecision({
      companyId: c.companyId, key: c.key, name: c.name, decision,
      agreedCents: decision === 'stralcio' ? agreedCents : null, notes,
    }), 'Decisione salvata')
  }

  function prepare() {
    const k = parseInt(n, 10)
    if (!(k > 0)) return
    const [month, idx] = start.split('|')
    setQuotes(splitPlan(target, k, { month, idx: Number(idx) as DecadeIdx }))
  }

  function savePlan() {
    if (!c.itemId) { setMsg({ ok: false, text: 'Prima salva la decisione' }); return }
    if (planned > target) { setMsg({ ok: false, text: `Le quote superano quanto c'è da pagare (${formatEur(target, 2)})` }); return }
    run(() => saveBacklogPlan(c.itemId!, quotes), 'Piano salvato: le quote sono nel cruscotto')
  }

  return (
    <div className="px-4 py-4 bg-zinc-950/40 border-t border-zinc-800 space-y-4 text-sm">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="space-y-1">
          <div className="text-xs text-zinc-500">Decisione</div>
          <select value={decision} onChange={e => setDecision(e.target.value as BacklogDecision)} className="px-2 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-zinc-100">
            {(Object.keys(DECISION_LABEL) as BacklogDecision[]).map(d => <option key={d} value={d}>{DECISION_LABEL[d]}</option>)}
          </select>
        </label>
        {decision === 'stralcio' && (
          <label className="space-y-1">
            <div className="text-xs text-zinc-500">Importo concordato (€)</div>
            <input value={agreed} onChange={e => setAgreed(e.target.value)} className="w-32 px-2 py-1.5 text-right bg-zinc-800 border border-zinc-600 rounded text-zinc-100" />
          </label>
        )}
        <label className="space-y-1 flex-1 min-w-[240px]">
          <div className="text-xs text-zinc-500">Note (accordi, contatti, motivo)</div>
          <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-zinc-100" />
        </label>
        <button onClick={saveDecision} disabled={isPending} className="px-3 py-1.5 rounded bg-indigo-700 text-zinc-100 hover:bg-indigo-600">Salva decisione</button>
      </div>

      {decided && c.itemId && c.decision === decision && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Piano delle quote · da pagare {formatEur(target, 2)}{c.paidCents > 0 && <> · già pagato con le quote {formatEur(c.paidCents, 2)}</>}
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="space-y-1">
              <div className="text-xs text-zinc-500">Numero quote</div>
              <input value={n} onChange={e => setN(e.target.value)} className="w-16 px-2 py-1 text-right bg-zinc-800 border border-zinc-600 rounded text-zinc-100" />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-zinc-500">A partire da</div>
              <select value={start} onChange={e => setStart(e.target.value)} className="px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-zinc-100">
                {starts.map(s => <option key={`${s.month}|${s.idx}`} value={`${s.month}|${s.idx}`}>{decadeLabel(s.month, s.idx)}</option>)}
              </select>
            </label>
            <button onClick={prepare} className="px-3 py-1 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700">Prepara quote uguali</button>
          </div>
          {quotes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quotes.map((q, i) => (
                <div key={`${q.month}|${q.idx}|${q.cents}`} className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/60 rounded">
                  <span className="text-xs text-zinc-400">{decadeLabel(q.month, q.idx)}</span>
                  <input
                    defaultValue={(q.cents / 100).toFixed(2).replace('.', ',')}
                    onBlur={e => {
                      const v = parseCents(e.target.value)
                      if (v !== null && v > 0) setQuotes(quotes.map((x, j) => j === i ? { ...x, cents: v } : x))
                    }}
                    className="w-24 px-1.5 py-0.5 text-xs text-right bg-zinc-900 border border-zinc-700 rounded text-zinc-100"
                  />
                  <button onClick={() => setQuotes(quotes.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button onClick={savePlan} disabled={isPending} className="px-3 py-1.5 rounded bg-indigo-700 text-zinc-100 hover:bg-indigo-600">Salva piano</button>
            <span className={`text-xs ${planned > target ? 'text-red-400' : 'text-zinc-500'}`}>
              quote {formatEur(planned, 2)} su {formatEur(target, 2)}{planned < target && <> · restano {formatEur(target - planned, 2)} senza quota</>}
            </span>
          </div>
        </div>
      )}
      {decided && (!c.itemId || c.decision !== decision) && (
        <p className="text-xs text-zinc-500">Salva la decisione, poi qui compare il piano delle quote.</p>
      )}

      {c.installments.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Quote salvate</div>
          {c.installments.map(q => (
            <div key={q.id} className="flex items-center gap-3 text-xs">
              <span className="w-24 text-zinc-400">{decadeLabel(q.month, q.idx)}</span>
              <span className="w-24 text-right font-mono text-zinc-200">{formatEur(q.cents, 2)}</span>
              {q.paidAt
                ? <span className="text-emerald-400">pagata il {formatDate(q.paidAt)}</span>
                : (
                  <button
                    onClick={() => run(() => markInstallmentPaid(q.id, paidDate), 'Quota registrata sulle partite, dalla più vecchia')}
                    disabled={isPending}
                    className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  >
                    Segna pagata il {formatDate(paidDate)}
                  </button>
                )}
            </div>
          ))}
          <label className="flex items-center gap-2 text-xs text-zinc-500 pt-1">
            data del pagamento
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 rounded text-zinc-100" />
          </label>
        </div>
      )}

      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}

      <details>
        <summary className="text-xs text-zinc-500 cursor-pointer">Partite aperte nello scadenzario ({c.rows.length})</summary>
        <div className="mt-2 max-h-60 overflow-y-auto divide-y divide-zinc-800/60">
          {c.rows.map((r, i) => (
            <div key={`${r.rowId}-${i}`} className="flex gap-3 py-1 text-xs">
              <span className="w-24 text-zinc-500">{formatDate(r.date)}</span>
              <span className="flex-1 text-zinc-400">{r.doc ?? '—'}</span>
              <span className="w-28 text-right font-mono text-zinc-300">{formatEur(r.cents, 2)}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

export default function ArretratoTab({ creditors, decades, companies, today }: {
  creditors: BacklogCreditor[]
  decades: Decade[]
  companies: { id: string; code: string }[]
  today: string
}) {
  const [filter, setFilter] = useState<'da' | 'decisi' | 'tutti'>('da')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const code = (id: string) => companies.find(c => c.id === id)?.code ?? ''

  const sum = (f: (c: BacklogCreditor) => boolean, v: (c: BacklogCreditor) => number = c => c.residualCents) =>
    creditors.filter(f).reduce((s, c) => s + v(c), 0)
  const tot = sum(() => true)
  const daDecidere = sum(c => c.decision === 'da_decidere')
  const conPiano = sum(() => true, c => c.plannedCents)
  const nonSiPaga = sum(c => c.decision === 'non_si_paga')
  const risparmio = sum(c => c.decision === 'stralcio' && c.agreedCents !== null, c => Math.max(0, c.residualCents - c.targetCents))

  const shown = creditors
    // il creditore aperto resta in vista anche quando la decisione lo sposta di elenco
    .filter(c => filter === 'tutti' || `${c.companyId}|${c.key}` === open
      || (filter === 'da' ? c.decision === 'da_decidere' : c.decision !== 'da_decidere'))
    .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex gap-6 flex-wrap text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <div>Arretrato <span className="text-zinc-100 font-semibold">{formatEur(tot)}</span> su {creditors.length} creditori</div>
        <div>Da decidere <span className="text-amber-400 font-medium">{formatEur(daDecidere)}</span></div>
        <div>In quote non ancora pagate <span className="text-zinc-100 font-medium">{formatEur(conPiano)}</span></div>
        <div>Non si paga <span className="text-zinc-100 font-medium">{formatEur(nonSiPaga)}</span></div>
        {risparmio > 0 && <div>Stralciato <span className="text-zinc-100 font-medium">{formatEur(risparmio)}</span></div>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {([['da', 'Da decidere'], ['decisi', 'Decisi'], ['tutti', 'Tutti']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1 rounded-md text-xs font-medium ${filter === id ? 'bg-indigo-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Cerca creditore"
          className="px-3 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-500"
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        {shown.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">Nessun creditore in questo elenco.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-2 py-2"></th>
                <th className="text-left px-3 py-2 font-medium">Soc.</th>
                <th className="text-left px-3 py-2 font-medium">Creditore</th>
                <th className="text-right px-3 py-2 font-medium">Partite</th>
                <th className="text-left px-3 py-2 font-medium">Periodo</th>
                <th className="text-right px-3 py-2 font-medium">Residuo</th>
                <th className="text-left px-3 py-2 font-medium">Decisione</th>
                <th className="text-left px-3 py-2 font-medium">Quote</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(c => {
                const id = `${c.companyId}|${c.key}`
                const next = c.installments.find(x => !x.paidAt)
                const decided = c.decision === 'pagare' || c.decision === 'dilazionare' || c.decision === 'stralcio'
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setOpen(open === id ? null : id)}>
                      <td className="px-2 py-1.5 text-zinc-500">{open === id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                      <td className="px-3 py-1.5 text-xs text-zinc-500">{code(c.companyId)}</td>
                      <td className="px-3 py-1.5 text-zinc-200">{c.name}</td>
                      <td className="px-3 py-1.5 text-right text-xs text-zinc-400">{c.rows.length}</td>
                      <td className="px-3 py-1.5 text-xs text-zinc-500">{c.from?.slice(0, 4)}{c.to && c.to.slice(0, 4) !== c.from?.slice(0, 4) && `–${c.to.slice(0, 4)}`}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-100">{formatEur(c.residualCents)}</td>
                      <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded text-xs ${DECISION_STYLE[c.decision]}`}>{DECISION_LABEL[c.decision]}</span></td>
                      <td className="px-3 py-1.5 text-xs text-zinc-400">
                        {next
                          ? <>{c.installments.filter(x => !x.paidAt).length} da pagare · prossima {decadeLabel(next.month, next.idx)} {formatEur(next.cents)}</>
                          : decided && c.targetCents > 0 ? <span className="text-amber-400">nessuna quota</span> : '—'}
                      </td>
                    </tr>
                    {open === id && (
                      <tr><td colSpan={8} className="p-0"><Editor c={c} decades={decades} today={today} /></td></tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Le partite restano quelle dello scadenzario: qui si salva solo cosa si fa con ogni creditore. Nel cruscotto, alla riga «Rientro arretrati»,
        entrano solo le quote non pagate dei creditori decisi (pagare, dilazionare, stralcio); si pagano prima della percentuale ai fornitori.
        «Segna pagata» registra la quota sulle partite del creditore, dalla più vecchia. Per lo stralcio, il residuo oltre l&apos;importo concordato
        si chiude in contabilità. I debiti che non sono nello scadenzario (IVA, INPS, ritenute, cartelle) si inseriscono come Impegni con le loro rate.
      </p>
    </div>
  )
}


'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { setEstimateOverride, setWindowPct } from './actions'
import type { BlockResult, CellItem, DecadeResult, RowKey, WindowResult } from '@/lib/decadi'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

const ROWS: { key: RowKey; label: string; sign: 1 | -1 }[] = [
  { key: 'incassi', label: 'Incassi previsti', sign: 1 },
  { key: 'muro', label: 'Muro: personale, utenze, F24', sign: -1 },
  { key: 'automatici', label: 'Uscite automatiche: RID, rate, addebiti', sign: -1 },
  { key: 'pianificati', label: 'Spese pianificate (impegni)', sign: -1 },
  { key: 'f24', label: 'F24 scaduti da recuperare (ravvedimento)', sign: -1 },
  { key: 'arretrati', label: 'Rientro arretrati (quote decise)', sign: -1 },
  { key: 'fattureSotto', label: 'Fatture sotto 300 €', sign: -1 },
  { key: 'fattureSopra', label: 'Fatture sopra 300 € che scadono', sign: -1 },
  { key: 'nuoveFatture', label: 'Nuove fatture fornitori (stima)', sign: -1 },
]
const BEFORE_WINDOW: RowKey[] = ['incassi', 'muro', 'automatici', 'pianificati', 'f24', 'arretrati', 'fattureSotto']
const INTO_WINDOW: RowKey[] = ['fattureSopra', 'nuoveFatture']

function formatPct(p: number) {
  return `${(Math.round(p * 1000) / 10).toLocaleString('it-IT')}%`
}

const SOURCE_LABEL: Record<CellItem['source'], string> = {
  stima: 'stima', coffa: 'Coffa', previsione: 'previsione', scadenzario: 'scadenzario', impegno: 'impegno', staff: 'staff', piano: 'piano di rientro',
}

function Amount({ cents, strong }: { cents: number; strong?: boolean }) {
  return (
    <span className={`font-mono ${cents < 0 ? 'text-red-400' : cents === 0 ? 'text-zinc-600' : 'text-zinc-200'} ${strong ? 'font-semibold' : ''}`}>
      {cents === 0 ? '—' : formatEur(cents)}
    </span>
  )
}

function OverrideEditor({ item, onDone }: { item: CellItem; onDone: () => void }) {
  const router = useRouter()
  const [value, setValue] = useState((item.cents / 100).toFixed(0))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(cents: number | null) {
    if (!item.estimateId || !item.month || !item.idx) return
    setError(null)
    startTransition(async () => {
      const res = await setEstimateOverride(item.estimateId!, item.month!, item.idx!, cents)
      if ('error' in res) setError(String(res.error))
      else { onDone(); router.refresh() }
    })
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <button onClick={() => save(0)} disabled={isPending} className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Già pagata / non c&apos;è</button>
      <input value={value} onChange={e => setValue(e.target.value)} className="w-24 px-2 py-0.5 text-xs text-right bg-zinc-800 border border-zinc-600 rounded text-zinc-100" />
      <button
        onClick={() => { const n = parseFloat(value.replace(',', '.')); if (Number.isFinite(n)) save(Math.round(n * 100)) }}
        disabled={isPending}
        className="px-2 py-0.5 text-xs rounded bg-indigo-700 text-zinc-100 hover:bg-indigo-600"
      >
        Imposta
      </button>
      <button onClick={() => save(null)} disabled={isPending} className="px-2 py-0.5 text-xs rounded text-zinc-400 hover:text-zinc-200">Torna alla stima</button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

function Detail({ d, rowKey, onClose, codeOf }: { d: DecadeResult; rowKey: RowKey; onClose: () => void; codeOf: (id?: string) => string }) {
  const [editing, setEditing] = useState<string | null>(null)
  // Il dettaglio sta sotto una tabella lunga: senza scorrere, il clic sembrava non fare niente
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [d.decade.key, rowKey])
  const row = ROWS.find(r => r.key === rowKey)!
  const items = [...d.rows[rowKey].items].sort((a, b) => b.cents - a.cents)
  // Nel Gruppo le voci sono di più società: sigla su ogni voce e totale per società in testa
  const byCompany = new Map<string, number>()
  for (const it of items) {
    if (it.replaced) continue
    const c = codeOf(it.companyId) || '—'
    byCompany.set(c, (byCompany.get(c) ?? 0) + it.cents)
  }
  return (
    <div ref={ref} className="bg-zinc-900 border border-indigo-500/50 rounded-xl p-4 scroll-mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-zinc-200">
          <span className="font-medium">{row.label}</span>
          <span className="text-zinc-500 ml-2">{d.decade.label}, entro il {d.decade.entro}</span>
          <span className="ml-3"><Amount cents={row.sign * d.rows[rowKey].total} strong /></span>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
      </div>
      {byCompany.size > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {[...byCompany.entries()].sort((x, y) => y[1] - x[1]).map(([c, v]) => (
            <span key={c} className="px-2 py-1 rounded bg-zinc-800/70 text-xs text-zinc-300">
              <span className="font-medium text-zinc-400 mr-1.5">{c}</span><Amount cents={row.sign * v} />
            </span>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Nessuna voce.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/60">
          {items.map((it, i) => {
            const id = `${it.rowId ?? it.estimateId}-${i}`
            return (
              <div key={id} className="py-1.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="w-16 shrink-0"><span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-medium text-zinc-400">{codeOf(it.companyId) || '—'}</span></span>
                  <span className={`flex-1 ${it.replaced ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>{it.label}</span>
                  {it.date && <span className="text-xs text-zinc-500">{it.date.slice(8, 10)}/{it.date.slice(5, 7)}/{it.date.slice(0, 4)}</span>}
                  <span className="text-xs text-zinc-500 w-20">{SOURCE_LABEL[it.source]}</span>
                  <span className="w-28 text-right"><Amount cents={it.cents} /></span>
                  {it.estimateId && !it.replaced && (
                    <button onClick={() => setEditing(editing === id ? null : id)} className="text-xs text-indigo-400 hover:text-indigo-300">correggi</button>
                  )}
                </div>
                {editing === id && <OverrideEditor item={it} onDone={() => setEditing(null)} />}
                {it.covered !== undefined && (
                  <div className="ml-16 mt-1 pl-3 border-l border-zinc-700 space-y-0.5">
                    {it.monthCoveredCents !== undefined && it.monthEstimateCents !== undefined && it.monthCoveredCents > it.monthEstimateCents && (
                      <div className="text-xs text-amber-400">
                        Le fatture vere del mese ({formatEur(it.monthCoveredCents)}) superano la stima ({formatEur(it.monthEstimateCents)}):
                        alza la stima in Impostazioni → Tesoreria o correggi questa quota.
                      </div>
                    )}
                    {it.covered.length === 0
                      ? <div className="text-xs text-zinc-600">Nessuna fattura vera in questa decade: conta la stima.</div>
                      : (
                        <>
                          <div className="text-xs text-zinc-500">Fatture già arrivate, pagate da questa stima (non si contano due volte):</div>
                          {it.covered.map((c, k) => (
                            <div key={`${c.rowId}-${k}`} className="flex items-center gap-3 text-xs">
                              <span className="flex-1 text-zinc-400">{c.label}{c.doc && <span className="text-zinc-600 ml-1">n. {c.doc}</span>}</span>
                              {c.date && <span className="text-zinc-500">{c.date.slice(8, 10)}/{c.date.slice(5, 7)}</span>}
                              <span className="w-24 text-right font-mono text-zinc-400">{formatEur(c.cents)}</span>
                            </div>
                          ))}
                        </>
                      )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PctInput({ month, idx, decisa, suggerita }: { month: string; idx: number; decisa: number | null; suggerita: number }) {
  const router = useRouter()
  const initial = decisa === null ? '' : String(Math.round(decisa * 1000) / 10).replace('.', ',')
  const [value, setValue] = useState(initial)
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()

  function save() {
    const t = value.trim()
    if (t === initial) return
    const pct = t === '' ? null : parseFloat(t.replace(',', '.'))
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) { setError(true); return }
    setError(false)
    startTransition(async () => {
      const res = await setWindowPct(month, idx, pct)
      if ('error' in res) setError(true)
      else router.refresh()
    })
  }

  return (
    <input
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder={formatPct(suggerita)}
      disabled={isPending}
      title="Vuoto = vale la suggerita"
      className={`w-20 px-2 py-0.5 text-xs text-right bg-zinc-800 border rounded text-zinc-100 placeholder:text-zinc-500 ${error ? 'border-red-500' : 'border-zinc-600'}`}
    />
  )
}

function Grid({ result, window, compact, pctEditable, onPick, picked }: {
  result: BlockResult
  window: WindowResult
  compact?: boolean
  pctEditable?: boolean
  onPick?: (i: number, k: RowKey) => void
  picked?: { i: number; k: RowKey } | null
}) {
  const ds = result.decades
  const ws = window.decades
  const rowsBefore = ROWS.filter(r => BEFORE_WINDOW.includes(r.key) && (!compact || r.key === 'incassi'))
  const rowsInto = ROWS.filter(r => INTO_WINDOW.includes(r.key))

  const cellRow = (r: typeof ROWS[number]) => (
    <tr key={r.key} className="border-b border-zinc-800/50">
      <td className="px-3 py-1.5 text-zinc-300">
        {onPick
          ? <button onClick={() => onPick(0, r.key)} className="text-left hover:text-zinc-100 hover:underline underline-offset-2" title="Vedi le voci della decade in corso">{r.label}</button>
          : r.label}
      </td>
      {ds.map((d, i) => {
        const active = picked?.i === i && picked.k === r.key
        return (
          <td key={d.decade.key} className="px-1 py-0.5 text-right">
            <button
              onClick={() => onPick?.(i, r.key)}
              disabled={!onPick}
              className={`w-full px-2 py-1 rounded text-right ${active ? 'bg-indigo-600/30' : onPick ? 'hover:bg-zinc-800' : ''}`}
            >
              <Amount cents={r.sign * d.rows[r.key].total} />
            </button>
          </td>
        )
      })}
    </tr>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500 min-w-[280px]"></th>
            {ds.map(d => (
              <th key={d.decade.key} className="text-right px-3 py-2 text-xs font-medium text-zinc-300 min-w-[105px]">
                {d.decade.label}
                <div className="text-[10px] font-normal text-zinc-500">entro il {d.decade.entro}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-zinc-800/50">
            <td className="px-3 py-1.5 text-zinc-400">Saldo a inizio decade</td>
            {ws.map((w, i) => <td key={ds[i].decade.key} className="px-3 py-1.5 text-right"><Amount cents={w.inizio} /></td>)}
          </tr>
          {rowsBefore.map(cellRow)}
          {compact && (
            <tr className="border-b border-zinc-800/50">
              <td className="px-3 py-1.5 text-zinc-300">Uscite fisse, quote arretrati e fatture sotto 300 €</td>
              {ds.map(d => (
                <td key={d.decade.key} className="px-3 py-1.5 text-right">
                  <Amount cents={-(d.rows.muro.total + d.rows.automatici.total + d.rows.pianificati.total + d.rows.f24.total + d.rows.arretrati.total + d.rows.fattureSotto.total)} />
                </td>
              ))}
            </tr>
          )}

          {!compact && (
            <>
              <tr className="bg-zinc-800/20">
                <td colSpan={ds.length + 1} className="px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Finestra fornitori sopra 300 €
                </td>
              </tr>
              {rowsInto.map(cellRow)}
              <tr className="border-b border-zinc-800/50">
                <td className="px-3 py-1.5 text-zinc-300">Dovuto ai fornitori <span className="text-xs text-zinc-500">(con quello che slitta)</span></td>
                {ws.map((w, i) => <td key={ds[i].decade.key} className="px-3 py-1.5 text-right"><Amount cents={-w.dovuto} /></td>)}
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="px-3 py-1.5 text-zinc-400">Percentuale suggerita</td>
                {ws.map((w, i) => (
                  <td key={ds[i].decade.key} className="px-3 py-1.5 text-right font-mono text-zinc-400">{w.dovuto > 0 ? formatPct(w.suggerita) : '—'}</td>
                ))}
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="px-3 py-1.5 text-zinc-200">
                  Percentuale decisa
                  {!pctEditable && <span className="text-xs text-zinc-500 ml-2">(si decide nella vista Gruppo)</span>}
                </td>
                {ws.map((w, i) => (
                  <td key={ds[i].decade.key} className="px-3 py-1 text-right">
                    {pctEditable
                      ? <PctInput key={`${ds[i].decade.key}|${w.decisa}`} month={ds[i].decade.month} idx={ds[i].decade.idx} decisa={w.decisa} suggerita={w.suggerita} />
                      : <span className="font-mono text-zinc-200">{w.dovuto > 0 ? formatPct(w.applicata) : '—'}</span>}
                  </td>
                ))}
              </tr>
            </>
          )}
          <tr className="border-b border-zinc-800/50">
            <td className="px-3 py-1.5 text-zinc-300">Pagato ai fornitori sopra 300 €</td>
            {ws.map((w, i) => <td key={ds[i].decade.key} className="px-3 py-1.5 text-right"><Amount cents={-w.pagato} /></td>)}
          </tr>
          <tr className="border-b border-zinc-700 bg-zinc-800/30">
            <td className="px-3 py-2 font-medium text-zinc-100">Saldo a fine decade</td>
            {ws.map((w, i) => (
              <td key={ds[i].decade.key} className="px-3 py-2 text-right">
                <Amount cents={w.fine} strong />
                {!compact && w.dovuto > 0 && <div className="text-[10px] text-zinc-500">pagando il {formatPct(w.applicata)}</div>}
              </td>
            ))}
          </tr>
          {!compact && (
            <>
              <tr className="border-b border-zinc-800/50">
                <td className="px-3 py-1.5 text-zinc-400">Resta ai fornitori, slitta alla decade dopo</td>
                {ws.map((w, i) => <td key={ds[i].decade.key} className="px-3 py-1.5 text-right"><Amount cents={-w.riporto} /></td>)}
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="px-3 py-1.5 text-zinc-600">Saldo se si pagasse tutto il dovuto</td>
                {ds.map(d => (
                  <td key={d.decade.key} className="px-3 py-1.5 text-right font-mono text-zinc-600">{formatEur(d.fine)}</td>
                ))}
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="px-3 py-1.5 text-zinc-400">Disponibilità con il fido</td>
                {ws.map((w, i) => <td key={ds[i].decade.key} className="px-3 py-1.5 text-right"><Amount cents={w.dispFido} /></td>)}
              </tr>
              <tr>
                <td className="px-3 py-1.5 text-zinc-400">Fabbisogno per restare sopra la soglia ({formatEur(ds[0]?.soglia ?? 0)})</td>
                {ws.map((w, i) => (
                  <td key={ds[i].decade.key} className="px-3 py-1.5 text-right font-mono">
                    {w.fabbisogno > 0 ? <span className="text-red-400">{formatEur(w.fabbisogno)}</span> : <span className="text-zinc-600">—</span>}
                  </td>
                ))}
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function CruscottoTab({ result, window, subBlocks, subWindows, pctEditable, companies }: {
  result: BlockResult
  window: WindowResult
  subBlocks: BlockResult[]
  subWindows: WindowResult[]
  pctEditable: boolean
  companies: { id: string; code: string }[]
}) {
  const [picked, setPicked] = useState<{ i: number; k: RowKey } | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-2">
        <Grid
          result={result}
          window={window}
          pctEditable={pctEditable}
          picked={picked}
          onPick={(i, k) => setPicked(picked?.i === i && picked.k === k ? null : { i, k })}
        />
      </div>
      <p className="text-xs text-zinc-500">
        Le fatture sotto 300 € si pagano per intero. Quello che resta, tolta la soglia minima, va ai fornitori sopra 300 € con una sola percentuale:
        ognuno riceve la stessa quota, nessuno resta a zero, e quello che non si paga slitta alla decade dopo.
        La percentuale si decide nella vista Gruppo (vuoto = vale la suggerita) e vale per tutte le società.
        Clic su un importo per vedere le voci. I movimenti fra le società del gruppo non sono contati.
      </p>

      {picked && (
        <Detail
          d={result.decades[picked.i]} rowKey={picked.k} onClose={() => setPicked(null)}
          codeOf={id => companies.find(c => c.id === id)?.code ?? ''}
        />
      )}

      {subBlocks.map((b, bi) => {
        const last = subWindows[bi].decades[subWindows[bi].decades.length - 1]
        return (
          <div key={b.code} className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <button
              onClick={() => setOpen({ ...open, [b.code]: !open[b.code] })}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-zinc-200"
            >
              {open[b.code] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span className="font-medium">{b.label}</span>
              <span className="ml-auto text-xs text-zinc-500">
                saldo {formatEur(b.balanceCents)} · fine orizzonte <span className={last.fine < 0 ? 'text-red-400' : ''}>{formatEur(last.fine)}</span>
              </span>
            </button>
            {open[b.code] && <div className="pb-2"><Grid result={b} window={subWindows[bi]} compact /></div>}
          </div>
        )
      })}
    </div>
  )
}

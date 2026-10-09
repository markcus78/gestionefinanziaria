'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { BlockResult, WindowResult } from '@/lib/decadi'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(cents / 100)
}

function formatDate(iso?: string) {
  if (!iso) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

function formatPct(p: number) {
  return `${(Math.round(p * 1000) / 10).toLocaleString('it-IT')}%`
}

type Row = {
  key: string
  company: string
  companyId?: string
  supplier: string
  doc?: string | null
  date?: string
  method?: string | null
  dovuto: number
  pagare: number
  estimate: boolean
}

function scheduleLink(r: Row) {
  const p = new URLSearchParams({ q: r.supplier, flow: 'out' })
  if (r.companyId) p.set('company', r.companyId)
  return `/schedule?${p.toString()}`
}

function Table({ rows, showResta }: { rows: Row[]; showResta: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
          <th className="text-left px-3 py-2 font-medium">Soc.</th>
          <th className="text-left px-3 py-2 font-medium">Fornitore</th>
          <th className="text-left px-3 py-2 font-medium">Documento</th>
          <th className="text-left px-3 py-2 font-medium">Scadenza</th>
          <th className="text-left px-3 py-2 font-medium">Metodo</th>
          <th className="text-right px-3 py-2 font-medium">Dovuto</th>
          <th className="text-right px-3 py-2 font-medium">Da pagare</th>
          {showResta && <th className="text-right px-3 py-2 font-medium">Resta</th>}
          <th className="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} className="border-b border-zinc-800/50 last:border-0">
            <td className="px-3 py-1.5 text-xs text-zinc-500">{r.company}</td>
            <td className="px-3 py-1.5 text-zinc-200">{r.supplier}{r.estimate && <span className="ml-2 text-xs text-zinc-500">(stima: non è ancora una fattura)</span>}</td>
            <td className="px-3 py-1.5 text-xs text-zinc-400">{r.doc ?? '—'}</td>
            <td className="px-3 py-1.5 text-xs text-zinc-400">{formatDate(r.date)}</td>
            <td className="px-3 py-1.5 text-xs text-zinc-400">{r.method ?? '—'}</td>
            <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{formatEur(r.dovuto)}</td>
            <td className="px-3 py-1.5 text-right font-mono font-semibold text-zinc-100">{formatEur(r.pagare)}</td>
            {showResta && <td className="px-3 py-1.5 text-right font-mono text-amber-400/80">{r.dovuto - r.pagare > 0 ? formatEur(r.dovuto - r.pagare) : '—'}</td>}
            <td className="px-3 py-1.5 text-right">
              {!r.estimate && (
                <Link href={scheduleLink(r)} className="text-zinc-500 hover:text-zinc-200" title="Apri nello Scadenzario per registrare il pagamento">
                  <ExternalLink className="w-3.5 h-3.5 inline" />
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function FattureTab({ result, window, companies }: {
  result: BlockResult
  window: WindowResult
  companies: { id: string; code: string }[]
}) {
  const [i, setI] = useState(0)
  const [q, setQ] = useState('')
  const code = (id?: string) => companies.find(c => c.id === id)?.code ?? ''
  const w = window.decades[i]
  const d = result.decades[i]
  const match = (r: Row) => !q || r.supplier.toLowerCase().includes(q.toLowerCase()) || (r.doc ?? '').toLowerCase().includes(q.toLowerCase())
  const bySupplier = (a: Row, b: Row) => a.supplier.localeCompare(b.supplier) || (a.date ?? '').localeCompare(b.date ?? '')

  const sopra: Row[] = window.invoices
    .filter(v => v.start <= i && v.before[i] > 0)
    .map(v => ({
      key: v.key, company: code(v.companyId), companyId: v.companyId, supplier: v.label, doc: v.doc, date: v.date,
      method: v.method, dovuto: v.before[i], pagare: v.paid[i], estimate: v.estimate,
    }))
    .filter(match)
    .sort((a, b) => Number(a.estimate) - Number(b.estimate) || bySupplier(a, b))
  const sotto: Row[] = d.rows.fattureSotto.items
    .map((it, n) => ({
      key: `${it.rowId ?? n}`, company: code(it.companyId), companyId: it.companyId, supplier: it.label, doc: it.doc, date: it.date,
      method: it.method, dovuto: it.cents, pagare: it.cents, estimate: false,
    }))
    .filter(match)
    .sort(bySupplier)

  const realSopra = sopra.filter(r => !r.estimate)
  const totPagare = realSopra.reduce((s, r) => s + r.pagare, 0) + sotto.reduce((s, r) => s + r.pagare, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 flex-wrap">
          {result.decades.map((x, n) => (
            <button
              key={x.decade.key}
              onClick={() => setI(n)}
              className={`px-3 py-1 rounded-md text-xs font-medium ${n === i ? 'bg-indigo-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {x.decade.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Cerca fornitore o documento"
          className="px-3 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-500"
        />
      </div>

      <div className="flex gap-6 flex-wrap text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <div>Decade <span className="text-zinc-100 font-medium">{d.decade.label}</span>, entro il {d.decade.entro}</div>
        <div>Percentuale ai fornitori sopra 300 €: <span className="text-zinc-100 font-medium">{w.dovuto > 0 ? formatPct(w.applicata) : '—'}</span>{w.decisa === null && w.dovuto > 0 && <span className="text-xs ml-1">(suggerita)</span>}</div>
        <div>Fatture vere da pagare: <span className="text-zinc-100 font-semibold">{formatEur(totPagare)}</span></div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <div className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Sopra 300 €: si paga la percentuale del dovuto</div>
        {sopra.length === 0 ? <p className="px-4 py-3 text-sm text-zinc-500">Nessuna fattura.</p> : <Table rows={sopra} showResta />}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <div className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Sotto 300 €: si pagano per intero</div>
        {sotto.length === 0 ? <p className="px-4 py-3 text-sm text-zinc-500">Nessuna fattura.</p> : <Table rows={sotto} showResta={false} />}
      </div>

      <p className="text-xs text-zinc-500">
        «Dovuto» è quanto resta della fattura all&apos;inizio della decade, dopo le quote delle decadi prima. Il pagamento si registra nello Scadenzario
        (icona a destra): dopo la registrazione la fattura scende e il calcolo si rifà da solo. Le stime delle nuove fatture servono al calcolo ma non si pagano.
      </p>
    </div>
  )
}

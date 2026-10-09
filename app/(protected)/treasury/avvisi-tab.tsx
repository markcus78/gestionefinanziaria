'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check } from 'lucide-react'
import { setSupplierNotified } from './actions'
import { supplierKey, type BlockResult, type WindowResult } from '@/lib/decadi'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

type Supplier = {
  key: string
  name: string
  companies: string[]
  invoices: number
  dovuto: number      // dovuto a inizio della decade in corso
  quota: number       // quanto riceve nella decade in corso
  resta: number       // quanto slitta dopo la decade in corso
  prossima: string | null
}

function message(prossima: string | null) {
  return `Da questo mese vi paghiamo a quote, ogni dieci giorni (entro il 10, il 20 e il 30), fino a chiudere le fatture aperte.`
    + (prossima ? ` La prossima quota arriva entro il ${prossima}.` : '')
}

function NotifiedToggle({ s, notified, notifiedAt, today }: { s: Supplier; notified: boolean; notifiedAt: string | null; today: string }) {
  const router = useRouter()
  const [date, setDate] = useState(notifiedAt ?? today)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(on: boolean, d: string) {
    setError(null)
    startTransition(async () => {
      const res = await setSupplierNotified(s.key, s.name, on, on ? d : null)
      if ('error' in res) setError(String(res.error))
      else router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
        <input type="checkbox" checked={notified} disabled={isPending} onChange={e => save(e.target.checked, date)} className="accent-emerald-500" />
        avvisato
      </label>
      {notified && (
        <input
          type="date"
          value={date}
          disabled={isPending}
          onChange={e => { setDate(e.target.value); save(true, e.target.value) }}
          className="px-1.5 py-0.5 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100"
        />
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

export default function AvvisiTab({ result, window, notices, companies, today }: {
  result: BlockResult
  window: WindowResult
  notices: { key: string; notified: boolean; notifiedAt: string | null }[]
  companies: { id: string; code: string }[]
  today: string
}) {
  const [filter, setFilter] = useState<'da' | 'fatti' | 'tutti'>('da')
  const [copied, setCopied] = useState<string | null>(null)
  const code = (id?: string) => companies.find(c => c.id === id)?.code ?? ''
  const noticeOf = new Map(notices.map(n => [n.key, n]))
  const w0 = window.decades[0]

  // Fornitori con fatture vere aperte nella decade in corso che non si chiudono in questa decade
  const map = new Map<string, Supplier & { paidBy: number[] }>()
  for (const v of window.invoices) {
    if (v.estimate || v.start > 0 || v.before[0] <= 0) continue
    const key = supplierKey(v.label) || v.label
    let s = map.get(key)
    if (!s) {
      s = { key, name: v.label, companies: [], invoices: 0, dovuto: 0, quota: 0, resta: 0, prossima: null, paidBy: Array(v.paid.length).fill(0) }
      map.set(key, s)
    }
    const c = code(v.companyId)
    if (c && !s.companies.includes(c)) s.companies.push(c)
    s.invoices++
    s.dovuto += v.before[0]
    s.quota += v.paid[0]
    s.resta += v.before[0] - v.paid[0]
    v.paid.forEach((p, n) => { s!.paidBy[n] += p })
  }
  const suppliers = [...map.values()]
    .filter(s => s.resta > 0)
    .map(s => {
      const n = s.paidBy.findIndex(p => p > 0)
      return { ...s, prossima: n >= 0 ? result.decades[n].decade.entro : null }
    })
    .sort((a, b) => b.resta - a.resta)

  const isNotified = (s: Supplier) => noticeOf.get(s.key)?.notified ?? false
  const shown = suppliers.filter(s => filter === 'tutti' || (filter === 'da' ? !isNotified(s) : isNotified(s)))
  const daAvvisare = suppliers.filter(s => !isNotified(s))

  async function copy(s: Supplier) {
    try {
      await navigator.clipboard.writeText(message(s.prossima))
      setCopied(s.key)
      setTimeout(() => setCopied(null), 1500)
    } catch { /* il testo resta comunque visibile sotto */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-6 flex-wrap text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <div>Decade in corso <span className="text-zinc-100 font-medium">{result.decades[0].decade.label}</span>, entro il {result.decades[0].decade.entro}</div>
        <div>Percentuale: <span className="text-zinc-100 font-medium">{w0.dovuto > 0 ? `${Math.round(w0.applicata * 1000) / 10}%` : '—'}</span></div>
        <div>Fornitori pagati a quote: <span className="text-zinc-100 font-medium">{suppliers.length}</span></div>
        <div>Da avvisare: <span className={daAvvisare.length ? 'text-amber-400 font-semibold' : 'text-zinc-100'}>{daAvvisare.length}</span>
          {daAvvisare.length > 0 && <span className="ml-1">({formatEur(daAvvisare.reduce((s, x) => s + x.resta, 0))} che slittano)</span>}
        </div>
      </div>

      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        {([['da', 'Da avvisare'], ['fatti', 'Avvisati'], ['tutti', 'Tutti']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 py-1 rounded-md text-xs font-medium ${filter === id ? 'bg-indigo-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        {shown.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">
            {suppliers.length === 0 ? 'In questa decade i fornitori si pagano per intero: nessuno da avvisare.' : 'Nessun fornitore in questo elenco.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2 font-medium">Fornitore</th>
                <th className="text-left px-3 py-2 font-medium">Soc.</th>
                <th className="text-right px-3 py-2 font-medium">Fatture</th>
                <th className="text-right px-3 py-2 font-medium">Dovuto</th>
                <th className="text-right px-3 py-2 font-medium">Quota ora</th>
                <th className="text-right px-3 py-2 font-medium">Slitta</th>
                <th className="text-left px-3 py-2 font-medium">Prossima quota</th>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(s => {
                const n = noticeOf.get(s.key)
                return (
                  <tr key={s.key} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-3 py-1.5 text-zinc-200">{s.name}</td>
                    <td className="px-3 py-1.5 text-xs text-zinc-500">{s.companies.join(', ')}</td>
                    <td className="px-3 py-1.5 text-right text-xs text-zinc-400">{s.invoices}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{formatEur(s.dovuto)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-100">{formatEur(s.quota)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-amber-400/80">{formatEur(s.resta)}</td>
                    <td className="px-3 py-1.5 text-xs text-zinc-400">{s.prossima ? `entro il ${s.prossima}` : '—'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => copy(s)} className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1" title={message(s.prossima)}>
                        {copied === s.key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} testo
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <NotifiedToggle key={`${s.key}|${n?.notified}|${n?.notifiedAt}`} s={s} notified={n?.notified ?? false} notifiedAt={n?.notifiedAt ?? null} today={today} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">Testo da mandare</div>
        <p className="text-zinc-300">{message('[data della prossima quota]')}</p>
        <p className="text-xs text-zinc-500 mt-2">
          Il pulsante «testo» copia il messaggio con la data giusta per quel fornitore. Un fornitore è lo stesso nelle quattro società:
          si avvisa una volta sola. «Avvisato» resta salvato anche quando la percentuale cambia.
        </p>
      </div>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, TrendingDown, Pencil, Check, X, Archive } from 'lucide-react'
import CruscottoTab from './cruscotto-tab'
import FattureTab from './fatture-tab'
import AvvisiTab from './avvisi-tab'
import { updateAccountBalance } from './actions'
import type { BankAccount } from '@/lib/types/database'
import type { BlockResult, WindowResult } from '@/lib/decadi'

type Props = {
  view: string
  blocks: { code: string; label: string }[]
  result: BlockResult
  window: WindowResult
  notices: { key: string; notified: boolean; notifiedAt: string | null }[]
  subBlocks: BlockResult[]
  subWindows: WindowResult[]
  accounts: BankAccount[]
  companies: { id: string; code: string }[]
  today: string
  coffa: { date: string; fresh: boolean } | null
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

function parseCents(s: string) {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function AccountRow({ account, companyCode, today }: { account: BankAccount; companyCode: string; today: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [balance, setBalance] = useState((account.current_balance_cents / 100).toFixed(2).replace('.', ','))
  const [date, setDate] = useState(account.balance_date ?? today)
  const [fido, setFido] = useState(((account.credit_line_cents ?? 0) / 100).toFixed(0))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const stale = !account.balance_date || account.balance_date < today

  function save() {
    const b = parseCents(balance)
    const f = parseCents(fido)
    if (b === null || f === null) { setError('Importo non valido'); return }
    setError(null)
    startTransition(async () => {
      const res = await updateAccountBalance(account.id, b, date, f)
      if ('error' in res) setError(String(res.error))
      else { setOpen(false); router.refresh() }
    })
  }

  return (
    <tr className="border-b border-zinc-800/50 last:border-0">
      <td className="px-3 py-2 text-xs text-zinc-500">{companyCode}</td>
      <td className="px-3 py-2 text-sm text-zinc-200">{account.name}</td>
      {open ? (
        <>
          <td className="px-3 py-2 text-right">
            <input value={balance} onChange={e => setBalance(e.target.value)} className="w-28 px-2 py-1 text-xs text-right bg-zinc-800 border border-zinc-600 rounded text-zinc-100" />
          </td>
          <td className="px-3 py-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100" />
          </td>
          <td className="px-3 py-2 text-right">
            <input value={fido} onChange={e => setFido(e.target.value)} className="w-24 px-2 py-1 text-xs text-right bg-zinc-800 border border-zinc-600 rounded text-zinc-100" />
          </td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-2 justify-end">
              <button onClick={save} disabled={isPending} className="text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
              {error && <span className="text-xs text-red-400">{error}</span>}
            </div>
          </td>
        </>
      ) : (
        <>
          <td className={`px-3 py-2 text-right text-sm font-mono ${account.current_balance_cents < 0 ? 'text-red-400' : 'text-zinc-100'}`}>
            {formatEur(account.current_balance_cents)}
          </td>
          <td className={`px-3 py-2 text-xs ${stale ? 'text-amber-400' : 'text-zinc-400'}`}>{formatDate(account.balance_date)}</td>
          <td className="px-3 py-2 text-right text-xs font-mono text-zinc-400">{account.credit_line_cents ? formatEur(account.credit_line_cents) : '—'}</td>
          <td className="px-3 py-2 text-right">
            <button onClick={() => setOpen(true)} className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Aggiorna
            </button>
          </td>
        </>
      )}
    </tr>
  )
}

export default function TreasuryClient({ view, blocks, result, window, notices, subBlocks, subWindows, accounts, companies, today, coffa }: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    router.push(`/treasury?${params.toString()}`)
  }

  const codeOf = (companyId: string) => companies.find(c => c.id === companyId)?.code ?? ''
  const staleAccounts = accounts.filter(a => !a.balance_date || a.balance_date < today)
  const tab = sp.get('tab') ?? 'cruscotto'
  const wd = window.decades.map((w, i) => ({ ...w, decade: result.decades[i].decade }))
  const fabbisogno = wd.filter(d => d.fabbisogno > 0)
  const sottoFido = wd.filter(d => d.dispFido < 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {[{ code: 'GRUPPO', label: 'Gruppo' }, ...blocks].map(b => (
            <button
              key={b.code}
              onClick={() => navigate({ block: b.code === 'GRUPPO' ? null : b.code })}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === b.code ? 'bg-indigo-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-zinc-400">
          Saldo di partenza:{' '}
          <span className={`font-semibold ${result.balanceCents >= 0 ? 'text-zinc-100' : 'text-red-400'}`}>{formatEur(result.balanceCents)}</span>
          {result.creditLineCents > 0 && <span className="ml-3">Fido: <span className="text-zinc-200">{formatEur(result.creditLineCents)}</span></span>}
          <span className="ml-3 text-xs">al {formatDate(result.balanceDate)}</span>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <th className="text-left px-3 py-2 font-medium">Soc.</th>
              <th className="text-left px-3 py-2 font-medium">Conto</th>
              <th className="text-right px-3 py-2 font-medium">Saldo</th>
              <th className="text-left px-3 py-2 font-medium">Al</th>
              <th className="text-right px-3 py-2 font-medium">Fido</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-sm text-zinc-500">Nessun conto: aggiungilo in Impostazioni → Conti Bancari</td></tr>
            ) : accounts.map(a => (
              <AccountRow key={a.id} account={a} companyCode={codeOf(a.company_id)} today={today} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        {staleAccounts.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-amber-400 font-medium">{staleAccounts.length} saldi non di oggi</span>
              <span className="text-zinc-400 ml-2">il cruscotto parte da saldi vecchi: aggiornali qui sopra</span>
            </div>
          </div>
        )}
        {(!coffa || !coffa.fresh) && (
          <div className="flex items-start gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-amber-400 font-medium">Coffa {coffa ? `fermo al ${formatDate(coffa.date)}` : 'non ha ancora inviato la previsione'}</span>
              <span className="text-zinc-400 ml-2">gli incassi Appiae sono la stima mensile delle Impostazioni</span>
            </div>
          </div>
        )}
        {(fabbisogno.length > 0 || sottoFido.length > 0) && (
          <div className="flex items-start gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm">
            <TrendingDown className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              {sottoFido.length > 0 ? (
                <>
                  <span className="text-red-400 font-medium">Sotto zero anche con il fido</span>
                  <span className="text-zinc-400 ml-2">dalla decade {sottoFido[0].decade.label} (entro il {sottoFido[0].decade.entro}): {formatEur(sottoFido[0].dispFido)}</span>
                </>
              ) : (
                <>
                  <span className="text-red-400 font-medium">Sotto la soglia minima</span>
                  <span className="text-zinc-400 ml-2">in {fabbisogno.length} decadi, prima {fabbisogno[0].decade.label}: mancano {formatEur(fabbisogno[0].fabbisogno)}</span>
                </>
              )}
            </div>
          </div>
        )}
        {result.stockCount > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 bg-zinc-800/40 border border-zinc-700 rounded-xl text-sm">
            <Archive className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-zinc-300 font-medium">Arretrato fuori dal cruscotto: {formatEur(result.stockCents)}</span>
              <span className="text-zinc-500 ml-2">
                {result.stockCount} partite: scadute prima della data di taglio, utenze e personale scaduti. Si decidono a parte.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-0 border-b border-zinc-800">
        {[
          { id: 'cruscotto', label: 'Cruscotto' },
          { id: 'fatture', label: 'Fatture da pagare' },
          { id: 'avvisi', label: 'Avvisi ai fornitori' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => navigate({ tab: t.id === 'cruscotto' ? null : t.id })}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-blue-500 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cruscotto' && <CruscottoTab key={view} result={result} window={window} subBlocks={subBlocks} subWindows={subWindows} pctEditable={view === 'GRUPPO'} />}
      {tab === 'fatture' && <FattureTab key={view} result={result} window={window} companies={companies} />}
      {tab === 'avvisi' && <AvvisiTab key={view} result={result} window={window} notices={notices} companies={companies} today={today} />}
    </div>
  )
}

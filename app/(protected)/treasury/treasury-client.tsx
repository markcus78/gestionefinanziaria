'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, TrendingDown } from 'lucide-react'
import TimelineTab from './timeline-tab'
import PaymentsTab from './payments-tab'
import type { BankAccount } from '@/lib/types/database'
import type { TreasuryDay, PaymentItem } from '@/lib/treasury-calc'

type Company = { id: string; code: string; name: string; minimum_cash_threshold_cents: number }

type Props = {
  companies: Company[]
  company: Company | null
  bankAccounts: BankAccount[]
  selectedAccountIds: string[]
  view: 'single' | 'consolidated'
  timeline: TreasuryDay[]
  allPayments: PaymentItem[]
  initialBalance: number
  threshold: number
  today: string
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

export default function TreasuryClient({
  companies, company, bankAccounts, selectedAccountIds,
  view, timeline, allPayments, initialBalance, threshold, today,
}: Props) {
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

  const tab = sp.get('tab') ?? 'timeline'

  // ── Alerts ────────────────────────────────────────────────────────────────
  const belowThresholdDays = threshold > 0
    ? timeline.filter(d => d.balance < threshold)
    : []
  const criticalDue7 = allPayments.filter(p => {
    if (!p.isCritical) return false
    const diff = (new Date(p.dueDate).getTime() - new Date(today).getTime()) / 86400000
    return diff >= 0 && diff <= 7 && p.status !== 'paid'
  })

  // ── Account selector ──────────────────────────────────────────────────────
  function toggleAccount(accountId: string) {
    const current = new Set(selectedAccountIds)
    if (current.has(accountId)) current.delete(accountId)
    else current.add(accountId)
    const ids = Array.from(current)
    navigate({ accounts: ids.length ? ids.join(',') : null })
  }

  const byCompany = companies.map(c => ({
    company: c,
    accounts: bankAccounts.filter(a => a.company_id === c.id),
  })).filter(g => g.accounts.length > 0)

  return (
    <div className="space-y-4">
      {/* Vista + selettore società */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Toggle single/consolidated */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          <button
            onClick={() => navigate({ view: 'single', accounts: null })}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'single' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Singola
          </button>
          <button
            onClick={() => navigate({ view: 'consolidated', company: null, accounts: null })}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'consolidated' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Consolidato
          </button>
        </div>

        {/* Selettore società (solo vista singola) */}
        {view === 'single' && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {companies.map(c => (
              <button
                key={c.id}
                onClick={() => navigate({ company: c.code, accounts: null })}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  company?.id === c.id ? 'bg-indigo-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {c.code}
              </button>
            ))}
          </div>
        )}

        {/* Saldo iniziale */}
        <div className="ml-auto text-sm text-zinc-400">
          Saldo iniziale:{' '}
          <span className={`font-semibold ${initialBalance >= 0 ? 'text-zinc-100' : 'text-red-400'}`}>
            {formatEur(initialBalance)}
          </span>
        </div>
      </div>

      {/* Selettore conti (solo vista singola) */}
      {view === 'single' && bankAccounts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-zinc-500 text-xs">Conti inclusi:</span>
          {bankAccounts.map(a => {
            const selected = selectedAccountIds.includes(a.id)
            return (
              <button
                key={a.id}
                onClick={() => toggleAccount(a.id)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  selected
                    ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-500'
                }`}
              >
                {a.name}
                <span className="ml-1 font-mono">
                  {selected ? formatEur(a.current_balance_cents) : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Alert strip */}
      {(belowThresholdDays.length > 0 || criticalDue7.length > 0) && (
        <div className="space-y-2">
          {belowThresholdDays.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm">
              <TrendingDown className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-red-400 font-medium">Saldo sotto soglia</span>
                <span className="text-zinc-400 ml-2">
                  {belowThresholdDays.length === 1
                    ? `il ${new Date(belowThresholdDays[0].date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long' })}`
                    : `in ${belowThresholdDays.length} giorni (primo: ${new Date(belowThresholdDays[0].date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long' })})`
                  }
                  {' · '}min. {formatEur(Math.min(...belowThresholdDays.map(d => d.balance)))}
                </span>
              </div>
            </div>
          )}
          {criticalDue7.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-amber-400 font-medium">{criticalDue7.length} partite critiche</span>
                <span className="text-zinc-400 ml-2">in scadenza entro 7 giorni</span>
                <span className="text-zinc-500 ml-2">
                  ({criticalDue7.map(p => p.supplierName ?? p.accountDescription ?? '—').slice(0, 3).join(', ')}
                  {criticalDue7.length > 3 ? ` +${criticalDue7.length - 3}` : ''})
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab nav */}
      <div className="flex gap-0 border-b border-zinc-800">
        {[
          { id: 'timeline', label: 'Timeline 30 giorni' },
          { id: 'payments', label: `Pagamenti (${allPayments.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => navigate({ tab: t.id })}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-blue-500 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'timeline' && (
        <TimelineTab
          timeline={timeline}
          threshold={threshold}
          today={today}
        />
      )}
      {tab === 'payments' && (
        <PaymentsTab
          payments={allPayments}
          timeline={timeline}
          initialBalance={initialBalance}
          today={today}
          view={view}
          companies={companies}
        />
      )}
    </div>
  )
}

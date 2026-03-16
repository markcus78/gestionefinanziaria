'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import CashflowTab from './cashflow-tab'
import type { ForecastMonth } from './page'

type Company = { id: string; code: string; name: string; minimum_cash_threshold_cents: number }

type Props = {
  companies: Company[]
  company: Company | null
  view: 'single' | 'consolidated'
  forecastMonths: ForecastMonth[]
  initialBalance: number
  threshold: number
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

export default function ForecastClient({
  companies, company, view,
  forecastMonths, initialBalance, threshold,
}: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    router.push(`/forecast?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Toggle single/consolidato + selettore società */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          <button
            onClick={() => navigate({ view: 'single' })}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'single' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Singola
          </button>
          <button
            onClick={() => navigate({ view: 'consolidated', company: null })}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'consolidated' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Consolidato
          </button>
        </div>

        {view === 'single' && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {companies.map(c => (
              <button
                key={c.id}
                onClick={() => navigate({ company: c.code })}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  company?.id === c.id ? 'bg-indigo-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {c.code}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto text-sm text-zinc-400">
          Saldo attuale:{' '}
          <span className={`font-semibold ${initialBalance >= 0 ? 'text-zinc-100' : 'text-red-400'}`}>
            {formatEur(initialBalance)}
          </span>
        </div>
      </div>

      <CashflowTab
        key={`cashflow-${view}-${company?.id ?? 'all'}`}
        forecastMonths={forecastMonths}
        initialBalance={initialBalance}
        threshold={threshold}
        company={company}
        view={view}
      />
    </div>
  )
}

'use client'

import { useRouter, useSearchParams } from 'next/navigation'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}
import { MONTHS_SHORT } from '@/lib/channel-utils'
import CollectionsTab from './collections-tab'
import SettlementTab from './settlement-tab'
import ScostamentoTab from './scostamento-tab'
import type { ChannelConfig, CollectionWithChannel } from '@/lib/types/database'

type Company = { id: string; code: string; name: string }

type Props = {
  companies: Company[]
  company: Company | null
  channelConfigs: ChannelConfig[]
  collections: CollectionWithChannel[]
  pendingSettlements: CollectionWithChannel[]
  forecastCents: number
  year: number
  month: number
  tab: string
  today: string
  canDelete: boolean
}

const TABS = [
  { id: 'incassi',    label: 'Incassi' },
  { id: 'andamento',  label: 'Andamento' },
  { id: 'settlement', label: 'Settlement' },
]

const YEARS = [2024, 2025, 2026, 2027]

export default function OperationsClient({
  companies, company, channelConfigs,
  collections, pendingSettlements,
  forecastCents, year, month, tab, today, canDelete,
}: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) params.set(k, v)
    router.push(`/operations?${params.toString()}`)
  }

  return (
    <div className="space-y-5">
      {/* Selettori società + mese/anno */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {companies.map(c => (
            <button
              key={c.id}
              onClick={() => navigate({ company: c.code })}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                company?.id === c.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {c.code}
            </button>
          ))}
        </div>

        <select
          value={month}
          onChange={e => navigate({ month: e.target.value })}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {MONTHS_SHORT.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>

        <select
          value={year}
          onChange={e => navigate({ year: e.target.value })}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {YEARS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Banner forecast vs incassato */}
      {(() => {
        const totalCollected = collections.reduce((s, c) => s + c.gross_amount_cents, 0)
        const delta = totalCollected - forecastCents
        const pct = forecastCents > 0 ? Math.round((totalCollected / forecastCents) * 100) : null
        return (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Forecast mese</p>
              <p className="text-lg font-semibold text-zinc-100 tabular-nums">
                {forecastCents > 0 ? formatEur(forecastCents) : <span className="text-zinc-600">non impostato</span>}
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Incassato</p>
              <p className="text-lg font-semibold text-zinc-100 tabular-nums">{formatEur(totalCollected)}</p>
            </div>
            <div className={`border rounded-xl p-4 ${
              pct === null ? 'bg-zinc-900 border-zinc-800'
              : delta >= 0  ? 'bg-emerald-500/10 border-emerald-500/30'
              : pct >= 75   ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-red-500/10 border-red-500/30'
            }`}>
              <p className="text-xs text-zinc-500 mb-1">Delta{pct !== null ? ` · ${pct}%` : ''}</p>
              <p className={`text-lg font-semibold tabular-nums ${
                pct === null ? 'text-zinc-600'
                : delta >= 0  ? 'text-emerald-400'
                : pct >= 75   ? 'text-amber-400'
                : 'text-red-400'
              }`}>
                {pct !== null ? (delta >= 0 ? '+' : '') + formatEur(delta) : '—'}
              </p>
            </div>
          </div>
        )
      })()}

      {/* Tab nav */}
      <div className="flex gap-0 border-b border-zinc-800">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => navigate({ tab: t.id })}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-indigo-500 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
            {t.id === 'settlement' && pendingSettlements.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                {pendingSettlements.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'incassi' && (
        <CollectionsTab
          companyId={company?.id ?? ''}
          channelConfigs={channelConfigs}
          collections={collections}
          year={year}
          month={month}
          canDelete={canDelete}
        />
      )}

      {tab === 'andamento' && (
        <ScostamentoTab
          collections={collections}
          forecastCents={forecastCents}
          year={year}
          month={month}
          today={today}
        />
      )}

      {tab === 'settlement' && (
        <SettlementTab
          pendingSettlements={pendingSettlements}
        />
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toggleCompanyChannel } from './actions'
import type { Company, CashChannel, CompanyCashChannel } from '@/lib/types/database'

function formatPct(pct: number) {
  return (pct * 100).toFixed(2) + '%'
}

export function ChannelsSection({
  companies,
  channels,
  companyCashChannels,
}: {
  companies: Company[]
  channels: CashChannel[]
  companyCashChannels: CompanyCashChannel[]
}) {
  const router = useRouter()
  const [activeCompany, setActiveCompany] = useState(companies[0]?.id ?? '')
  const [loading, setLoading] = useState<string | null>(null)

  const company = companies.find((c) => c.id === activeCompany)

  function getConfig(channelId: string): CompanyCashChannel | undefined {
    return companyCashChannels.find(
      (cc) => cc.company_id === activeCompany && cc.channel_id === channelId
    )
  }

  function isEnabled(channelId: string): boolean {
    const config = getConfig(channelId)
    // Se non esiste un record, il canale è disponibile ma non abilitato
    return config?.is_enabled ?? false
  }

  async function handleToggle(channelId: string) {
    const current = isEnabled(channelId)
    setLoading(channelId)
    await toggleCompanyChannel(activeCompany, channelId, !current)
    setLoading(null)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium text-zinc-100">Canali di Incasso</h2>
        <p className="text-sm text-zinc-400 mt-0.5">
          Abilita i canali per ogni società e configura commissioni e settlement
        </p>
      </div>

      {/* Tabs società */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        {companies.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCompany(c.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeCompany === c.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {c.code}
          </button>
        ))}
      </div>

      {company && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-medium text-zinc-200">
              {company.code} — {company.name}
            </p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Canale</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Comm. %</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Comm. fissa</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Settlement</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Abilitato</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => {
                const config = getConfig(channel.id)
                const enabled = isEnabled(channel.id)
                const commPct = config?.custom_commission_pct ?? channel.default_commission_pct
                const commFixed = config?.custom_commission_fixed_cents ?? channel.default_commission_fixed_cents
                const settlement = config?.custom_settlement_days ?? channel.avg_settlement_days

                return (
                  <tr key={channel.id} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-4 py-3">
                      <span className={`font-medium ${enabled ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {channel.name}
                      </span>
                      {config?.custom_commission_pct != null && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 rounded">
                          personalizzato
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {formatPct(commPct)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {commFixed > 0 ? `${(commFixed / 100).toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {settlement > 0 ? `${settlement} gg` : 'immediato'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggle(channel.id)}
                        disabled={loading === channel.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          enabled ? 'bg-indigo-600' : 'bg-zinc-700'
                        } disabled:opacity-50`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            enabled ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

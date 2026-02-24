'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Settings2, X } from 'lucide-react'
import { toggleCompanyChannel, updateChannelConfig } from './actions'
import { WEEKDAYS } from '@/lib/channel-utils'
import type { Company, CashChannel, CompanyCashChannel } from '@/lib/types/database'

function formatPct(pct: number) {
  return (pct * 100).toFixed(2) + '%'
}

function payoutLabel(config: CompanyCashChannel | undefined): string {
  if (!config?.payout_type) return '—'
  if (config.payout_type === 'rolling_days') {
    return `${config.payout_rolling_days ?? '?'} gg`
  }
  if (config.payout_type === 'fixed_weekday' && config.payout_fixed_weekday != null) {
    return `Ogni ${WEEKDAYS[config.payout_fixed_weekday]}`
  }
  return '—'
}

type EditingState = {
  channelId: string
  channelName: string
  commPct: string
  commFixed: string
  settlementDays: string
  payoutType: string
  payoutRollingDays: string
  payoutFixedWeekday: string
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
  const [toggleLoading, setToggleLoading] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const company = companies.find((c) => c.id === activeCompany)

  function getConfig(channelId: string): CompanyCashChannel | undefined {
    return companyCashChannels.find(
      (cc) => cc.company_id === activeCompany && cc.channel_id === channelId
    )
  }

  function isEnabled(channelId: string): boolean {
    return getConfig(channelId)?.is_enabled ?? false
  }

  async function handleToggle(channelId: string) {
    const current = isEnabled(channelId)
    setToggleLoading(channelId)
    await toggleCompanyChannel(activeCompany, channelId, !current)
    setToggleLoading(null)
    router.refresh()
  }

  function openEdit(channel: CashChannel) {
    const config = getConfig(channel.id)
    setFormError(null)
    setEditing({
      channelId: channel.id,
      channelName: channel.name,
      commPct: config?.custom_commission_pct != null
        ? (config.custom_commission_pct * 100).toFixed(2)
        : '',
      commFixed: config?.custom_commission_fixed_cents != null
        ? (config.custom_commission_fixed_cents / 100).toFixed(2)
        : '',
      settlementDays: config?.custom_settlement_days != null
        ? String(config.custom_settlement_days)
        : '',
      payoutType: config?.payout_type ?? '',
      payoutRollingDays: config?.payout_rolling_days != null
        ? String(config.payout_rolling_days)
        : '',
      payoutFixedWeekday: config?.payout_fixed_weekday != null
        ? String(config.payout_fixed_weekday)
        : '',
    })
  }

  function handleSave() {
    if (!editing) return
    setFormError(null)
    const formData = new FormData()
    formData.set('company_id', activeCompany)
    formData.set('channel_id', editing.channelId)
    if (editing.commPct) formData.set('commission_pct', editing.commPct)
    if (editing.commFixed) formData.set('commission_fixed', editing.commFixed)
    if (editing.settlementDays) formData.set('settlement_days', editing.settlementDays)
    formData.set('payout_type', editing.payoutType)
    if (editing.payoutType === 'rolling_days') {
      formData.set('payout_rolling_days', editing.payoutRollingDays)
    } else if (editing.payoutType === 'fixed_weekday') {
      formData.set('payout_fixed_weekday', editing.payoutFixedWeekday)
    }

    startTransition(async () => {
      const result = await updateChannelConfig(null, formData)
      if (result?.error) {
        setFormError(result.error)
      } else {
        setEditing(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium text-zinc-100">Canali di Incasso</h2>
        <p className="text-sm text-zinc-400 mt-0.5">
          Abilita i canali per ogni società e configura commissioni, settlement e payout
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
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Payout</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">On/Off</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => {
                const config = getConfig(channel.id)
                const enabled = isEnabled(channel.id)
                const commPct = config?.custom_commission_pct ?? channel.default_commission_pct
                const commFixed = config?.custom_commission_fixed_cents ?? channel.default_commission_fixed_cents
                const settlement = config?.custom_settlement_days ?? channel.avg_settlement_days
                const hasCustom = config?.custom_commission_pct != null || config?.payout_type != null

                return (
                  <tr key={channel.id} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-4 py-3">
                      <span className={`font-medium ${enabled ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {channel.name}
                      </span>
                      {hasCustom && (
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
                    <td className="px-4 py-3 text-zinc-300 text-sm">
                      {payoutLabel(config)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggle(channel.id)}
                        disabled={toggleLoading === channel.id}
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
                    <td className="px-2 py-3">
                      <button
                        onClick={() => openEdit(channel)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                        title="Configura canale"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal configurazione */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100">
                Configura — {editing.channelName}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Commissioni */}
              <div>
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
                  Commissioni (lascia vuoto = usa default canale)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Comm. % personalizzata</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={editing.commPct}
                        onChange={e => setEditing(s => s ? { ...s, commPct: e.target.value } : s)}
                        placeholder="es. 1.49"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 pr-6"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Comm. fissa per transazione</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editing.commFixed}
                        onChange={e => setEditing(s => s ? { ...s, commFixed: e.target.value } : s)}
                        placeholder="es. 0.25"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 pr-6"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">€</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Settlement */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Giorni settlement personalizzati (lascia vuoto = default)
                </label>
                <div className="relative w-40">
                  <input
                    type="number"
                    min="0"
                    value={editing.settlementDays}
                    onChange={e => setEditing(s => s ? { ...s, settlementDays: e.target.value } : s)}
                    placeholder="es. 2"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 pr-8"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">gg</span>
                </div>
              </div>

              {/* Payout */}
              <div>
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Payout</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Tipo payout</label>
                    <select
                      value={editing.payoutType}
                      onChange={e => setEditing(s => s ? {
                        ...s,
                        payoutType: e.target.value,
                        payoutRollingDays: '',
                        payoutFixedWeekday: '',
                      } : s)}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
                    >
                      <option value="">— Non configurato</option>
                      <option value="rolling_days">Rolling — ogni N giorni dalla transazione</option>
                      <option value="fixed_weekday">Fisso — giorno fisso della settimana</option>
                    </select>
                  </div>

                  {editing.payoutType === 'rolling_days' && (
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Giorni dalla transazione</label>
                      <div className="relative w-40">
                        <input
                          type="number"
                          min="1"
                          value={editing.payoutRollingDays}
                          onChange={e => setEditing(s => s ? { ...s, payoutRollingDays: e.target.value } : s)}
                          placeholder="es. 7"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 pr-8"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">gg</span>
                      </div>
                    </div>
                  )}

                  {editing.payoutType === 'fixed_weekday' && (
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Giorno della settimana</label>
                      <select
                        value={editing.payoutFixedWeekday}
                        onChange={e => setEditing(s => s ? { ...s, payoutFixedWeekday: e.target.value } : s)}
                        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
                      >
                        <option value="">— Seleziona</option>
                        {WEEKDAYS.map((d, i) => (
                          <option key={i} value={i}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-400">{formError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Salvataggio…' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

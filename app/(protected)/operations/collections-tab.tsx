'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronDown } from 'lucide-react'
import { addDailyCollection, deleteDailyCollection } from './actions'
import { calcCommissionCents, calcPayoutDate, WEEKDAYS } from '@/lib/channel-utils'
import type { ChannelConfig, CollectionWithChannel } from '@/lib/types/database'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function formatDateShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit',
  })
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

function getEffective(cc: ChannelConfig) {
  return {
    commPct: cc.custom_commission_pct ?? cc.cash_channels.default_commission_pct,
    commFixed: cc.custom_commission_fixed_cents ?? cc.cash_channels.default_commission_fixed_cents,
    payoutType: cc.payout_type,
    payoutRollingDays: cc.payout_rolling_days,
    payoutFixedWeekday: cc.payout_fixed_weekday,
  }
}

type Props = {
  companyId: string
  channelConfigs: ChannelConfig[]
  collections: CollectionWithChannel[]
  year: number
  month: number
  canDelete: boolean
}

export default function CollectionsTab({
  companyId, channelConfigs, collections, canDelete,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [channelId, setChannelId] = useState(channelConfigs[0]?.channel_id ?? '')
  const [date, setDate] = useState(todayIso())
  const [grossStr, setGrossStr] = useState('')
  const [txCount, setTxCount] = useState(1)
  const [notes, setNotes] = useState('')

  // Canale selezionato
  const selectedConfig = channelConfigs.find(cc => cc.channel_id === channelId)

  // Preview calcolo
  const preview = useMemo(() => {
    if (!selectedConfig || !grossStr) return null
    const grossCents = Math.round(parseFloat(grossStr.replace(',', '.')) * 100)
    if (isNaN(grossCents) || grossCents <= 0) return null
    const eff = getEffective(selectedConfig)
    const commCents = calcCommissionCents(grossCents, txCount, eff.commPct, eff.commFixed)
    const netCents = grossCents - commCents
    let payoutDate: string | null = null
    if (eff.payoutType === 'rolling_days' || eff.payoutType === 'fixed_weekday') {
      payoutDate = calcPayoutDate(date, eff.payoutType, eff.payoutRollingDays, eff.payoutFixedWeekday)
    }
    return { grossCents, commCents, netCents, payoutDate }
  }, [selectedConfig, grossStr, txCount, date])

  function resetForm() {
    setGrossStr('')
    setTxCount(1)
    setNotes('')
    setDate(todayIso())
    setFormError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedConfig) return
    const grossCents = Math.round(parseFloat(grossStr.replace(',', '.')) * 100)
    if (!grossCents || grossCents <= 0) {
      setFormError('Inserisci un importo valido.')
      return
    }
    setFormError(null)
    const eff = getEffective(selectedConfig)
    startTransition(async () => {
      const result = await addDailyCollection({
        companyId,
        channelId: selectedConfig.channel_id,
        collectionDate: date,
        grossCents,
        transactionCount: txCount,
        commissionPct: eff.commPct,
        commissionFixedCents: eff.commFixed,
        payoutType: eff.payoutType,
        payoutRollingDays: eff.payoutRollingDays,
        payoutFixedWeekday: eff.payoutFixedWeekday,
        notes: notes || undefined,
      })
      if (result?.error) {
        setFormError(result.error)
      } else {
        resetForm()
        setShowForm(false)
        router.refresh()
      }
    })
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await deleteDailyCollection(id)
    setDeleting(null)
    router.refresh()
  }

  // Raggruppa per data
  const grouped = useMemo(() => {
    const map = new Map<string, CollectionWithChannel[]>()
    for (const c of collections) {
      const list = map.get(c.collection_date) ?? []
      list.push(c)
      map.set(c.collection_date, list)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [collections])

  const hasFixedComm = selectedConfig
    ? (selectedConfig.custom_commission_fixed_cents ?? selectedConfig.cash_channels.default_commission_fixed_cents) > 0
    : false

  return (
    <div className="space-y-4">
      {/* Pulsante aggiungi */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Registra incasso
        </button>
      )}

      {/* Form inserimento */}
      {showForm && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-100">Nuovo incasso</h3>
            <button
              onClick={() => { setShowForm(false); resetForm() }}
              className="text-zinc-500 hover:text-zinc-200 text-xs"
            >
              Annulla
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Riga 1: Canale + Data */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Canale</label>
                <select
                  value={channelId}
                  onChange={e => setChannelId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {channelConfigs.map(cc => (
                    <option key={cc.channel_id} value={cc.channel_id}>
                      {cc.cash_channels.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Riga 2: Importo + N. transazioni */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Importo lordo (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={grossStr}
                  onChange={e => setGrossStr(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  N. transazioni
                  {!hasFixedComm && <span className="text-zinc-600 ml-1">(no comm. fissa)</span>}
                </label>
                <input
                  type="number"
                  min="1"
                  value={txCount}
                  onChange={e => setTxCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  disabled={!hasFixedComm}
                />
              </div>
            </div>

            {/* Preview calcolo */}
            {preview && (
              <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 text-sm">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Commissione</p>
                    <p className="text-zinc-300 font-medium">
                      {preview.commCents > 0 ? formatEur(preview.commCents) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Netto</p>
                    <p className="text-emerald-400 font-semibold">{formatEur(preview.netCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Payout previsto</p>
                    <p className="text-zinc-300 font-medium">
                      {preview.payoutDate
                        ? new Date(preview.payoutDate + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : <span className="text-zinc-500">immediato</span>
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Note (opzionale)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder=""
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {formError && (
              <p className="text-xs text-red-400">{formError}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Registrazione…' : 'Registra incasso'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista incassi raggruppata per data */}
      {grouped.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">Nessun incasso registrato per questo mese.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {grouped.map(([dateStr, rows], gi) => {
            const dayTotal = rows.reduce((s, r) => s + r.gross_amount_cents, 0)
            const dayNet   = rows.reduce((s, r) => s + r.net_amount_cents, 0)
            return (
              <div key={dateStr} className={gi > 0 ? 'border-t border-zinc-800' : ''}>
                {/* Header data */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/40">
                  <span className="text-xs font-semibold text-zinc-300">{formatDate(dateStr)}</span>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span>Lordo: <span className="text-zinc-200">{formatEur(dayTotal)}</span></span>
                    <span>Netto: <span className="text-emerald-400 font-medium">{formatEur(dayNet)}</span></span>
                  </div>
                </div>
                {/* Righe */}
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id} className="border-t border-zinc-800/40 hover:bg-zinc-800/20">
                        <td className="px-4 py-2.5 text-zinc-300 font-medium w-32">
                          {row.cash_channels.name}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 tabular-nums">
                          Lordo: <span className="text-zinc-200">{formatEur(row.gross_amount_cents)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 tabular-nums">
                          Comm: <span className="text-zinc-300">
                            {row.commission_cents > 0 ? formatEur(row.commission_cents) : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          Netto: <span className="text-emerald-400 font-medium">{formatEur(row.net_amount_cents)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 tabular-nums text-xs">
                          {row.settlement_expected_date ? (
                            <>
                              Payout: {' '}
                              <span className={`${row.is_settled ? 'text-emerald-400' : 'text-zinc-300'}`}>
                                {formatDateShort(row.settlement_expected_date)}
                                {row.is_settled && ' ✓'}
                              </span>
                            </>
                          ) : (
                            <span className="text-zinc-600">liquidato</span>
                          )}
                        </td>
                        {row.notes && (
                          <td className="px-3 py-2.5 text-zinc-500 text-xs italic truncate max-w-32">
                            {row.notes}
                          </td>
                        )}
                        {canDelete && (
                          <td className="px-3 py-2.5 text-right">
                            <button
                              onClick={() => handleDelete(row.id)}
                              disabled={deleting === row.id}
                              className="p-1 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                              title="Elimina incasso"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

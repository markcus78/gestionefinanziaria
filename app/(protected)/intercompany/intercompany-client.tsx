'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import PartiteTab from './partite-tab'
import NettingTab from './netting-tab'
import StoricoTab from './storico-tab'
import type { ICRow, NettingPair, NettingHistoryItem } from './page'

type Props = {
  tab: string
  icRows: ICRow[]
  nettingPairs: NettingPair[]
  history: NettingHistoryItem[]
  unmappedCount: number
}

export default function IntercompanyClient({ tab, icRows, nettingPairs, history, unmappedCount }: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    router.push(`/intercompany?${params.toString()}`)
  }

  const tabs = [
    { id: 'partite',  label: `Partite (${icRows.length})` },
    { id: 'netting',  label: `Netting (${nettingPairs.length})` },
    { id: 'storico',  label: `Storico (${history.length})` },
  ]

  return (
    <div className="space-y-4">
      {/* Tab nav */}
      <div className="flex gap-0 border-b border-zinc-800">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => navigate({ tab: t.id })}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-cyan-500 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'partite' && (
        <PartiteTab icRows={icRows} unmappedCount={unmappedCount} />
      )}
      {tab === 'netting' && (
        <NettingTab pairs={nettingPairs} unmappedCount={unmappedCount} />
      )}
      {tab === 'storico' && (
        <StoricoTab history={history} />
      )}
    </div>
  )
}

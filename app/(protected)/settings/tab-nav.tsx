'use client'

import Link from 'next/link'

const tabs = [
  { id: 'banche', label: 'Conti Bancari' },
  { id: 'canali', label: 'Canali Incasso' },
  { id: 'soglie', label: 'Soglie Alert' },
  { id: 'pattern', label: 'Pattern Incassi' },
  { id: 'utenti', label: 'Utenti' },
]

export function TabNav({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`/settings?tab=${tab.id}`}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

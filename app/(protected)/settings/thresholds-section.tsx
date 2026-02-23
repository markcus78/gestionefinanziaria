'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateThreshold } from './actions'
import type { Company } from '@/lib/types/database'

function ThresholdRow({ company }: { company: Company }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateThreshold(null, formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-4">
      <input type="hidden" name="company_id" value={company.id} />
      <div className="w-28">
        <span className="text-sm font-medium text-zinc-200">{company.code}</span>
        <p className="text-xs text-zinc-500 truncate">{company.name}</p>
      </div>
      <div className="flex items-center gap-2 flex-1">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">€</span>
          <input
            name="threshold"
            type="number"
            step="100"
            min="0"
            defaultValue={(company.minimum_cash_threshold_cents / 100).toFixed(0)}
            className="pl-6 pr-3 py-2 w-36 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-200 text-sm rounded-lg transition-colors"
        >
          {isPending ? 'Salvo...' : 'Salva'}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
        {saved && <span className="text-xs text-emerald-400">Salvato ✓</span>}
      </div>
    </form>
  )
}

export function ThresholdsSection({ companies }: { companies: Company[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium text-zinc-100">Soglie Alert</h2>
        <p className="text-sm text-zinc-400 mt-0.5">
          Soglia minima di cassa per ogni società. Verrà mostrato un alert quando il saldo scende sotto questa soglia.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
        {companies.map((company) => (
          <ThresholdRow key={company.id} company={company} />
        ))}
      </div>
    </div>
  )
}

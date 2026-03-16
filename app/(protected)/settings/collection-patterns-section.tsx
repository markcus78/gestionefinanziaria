'use client'

import { useState, useTransition } from 'react'
import type { Company } from '@/lib/types/database'
import { upsertCollectionPattern } from './actions'

type PatternRow = {
  company_id: string
  pattern_type: 'daily' | 'monthly' | 'subscription'
  day_of_month: number | null
}

type Props = {
  companies: Company[]
  patterns: PatternRow[]
}

const LABELS: Record<string, string> = {
  daily:        'Giornaliero',
  monthly:      'Mensile',
  subscription: 'Abbonamenti',
}

export function CollectionPatternsSection({ companies, patterns }: Props) {
  const [state, setState] = useState<Record<string, PatternRow>>(() => {
    const map: Record<string, PatternRow> = {}
    for (const c of companies) {
      const found = patterns.find(p => p.company_id === c.id)
      map[c.id] = found ?? { company_id: c.id, pattern_type: 'daily', day_of_month: null }
    }
    return map
  })
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [, startTransition] = useTransition()

  function save(companyId: string) {
    const row = state[companyId]
    startTransition(async () => {
      const res = await upsertCollectionPattern(companyId, row.pattern_type, row.day_of_month)
      if (res.error) {
        setErrors(e => ({ ...e, [companyId]: res.error! }))
      } else {
        setSaved(s => ({ ...s, [companyId]: true }))
        setErrors(e => { const n = { ...e }; delete n[companyId]; return n })
        setTimeout(() => setSaved(s => { const n = { ...s }; delete n[companyId]; return n }), 2000)
      }
    })
  }

  function setPattern(companyId: string, pattern_type: 'daily' | 'monthly' | 'subscription') {
    setState(s => ({
      ...s,
      [companyId]: { ...s[companyId], pattern_type, day_of_month: pattern_type === 'monthly' ? (s[companyId].day_of_month ?? 1) : null },
    }))
  }

  function setDay(companyId: string, day: string) {
    const n = parseInt(day)
    setState(s => ({
      ...s,
      [companyId]: { ...s[companyId], day_of_month: isNaN(n) ? null : Math.min(31, Math.max(1, n)) },
    }))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400 mb-4">
        Configura come viene distribuito il forecast mensile nei giorni della tesoreria.
      </p>
      {companies.map(c => {
        const row = state[c.id]
        return (
          <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-sm font-medium text-zinc-200 w-20 shrink-0">{c.code}</span>

              <div className="flex gap-4">
                {(['daily', 'monthly', 'subscription'] as const).map(pt => (
                  <label key={pt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`pattern-${c.id}`}
                      value={pt}
                      checked={row.pattern_type === pt}
                      onChange={() => setPattern(c.id, pt)}
                      className="accent-indigo-500"
                    />
                    <span className="text-sm text-zinc-300">{LABELS[pt]}</span>
                  </label>
                ))}
              </div>

              {row.pattern_type === 'monthly' && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-zinc-400">Giorno:</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={row.day_of_month ?? ''}
                    onChange={e => setDay(c.id, e.target.value)}
                    onBlur={() => save(c.id)}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 text-center"
                  />
                </div>
              )}

              {row.pattern_type !== 'monthly' && (
                <button
                  onClick={() => save(c.id)}
                  className="ml-auto text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                >
                  Salva
                </button>
              )}

              {saved[c.id] && (
                <span className="text-xs text-green-400 ml-2">Salvato ✓</span>
              )}
              {errors[c.id] && (
                <span className="text-xs text-red-400 ml-2">{errors[c.id]}</span>
              )}
            </div>

            <p className="text-xs text-zinc-500 mt-2 ml-20">
              {row.pattern_type === 'daily' && 'Distribuzione uniforme lun–sab. Domenica = 0.'}
              {row.pattern_type === 'monthly' && `100% concentrato il giorno ${row.day_of_month ?? '?'} del mese.`}
              {row.pattern_type === 'subscription' && '30% nei giorni 1–10, 30% nei giorni 11–20, 40% nei giorni 21–fine mese.'}
            </p>
          </div>
        )
      })}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertExpenseForecast } from './actions'
import type { ForecastMonth } from './page'
import type { ExpenseForecast } from '@/lib/types/database'

type Company = { id: string; code: string; name: string; minimum_cash_threshold_cents: number }

type Props = {
  forecastMonths: ForecastMonth[]
  expenseForecasts: ExpenseForecast[]
  company: Company | null
  view: 'single' | 'consolidated'
}

const EXPENSE_CATEGORIES = [
  'utenze',
  'stipendi',
  'affitti',
  'tributi_f24',
  'professionisti',
  'leasing_noleggio',
  'manutenzione',
  'forniture',
  'assicurazioni',
  'altro',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  utenze:           'Utenze',
  stipendi:         'Stipendi',
  affitti:          'Affitti',
  tributi_f24:      'F24 / Tributi',
  professionisti:   'Professionisti',
  leasing_noleggio: 'Leasing / Noleggio',
  manutenzione:     'Manutenzione',
  forniture:        'Forniture',
  assicurazioni:    'Assicurazioni',
  altro:            'Altro',
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function parseCents(val: string): number {
  const n = parseFloat(val.replace(',', '.').replace(/[^\d.]/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

export default function ExpensesTab({ forecastMonths, expenseForecasts, company, view }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const canEdit = view === 'single' && !!company

  // Valori editabili keyed by "category-year-month" (solo per vista singola)
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!canEdit || !company) return {}
    const init: Record<string, string> = {}
    for (const ef of expenseForecasts) {
      if (ef.company_id !== company.id) continue
      const key = `${ef.category}-${ef.year}-${ef.month}`
      init[key] = ef.forecast_cents > 0 ? String(ef.forecast_cents / 100) : ''
    }
    return init
  })

  const [saving, setSaving] = useState<string | null>(null)

  // Valore da mostrare: locale in single, somma da props in consolidated
  function getDisplayCents(category: string, year: number, month: number): number {
    if (canEdit) {
      return parseCents(values[`${category}-${year}-${month}`] ?? '0')
    }
    return expenseForecasts
      .filter(ef => ef.category === category && ef.year === year && ef.month === month)
      .reduce((s, ef) => s + ef.forecast_cents, 0)
  }

  function handleBlur(category: string, year: number, month: number) {
    if (!canEdit || !company) return
    const key = `${category}-${year}-${month}`
    const cents = parseCents(values[key] ?? '0')
    setSaving(key)
    startTransition(async () => {
      await upsertExpenseForecast(company.id, category, year, month, cents)
      setSaving(null)
      router.refresh()
    })
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      {!canEdit && (
        <div className="px-4 py-2 bg-zinc-800/40 border-b border-zinc-800 text-xs text-zinc-500">
          {view === 'consolidated'
            ? 'Vista consolidata — modifica disponibile solo in vista singola'
            : 'Seleziona una società per modificare i valori'}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide w-44 min-w-[10rem]">
              Categoria
            </th>
            {forecastMonths.map(m => (
              <th key={`${m.year}-${m.month}`} className="text-right px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide min-w-[8rem]">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {EXPENSE_CATEGORIES.map(category => (
            <tr key={category} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
              <td className="px-4 py-2.5 text-zinc-300 font-medium">
                {CATEGORY_LABELS[category]}
              </td>
              {forecastMonths.map(m => {
                const key = `${category}-${m.year}-${m.month}`
                const displayCents = getDisplayCents(category, m.year, m.month)
                return (
                  <td key={key} className="px-3 py-2 text-right">
                    {canEdit ? (
                      <div className="inline-flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={values[key] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
                          onBlur={() => handleBlur(category, m.year, m.month)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          placeholder="0"
                          className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-right text-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                        />
                        {saving === key && <span className="text-xs text-zinc-500">…</span>}
                      </div>
                    ) : (
                      <span className="text-zinc-400 tabular-nums text-xs">
                        {displayCents > 0
                          ? formatEur(displayCents)
                          : <span className="text-zinc-600">—</span>
                        }
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr className="border-t border-zinc-700 bg-zinc-800/40">
            <td className="px-4 py-2.5 text-xs font-semibold text-zinc-300 uppercase tracking-wide">
              Totale
            </td>
            {forecastMonths.map(m => {
              const total = EXPENSE_CATEGORIES.reduce((s, cat) => s + getDisplayCents(cat, m.year, m.month), 0)
              return (
                <td key={`${m.year}-${m.month}`} className="px-3 py-2.5 text-right font-semibold text-red-400 tabular-nums">
                  {total > 0 ? formatEur(total) : <span className="text-zinc-600">—</span>}
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

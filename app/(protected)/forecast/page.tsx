import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TrendingUp } from 'lucide-react'
import ForecastClient from './forecast-client'
import { MONTHS_SHORT } from '@/lib/channel-utils'
import type { ExpenseForecast } from '@/lib/types/database'

export type ForecastMonth = {
  year: number
  month: number
  label: string
  revenueForecasted: number    // sum monthly_revenue_forecasts (channel_id IS NULL)
  outflowScheduled: number     // sum payment_schedule (pending/scheduled, flow=out)
  outflowExpenses: number      // sum expense_forecasts
  netFlow: number              // revenueForecasted - outflowScheduled - outflowExpenses
  balanceEnd: number           // saldo cumulativo
}

type Company = { id: string; code: string; name: string; minimum_cash_threshold_cents: number }

function get6Months(now: Date) {
  const result: Array<{ year: number; month: number; start: string; end: string; label: string }> = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const ms = String(m).padStart(2, '0')
    const lastDay = new Date(y, m, 0).getDate()
    result.push({
      year: y,
      month: m,
      start: `${y}-${ms}-01`,
      end: `${y}-${ms}-${String(lastDay).padStart(2, '0')}`,
      label: `${MONTHS_SHORT[m - 1]} ${y}`,
    })
  }
  return result
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const view        = (sp.view    ?? 'single') as 'single' | 'consolidated'
  const companyCode = sp.company  ?? ''
  const tab         = sp.tab      ?? 'cashflow'

  const now     = new Date()
  const months6 = get6Months(now)
  const start6  = months6[0].start
  const end6    = months6[months6.length - 1].end
  const years   = [...new Set(months6.map(m => m.year))]
  const monthNums = months6.map(m => m.month)

  const [
    { data: companies },
    { data: allBankAccounts },
    { data: revenueForecasts },
    { data: expenseForecastsRaw },
    { data: paymentsRaw },
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('id, code, name, minimum_cash_threshold_cents')
      .eq('is_active', true)
      .order('code'),
    supabase.from('bank_accounts').select('*').eq('is_active', true),
    supabase
      .from('monthly_revenue_forecasts')
      .select('company_id, year, month, forecast_gross_cents')
      .is('channel_id', null)
      .in('year', years)
      .in('month', monthNums),
    supabase
      .from('expense_forecasts')
      .select('*')
      .in('year', years)
      .in('month', monthNums),
    supabase
      .from('payment_schedule')
      .select('company_id, due_date, amount_cents, is_intercompany')
      .eq('flow_type', 'out')
      .in('status', ['pending', 'scheduled'])
      .gte('due_date', start6)
      .lte('due_date', end6),
  ])

  const allCompanies   = (companies ?? []) as Company[]
  const company        = (companyCode ? allCompanies.find(c => c.code === companyCode) : null) ?? allCompanies[0] ?? null
  const scopeCompanies = view === 'consolidated' ? allCompanies : (company ? [company] : [])
  const scopeIds       = new Set(scopeCompanies.map(c => c.id))

  const initialBalance = (allBankAccounts ?? [])
    .filter(a => scopeIds.has(a.company_id))
    .reduce((s, a) => s + ((a as { current_balance_cents: number }).current_balance_cents ?? 0), 0)

  // Calcola ForecastMonth[] con saldo cumulativo
  let cumBalance = initialBalance
  const forecastMonths: ForecastMonth[] = months6.map(({ year, month, start, end, label }) => {
    const revenueForecasted = (revenueForecasts ?? [])
      .filter(f => scopeIds.has(f.company_id) && f.year === year && f.month === month)
      .reduce((s, f) => s + (f.forecast_gross_cents ?? 0), 0)

    const outflowScheduled = (paymentsRaw ?? [])
      .filter(p => {
        if (!scopeIds.has(p.company_id)) return false
        if (view === 'consolidated' && p.is_intercompany) return false
        return p.due_date >= start && p.due_date <= end
      })
      .reduce((s, p) => s + Math.abs(p.amount_cents ?? 0), 0)

    const outflowExpenses = (expenseForecastsRaw ?? [])
      .filter(f => scopeIds.has(f.company_id) && f.year === year && f.month === month)
      .reduce((s, f) => s + ((f as { forecast_cents: number }).forecast_cents ?? 0), 0)

    const netFlow = revenueForecasted - outflowScheduled - outflowExpenses
    cumBalance += netFlow

    return { year, month, label, revenueForecasted, outflowScheduled, outflowExpenses, netFlow, balanceEnd: cumBalance }
  })

  const threshold = scopeCompanies.reduce((s, c) => s + (c.minimum_cash_threshold_cents ?? 0), 0)

  // expense_forecasts filtrate allo scope corrente (tutte le società incluse)
  const expenseForecasts = (expenseForecastsRaw ?? []).filter(f =>
    scopeIds.has(f.company_id)
  ) as ExpenseForecast[]

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Previsione 6 mesi</h1>
      </div>

      <ForecastClient
        companies={allCompanies}
        company={company}
        view={view}
        tab={tab}
        forecastMonths={forecastMonths}
        expenseForecasts={expenseForecasts}
        initialBalance={initialBalance}
        threshold={threshold}
      />
    </div>
  )
}

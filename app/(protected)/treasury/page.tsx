import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Landmark } from 'lucide-react'
import TreasuryClient from './treasury-client'
import {
  distributeRemainingForecast,
  buildTimeline,
  addDays,
  type PaymentItem,
  type TreasuryDay,
} from '@/lib/treasury-calc'
import type { BankAccount, PatternType } from '@/lib/types/database'

const TIMELINE_DAYS = 30
const PAYMENTS_HORIZON_DAYS = 60

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const view        = (sp.view ?? 'single') as 'single' | 'consolidated'
  const companyCode = sp.company ?? ''
  const accountIds  = sp.accounts ? sp.accounts.split(',').filter(Boolean) : null

  const today       = new Date().toISOString().split('T')[0]
  const future60    = addDays(today, PAYMENTS_HORIZON_DAYS)
  const now         = new Date()
  const year        = now.getFullYear()
  const month       = now.getMonth() + 1
  const monthStr    = String(month).padStart(2, '0')
  const monthStart  = `${year}-${monthStr}-01`
  const monthEnd    = new Date(year, month, 0).toISOString().split('T')[0]

  // ── Fetch base ────────────────────────────────────────────────────────────
  const [
    { data: companies },
    { data: allBankAccounts },
    { data: collectionPatterns },
    { data: forecastsRaw },
    { data: collectionsThisMonth },
    { data: pendingSettlementsRaw },
    { data: paymentsRaw },
  ] = await Promise.all([
    supabase.from('companies').select('id, code, name, minimum_cash_threshold_cents').eq('is_active', true).order('code'),
    supabase.from('bank_accounts').select('*').eq('is_active', true).order('company_id'),
    supabase.from('collection_patterns').select('*').is('channel_id', null),
    supabase.from('monthly_revenue_forecasts').select('company_id, forecast_gross_cents').eq('year', year).eq('month', month),
    supabase.from('daily_collections').select('company_id, gross_amount_cents').gte('collection_date', monthStart).lte('collection_date', monthEnd),
    supabase.from('daily_collections').select('company_id, net_amount_cents, settlement_expected_date').eq('is_settled', false).not('settlement_expected_date', 'is', null),
    supabase.from('payment_schedule')
      .select('id, company_id, supplier_name, account_description, due_date, amount_cents, status, priority_score, priority_override, is_intercompany, supplier_registry(category, is_critical)')
      .eq('flow_type', 'out')
      .in('status', ['pending', 'scheduled'])
      .lte('due_date', future60)
      .order('due_date'),
  ])

  const allCompanies = companies ?? []
  const company = (companyCode ? allCompanies.find(c => c.code === companyCode) : null) ?? allCompanies[0] ?? null
  const companyId = company?.id ?? ''

  // Quali società includere
  const companiesInScope = view === 'consolidated' ? allCompanies : (company ? [company] : [])
  const companyIdsInScope = new Set(companiesInScope.map(c => c.id))

  // ── Saldo iniziale ────────────────────────────────────────────────────────
  const accountsInScope = (allBankAccounts ?? []).filter(a => {
    if (!companyIdsInScope.has(a.company_id)) return false
    if (accountIds) return accountIds.includes(a.id)
    return true
  })
  const initialBalance = accountsInScope.reduce((s, a) => s + (a.current_balance_cents ?? 0), 0)

  // ── Incassi certi (settlement in attesa) ──────────────────────────────────
  const certainMap = new Map<string, number>()
  for (const c of (pendingSettlementsRaw ?? [])) {
    if (!companyIdsInScope.has(c.company_id)) continue
    if (!c.settlement_expected_date) continue
    certainMap.set(c.settlement_expected_date, (certainMap.get(c.settlement_expected_date) ?? 0) + (c.net_amount_cents ?? 0))
  }

  // ── Forecast rimanente distribuito ───────────────────────────────────────
  const forecastMap = new Map<string, number>()
  for (const c of companiesInScope) {
    const forecastTotal = (forecastsRaw ?? [])
      .filter(f => f.company_id === c.id)
      .reduce((s, f) => s + (f.forecast_gross_cents ?? 0), 0)
    const alreadyCollected = (collectionsThisMonth ?? [])
      .filter(col => col.company_id === c.id)
      .reduce((s, col) => s + (col.gross_amount_cents ?? 0), 0)
    const remaining = Math.max(0, forecastTotal - alreadyCollected)

    const patternRow = (collectionPatterns ?? []).find(p => p.company_id === c.id)
    const pattern: PatternType = (patternRow?.pattern_type as PatternType) ?? 'daily'
    const avgSettlement = 0 // già gestito dal payout delle daily_collections

    const dist = distributeRemainingForecast(remaining, pattern, avgSettlement, today, year, month)
    for (const [date, cents] of dist) {
      forecastMap.set(date, (forecastMap.get(date) ?? 0) + cents)
    }
  }

  // ── Pagamenti (PaymentItem) ───────────────────────────────────────────────
  const allPayments: PaymentItem[] = (paymentsRaw ?? [])
    .filter(p => {
      if (!companyIdsInScope.has(p.company_id)) return false
      if (view === 'consolidated' && p.is_intercompany) return false
      return true
    })
    .map(p => {
      const sr = p.supplier_registry as unknown as { category: string | null; is_critical: boolean } | null
      return {
        id: p.id,
        companyId: p.company_id,
        supplierName: p.supplier_name,
        accountDescription: p.account_description,
        category: sr?.category ?? null,
        isCritical: sr?.is_critical ?? false,
        dueDate: p.due_date,
        amountCents: Math.abs(p.amount_cents),
        priorityScore: p.priority_score,
        priorityOverride: p.priority_override,
        isIntercompany: p.is_intercompany ?? false,
        status: p.status,
      } satisfies PaymentItem
    })

  // Uscite nei prossimi 30 giorni per la timeline
  const future30 = addDays(today, TIMELINE_DAYS)
  const paymentsByDay = new Map<string, PaymentItem[]>()
  for (const p of allPayments) {
    if (p.dueDate > future30) continue
    const list = paymentsByDay.get(p.dueDate) ?? []
    list.push(p)
    paymentsByDay.set(p.dueDate, list)
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  const threshold = companiesInScope.reduce((s, c) => s + (c.minimum_cash_threshold_cents ?? 0), 0)
  const timeline: TreasuryDay[] = buildTimeline({
    startDate: today,
    days: TIMELINE_DAYS,
    initialBalance,
    certain: certainMap,
    forecast: forecastMap,
    paymentsByDay,
  })

  // ── Conti per selettore ───────────────────────────────────────────────────
  const bankAccountsForSelector = (allBankAccounts ?? []).filter(a =>
    view === 'consolidated' || a.company_id === companyId
  )

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Landmark className="w-5 h-5 text-blue-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Tesoreria 30 giorni</h1>
      </div>

      <TreasuryClient
        companies={allCompanies}
        company={company}
        bankAccounts={bankAccountsForSelector as BankAccount[]}
        selectedAccountIds={accountIds ?? bankAccountsForSelector.map(a => a.id)}
        view={view}
        timeline={timeline}
        allPayments={allPayments}
        initialBalance={initialBalance}
        threshold={threshold}
        today={today}
      />
    </div>
  )
}

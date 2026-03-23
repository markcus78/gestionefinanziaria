import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TrendingUp } from 'lucide-react'
import OperationsClient from './operations-client'
import type { ChannelConfig, CollectionWithChannel } from '@/lib/types/database'

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const companyCode = sp.company ?? ''
  const year  = parseInt(sp.year  ?? String(now.getFullYear()), 10)
  const month = parseInt(sp.month ?? String(now.getMonth() + 1), 10)
  const tab   = sp.tab ?? 'incassi'

  const [{ data: companies }, { data: userProfile }] = await Promise.all([
    supabase.from('companies').select('id, code, name').eq('is_active', true).order('code'),
    supabase.from('user_profiles').select('role').eq('id', user.id).single(),
  ])

  const company = (companyCode
    ? companies?.find(c => c.code === companyCode)
    : null) ?? companies?.[0] ?? null
  const companyId = company?.id ?? ''
  const canDelete = userProfile?.role === 'strategic'

  if (!companyId) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-zinc-100 mb-2">Incassi</h1>
        <p className="text-zinc-400 text-sm">Nessuna società trovata.</p>
      </div>
    )
  }

  const monthStr  = String(month).padStart(2, '0')
  const startDate = `${year}-${monthStr}-01`
  const endDate   = new Date(year, month, 0).toISOString().split('T')[0]

  const [
    { data: channelConfigsRaw },
    { data: collectionsRaw },
    { data: pendingSettlementsRaw },
    { data: forecastRow },
  ] = await Promise.all([
    supabase
      .from('company_cash_channels')
      .select('*, cash_channels(*)')
      .eq('company_id', companyId)
      .eq('is_enabled', true),
    supabase
      .from('daily_collections')
      .select('*, cash_channels(name)')
      .eq('company_id', companyId)
      .gte('collection_date', startDate)
      .lte('collection_date', endDate)
      .order('collection_date', { ascending: false }),
    supabase
      .from('daily_collections')
      .select('*, cash_channels(name)')
      .eq('company_id', companyId)
      .eq('is_settled', false)
      .not('settlement_expected_date', 'is', null)
      .order('settlement_expected_date'),
    supabase
      .from('monthly_revenue_forecasts')
      .select('forecast_gross_cents')
      .eq('company_id', companyId)
      .eq('year', year)
      .eq('month', month)
      .is('channel_id', null)
      .maybeSingle(),
  ])

  const forecastCents = forecastRow?.forecast_gross_cents ?? 0

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Incassi</h1>
      </div>

      <OperationsClient
        companies={companies ?? []}
        company={company}
        channelConfigs={(channelConfigsRaw ?? []) as ChannelConfig[]}
        collections={(collectionsRaw ?? []) as CollectionWithChannel[]}
        pendingSettlements={(pendingSettlementsRaw ?? []) as CollectionWithChannel[]}
        forecastCents={forecastCents}
        year={year}
        month={month}
        tab={tab}
        today={today}
        canDelete={canDelete}
      />
    </div>
  )
}

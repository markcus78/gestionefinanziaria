'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Conti Bancari ────────────────────────────────────────────────────────────

export async function addBankAccount(_: unknown, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from('bank_accounts').insert({
    company_id: formData.get('company_id') as string,
    name: formData.get('name') as string,
    iban: (formData.get('iban') as string) || null,
    current_balance_cents: Math.round(parseFloat((formData.get('balance') as string) || '0') * 100),
  })
  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}

export async function updateBankBalance(_: unknown, formData: FormData) {
  const supabase = await createClient()
  const balanceDate = formData.get('balance_date') as string
  const { error } = await supabase
    .from('bank_accounts')
    .update({
      current_balance_cents: Math.round(parseFloat(formData.get('balance') as string) * 100),
      balance_updated_at: new Date().toISOString(),
      balance_date: /^\d{4}-\d{2}-\d{2}$/.test(balanceDate) ? balanceDate : null,
      credit_line_cents: Math.max(0, Math.round(parseFloat((formData.get('credit_line') as string) || '0') * 100)),
    })
    .eq('id', formData.get('id') as string)
  if (error) return { error: error.message }
  revalidatePath('/settings')
  revalidatePath('/treasury')
  return { success: true }
}

export async function toggleBankAccount(id: string, isActive: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('bank_accounts')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}

// ─── Canali di Incasso ────────────────────────────────────────────────────────

export async function createCashChannel(_: unknown, formData: FormData) {
  const supabase = await createClient()
  const name = (formData.get('name') as string).trim()
  if (!name) return { error: 'Il nome è obbligatorio' }
  const commPct   = formData.get('commission_pct')   as string
  const commFixed = formData.get('commission_fixed')  as string
  const settlement = formData.get('settlement_days') as string
  const { error } = await supabase.from('cash_channels').insert({
    name,
    default_commission_pct:         commPct   ? parseFloat(commPct) / 100   : 0,
    default_commission_fixed_cents: commFixed ? Math.round(parseFloat(commFixed) * 100) : 0,
    avg_settlement_days:            settlement ? parseInt(settlement) : 0,
  })
  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}

export async function toggleCompanyChannel(
  companyId: string,
  channelId: string,
  isEnabled: boolean
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('company_cash_channels')
    .upsert(
      { company_id: companyId, channel_id: channelId, is_enabled: isEnabled },
      { onConflict: 'company_id,channel_id' }
    )
  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}

export async function updateChannelConfig(_: unknown, formData: FormData) {
  const supabase = await createClient()
  const commPct = formData.get('commission_pct') as string
  const commFixed = formData.get('commission_fixed') as string
  const settlement = formData.get('settlement_days') as string
  const payoutType = formData.get('payout_type') as string
  const payoutRollingDays = formData.get('payout_rolling_days') as string
  const payoutFixedWeekday = formData.get('payout_fixed_weekday') as string

  const { error } = await supabase
    .from('company_cash_channels')
    .upsert(
      {
        company_id: formData.get('company_id') as string,
        channel_id: formData.get('channel_id') as string,
        custom_commission_pct: commPct ? parseFloat(commPct) / 100 : null,
        custom_commission_fixed_cents: commFixed ? Math.round(parseFloat(commFixed) * 100) : null,
        custom_settlement_days: settlement ? parseInt(settlement) : null,
        bank_account_id: (formData.get('bank_account_id') as string) || null,
        payout_type: payoutType || null,
        payout_rolling_days: payoutRollingDays ? parseInt(payoutRollingDays) : null,
        payout_fixed_weekday: payoutFixedWeekday !== '' && payoutFixedWeekday != null ? parseInt(payoutFixedWeekday) : null,
      },
      { onConflict: 'company_id,channel_id' }
    )
  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}

// ─── Pattern Incassi ──────────────────────────────────────────────────────────

export async function upsertCollectionPattern(
  companyId: string,
  patternType: 'daily' | 'monthly' | 'subscription',
  dayOfMonth: number | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('collection_patterns')
    .select('id')
    .eq('company_id', companyId)
    .is('channel_id', null)
    .single()

  let error
  if (existing) {
    ;({ error } = await supabase
      .from('collection_patterns')
      .update({ pattern_type: patternType, day_of_month: dayOfMonth })
      .eq('id', existing.id))
  } else {
    ;({ error } = await supabase
      .from('collection_patterns')
      .insert({ company_id: companyId, channel_id: null, pattern_type: patternType, day_of_month: dayOfMonth }))
  }

  if (error) return { error: error.message }
  revalidatePath('/settings')
  revalidatePath('/treasury')
  return {}
}

// ─── Soglie Alert ─────────────────────────────────────────────────────────────

export async function updateThreshold(_: unknown, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('companies')
    .update({
      minimum_cash_threshold_cents: Math.round(
        parseFloat(formData.get('threshold') as string) * 100
      ),
    })
    .eq('id', formData.get('company_id') as string)
  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}

// ─── Utenti ───────────────────────────────────────────────────────────────────

export async function updateUserRole(userId: string, role: 'strategic' | 'operational' | 'supervisor') {
  const supabase = await createClient()
  const { error } = await supabase
    .from('user_profiles')
    .update({ role })
    .eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}

// ─── Tesoreria a decadi ───────────────────────────────────────────────────────

export async function updateEstimate(id: string, monthlyCents: number, pct: [number, number, number], active: boolean) {
  if (monthlyCents < 0) return { error: 'Importo non valido' }
  if (pct.some(p => p < 0) || Math.abs(pct[0] + pct[1] + pct[2] - 100) > 0.1) return { error: 'Le tre percentuali devono fare 100' }
  const supabase = await createClient()
  const { error } = await supabase.from('treasury_estimates').update({
    monthly_cents: monthlyCents, pct_d1: pct[0], pct_d2: pct[1], pct_d3: pct[2], active, updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/settings')
  revalidatePath('/treasury')
  return { success: true }
}

export async function createEstimate(input: {
  companyId: string; label: string; kind: 'incasso' | 'muro' | 'automatico' | 'fornitori'
  monthlyCents: number; pct: [number, number, number]
}) {
  if (!input.label.trim()) return { error: 'Il nome è obbligatorio' }
  if (Math.abs(input.pct[0] + input.pct[1] + input.pct[2] - 100) > 0.1) return { error: 'Le tre percentuali devono fare 100' }
  const supabase = await createClient()
  const { error } = await supabase.from('treasury_estimates').insert({
    company_id: input.companyId, label: input.label.trim(), kind: input.kind, category: 'altro',
    monthly_cents: Math.max(0, input.monthlyCents), pct_d1: input.pct[0], pct_d2: input.pct[1], pct_d3: input.pct[2],
  })
  if (error) return { error: error.message }
  revalidatePath('/settings')
  revalidatePath('/treasury')
  return { success: true }
}

export async function updateBacklogBefore(companyId: string, date: string | null) {
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Data non valida' }
  const supabase = await createClient()
  const { error } = await supabase.from('companies').update({ backlog_before: date }).eq('id', companyId)
  if (error) return { error: error.message }
  revalidatePath('/settings')
  revalidatePath('/treasury')
  return { success: true }
}

export async function updateGroupThreshold(cents: number) {
  if (cents < 0) return { error: 'Importo non valido' }
  const supabase = await createClient()
  const { error } = await supabase.from('treasury_settings')
    .update({ group_threshold_cents: cents, updated_at: new Date().toISOString() }).eq('id', true)
  if (error) return { error: error.message }
  revalidatePath('/settings')
  revalidatePath('/treasury')
  return { success: true }
}

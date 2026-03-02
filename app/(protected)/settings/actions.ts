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
  const { error } = await supabase
    .from('bank_accounts')
    .update({
      current_balance_cents: Math.round(parseFloat(formData.get('balance') as string) * 100),
      balance_updated_at: new Date().toISOString(),
    })
    .eq('id', formData.get('id') as string)
  if (error) return { error: error.message }
  revalidatePath('/settings')
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

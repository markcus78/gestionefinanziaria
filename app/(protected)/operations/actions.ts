'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { calcCommissionCents, calcPayoutDate } from '@/lib/channel-utils'

// ─── Incasso giornaliero ───────────────────────────────────────────────────────

export async function addDailyCollection(params: {
  companyId: string
  channelId: string
  collectionDate: string
  grossCents: number
  transactionCount: number
  commissionPct: number
  commissionFixedCents: number
  payoutType: string | null
  payoutRollingDays: number | null
  payoutFixedWeekday: number | null
  notes?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const commissionCents = calcCommissionCents(
    params.grossCents,
    params.transactionCount,
    params.commissionPct,
    params.commissionFixedCents
  )
  const netCents = params.grossCents - commissionCents

  let settlementDate: string | null = null
  if (params.payoutType === 'rolling_days' || params.payoutType === 'fixed_weekday') {
    settlementDate = calcPayoutDate(
      params.collectionDate,
      params.payoutType,
      params.payoutRollingDays,
      params.payoutFixedWeekday
    )
  }

  // Se il payout è immediato (stesso giorno o nessuna data), segna già come liquidato
  const isSettled = !settlementDate || settlementDate <= params.collectionDate

  const { error } = await supabase.from('daily_collections').insert({
    company_id: params.companyId,
    channel_id: params.channelId,
    collection_date: params.collectionDate,
    gross_amount_cents: params.grossCents,
    commission_cents: commissionCents,
    net_amount_cents: netCents,
    transaction_count: params.transactionCount,
    settlement_expected_date: settlementDate,
    is_settled: isSettled,
    settled_date: isSettled ? params.collectionDate : null,
    notes: params.notes || null,
    created_by: user?.id,
  })

  if (error) return { error: error.message }
  revalidatePath('/operations')
  return { success: true }
}

// ─── Settlement ────────────────────────────────────────────────────────────────

export async function markSettled(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('daily_collections')
    .update({
      is_settled: true,
      settled_date: new Date().toISOString().split('T')[0],
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/operations')
  return { success: true }
}

// ─── Elimina incasso ───────────────────────────────────────────────────────────

export async function deleteDailyCollection(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('daily_collections')
    .delete()
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/operations')
  return { success: true }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateAccountBalance(id: string, balanceCents: number, balanceDate: string, creditLineCents: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(balanceDate)) return { error: 'Data del saldo non valida' }
  if (creditLineCents < 0) return { error: 'Il fido non può essere negativo' }
  const supabase = await createClient()
  const { error } = await supabase.from('bank_accounts').update({
    current_balance_cents: balanceCents,
    balance_date: balanceDate,
    balance_updated_at: new Date().toISOString(),
    credit_line_cents: creditLineCents,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  revalidatePath('/settings')
  return { success: true }
}

// cents = null toglie la correzione e torna alla stima
export async function setEstimateOverride(estimateId: string, month: string, idx: number, cents: number | null) {
  const supabase = await createClient()
  const { error } = cents === null
    ? await supabase.from('treasury_estimate_overrides').delete()
        .eq('estimate_id', estimateId).eq('month', month).eq('idx', idx)
    : await supabase.from('treasury_estimate_overrides').upsert({
        estimate_id: estimateId, month, idx, amount_cents: Math.max(0, cents), updated_at: new Date().toISOString(),
      })
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  return { success: true }
}

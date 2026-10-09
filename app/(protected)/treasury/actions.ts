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

// pct = null torna alla percentuale suggerita
export async function setWindowPct(month: string, idx: number, pct: number | null) {
  if (pct !== null && (pct < 0 || pct > 100)) return { error: 'La percentuale va da 0 a 100' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = pct === null
    ? await supabase.from('treasury_window_pct').delete().eq('month', month).eq('idx', idx)
    : await supabase.from('treasury_window_pct').upsert({
        month, idx, pct, decided_by: user?.id ?? null, decided_at: new Date().toISOString(),
      })
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  return { success: true }
}

export async function setSupplierNotified(key: string, name: string, notified: boolean, date: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('supplier_notices').upsert({
    supplier_key: key, display_name: name, notified,
    notified_at: notified ? date : null, notified_by: notified ? user?.id ?? null : null,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  return { success: true }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupplierCategory } from '@/lib/types/database'
import { applyPayment, revertPayments, residualCents } from '@/lib/payment-apply'

function revalidateAll() {
  revalidatePath('/schedule')
  revalidatePath('/payments')
  revalidatePath('/dashboard')
  revalidatePath('/impegni')
  revalidatePath('/staff')
  revalidatePath('/treasury')
}

export async function markPaid(id: string, paidDate: string, paidAmountCents: number) {
  const supabase = await createClient()
  const res = await applyPayment(supabase, id, paidDate, paidAmountCents)
  if ('error' in res) return res
  revalidateAll()
  return { success: true }
}

export async function markPostponed(id: string, newDate: string, notes: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'postponed', postponed_to: newDate, postpone_notes: notes || null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedule')
  return { success: true }
}

export async function markScheduled(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'scheduled' })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedule')
  return { success: true }
}

export async function resetToPending(id: string) {
  const supabase = await createClient()
  const res = await revertPayments(supabase, id)
  if ('error' in res) return res
  revalidateAll()
  return { success: true }
}

export async function setPriorityOverride(id: string, override: number | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_schedule')
    .update({ priority_override: override })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedule')
  return { success: true }
}

export async function updateSupplier(
  id: string,
  data: {
    category?: SupplierCategory | null
    is_critical?: boolean
    default_priority?: number | null
    accepts_postponement?: boolean | null
    postponement_notes?: string | null
  }
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('supplier_registry')
    .update(data)
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedule')
  return { success: true }
}

export async function markPartiallyPaid(
  id: string,
  paidDate: string,
  paidAmountCents: number
) {
  const supabase = await createClient()

  const { data: original, error: fetchErr } = await supabase
    .from('payment_schedule')
    .select('amount_cents, paid_amount_cents')
    .eq('id', id)
    .single()
  if (fetchErr || !original) return { error: fetchErr?.message ?? 'Riga non trovata' }

  const residual = residualCents(original.amount_cents, original.paid_amount_cents)
  if (paidAmountCents >= residual) return { error: 'Importo pari o superiore al residuo: usa Paga' }

  const res = await applyPayment(supabase, id, paidDate, paidAmountCents)
  if ('error' in res) return res

  revalidateAll()
  return { success: true }
}

export async function toggleRepaymentPlan(id: string, value: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_schedule')
    .update({ is_repayment_plan: value })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedule')
  return { success: true }
}

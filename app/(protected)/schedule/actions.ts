'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupplierCategory } from '@/lib/types/database'

export async function markPaid(id: string, paidDate: string, paidAmountCents: number) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'paid', paid_date: paidDate, paid_amount_cents: paidAmountCents })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedule')
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
  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'pending', paid_date: null, paid_amount_cents: null, postponed_to: null, postpone_notes: null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedule')
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

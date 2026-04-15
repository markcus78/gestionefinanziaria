'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function revalidateAll() {
  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  revalidatePath('/payments')
}

export async function markPaid(id: string, paidDate: string, paidAmountCents: number) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'paid', paid_date: paidDate, paid_amount_cents: paidAmountCents })
    .eq('id', id)
  if (error) return { error: error.message }
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
  revalidateAll()
  return { success: true }
}

export async function markScheduled(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'scheduled' })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return { success: true }
}

export async function resetToPending(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'pending', paid_date: null, paid_amount_cents: null, postponed_to: null, postpone_notes: null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return { success: true }
}

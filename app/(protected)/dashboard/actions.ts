'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { applyPayment, revertPayments } from '@/lib/payment-apply'

function revalidateAll() {
  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  revalidatePath('/payments')
  revalidatePath('/staff')
  revalidatePath('/impegni')
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
  const res = await revertPayments(supabase, id)
  if ('error' in res) return res
  revalidateAll()
  return { success: true }
}

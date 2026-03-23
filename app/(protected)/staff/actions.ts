'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markStaffPaid(id: string, paidDate: string, paidAmountCents: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'paid', paid_date: paidDate, paid_amount_cents: paidAmountCents })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/staff')
  revalidatePath('/payments')
  revalidatePath('/treasury')
  return { success: true }
}

export async function resetStaffToPending(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'pending', paid_date: null, paid_amount_cents: null })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/staff')
  revalidatePath('/payments')
  return { success: true }
}

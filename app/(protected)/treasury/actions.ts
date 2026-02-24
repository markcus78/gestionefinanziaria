'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updatePriorityOverride(id: string, priority: number | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payment_schedule')
    .update({ priority_override: priority })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  revalidatePath('/schedule')
  return { success: true }
}

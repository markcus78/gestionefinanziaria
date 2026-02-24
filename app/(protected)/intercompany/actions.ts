'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type NettingPairDetail = {
  company_a_code: string
  company_b_code: string
  gross_a_to_b_cents: number
  gross_b_to_a_cents: number
  net_cents: number
  net_direction: 'a_to_b' | 'b_to_a' | 'zero'
}

// Esegue il netting per una coppia intercompany:
// 1. Marca tutti i payment_schedule coinvolti come 'paid'
// 2. Registra il netting in intercompany_nettings
export async function executeNettingPair(
  allItemIds: string[],
  pairDetail: NettingPairDetail
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const today = new Date().toISOString().split('T')[0]

  // Importo compensato = 2 * min(a_to_b, b_to_a)
  const compensated = 2 * Math.min(pairDetail.gross_a_to_b_cents, pairDetail.gross_b_to_a_cents)

  // Marca le partite come pagate (saldate per compensazione)
  const { error: updateError } = await supabase
    .from('payment_schedule')
    .update({
      status: 'paid',
      paid_date: today,
      updated_at: new Date().toISOString(),
    })
    .in('id', allItemIds)

  if (updateError) return { error: updateError.message }

  // Registra il netting
  const { error: insertError } = await supabase
    .from('intercompany_nettings')
    .insert({
      netting_date: today,
      created_by: user?.id ?? null,
      total_compensated_cents: compensated,
      details: { pairs: [pairDetail] },
    })

  if (insertError) return { error: insertError.message }

  revalidatePath('/intercompany')
  revalidatePath('/treasury')
  revalidatePath('/forecast')
  return { success: true }
}

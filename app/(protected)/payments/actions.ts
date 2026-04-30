'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function revalidateAll() {
  revalidatePath('/payments')
  revalidatePath('/schedule')
  revalidatePath('/treasury')
}

export async function markPaid(id: string, paidDate: string, paidAmountCents: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: original } = await supabase
    .from('payment_schedule')
    .select('status, paid_amount_cents')
    .eq('id', id)
    .single()

  const previouslyPaid = original?.status === 'partial' ? (original.paid_amount_cents ?? 0) : 0
  const totalPaid = previouslyPaid + paidAmountCents

  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'paid', paid_date: paidDate, paid_amount_cents: totalPaid })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return { success: true }
}

export async function markPartiallyPaid(
  id: string,
  paidDate: string,
  paidAmountCents: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: original, error: fetchErr } = await supabase
    .from('payment_schedule')
    .select('amount_cents, paid_amount_cents, flow_type')
    .eq('id', id)
    .single()
  if (fetchErr || !original) return { error: fetchErr?.message ?? 'Riga non trovata' }

  const currentCents = Math.abs(original.amount_cents)
  if (paidAmountCents <= 0) return { error: 'Importo non valido' }
  if (paidAmountCents >= currentCents) return { error: 'Importo pari o superiore al residuo: usa Paga' }

  const residualCents = currentCents - paidAmountCents
  const previouslyPaid = original.paid_amount_cents ?? 0
  const cumulativePaid = previouslyPaid + paidAmountCents
  const sign = original.flow_type === 'out' ? -1 : 1

  const { error: updateErr } = await supabase
    .from('payment_schedule')
    .update({
      status: 'partial',
      paid_date: paidDate,
      paid_amount_cents: cumulativePaid,
      amount_cents: sign * residualCents,
      amount_in_cents: original.flow_type === 'in' ? residualCents : 0,
      amount_out_cents: original.flow_type === 'out' ? residualCents : 0,
    })
    .eq('id', id)
  if (updateErr) return { error: updateErr.message }

  revalidateAll()
  return { success: true }
}

export async function markPostponed(id: string, newDate: string, notes: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'postponed', postponed_to: newDate, postpone_notes: notes || null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/payments')
  revalidatePath('/schedule')
  return { success: true }
}

export async function markScheduled(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'scheduled' })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/payments')
  revalidatePath('/schedule')
  return { success: true }
}

export async function resetToPending(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: original, error: fetchErr } = await supabase
    .from('payment_schedule')
    .select('status, amount_cents, paid_amount_cents, flow_type')
    .eq('id', id)
    .single()
  if (fetchErr || !original) return { error: fetchErr?.message ?? 'Riga non trovata' }

  const update: Record<string, unknown> = {
    status: 'pending',
    paid_date: null,
    paid_amount_cents: null,
    postponed_to: null,
    postpone_notes: null,
  }

  // Per i parziali ripristina l'importo totale (residuo corrente + già pagato)
  if (original.status === 'partial') {
    const totalCents = Math.abs(original.amount_cents) + (original.paid_amount_cents ?? 0)
    const sign = original.flow_type === 'out' ? -1 : 1
    update.amount_cents = sign * totalCents
    update.amount_in_cents = original.flow_type === 'in' ? totalCents : 0
    update.amount_out_cents = original.flow_type === 'out' ? totalCents : 0
  }

  const { error } = await supabase
    .from('payment_schedule')
    .update(update)
    .eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return { success: true }
}

export async function createUrgentPayment(input: {
  company_id: string
  supplier_name: string
  description: string
  amount_cents: number
  due_date: string
  notes: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const docNumber = 'URG-' + crypto.randomUUID().slice(0, 8)
  const abs = Math.abs(input.amount_cents)

  const { error } = await supabase.from('payment_schedule').insert({
    company_id: input.company_id,
    import_batch_id: null,
    supplier_name: input.supplier_name,
    account_description: input.description || null,
    due_date: input.due_date,
    amount_cents: -abs,
    amount_in_cents: 0,
    amount_out_cents: abs,
    flow_type: 'out',
    entry_type: 'commitment',
    commitment_type: 'manual',
    status: 'pending',
    document_number: docNumber,
    is_intercompany: false,
    postpone_notes: input.notes || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/payments')
  revalidatePath('/treasury')
  return { success: true }
}

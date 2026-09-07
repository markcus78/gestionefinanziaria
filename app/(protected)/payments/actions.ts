'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { applyPayment, revertPayments, residualCents } from '@/lib/payment-apply'

function revalidateAll() {
  revalidatePath('/payments')
  revalidatePath('/schedule')
  revalidatePath('/treasury')
  revalidatePath('/staff')
  revalidatePath('/impegni')
  revalidatePath('/dashboard')
}

export async function markPaid(id: string, paidDate: string, paidAmountCents: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const res = await applyPayment(supabase, id, paidDate, paidAmountCents)
  if ('error' in res) return res

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

  const res = await revertPayments(supabase, id)
  if ('error' in res) return res

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

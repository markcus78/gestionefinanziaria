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

  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'paid', paid_date: paidDate, paid_amount_cents: paidAmountCents })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return { success: true }
}

export async function markPartiallyPaid(
  id: string,
  paidDate: string,
  paidAmountCents: number,
  residualDueDate: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: original, error: fetchErr } = await supabase
    .from('payment_schedule')
    .select('company_id, amount_cents, supplier_name, account_description, document_number')
    .eq('id', id)
    .single()
  if (fetchErr || !original) return { error: fetchErr?.message ?? 'Riga non trovata' }

  const totalCents = Math.abs(original.amount_cents)
  const residualCents = totalCents - paidAmountCents

  const { error: updateErr } = await supabase
    .from('payment_schedule')
    .update({ status: 'paid', paid_date: paidDate, paid_amount_cents: paidAmountCents })
    .eq('id', id)
  if (updateErr) return { error: updateErr.message }

  if (residualCents > 0) {
    const docNum = 'RES-' + (original.document_number ?? id).slice(0, 12)
    const desc = original.account_description ? original.account_description + ' (residuo)' : '(residuo)'
    const { error: insertErr } = await supabase.from('payment_schedule').insert({
      company_id: original.company_id,
      import_batch_id: null,
      supplier_name: original.supplier_name,
      account_description: desc,
      due_date: residualDueDate,
      amount_cents: -residualCents,
      amount_in_cents: 0,
      amount_out_cents: residualCents,
      flow_type: 'out',
      entry_type: 'commitment',
      commitment_type: 'manual',
      status: 'pending',
      document_number: docNum,
      is_intercompany: false,
    })
    if (insertErr) return { error: insertErr.message }
  }

  revalidateAll()
  revalidatePath('/impegni')
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

  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'pending', paid_date: null, paid_amount_cents: null, postponed_to: null, postpone_notes: null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/payments')
  revalidatePath('/schedule')
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

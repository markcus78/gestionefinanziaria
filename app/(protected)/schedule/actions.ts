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

export async function markPartiallyPaid(
  id: string,
  paidDate: string,
  paidAmountCents: number,
  residualDueDate: string
) {
  const supabase = await createClient()

  const { data: original, error: fetchErr } = await supabase
    .from('payment_schedule')
    .select('company_id, amount_cents, supplier_name, account_description, document_number, supplier_id, is_repayment_plan')
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
      supplier_id: original.supplier_id,
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
      is_repayment_plan: original.is_repayment_plan,
    })
    if (insertErr) return { error: insertErr.message }
  }

  revalidatePath('/schedule')
  revalidatePath('/payments')
  revalidatePath('/impegni')
  revalidatePath('/dashboard')
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

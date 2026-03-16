'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CommitmentInput = {
  company_id: string
  supplier_name: string
  account_description: string | null
  due_date: string
  amount_cents: number   // negativo per out, positivo per in
  flow_type: 'in' | 'out'
  notes: string | null
}

export type CommitmentResult = { error: string } | { ok: true }

export async function createCommitment(input: CommitmentInput): Promise<CommitmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // dedup_key sicuro per commitment manuali: uso document_number univoco
  const docNumber = 'IMP-' + crypto.randomUUID().slice(0, 8)

  const { error } = await supabase.from('payment_schedule').insert({
    company_id: input.company_id,
    import_batch_id: null,
    supplier_name: input.supplier_name,
    account_description: input.account_description,
    due_date: input.due_date,
    amount_cents: input.amount_cents,
    amount_in_cents:  input.flow_type === 'in'  ? Math.abs(input.amount_cents) : 0,
    amount_out_cents: input.flow_type === 'out' ? Math.abs(input.amount_cents) : 0,
    flow_type: input.flow_type,
    entry_type: 'commitment',
    status: 'pending',
    document_number: docNumber,
    is_intercompany: false,
    postpone_notes: input.notes,
  })

  if (error) return { error: error.message }
  revalidatePath('/impegni')
  return { ok: true }
}

export async function updateCommitment(
  id: string,
  input: Pick<CommitmentInput, 'supplier_name' | 'account_description' | 'due_date' | 'amount_cents' | 'flow_type' | 'notes'>
): Promise<CommitmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('payment_schedule')
    .update({
      supplier_name: input.supplier_name,
      account_description: input.account_description,
      due_date: input.due_date,
      amount_cents: input.amount_cents,
      amount_in_cents:  input.flow_type === 'in'  ? Math.abs(input.amount_cents) : 0,
      amount_out_cents: input.flow_type === 'out' ? Math.abs(input.amount_cents) : 0,
      flow_type: input.flow_type,
      postpone_notes: input.notes,
    })
    .eq('id', id)
    .eq('entry_type', 'commitment')

  if (error) return { error: error.message }
  revalidatePath('/impegni')
  return { ok: true }
}

export async function cancelCommitment(id: string): Promise<CommitmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('payment_schedule')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('entry_type', 'commitment')

  if (error) return { error: error.message }
  revalidatePath('/impegni')
  return { ok: true }
}

export async function deleteCommitment(id: string): Promise<CommitmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('payment_schedule')
    .delete()
    .eq('id', id)
    .eq('entry_type', 'commitment')

  if (error) return { error: error.message }
  revalidatePath('/impegni')
  return { ok: true }
}

export async function createCommitmentBatch(items: CommitmentInput[]): Promise<CommitmentResult> {
  if (!items.length) return { ok: true }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const rows = items.map(input => ({
    company_id: input.company_id,
    import_batch_id: null,
    supplier_name: input.supplier_name,
    account_description: input.account_description,
    due_date: input.due_date,
    amount_cents: input.amount_cents,
    amount_in_cents:  input.flow_type === 'in'  ? Math.abs(input.amount_cents) : 0,
    amount_out_cents: input.flow_type === 'out' ? Math.abs(input.amount_cents) : 0,
    flow_type: input.flow_type,
    entry_type: 'commitment' as const,
    status: 'pending' as const,
    document_number: 'IMP-' + crypto.randomUUID().slice(0, 8),
    is_intercompany: false,
    postpone_notes: input.notes,
  }))

  const { error } = await supabase.from('payment_schedule').insert(rows)
  if (error) return { error: error.message }
  revalidatePath('/impegni')
  return { ok: true }
}

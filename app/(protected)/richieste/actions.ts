'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type RequestInput = {
  company_id: string
  supplier_id: string | null
  supplier_name: string
  description: string
  amount_cents: number
  expected_date: string
  requested_by: string | null
  notes: string | null
}

type Result = { error: string } | { ok: true }

function revalidateAll() {
  revalidatePath('/richieste')
  revalidatePath('/impegni')
  revalidatePath('/treasury')
}

export async function createRequest(input: RequestInput): Promise<Result> {
  if (!input.company_id) return { error: 'Scegli la società' }
  if (!input.supplier_name.trim()) return { error: 'Scegli il fornitore' }
  if (!input.description.trim()) return { error: 'Scrivi cosa si chiede' }
  if (!(input.amount_cents > 0)) return { error: 'Importo non valido' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expected_date)) return { error: 'Data non valida' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { error } = await supabase.from('spend_requests').insert({
    ...input, supplier_name: input.supplier_name.trim(), description: input.description.trim(),
  })
  if (error) return { error: error.message }
  revalidateAll()
  return { ok: true }
}

// Approvata, la richiesta diventa un impegno legato al suo fornitore: da lì entra nella cassa
// e collassa nella fattura quando arriva dallo scadenzario
export async function approveRequest(id: string, note: string | null): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { data: r, error: e1 } = await supabase.from('spend_requests').select('*').eq('id', id).single()
  if (e1 || !r) return { error: e1?.message ?? 'Richiesta non trovata' }
  if (r.status !== 'in_attesa') return { error: 'La richiesta è già stata decisa' }

  const { data: imp, error: e2 } = await supabase.from('payment_schedule').insert({
    company_id: r.company_id,
    import_batch_id: null,
    supplier_id: r.supplier_id,
    supplier_name: r.supplier_name,
    account_description: r.description,
    due_date: r.expected_date,
    amount_cents: -Math.abs(r.amount_cents),
    amount_in_cents: 0,
    amount_out_cents: Math.abs(r.amount_cents),
    flow_type: 'out',
    entry_type: 'commitment',
    commitment_type: 'manual',
    status: 'pending',
    document_number: 'RQ-' + String(r.id).slice(0, 8),
    is_intercompany: false,
    postpone_notes: `Da richiesta${r.requested_by ? ` di ${r.requested_by}` : ''}, approvata da ${user.email}${note ? `: ${note}` : ''}`,
  }).select('id').single()
  if (e2 || !imp) return { error: e2?.message ?? 'Impegno non creato' }

  const { error: e3 } = await supabase.from('spend_requests').update({
    status: 'approvata', decided_by: user.email, decided_at: new Date().toISOString(), decision_note: note,
    commitment_id: imp.id,
  }).eq('id', id)
  if (e3) return { error: e3.message }
  revalidateAll()
  return { ok: true }
}

export async function rejectRequest(id: string, note: string | null): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { error } = await supabase.from('spend_requests').update({
    status: 'respinta', decided_by: user.email, decided_at: new Date().toISOString(), decision_note: note,
  }).eq('id', id).eq('status', 'in_attesa')
  if (error) return { error: error.message }
  revalidateAll()
  return { ok: true }
}

export async function deleteRequest(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('spend_requests').delete().eq('id', id).eq('status', 'in_attesa')
  if (error) return { error: error.message }
  revalidateAll()
  return { ok: true }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { applyPayment } from '@/lib/payment-apply'

export type CommitmentInput = {
  company_id: string
  supplier_name: string
  account_description: string | null
  due_date: string
  amount_cents: number   // negativo per out, positivo per in
  flow_type: 'in' | 'out'
  notes: string | null
  // spesa verso un fornitore (null/manual) = passa dallo scadenzario (diventerà fattura);
  // gli altri non passano mai dallo scadenzario e in Tesoreria si pagano per intero (muro)
  commitment_type?: ManualKind | null
  // fornitore che non ha ancora fatture nello scadenzario: l'impegno resta da collegare
  new_supplier?: boolean
  // importo stimato, da confermare (Marco, 23/10/2026): in Tesoreria conta come gli altri
  is_estimated?: boolean
}

// Tipi che si inseriscono e si cambiano da Impegni (il personale e gli F24 arrivano da Staff)
const MANUAL_KINDS = ['manual', 'loan_item', 'tributi_item', 'insurance_item', 'membership_item'] as const
type ManualKind = typeof MANUAL_KINDS[number]

type Supa = Awaited<ReturnType<typeof createClient>>

// Fornitore obbligatorio sulle spese in uscita (Marco, 15/10/2026): senza fornitore, quando la fattura
// arriva dallo scadenzario il sistema non la riconosce e la spesa si conta due volte. Il nome si
// sceglie fra i fornitori dello scadenzario di quella società; se non ha ancora fatture si dichiara
// «fornitore nuovo». Gli impegni che non passano dallo scadenzario (rate, tributi, assicurazioni,
// tesseramenti): niente obbligo.
function needsSupplier(type: string | null | undefined, flow: 'in' | 'out') {
  return flow === 'out' && (!type || type === 'manual')
}

async function resolveSupplier(supabase: Supa, input: Pick<CommitmentInput, 'company_id' | 'supplier_name' | 'flow_type' | 'commitment_type' | 'new_supplier'>):
  Promise<{ supplier_id: string | null; new_supplier: boolean } | { error: string }> {
  const name = input.supplier_name.trim()
  const { data } = await supabase.from('supplier_registry').select('id, supplier_name')
    .eq('company_id', input.company_id).ilike('supplier_name', name.replace(/[\\%_]/g, c => '\\' + c)).limit(1)
  const found = data?.[0]?.id ?? null
  if (found) return { supplier_id: found, new_supplier: false }
  if (!needsSupplier(input.commitment_type, input.flow_type)) return { supplier_id: null, new_supplier: false }
  if (input.new_supplier) return { supplier_id: null, new_supplier: true }
  return { error: `«${name}» non è fra i fornitori dello scadenzario di questa società: sceglilo dall'elenco, oppure spunta «fornitore nuovo» se non ha ancora fatture` }
}

export type CommitmentResult = { error: string } | { ok: true }
export type RecurringResult  = { error: string } | { ok: true; created: number }

export async function createCommitment(input: CommitmentInput): Promise<CommitmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const sup = await resolveSupplier(supabase, input)
  if ('error' in sup) return sup

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
    commitment_type: input.commitment_type ?? null,
    is_estimated: input.is_estimated ?? false,
    ...sup,
  })

  if (error) return { error: error.message }
  revalidatePath('/impegni')
  revalidatePath('/treasury')
  return { ok: true }
}

export async function updateCommitment(
  id: string,
  input: Pick<CommitmentInput, 'supplier_name' | 'account_description' | 'due_date' | 'amount_cents' | 'flow_type' | 'notes' | 'new_supplier' | 'commitment_type' | 'is_estimated'>
): Promise<CommitmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: row, error: e0 } = await supabase.from('payment_schedule')
    .select('company_id, commitment_type').eq('id', id).single()
  if (e0 || !row) return { error: e0?.message ?? 'Impegno non trovato' }
  // il tipo si cambia solo fra quelli di Impegni (personale, F24 e stime restano come sono)
  const current = (row.commitment_type ?? 'manual') as string
  const editable = (MANUAL_KINDS as readonly string[]).includes(current)
  const kind = editable && input.commitment_type && (MANUAL_KINDS as readonly string[]).includes(input.commitment_type)
    ? input.commitment_type : row.commitment_type
  const sup = await resolveSupplier(supabase, {
    company_id: row.company_id, supplier_name: input.supplier_name, flow_type: input.flow_type,
    commitment_type: kind as CommitmentInput['commitment_type'], new_supplier: input.new_supplier,
  })
  if ('error' in sup) return sup

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
      commitment_type: kind,
      ...(input.is_estimated !== undefined ? { is_estimated: input.is_estimated } : {}),
      ...sup,
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

export async function markCommitmentPaid(id: string, paidDate: string, paidAmountCents: number): Promise<CommitmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const res = await applyPayment(supabase, id, paidDate, paidAmountCents)
  if ('error' in res) return { error: res.error }

  revalidatePath('/impegni')
  revalidatePath('/payments')
  revalidatePath('/staff')
  revalidatePath('/schedule')
  revalidatePath('/treasury')
  return { ok: true }
}

export async function createRecurringCommitments(
  input: CommitmentInput,
  frequency: 'monthly' | 'quarterly' | 'annual',
  monthsAhead: number,
): Promise<RecurringResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const sup = await resolveSupplier(supabase, input)
  if ('error' in sup) return sup

  const step = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12
  const seriesId = crypto.randomUUID().slice(0, 8)

  const dates: string[] = []
  const [yy, mm, dd] = input.due_date.split('-').map(Number)
  for (let i = 0; i < monthsAhead; i++) {
    const totalMonths = mm - 1 + i * step
    const year  = yy + Math.floor(totalMonths / 12)
    const month = (totalMonths % 12) + 1
    const daysInMonth = new Date(year, month, 0).getDate()
    const day = Math.min(dd, daysInMonth)
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }

  const rows = dates.map(due_date => ({
    company_id:         input.company_id,
    import_batch_id:    null,
    supplier_name:      input.supplier_name,
    account_description: input.account_description,
    due_date,
    amount_cents:       input.amount_cents,
    amount_in_cents:    input.flow_type === 'in'  ? Math.abs(input.amount_cents) : 0,
    amount_out_cents:   input.flow_type === 'out' ? Math.abs(input.amount_cents) : 0,
    flow_type:          input.flow_type,
    entry_type:         'commitment' as const,
    commitment_type:    input.commitment_type ?? 'manual',
    status:             'pending'    as const,
    document_number:    `RIC-${seriesId}-${due_date.slice(0, 7)}`,
    is_intercompany:    false,
    postpone_notes:     input.notes,
    is_estimated:       input.is_estimated ?? false,
    ...sup,
  }))

  const { error } = await supabase.from('payment_schedule').insert(rows)
  if (error) return { error: error.message }
  revalidatePath('/impegni')
  return { ok: true, created: rows.length }
}

export async function createCommitmentBatch(items: CommitmentInput[]): Promise<CommitmentResult> {
  if (!items.length) return { ok: true }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const sups = await Promise.all(items.map(i => resolveSupplier(supabase, i)))
  const bad = items.filter((_, k) => 'error' in sups[k]).map(i => i.supplier_name)
  if (bad.length) return { error: `Fornitori non trovati nello scadenzario: ${bad.join(', ')}. Sceglili dall'elenco; un fornitore nuovo si inserisce con «Nuovo impegno»` }

  const rows = items.map((input, k) => ({
    ...(sups[k] as { supplier_id: string | null; new_supplier: boolean }),
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

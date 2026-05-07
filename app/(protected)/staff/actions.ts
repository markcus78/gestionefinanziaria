'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CommitmentType } from '@/lib/types/database'

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
}

function revalidateAll() {
  revalidatePath('/staff')
  revalidatePath('/payments')
  revalidatePath('/treasury')
  revalidatePath('/impegni')
}

// ── Existing actions ────────────────────────────────────────────────────────

export async function markStaffPaid(id: string, paidDate: string, paidAmountCents: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: original, error: fetchErr } = await supabase
    .from('payment_schedule')
    .select('status, amount_cents, paid_amount_cents, flow_type')
    .eq('id', id)
    .single()
  if (fetchErr || !original) return { error: fetchErr?.message ?? 'Riga non trovata' }

  if (paidAmountCents <= 0) return { error: 'Importo non valido' }

  const currentCents = Math.abs(original.amount_cents)
  const previouslyPaid = original.status === 'partial' ? (original.paid_amount_cents ?? 0) : 0

  if (paidAmountCents >= currentCents) {
    const totalPaid = previouslyPaid + paidAmountCents
    const { error } = await supabase
      .from('payment_schedule')
      .update({ status: 'paid', paid_date: paidDate, paid_amount_cents: totalPaid })
      .eq('id', id)
    if (error) return { error: error.message }
  } else {
    const residualCents = currentCents - paidAmountCents
    const cumulativePaid = previouslyPaid + paidAmountCents
    const sign = original.flow_type === 'out' ? -1 : 1
    const { error } = await supabase
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
    if (error) return { error: error.message }
  }

  revalidateAll()
  return { success: true }
}

export async function resetStaffToPending(id: string) {
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
  }

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

// ── Budget ──────────────────────────────────────────────────────────────────

const BUDGET_MAP: Record<string, { supplierName: string; commitmentType: CommitmentType; prefix: string }> = {
  dipendenti:    { supplierName: 'BUDGET Dipendenti',    commitmentType: 'salary_item', prefix: 'BDG-dipendenti' },
  collaboratori: { supplierName: 'BUDGET Collaboratori', commitmentType: 'collab_item', prefix: 'BDG-collab' },
  f24:           { supplierName: 'BUDGET F24',           commitmentType: 'tax_item',    prefix: 'BDG-f24' },
}

export async function saveBudget(
  companyId: string,
  referenceMonth: string,
  category: 'dipendenti' | 'collaboratori' | 'f24',
  amountCents: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { supplierName, commitmentType, prefix } = BUDGET_MAP[category]
  const docNumber = `${prefix}-${referenceMonth}`

  // Delete existing budget row
  await supabase
    .from('payment_schedule')
    .delete()
    .eq('company_id', companyId)
    .eq('document_number', docNumber)

  // Insert new budget row
  const { error } = await supabase.from('payment_schedule').insert({
    company_id: companyId,
    import_batch_id: null,
    supplier_name: supplierName,
    account_description: 'Budget previsto',
    due_date: `${referenceMonth}-01`,
    amount_cents: -amountCents,
    amount_in_cents: 0,
    amount_out_cents: amountCents,
    flow_type: 'out',
    entry_type: 'commitment',
    commitment_type: commitmentType,
    status: 'pending',
    document_number: docNumber,
    is_intercompany: false,
    reference_month: referenceMonth,
  })
  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

// ── Import staff items ──────────────────────────────────────────────────────

type StaffItemInput = { name: string; amountCents: number }

const TYPE_PREFIX: Record<string, string> = {
  salary_item: 'SAL',
  extra_item: 'EXT',
  collab_item: 'COL',
  piva_item: 'PIV',
}

export async function importStaffItems(
  companyId: string,
  referenceMonth: string,
  type: 'salary_item' | 'extra_item' | 'collab_item' | 'piva_item',
  items: StaffItemInput[],
  dueDate: string
) {
  if (!items.length) return { error: 'Nessuna voce da importare' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const prefix = TYPE_PREFIX[type]

  // Delete existing actual rows (NOT budget rows)
  await supabase
    .from('payment_schedule')
    .delete()
    .eq('company_id', companyId)
    .eq('commitment_type', type)
    .eq('reference_month', referenceMonth)
    .not('document_number', 'like', 'BDG-%')

  const rows = items.map(item => ({
    company_id: companyId,
    import_batch_id: null,
    supplier_name: item.name,
    account_description: null,
    due_date: dueDate,
    amount_cents: -item.amountCents,
    amount_in_cents: 0,
    amount_out_cents: item.amountCents,
    flow_type: 'out' as const,
    entry_type: 'commitment' as const,
    commitment_type: type,
    status: 'pending' as const,
    document_number: `${prefix}-${referenceMonth}-${slugify(item.name)}`,
    is_intercompany: false,
    reference_month: referenceMonth,
  }))

  const { error } = await supabase.from('payment_schedule').insert(rows)
  if (error) return { error: error.message }

  revalidateAll()
  return { success: true, count: rows.length }
}

// ── Import F24 ──────────────────────────────────────────────────────────────

export async function importStaffTaxItem(
  companyId: string,
  referenceMonth: string,
  amountCents: number,
  dueDate: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Delete existing actual F24 row (NOT budget)
  await supabase
    .from('payment_schedule')
    .delete()
    .eq('company_id', companyId)
    .eq('commitment_type', 'tax_item')
    .eq('reference_month', referenceMonth)
    .not('document_number', 'like', 'BDG-%')

  const { error } = await supabase.from('payment_schedule').insert({
    company_id: companyId,
    import_batch_id: null,
    supplier_name: 'F24',
    account_description: null,
    due_date: dueDate,
    amount_cents: -amountCents,
    amount_in_cents: 0,
    amount_out_cents: amountCents,
    flow_type: 'out',
    entry_type: 'commitment',
    commitment_type: 'tax_item',
    status: 'pending',
    document_number: `F24-${referenceMonth}`,
    is_intercompany: false,
    reference_month: referenceMonth,
  })
  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

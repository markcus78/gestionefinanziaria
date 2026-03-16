'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

export type SalaryItemInput = { name: string; amountCents: number }

export async function importSalaryItems(
  companyId: string,
  referenceMonth: string,
  type: 'salary_item' | 'collab_item',
  items: SalaryItemInput[],
  dueDate: string,
): Promise<{ error?: string; created?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // 1. Cancella voci esistenti dello stesso tipo/mese/società
  const { error: delErr } = await supabase
    .from('payment_schedule')
    .delete()
    .eq('company_id', companyId)
    .eq('entry_type', 'commitment')
    .eq('commitment_type', type)
    .eq('reference_month', referenceMonth)

  if (delErr) return { error: delErr.message }

  if (!items.length) {
    revalidatePath('/impegni')
    return { created: 0 }
  }

  const prefix = type === 'salary_item' ? 'SAL' : 'COL'
  const desc   = type === 'salary_item' ? 'Stipendio' : 'Collaboratore'

  const rows = items.map(item => ({
    company_id: companyId,
    supplier_name: item.name,
    account_description: desc,
    due_date: dueDate,
    amount_cents: -Math.abs(item.amountCents),
    amount_in_cents: 0,
    amount_out_cents: Math.abs(item.amountCents),
    flow_type: 'out' as const,
    entry_type: 'commitment' as const,
    status: 'pending' as const,
    document_number: `${prefix}-${referenceMonth}-${slugify(item.name)}`,
    is_intercompany: false,
    import_batch_id: null,
    commitment_type: type,
    reference_month: referenceMonth,
  }))

  const { error: insErr } = await supabase.from('payment_schedule').insert(rows)
  if (insErr) return { error: insErr.message }

  revalidatePath('/impegni')
  return { created: items.length }
}

export async function importTaxItem(
  companyId: string,
  referenceMonth: string,
  amountCents: number,
  dueDate: string,
): Promise<{ error?: string; created?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // 1. Cancella voce F24 esistente per questo mese/società
  const { error: delErr } = await supabase
    .from('payment_schedule')
    .delete()
    .eq('company_id', companyId)
    .eq('entry_type', 'commitment')
    .eq('commitment_type', 'tax_item')
    .eq('reference_month', referenceMonth)

  if (delErr) return { error: delErr.message }

  // 2. Insert nuova voce F24
  const { error: insErr } = await supabase.from('payment_schedule').insert({
    company_id: companyId,
    supplier_name: 'F24',
    account_description: 'Tributi e contributi',
    due_date: dueDate,
    amount_cents: -Math.abs(amountCents),
    amount_in_cents: 0,
    amount_out_cents: Math.abs(amountCents),
    flow_type: 'out' as const,
    entry_type: 'commitment' as const,
    status: 'pending' as const,
    document_number: `F24-${referenceMonth}`,
    is_intercompany: false,
    import_batch_id: null,
    commitment_type: 'tax_item',
    reference_month: referenceMonth,
  })

  if (insErr) return { error: insErr.message }

  revalidatePath('/impegni')
  return { created: 1 }
}

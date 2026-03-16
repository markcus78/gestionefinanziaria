'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { RecurringTemplate } from '@/lib/types/database'

export type TemplateInput = {
  company_id: string
  name: string
  category: RecurringTemplate['category']
  amount_cents: number | null
  flow_type: 'in' | 'out'
  frequency: RecurringTemplate['frequency']
  day_of_month: number
  notes: string | null
  active?: boolean
}

export type TemplateResult = { error: string } | { ok: true }

export async function createTemplate(input: TemplateInput): Promise<TemplateResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase.from('recurring_templates').insert({
    company_id: input.company_id,
    name: input.name,
    category: input.category,
    amount_cents: input.amount_cents,
    flow_type: input.flow_type,
    frequency: input.frequency,
    day_of_month: input.day_of_month,
    notes: input.notes,
    active: true,
  })

  if (error) return { error: error.message }
  revalidatePath('/impegni')
  return { ok: true }
}

export async function updateTemplate(id: string, input: Partial<TemplateInput>): Promise<TemplateResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase.from('recurring_templates').update(input).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/impegni')
  return { ok: true }
}

export async function deleteTemplate(id: string): Promise<TemplateResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase.from('recurring_templates').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/impegni')
  return { ok: true }
}

export async function generateMonth(
  templateIds: string[],
  year: number,
  month: number,
): Promise<{ error?: string; created?: number }> {
  if (!templateIds.length) return { created: 0 }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: templates, error: fetchErr } = await supabase
    .from('recurring_templates')
    .select('*')
    .in('id', templateIds)

  if (fetchErr) return { error: fetchErr.message }
  if (!templates || templates.length === 0) return { created: 0 }

  const referenceMonth = `${year}-${String(month).padStart(2, '0')}`
  const daysInMonth = new Date(year, month, 0).getDate()

  const rows = (templates as RecurringTemplate[]).map(t => {
    const day = Math.min(t.day_of_month, daysInMonth)
    const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const docNumber = `FCST-${t.id.slice(0, 8)}-${referenceMonth}`
    const absCents = t.amount_cents != null ? Math.abs(t.amount_cents) : 0
    const amountCents = t.flow_type === 'out' ? -absCents : absCents

    return {
      company_id: t.company_id,
      supplier_name: t.name,
      account_description: t.category,
      due_date: dueDate,
      amount_cents: amountCents,
      amount_in_cents: t.flow_type === 'in' ? absCents : 0,
      amount_out_cents: t.flow_type === 'out' ? absCents : 0,
      flow_type: t.flow_type,
      entry_type: 'commitment' as const,
      status: 'pending' as const,
      document_number: docNumber,
      is_intercompany: false,
      import_batch_id: null,
      commitment_type: 'forecast' as const,
      recurring_template_id: t.id,
      reference_month: referenceMonth,
    }
  })

  // INSERT row-by-row: ignora conflitti dedup_key (doppia generazione stesso mese)
  let created = 0
  for (const row of rows) {
    const { error } = await supabase.from('payment_schedule').insert(row)
    if (!error) created++
  }

  revalidatePath('/impegni')
  return { created }
}

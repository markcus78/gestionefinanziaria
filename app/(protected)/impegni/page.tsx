import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ImpegniClient from './impegni-client'
import type { PaymentScheduleItem, Company, RecurringTemplate } from '@/lib/types/database'

export default async function ImpegniPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const companyId = sp.company ?? ''
  const status    = sp.status  ?? 'pending'
  const flow      = sp.flow    ?? ''
  const from      = sp.from    ?? ''
  const to        = sp.to      ?? ''

  let impQ = supabase
    .from('payment_schedule')
    .select('*')
    .eq('entry_type', 'commitment')

  if (companyId) impQ = impQ.eq('company_id', companyId)
  if (status)    impQ = impQ.eq('status', status)
  if (flow)      impQ = impQ.eq('flow_type', flow)
  if (from)      impQ = impQ.gte('due_date', from)
  if (to)        impQ = impQ.lte('due_date', to)

  impQ = impQ.order('due_date', { ascending: true }).limit(500)

  const [
    { data: items },
    { data: companies },
    { data: templates },
    { data: accounting },
  ] = await Promise.all([
    impQ,
    supabase.from('companies').select('id, code, name').eq('is_active', true).order('name'),
    supabase.from('recurring_templates').select('*').order('name'),
    supabase
      .from('payment_schedule')
      .select('company_id, amount_cents, due_date')
      .eq('entry_type', 'accounting')
      .not('status', 'in', '("cancelled","paid")'),
  ])

  // Calcola quali impegni attivi hanno un possibile match in accounting
  const matchedIds: string[] = []
  for (const c of (items ?? []).filter(x => x.status !== 'cancelled' && x.status !== 'paid')) {
    const hasMatch = (accounting ?? []).some(acc => {
      const sameCents = Math.abs(acc.amount_cents) === Math.abs(c.amount_cents)
      const daysDiff = Math.abs(
        new Date(acc.due_date).getTime() - new Date(c.due_date).getTime()
      ) / 86400000
      return acc.company_id === c.company_id && sameCents && daysDiff <= 7
    })
    if (hasMatch) matchedIds.push(c.id)
  }

  return (
    <ImpegniClient
      items={(items ?? []) as PaymentScheduleItem[]}
      companies={(companies ?? []) as Pick<Company, 'id' | 'code' | 'name'>[]}
      templates={(templates ?? []) as RecurringTemplate[]}
      matchedIds={matchedIds}
    />
  )
}

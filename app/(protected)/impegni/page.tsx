import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ImpegniClient from './impegni-client'
import type { PaymentScheduleItem, PaymentStatus } from '@/lib/types/database'
import type { Company } from '@/lib/types/database'

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
  const status    = sp.status  ?? ''
  const flow      = sp.flow    ?? ''
  const from      = sp.from    ?? ''
  const to        = sp.to      ?? ''

  // Fetch parallelo: impegni + società
  let impQ = supabase
    .from('payment_schedule')
    .select('*')
    .eq('entry_type', 'commitment')

  if (companyId) impQ = impQ.eq('company_id', companyId)
  if (status)    impQ = impQ.eq('status', status)
  if (flow)      impQ = impQ.eq('flow_type', flow)
  if (from)      impQ = impQ.gte('due_date', from)
  if (to)        impQ = impQ.lte('due_date', to)

  impQ = impQ
    .order('due_date', { ascending: true })
    .limit(500)

  const [{ data: items }, { data: companies }] = await Promise.all([
    impQ,
    supabase.from('companies').select('id, code, name').eq('is_active', true).order('name'),
  ])

  return (
    <ImpegniClient
      items={(items ?? []) as PaymentScheduleItem[]}
      companies={(companies ?? []) as Pick<Company, 'id' | 'code' | 'name'>[]}
    />
  )
}

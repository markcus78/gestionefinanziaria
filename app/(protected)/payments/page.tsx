import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import PaymentsClient from './payments-client'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const from = addDays(today, -30)
  const to = addDays(today, 15)

  const [
    { data: companies },
    { data: paymentsRaw },
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('id, code, name')
      .eq('is_active', true)
      .order('code'),
    supabase
      .from('payment_schedule')
      .select('id, company_id, supplier_name, account_description, due_date, amount_cents, status, entry_type, commitment_type, paid_amount_cents, paid_date, postponed_to, postpone_notes')
      .eq('flow_type', 'out')
      .gte('due_date', from)
      .lte('due_date', to)
      .neq('status', 'cancelled')
      .order('due_date'),
  ])

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="w-5 h-5 text-blue-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Pagamenti</h1>
      </div>

      <PaymentsClient
        companies={companies ?? []}
        payments={paymentsRaw ?? []}
        today={today}
        initialCompany={sp.company ?? ''}
      />
    </div>
  )
}

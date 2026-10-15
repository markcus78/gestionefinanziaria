import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import StaffClient from './staff-client'
import { loadPivaInvoiced } from '@/lib/piva-match'

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const selectedMonth = sp.month ?? today.slice(0, 7)

  const [
    { data: companies },
    { data: items },
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('id, code, name')
      .eq('is_active', true)
      .order('code'),
    supabase
      .from('payment_schedule')
      .select('id, company_id, supplier_name, account_description, due_date, amount_cents, status, commitment_type, paid_amount_cents, paid_date, reference_month, payment_transactions(id, paid_date, amount_cents, note, is_reconstructed)')
      .in('commitment_type', ['salary_item', 'collab_item', 'tax_item', 'extra_item', 'piva_item'])
      .eq('reference_month', selectedMonth)
      .neq('status', 'cancelled')
      .order('commitment_type')
      .order('supplier_name'),
  ])

  // Istruttori P.IVA con la fattura già arrivata dallo scadenzario: lì si paga la fattura
  const [y, m] = selectedMonth.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 7, 1)).toISOString().slice(0, 7)
  const invoiced = await loadPivaInvoiced(supabase, from)
  const shown = (items ?? []).map(i => {
    const inv = i.commitment_type === 'piva_item' ? invoiced.get(i.id) : undefined
    return { ...i, invoiced_doc: inv ? `${inv.doc ?? 'fattura'} del ${inv.date.split('-').reverse().join('/')}` : null }
  })

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Users className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Staff</h1>
      </div>

      <StaffClient
        companies={companies ?? []}
        items={shown}
        selectedMonth={selectedMonth}
        initialCompany={sp.company ?? ''}
        today={today}
      />
    </div>
  )
}

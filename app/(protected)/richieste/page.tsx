import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Inbox } from 'lucide-react'
import RichiesteClient, { type SpendRequest } from './richieste-client'

// Richieste di spesa: il quarto livello delle uscite. Non entrano nella cassa finché non sono
// approvate; approvate diventano impegni.
export default async function RichiestePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: companies }, { data: suppliers }, { data: requests }] = await Promise.all([
    supabase.from('companies').select('id, code, name').eq('is_active', true).order('code'),
    supabase.from('supplier_registry').select('id, company_id, supplier_name').order('supplier_name'),
    supabase.from('spend_requests').select('*').order('expected_date', { ascending: true }).limit(500),
  ])

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Inbox className="w-5 h-5 text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Richieste di spesa</h1>
      </div>
      <RichiesteClient
        companies={companies ?? []}
        suppliers={suppliers ?? []}
        requests={(requests ?? []) as SpendRequest[]}
      />
    </div>
  )
}

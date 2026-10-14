import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Calculator } from 'lucide-react'
import { EstimatesSection, type SupplierOption } from '../settings/treasury-section'
import type { Company, TreasuryEstimate } from '@/lib/types/database'

// Le stime: uno dei quattro livelli delle uscite (reali, impegni, stime, richieste), che si
// consumano quando arrivano i dati contabili. Sezione a sé accanto a Scadenzario e Impegni.
export default async function StimePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: companies }, { data: est }, { data: sup }] = await Promise.all([
    supabase.from('companies').select('*').eq('is_active', true).order('code'),
    supabase.from('treasury_estimates').select('*').order('kind').order('label'),
    supabase.from('supplier_registry').select('id, company_id, supplier_name').order('supplier_name'),
  ])

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Calculator className="w-5 h-5 text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Stime</h1>
      </div>
      <EstimatesSection
        companies={(companies ?? []) as Company[]}
        estimates={(est ?? []) as TreasuryEstimate[]}
        suppliers={(sup ?? []) as SupplierOption[]}
      />
    </div>
  )
}

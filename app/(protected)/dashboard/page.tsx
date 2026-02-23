import { createClient } from '@/lib/supabase/server'
import { LayoutDashboard } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('is_active', true)
    .order('code')

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <LayoutDashboard className="w-5 h-5 text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Dashboard</h1>
      </div>

      {/* KPI placeholder */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {(companies ?? []).map((company) => (
          <div key={company.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{company.code}</p>
            <p className="text-sm text-zinc-200 mt-0.5">{company.name}</p>
            <p className="text-xs text-zinc-500 mt-3">Dati non ancora disponibili</p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
        <p className="text-zinc-400 text-sm">
          Dashboard completa disponibile al termine della Fase 2 (import scadenzario).
        </p>
      </div>
    </div>
  )
}

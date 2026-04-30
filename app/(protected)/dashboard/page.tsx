import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import DashboardTable from './dashboard-table'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const dateFrom = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
  const dateTo   = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

  const [companiesResult, windowResult, overdueResult] = await Promise.all([
    supabase.from('companies').select('id, code, name').eq('is_active', true).order('code'),
    supabase
      .from('payment_schedule')
      .select('id, company_id, supplier_name, account_description, amount_cents, status, priority_score, priority_override, document_type, document_number, due_date')
      .gte('due_date', dateFrom)
      .lte('due_date', dateTo)
      .eq('entry_type', 'accounting')
      .eq('flow_type', 'out')
      .not('status', 'in', '("paid","cancelled")')
      .order('due_date', { ascending: true }),
    supabase
      .from('payment_schedule')
      .select('id, amount_cents')
      .eq('entry_type', 'accounting')
      .eq('flow_type', 'out')
      .lt('due_date', today)
      .not('status', 'in', '("paid","cancelled")'),
  ])

  const companies = companiesResult.data ?? []
  const windowPayments = windowResult.data ?? []
  const overdueItems = overdueResult.data ?? []

  const companyMap = Object.fromEntries(companies.map(c => [c.id, c.code]))
  const windowTotal = windowPayments.reduce((s, r) => s + Math.abs(r.amount_cents as number), 0)
  const overdueTotal = overdueItems.reduce((s, r) => s + Math.abs(r.amount_cents as number), 0)

  const todayFormatted = new Date(today + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100 capitalize">{todayFormatted}</h1>
      </div>

      {/* Banner scaduto */}
      {overdueItems.length > 0 && (
        <Link
          href="/schedule?flow=out&status=pending"
          className="flex items-center gap-3 px-4 py-3 bg-red-950/40 border border-red-800/50 rounded-xl hover:bg-red-950/60 transition-colors"
        >
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-300">
            <span className="font-semibold">{overdueItems.length} pagamenti scaduti</span>
            {' '}— totale {formatEur(overdueTotal)}
          </span>
          <span className="ml-auto text-xs text-red-500">Vai allo scadenzario →</span>
        </Link>
      )}

      {/* Tabella pagamenti ±3 giorni */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Pagamenti in scadenza <span className="text-zinc-500 font-normal">(±3 giorni)</span></h2>
          {windowPayments.length > 0 && (
            <span className="text-xs text-zinc-400">
              {windowPayments.length} voci · totale <span className="text-red-400 font-medium">{formatEur(windowTotal)}</span>
            </span>
          )}
        </div>

        {windowPayments.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-8 justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <p className="text-sm text-zinc-500">Nessun pagamento in scadenza nel periodo</p>
          </div>
        ) : (
          <DashboardTable
            rows={windowPayments.map(item => ({
              id: item.id,
              company_id: item.company_id as string,
              supplier_name: item.supplier_name as string | null,
              account_description: item.account_description as string | null,
              amount_cents: item.amount_cents as number,
              status: item.status as 'pending' | 'scheduled' | 'paid' | 'partial' | 'postponed' | 'disputed' | 'cancelled',
              document_type: item.document_type as string | null,
              document_number: item.document_number as string | null,
              due_date: item.due_date as string,
            }))}
            today={today}
            companyMap={companyMap}
            windowTotal={windowTotal}
          />
        )}
      </div>

      <div className="text-right">
        <Link href="/schedule" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          Vai allo scadenzario completo →
        </Link>
      </div>
    </div>
  )
}

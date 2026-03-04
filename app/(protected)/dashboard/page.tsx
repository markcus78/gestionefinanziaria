import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { PaymentStatus } from '@/lib/types/database'

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; cls: string }> = {
    pending:   { label: 'Pendente',    cls: 'bg-amber-500/20 text-amber-400' },
    scheduled: { label: 'Programmato', cls: 'bg-blue-500/20 text-blue-400' },
    paid:      { label: 'Pagato',      cls: 'bg-emerald-500/20 text-emerald-400' },
    postponed: { label: 'Posticipato', cls: 'bg-purple-500/20 text-purple-400' },
    disputed:  { label: 'Contestato',  cls: 'bg-red-500/20 text-red-400' },
    cancelled: { label: 'Annullato',   cls: 'bg-zinc-700 text-zinc-400' },
  }
  const { label, cls } = map[status] ?? map.pending
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [companiesResult, todayResult, overdueResult] = await Promise.all([
    supabase.from('companies').select('id, code, name').eq('is_active', true).order('code'),
    supabase
      .from('payment_schedule')
      .select('id, company_id, supplier_name, account_description, amount_cents, status, priority_score, priority_override, document_type, document_number')
      .eq('due_date', today)
      .eq('entry_type', 'accounting')
      .eq('flow_type', 'out')
      .not('status', 'in', '("paid","cancelled")')
      .order('priority_score', { ascending: false, nullsFirst: false }),
    supabase
      .from('payment_schedule')
      .select('id, amount_cents')
      .eq('entry_type', 'accounting')
      .eq('flow_type', 'out')
      .lt('due_date', today)
      .not('status', 'in', '("paid","cancelled")'),
  ])

  const companies = companiesResult.data ?? []
  const todayPayments = todayResult.data ?? []
  const overdueItems = overdueResult.data ?? []

  const companyMap = Object.fromEntries(companies.map(c => [c.id, c.code]))
  const todayTotal = todayPayments.reduce((s, r) => s + Math.abs(r.amount_cents as number), 0)
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

      {/* Tabella pagamenti di oggi */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Pagamenti di oggi</h2>
          {todayPayments.length > 0 && (
            <span className="text-xs text-zinc-400">
              {todayPayments.length} voci · totale <span className="text-red-400 font-medium">{formatEur(todayTotal)}</span>
            </span>
          )}
        </div>

        {todayPayments.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-8 justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <p className="text-sm text-zinc-500">Nessun pagamento in scadenza oggi</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="text-left px-4 py-2.5 font-medium">Soc.</th>
                  <th className="text-left px-4 py-2.5 font-medium">Fornitore / Descrizione</th>
                  <th className="text-left px-4 py-2.5 font-medium">Documento</th>
                  <th className="text-right px-4 py-2.5 font-medium">Importo</th>
                  <th className="text-left px-4 py-2.5 font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {todayPayments.map(item => (
                  <tr key={item.id} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">
                        {companyMap[item.company_id as string] ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-200 max-w-xs truncate">
                      {(item.supplier_name as string) || (item.account_description as string) || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 font-mono">
                      {item.document_number as string || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-red-400">
                      -{formatEur(Math.abs(item.amount_cents as number))}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={item.status as PaymentStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 bg-zinc-800/50">
                  <td colSpan={3} className="px-4 py-2.5 text-xs text-zinc-400 font-medium">Totale</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-red-400">
                    -{formatEur(todayTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
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

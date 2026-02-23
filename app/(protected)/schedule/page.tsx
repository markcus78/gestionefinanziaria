import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react'
import ScheduleFilters from './schedule-filters'
import RowActions from './row-actions'
import SuppliersTab from './suppliers-tab'
import type { PaymentScheduleItem, PaymentStatus } from '@/lib/types/database'

const PAGE_SIZE = 50

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
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>
  )
}

function PriorityBadge({ score }: { score: number | null }) {
  if (score === null) return null
  const cls =
    score >= 12 ? 'bg-red-500/20 text-red-400' :
    score >= 8  ? 'bg-orange-500/20 text-orange-400' :
    score >= 5  ? 'bg-amber-500/20 text-amber-400' :
                  'bg-zinc-700 text-zinc-400'
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${cls}`}>{score}</span>
  )
}

function dueDateClass(dueDate: string, status: PaymentStatus): string {
  if (status === 'paid' || status === 'cancelled') return 'text-zinc-500'
  const today = new Date().toISOString().split('T')[0]
  if (dueDate < today) return 'text-red-400 font-semibold'
  const d7 = new Date(); d7.setDate(d7.getDate() + 7)
  if (dueDate <= d7.toISOString().split('T')[0]) return 'text-amber-400'
  return 'text-zinc-300'
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tab = sp.tab ?? 'schedule'
  const companyId = sp.company ?? ''
  const status = sp.status ?? ''
  const flow = sp.flow ?? ''
  const from = sp.from ?? ''
  const to = sp.to ?? ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))

  // Fetch companies for filter
  const { data: companies } = await supabase
    .from('companies')
    .select('id, code, name')
    .eq('is_active', true)
    .order('name')

  // --- SUPPLIERS TAB ---
  if (tab === 'suppliers') {
    let q = supabase
      .from('supplier_registry')
      .select('*')
      .order('supplier_name')
    if (companyId) q = q.eq('company_id', companyId)
    const { data: suppliers } = await q

    return (
      <div className="p-6 max-w-6xl">
        <Header />
        <ScheduleFilters companies={companies ?? []} />
        <SuppliersTab suppliers={suppliers ?? []} />
      </div>
    )
  }

  // --- SCHEDULE TAB ---
  let q = supabase
    .from('payment_schedule')
    .select('*', { count: 'exact' })

  if (companyId) q = q.eq('company_id', companyId)
  if (status) q = q.eq('status', status)
  if (flow) q = q.eq('flow_type', flow)
  if (from) q = q.gte('due_date', from)
  if (to) q = q.lte('due_date', to)

  q = q
    .order('due_date', { ascending: true })
    .order('priority_score', { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data: items, count } = await q

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)
  const rows = (items ?? []) as PaymentScheduleItem[]

  // Stats for current result set
  const totalOut = rows.filter(r => r.flow_type === 'out').reduce((s, r) => s + Math.abs(r.amount_cents), 0)
  const totalIn = rows.filter(r => r.flow_type === 'in').reduce((s, r) => s + Math.abs(r.amount_cents), 0)
  const overdueCount = rows.filter(r => {
    const today = new Date().toISOString().split('T')[0]
    return r.due_date < today && r.flow_type === 'out' && r.status !== 'paid' && r.status !== 'cancelled'
  }).length

  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams(sp)
    params.set('page', String(p))
    return `/schedule?${params.toString()}`
  }

  return (
    <div className="p-6 max-w-6xl">
      <Header />
      <ScheduleFilters companies={companies ?? []} />

      {/* Summary strip */}
      {rows.length > 0 && (
        <div className="flex items-center gap-5 mb-4 text-xs text-zinc-400">
          <span>{count} righe{totalPages > 1 ? ` (pag. ${page}/${totalPages})` : ''}</span>
          {(flow === '' || flow === 'out') && (
            <span>Uscite: <span className="text-red-400 font-medium">{formatEur(totalOut)}</span></span>
          )}
          {(flow === '' || flow === 'in') && (
            <span>Entrate: <span className="text-emerald-400 font-medium">{formatEur(totalIn)}</span></span>
          )}
          {overdueCount > 0 && (
            <span className="text-red-400">{overdueCount} scadute</span>
          )}
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-zinc-500 text-sm">
            {!companyId && !status && !flow && !from && !to
              ? 'Seleziona una società o importa il primo scadenzario XLS.'
              : 'Nessun risultato con i filtri applicati.'}
          </p>
          {!companyId && !status && !flow && !from && !to && (
            <Link
              href="/schedule/import"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Importa XLS
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">P</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Scadenza</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Fornitore</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Documento</th>
                  <th className="text-right px-3 py-2.5 text-zinc-400 font-medium">Importo</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Stato</th>
                  <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Tipo</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(item => (
                  <tr key={item.id} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
                    <td className="px-3 py-2">
                      <PriorityBadge score={item.priority_override ?? item.priority_score} />
                    </td>
                    <td className={`px-3 py-2 font-mono ${dueDateClass(item.due_date, item.status)}`}>
                      {new Date(item.due_date + 'T00:00:00').toLocaleDateString('it-IT')}
                      {item.postponed_to && (
                        <span className="ml-1 text-purple-400">→ {new Date(item.postponed_to + 'T00:00:00').toLocaleDateString('it-IT')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-44">
                      <span className="text-zinc-200 block truncate">{item.supplier_name ?? '—'}</span>
                      {item.is_intercompany && (
                        <span className="text-amber-400 text-xs">IC</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {item.document_type && (
                        <span className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-300 mr-1">{item.document_type}</span>
                      )}
                      <span className="font-mono">{item.document_number ?? '—'}</span>
                    </td>
                    <td className={`px-3 py-2 text-right font-medium tabular-nums ${item.flow_type === 'out' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {item.flow_type === 'out' ? '-' : '+'}{formatEur(Math.abs(item.amount_cents))}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={item.status} />
                      {item.paid_date && (
                        <span className="text-zinc-500 ml-1">
                          {new Date(item.paid_date + 'T00:00:00').toLocaleDateString('it-IT')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${item.entry_type === 'accounting' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                        {item.entry_type === 'accounting' ? 'cont.' : 'imp.'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <RowActions item={item} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 text-xs text-zinc-400">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count ?? 0)} di {count}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={buildPageUrl(page - 1)} className="p-1 hover:text-zinc-200 hover:bg-zinc-800 rounded">
                    <ChevronLeft className="w-4 h-4" />
                  </Link>
                ) : (
                  <span className="p-1 opacity-30"><ChevronLeft className="w-4 h-4" /></span>
                )}
                <span>Pag. {page}/{totalPages}</span>
                {page < totalPages ? (
                  <Link href={buildPageUrl(page + 1)} className="p-1 hover:text-zinc-200 hover:bg-zinc-800 rounded">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <span className="p-1 opacity-30"><ChevronRight className="w-4 h-4" /></span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-lg font-semibold text-zinc-100">Scadenzario</h1>
      <Link
        href="/schedule/import"
        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
      >
        <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
        Importa XLS
      </Link>
    </div>
  )
}

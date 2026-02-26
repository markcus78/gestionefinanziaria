import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet } from 'lucide-react'
import ScheduleFilters from './schedule-filters'
import ScheduleGrouped from './schedule-grouped'
import SuppliersTab from './suppliers-tab'
import type { PaymentScheduleItem } from '@/lib/types/database'

export type SupplierAgg = {
  overdueCents: number
  due7dCents: number
  due30dCents: number
  due90dCents: number
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function isoAddDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
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

  const tab        = sp.tab         ?? 'schedule'
  const companyId  = sp.company     ?? ''
  const status     = sp.status      ?? ''
  const flow       = sp.flow        ?? ''
  const from       = sp.from        ?? ''
  const to         = sp.to          ?? ''
  const search     = sp.q           ?? ''
  const supplierId = sp.supplier_id ?? ''

  // Fetch companies for filter
  const { data: companies } = await supabase
    .from('companies')
    .select('id, code, name')
    .eq('is_active', true)
    .order('name')

  // ── SUPPLIERS TAB ────────────────────────────────────────────────────────
  if (tab === 'suppliers') {
    let suppQ = supabase.from('supplier_registry').select('*').order('supplier_name')
    if (companyId) suppQ = suppQ.eq('company_id', companyId)
    const { data: suppliers } = await suppQ

    // Aggregate pending out flows per supplier
    let aggQ = supabase
      .from('payment_schedule')
      .select('supplier_id, due_date, amount_cents')
      .eq('flow_type', 'out')
      .not('status', 'in', '("paid","cancelled")')
    if (companyId) aggQ = aggQ.eq('company_id', companyId)
    const { data: aggRows } = await aggQ

    const today = new Date().toISOString().split('T')[0]
    const d7    = isoAddDays(7)
    const d30   = isoAddDays(30)
    const d90   = isoAddDays(90)

    const agg: Record<string, SupplierAgg> = {}
    for (const row of (aggRows ?? [])) {
      if (!row.supplier_id) continue
      if (!agg[row.supplier_id]) {
        agg[row.supplier_id] = { overdueCents: 0, due7dCents: 0, due30dCents: 0, due90dCents: 0 }
      }
      const amount = Math.abs(row.amount_cents as number)
      const a = agg[row.supplier_id]
      if ((row.due_date as string) < today)       a.overdueCents += amount
      else if ((row.due_date as string) <= d7)    a.due7dCents   += amount
      else if ((row.due_date as string) <= d30)   a.due30dCents  += amount
      else if ((row.due_date as string) <= d90)   a.due90dCents  += amount
    }

    return (
      <div className="p-6 max-w-6xl">
        <Header />
        <ScheduleFilters companies={companies ?? []} />
        <SuppliersTab suppliers={suppliers ?? []} agg={agg} />
      </div>
    )
  }

  // ── SCHEDULE TAB ─────────────────────────────────────────────────────────
  let dbq = supabase
    .from('payment_schedule')
    .select('*')

  if (companyId)  dbq = dbq.eq('company_id', companyId)
  if (status)     dbq = dbq.eq('status', status)
  if (flow)       dbq = dbq.eq('flow_type', flow)
  if (from)       dbq = dbq.gte('due_date', from)
  if (to)         dbq = dbq.lte('due_date', to)
  if (supplierId) dbq = dbq.eq('supplier_id', supplierId)
  if (search)     dbq = dbq.or(`supplier_name.ilike.%${search}%,account_description.ilike.%${search}%`)

  dbq = dbq
    .order('due_date', { ascending: true })
    .order('priority_score', { ascending: false, nullsFirst: false })
    .limit(1000)

  const { data: items } = await dbq

  const rows = (items ?? []) as PaymentScheduleItem[]

  const totalOut = rows.filter(r => r.flow_type === 'out').reduce((s, r) => s + Math.abs(r.amount_cents), 0)
  const totalIn  = rows.filter(r => r.flow_type === 'in').reduce((s, r)  => s + Math.abs(r.amount_cents), 0)
  const today    = new Date().toISOString().split('T')[0]
  const overdueCount = rows.filter(r =>
    r.due_date < today && r.flow_type === 'out' && r.status !== 'paid' && r.status !== 'cancelled'
  ).length

  return (
    <div className="p-6 max-w-6xl">
      <Header />
      <ScheduleFilters companies={companies ?? []} />

      {/* Summary strip */}
      {rows.length > 0 && (
        <div className="flex items-center gap-5 mb-4 text-xs text-zinc-400">
          <span>{rows.length} voci</span>
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

      {/* Grouped view */}
      {rows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-zinc-500 text-sm">
            {!companyId && !status && !flow && !from && !to && !search
              ? 'Seleziona una società o importa il primo scadenzario XLS.'
              : 'Nessun risultato con i filtri applicati.'}
          </p>
          {!companyId && !status && !flow && !from && !to && !search && (
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
        <ScheduleGrouped rows={rows} today={today} />
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

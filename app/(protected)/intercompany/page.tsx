import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GitMerge } from 'lucide-react'
import IntercompanyClient from './intercompany-client'

export type ICRow = {
  id: string
  company_id: string
  company_code: string
  counterpart_company_id: string | null
  counterpart_code: string | null
  supplier_name: string | null
  account_description: string | null
  due_date: string
  amount_cents: number
  flow_type: 'in' | 'out'
  status: string
}

export type NettingPair = {
  key: string
  company_a: { id: string; code: string; name: string }
  company_b: { id: string; code: string; name: string }
  a_to_b_cents: number           // A deve a B
  b_to_a_cents: number           // B deve ad A
  net_cents: number              // positivo = A è ancora debitore netto
  a_to_b_item_ids: string[]
  b_to_a_item_ids: string[]
}

export type NettingHistoryItem = {
  id: string
  netting_date: string
  total_compensated_cents: number | null
  details: Record<string, unknown> | null
  created_at: string
}

export default async function IntercompanyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tab = sp.tab ?? 'partite'

  const [
    { data: companies },
    { data: icRowsRaw },
    { data: nettingsRaw },
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('id, code, name')
      .eq('is_active', true)
      .order('code'),
    supabase
      .from('payment_schedule')
      .select('id, company_id, counterpart_company_id, supplier_name, account_description, due_date, amount_cents, flow_type, status')
      .eq('is_intercompany', true)
      .in('status', ['pending', 'scheduled', 'postponed', 'disputed'])
      .order('due_date'),
    supabase
      .from('intercompany_nettings')
      .select('*')
      .order('netting_date', { ascending: false })
      .limit(50),
  ])

  const allCompanies = (companies ?? []) as Array<{ id: string; code: string; name: string }>
  const byId = new Map(allCompanies.map(c => [c.id, c]))

  // Arricchisci le righe IC con i codici società
  const icRows: ICRow[] = (icRowsRaw ?? []).map(r => ({
    id: r.id,
    company_id: r.company_id,
    company_code: byId.get(r.company_id)?.code ?? '??',
    counterpart_company_id: r.counterpart_company_id,
    counterpart_code: r.counterpart_company_id
      ? (byId.get(r.counterpart_company_id)?.code ?? '?')
      : null,
    supplier_name: r.supplier_name,
    account_description: r.account_description,
    due_date: r.due_date,
    amount_cents: r.amount_cents,
    flow_type: r.flow_type as 'in' | 'out',
    status: r.status,
  }))

  // Calcola coppie di netting (solo flow_type='out', controparte mappata)
  type PairAccum = {
    a: { id: string; code: string; name: string }
    b: { id: string; code: string; name: string }
    a_to_b: number
    b_to_a: number
    a_to_b_ids: string[]
    b_to_a_ids: string[]
  }
  const pairMap = new Map<string, PairAccum>()

  for (const row of icRows) {
    if (row.flow_type !== 'out') continue
    if (!row.counterpart_company_id) continue
    const compA = byId.get(row.company_id)
    const compB = byId.get(row.counterpart_company_id)
    if (!compA || !compB) continue

    // Ordinamento canonico: ID minore = "a"
    const [aId, bId] =
      row.company_id < row.counterpart_company_id
        ? [row.company_id, row.counterpart_company_id]
        : [row.counterpart_company_id, row.company_id]
    const key = `${aId}|${bId}`

    if (!pairMap.has(key)) {
      pairMap.set(key, {
        a: byId.get(aId)!,
        b: byId.get(bId)!,
        a_to_b: 0, b_to_a: 0,
        a_to_b_ids: [], b_to_a_ids: [],
      })
    }
    const pair = pairMap.get(key)!
    if (row.company_id === aId) {
      pair.a_to_b += row.amount_cents
      pair.a_to_b_ids.push(row.id)
    } else {
      pair.b_to_a += row.amount_cents
      pair.b_to_a_ids.push(row.id)
    }
  }

  const nettingPairs: NettingPair[] = Array.from(pairMap.entries())
    .map(([key, p]) => ({
      key,
      company_a: p.a,
      company_b: p.b,
      a_to_b_cents: p.a_to_b,
      b_to_a_cents: p.b_to_a,
      net_cents: p.a_to_b - p.b_to_a,
      a_to_b_item_ids: p.a_to_b_ids,
      b_to_a_item_ids: p.b_to_a_ids,
    }))
    .filter(p => p.a_to_b_cents > 0 || p.b_to_a_cents > 0)
    .sort((a, b) => a.company_a.code.localeCompare(b.company_a.code))

  const history: NettingHistoryItem[] = (nettingsRaw ?? []).map(n => ({
    id: n.id,
    netting_date: n.netting_date,
    total_compensated_cents: n.total_compensated_cents,
    details: n.details as Record<string, unknown> | null,
    created_at: n.created_at,
  }))

  const unmappedCount = icRows.filter(
    r => r.flow_type === 'out' && !r.counterpart_company_id
  ).length

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <GitMerge className="w-5 h-5 text-cyan-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Intercompany</h1>
        {icRows.length > 0 && (
          <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full">
            {icRows.length} partite attive
          </span>
        )}
      </div>

      <IntercompanyClient
        tab={tab}
        icRows={icRows}
        nettingPairs={nettingPairs}
        history={history}
        unmappedCount={unmappedCount}
      />
    </div>
  )
}

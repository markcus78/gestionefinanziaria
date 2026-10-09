import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Landmark } from 'lucide-react'
import TreasuryClient from './treasury-client'
import {
  todayRome, buildDecades, computeBlock, sumBlocks, allocateWindow, suggestPct, groupBacklog, activeInstallments,
  type BlockCode, type BlockResult, type Estimate, type OutRow, type WindowResult,
  type BacklogItemRow, type BacklogInstallmentRow, type DecadeIdx, type Installment,
} from '@/lib/decadi'
import type { BankAccount } from '@/lib/types/database'

const DECADI = 9
const COFFA_MAX_AGE_DAYS = 3
const STAFF_TYPES = ['salary_item', 'extra_item', 'collab_item', 'piva_item', 'tax_item']
const BLOCKS: { code: BlockCode; label: string }[] = [
  { code: 'APPIAE', label: 'Appiae' },
  { code: 'HANGAR', label: 'Hangar' },
  { code: 'WT_ARIES', label: 'WT e Aries' },
]

type OpenRow = {
  id: string; company_id: string; supplier_id: string | null; supplier_name: string | null; due_date: string; postponed_to: string | null
  amount_cents: number; paid_amount_cents: number | null; payment_method: string | null; entry_type: string
  commitment_type: string | null; document_number: string | null; is_intercompany: boolean | null
  supplier_registry: { category: string | null; exclude_from_treasury: boolean } | null
}

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = todayRome()
  const decades = buildDecades(today, DECADI)
  const firstDay = decades[0].from
  const lastDay = decades[decades.length - 1].to
  const months = [...new Set(decades.map(d => d.month))]

  const [
    { data: companies },
    { data: accounts },
    { data: estimatesRaw },
    { data: overridesRaw },
    { data: settings },
    { data: forecastsRaw },
    { data: snapshot },
    { data: staffRaw },
    { data: pctRaw },
    { data: noticesRaw },
    { data: backlogItemsRaw },
    { data: backlogQuotesRaw },
  ] = await Promise.all([
    supabase.from('companies').select('id, code, name, minimum_cash_threshold_cents, treasury_block, backlog_before').eq('is_active', true).order('code'),
    supabase.from('bank_accounts').select('*').eq('is_active', true).order('company_id'),
    supabase.from('treasury_estimates').select('*').eq('active', true),
    supabase.from('treasury_estimate_overrides').select('estimate_id, month, idx, amount_cents').in('month', months),
    supabase.from('treasury_settings').select('group_threshold_cents').maybeSingle(),
    supabase.from('monthly_revenue_forecasts').select('company_id, year, month, forecast_gross_cents').is('channel_id', null),
    supabase.from('coffa_snapshots').select('snapshot_date, received_at').order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('payment_schedule')
      .select('company_id, commitment_type, due_date, postponed_to, document_number')
      .eq('entry_type', 'commitment').in('commitment_type', STAFF_TYPES).neq('status', 'cancelled')
      .gte('due_date', firstDay.slice(0, 8) + '01').lte('due_date', lastDay),
    supabase.from('treasury_window_pct').select('month, idx, pct').in('month', months),
    supabase.from('supplier_notices').select('supplier_key, display_name, notified, notified_at'),
    supabase.from('backlog_items').select('id, company_id, creditor_key, decision, agreed_cents, notes'),
    supabase.from('backlog_installments').select('id, item_id, month, idx, amount_cents, paid_at'),
  ])

  // Uscite aperte: oltre 1000 righe, quindi a pagine
  const openRows: OpenRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('payment_schedule')
      .select('id, company_id, supplier_id, supplier_name, due_date, postponed_to, amount_cents, paid_amount_cents, payment_method, entry_type, commitment_type, document_number, is_intercompany, supplier_registry(category, exclude_from_treasury)')
      .eq('flow_type', 'out')
      .in('status', ['pending', 'scheduled', 'partial', 'postponed'])
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    openRows.push(...((data ?? []) as unknown as OpenRow[]))
    if (!data || data.length < 1000) break
  }

  const coffaFresh = snapshot
    && (Date.parse(today) - Date.parse(snapshot.snapshot_date)) / 86400000 <= COFFA_MAX_AGE_DAYS
  let coffa: { days: Map<string, number>; months: Map<string, number> } | null = null
  if (snapshot && coffaFresh) {
    const [{ data: days }, { data: cm }] = await Promise.all([
      supabase.from('coffa_cash_days').select('day, incassato_cents, da_incassare_cents, da_arrivare_cents').eq('snapshot_date', snapshot.snapshot_date),
      supabase.from('coffa_cash_months').select('month, atteso_cents').eq('snapshot_date', snapshot.snapshot_date),
    ])
    coffa = {
      days: new Map((days ?? []).map(d => [d.day, d.incassato_cents + d.da_incassare_cents + d.da_arrivare_cents])),
      months: new Map((cm ?? []).map(m => [m.month.slice(0, 7), m.atteso_cents])),
    }
  }

  const allCompanies = companies ?? []
  const estimates: Estimate[] = (estimatesRaw ?? []).map(e => ({
    id: e.id, companyId: e.company_id, label: e.label, kind: e.kind, category: e.category,
    monthlyCents: e.monthly_cents, pct: [Number(e.pct_d1), Number(e.pct_d2), Number(e.pct_d3)],
    replacedBy: e.replaced_by ?? [],
  }))
  const overrides = new Map((overridesRaw ?? []).map(o => [`${o.estimate_id}|${o.month}|${o.idx}`, o.amount_cents]))
  const realStaff = new Set((staffRaw ?? [])
    .filter(r => !r.document_number?.startsWith('BDG-'))
    .map(r => `${r.company_id}|${r.commitment_type}|${(r.postponed_to ?? r.due_date).slice(0, 7)}`))
  const manualRevenue = new Map((forecastsRaw ?? []).map(f =>
    [`${f.company_id}|${f.year}-${String(f.month).padStart(2, '0')}`, f.forecast_gross_cents]))
  const backlogBefore = new Map(allCompanies.map(c => [c.id, c.backlog_before as string | null]))

  const rows: OutRow[] = openRows.map(r => ({
    id: r.id,
    companyId: r.company_id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    supplierCategory: r.supplier_registry?.category ?? null,
    excludeFromTreasury: r.supplier_registry?.exclude_from_treasury ?? false,
    dueDate: r.due_date,
    postponedTo: r.postponed_to,
    residualCents: Math.max(0, Math.abs(r.amount_cents) - (r.paid_amount_cents ?? 0)),
    paymentMethod: r.payment_method,
    entryType: r.entry_type === 'commitment' ? 'commitment' : 'accounting',
    commitmentType: r.commitment_type,
    documentNumber: r.document_number,
    isIntercompany: r.is_intercompany ?? false,
  }))

  const allAccounts = (accounts ?? []) as BankAccount[]
  const backlogItems: BacklogItemRow[] = (backlogItemsRaw ?? []).map(i => ({
    id: i.id, companyId: i.company_id, creditorKey: i.creditor_key, decision: i.decision,
    agreedCents: i.agreed_cents, notes: i.notes,
  }))
  const backlogQuotes: BacklogInstallmentRow[] = (backlogQuotesRaw ?? []).map(q => ({
    id: q.id, itemId: q.item_id, month: q.month, idx: q.idx as DecadeIdx, cents: q.amount_cents, paidAt: q.paid_at,
  }))

  // Due giri: il primo dà l'arretrato (che non dipende dalle quote), il secondo mette le quote nel cruscotto
  const computeAll = (installments: Installment[]) => BLOCKS.map(b => {
    const comps = allCompanies.filter(c => c.treasury_block === b.code)
    const ids = comps.map(c => c.id)
    const accs = allAccounts.filter(a => ids.includes(a.company_id))
    const dates = accs.map(a => a.balance_date).filter((d): d is string => !!d).sort()
    return computeBlock({
      code: b.code, label: b.label, companyIds: ids,
      balanceCents: accs.reduce((s, a) => s + a.current_balance_cents, 0),
      creditLineCents: accs.reduce((s, a) => s + (a.credit_line_cents ?? 0), 0),
      balanceDate: dates.length ? dates[dates.length - 1] : null,
      balanceDatesDiffer: new Set(dates).size > 1,
      thresholdCents: comps.reduce((s, c) => s + (c.minimum_cash_threshold_cents ?? 0), 0),
      today, backlogBefore,
      rows: rows.filter(r => ids.includes(r.companyId)),
      estimates, overrides, realStaff, manualRevenue, coffa, installments,
    }, decades)
  })
  const creditors = groupBacklog(computeAll([]).flatMap(b => b.stockItems), backlogItems, backlogQuotes)
  const blocks: BlockResult[] = computeAll(activeInstallments(creditors))
  const group = sumBlocks(blocks, settings?.group_threshold_cents ?? 500000)

  // La percentuale della finestra si decide sul gruppo e vale uguale per ogni blocco
  const decise = new Map((pctRaw ?? []).map(r => [`${r.month}|${r.idx}`, Number(r.pct) / 100]))
  const groupWindow = allocateWindow(group, (i, disponibile, dovuto) => ({
    suggerita: suggestPct(disponibile, dovuto),
    decisa: decise.get(decades[i].key) ?? null,
  }))
  const windows: Record<string, WindowResult> = { GRUPPO: groupWindow }
  for (const b of blocks) {
    windows[b.code] = allocateWindow(b, i => ({ suggerita: groupWindow.decades[i].applicata, decisa: null }))
  }

  const view = (sp.block && BLOCKS.some(b => b.code === sp.block)) ? sp.block : 'GRUPPO'
  const shown = view === 'GRUPPO' ? group : blocks.find(b => b.code === view)!
  const blockOfCompany = new Map(allCompanies.map(c => [c.id, c.treasury_block as string | null]))
  const creditorsShown = view === 'GRUPPO' ? creditors : creditors.filter(c => blockOfCompany.get(c.companyId) === view)
  const accountsShown = view === 'GRUPPO'
    ? allAccounts
    : allAccounts.filter(a => allCompanies.some(c => c.id === a.company_id && c.treasury_block === view))

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-center gap-3 mb-6">
        <Landmark className="w-5 h-5 text-blue-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Tesoreria a decadi</h1>
      </div>

      <TreasuryClient
        view={view}
        blocks={BLOCKS}
        result={shown}
        window={windows[view]}
        notices={(noticesRaw ?? []).map(n => ({ key: n.supplier_key, notified: n.notified, notifiedAt: n.notified_at }))}
        subBlocks={view === 'GRUPPO' ? blocks : []}
        subWindows={view === 'GRUPPO' ? blocks.map(b => windows[b.code]) : []}
        creditors={creditorsShown}
        accounts={accountsShown}
        companies={allCompanies.map(c => ({ id: c.id, code: c.code }))}
        today={today}
        coffa={snapshot ? { date: snapshot.snapshot_date, fresh: !!coffaFresh } : null}
      />
    </div>
  )
}

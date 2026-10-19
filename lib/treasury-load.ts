// Calcolo della Tesoreria a decadi: letture dal database e cruscotto per blocco e gruppo.
// Lo usano la pagina Tesoreria e la pagina Pagamenti della decade, così i numeri sono gli stessi.
import { loadPivaInvoiced } from '@/lib/piva-match'
import type { createClient } from '@/lib/supabase/server'
import {
  todayRome, buildDecades, computeBlock, sumBlocks, allocateWindow, suggestPct, groupBacklog, activeInstallments,
  addDays, MURO_COMMITMENT_TYPES, plannedRemaining, paidByKey,
  type Transfer, type PlanSupplier, type DecadeTx, type MonthInvoice, type BlockCode, type BlockResult, type Estimate, type OutRow, type WindowResult, type RealIncasso, type PaidMove,
  type BacklogItemRow, type BacklogInstallmentRow, type DecadeIdx, type Installment,
} from '@/lib/decadi'
import type { BankAccount } from '@/lib/types/database'

type Supa = Awaited<ReturnType<typeof createClient>>

export const DECADI = 9
const COFFA_MAX_AGE_DAYS = 3
export const BLOCKS: { code: BlockCode; label: string }[] = [
  { code: 'APPIAE', label: 'Appiae' },
  { code: 'HANGAR', label: 'Hangar' },
  { code: 'WT_ARIES', label: 'WT e Aries' },
]

type OpenRow = {
  id: string; company_id: string; supplier_id: string | null; supplier_name: string | null; due_date: string; postponed_to: string | null
  amount_cents: number; paid_amount_cents: number | null; payment_method: string | null; entry_type: string
  commitment_type: string | null; document_number: string | null; is_intercompany: boolean | null
  supplier_registry: { category: string | null; exclude_from_treasury: boolean; treasury_as_staff: boolean; treasury_installments_only: boolean } | null
}

export async function loadTreasury(supabase: Supa) {
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
    { data: requestsRaw },
  ] = await Promise.all([
    supabase.from('companies').select('id, code, name, minimum_cash_threshold_cents, treasury_block, backlog_before').eq('is_active', true).order('code'),
    supabase.from('bank_accounts').select('*').eq('is_active', true).order('company_id'),
    supabase.from('treasury_estimates').select('*').eq('active', true),
    supabase.from('treasury_estimate_overrides').select('estimate_id, month, idx, amount_cents').in('month', months),
    supabase.from('treasury_settings').select('group_threshold_cents').maybeSingle(),
    supabase.from('monthly_revenue_forecasts').select('company_id, year, month, forecast_gross_cents').is('channel_id', null),
    supabase.from('coffa_snapshots').select('snapshot_date, received_at').order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('payment_schedule')
      .select('company_id, commitment_type, due_date, postponed_to, document_number, amount_cents')
      .eq('entry_type', 'commitment').in('commitment_type', MURO_COMMITMENT_TYPES).neq('status', 'cancelled')
      .gte('due_date', firstDay.slice(0, 8) + '01').lte('due_date', lastDay),
    supabase.from('treasury_window_pct').select('month, idx, pct').in('month', months),
    supabase.from('supplier_notices').select('supplier_key, display_name, notified, notified_at'),
    supabase.from('backlog_items').select('id, company_id, creditor_key, decision, agreed_cents, notes'),
    supabase.from('backlog_installments').select('id, item_id, month, idx, amount_cents, paid_at'),
    supabase.from('spend_requests').select('company_id, supplier_name, description, amount_cents, expected_date').eq('status', 'in_attesa'),
  ])

  // Uscite aperte: oltre 1000 righe, quindi a pagine
  const openRows: OpenRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('payment_schedule')
      .select('id, company_id, supplier_id, supplier_name, due_date, postponed_to, amount_cents, paid_amount_cents, payment_method, entry_type, commitment_type, document_number, is_intercompany, supplier_registry(category, exclude_from_treasury, treasury_as_staff, treasury_installments_only)')
      .eq('flow_type', 'out')
      .in('status', ['pending', 'scheduled', 'partial', 'postponed'])
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    openRows.push(...((data ?? []) as unknown as OpenRow[]))
    if (!data || data.length < 1000) break
  }

  // Incassi registrati da Orianna e pagamenti registrati dopo il saldo più vecchio
  const minBalance = ((accounts ?? []) as BankAccount[]).map(a => a.balance_date).filter((d): d is string => !!d).sort()[0]
    ?? addDays(firstDay, -30)
  const [{ data: collRaw, error: collErr }, { data: paidRaw, error: paidErr }, { data: cashCountRaw }] = await Promise.all([
    supabase.from('daily_collections')
      .select('company_id, channel_id, collection_date, gross_amount_cents, net_amount_cents, settlement_expected_date, settled_date, cash_channels(name)')
      .gte('collection_date', addDays(minBalance < firstDay ? minBalance : firstDay, -40)),
    supabase.from('payment_transactions')
      .select('paid_date, amount_cents, payment_schedule!inner(company_id, supplier_name, flow_type)')
      .gt('paid_date', minBalance).eq('payment_schedule.flow_type', 'out'),
    // canali Contanti che si versano in banca e quindi contano (Hangar, regola del 19/10)
    supabase.from('company_cash_channels').select('company_id, channel_id').eq('cash_counts_in_treasury', true),
  ])
  if (collErr) throw new Error(collErr.message)
  if (paidErr) throw new Error(paidErr.message)
  type CollRow = {
    company_id: string; channel_id: string; collection_date: string; gross_amount_cents: number; net_amount_cents: number | null
    settlement_expected_date: string | null; settled_date: string | null; cash_channels: { name: string } | null
  }
  const cashCounts = new Set((cashCountRaw ?? []).map(c => `${c.company_id}|${c.channel_id}`))
  const realIncassi: RealIncasso[] = ((collRaw ?? []) as unknown as CollRow[]).map(c => ({
    companyId: c.company_id,
    channel: c.cash_channels?.name ?? '—',
    saleDate: c.collection_date,
    arrival: c.settlement_expected_date ?? c.settled_date ?? c.collection_date,
    cents: c.net_amount_cents ?? c.gross_amount_cents,
    cashCounts: cashCounts.has(`${c.company_id}|${c.channel_id}`),
  }))
  type PaidRow = { paid_date: string; amount_cents: number; payment_schedule: { company_id: string; supplier_name: string | null } }
  const paidAfter: PaidMove[] = ((paidRaw ?? []) as unknown as PaidRow[]).map(p => ({
    companyId: p.payment_schedule.company_id, label: p.payment_schedule.supplier_name ?? '—',
    date: p.paid_date, cents: Math.abs(p.amount_cents),
  }))

  // Fatture dei mesi dell'orizzonte, anche pagate: consumano le stime (regola del 14/10)
  type InvRow = {
    id: string; company_id: string; supplier_id: string | null; supplier_name: string | null; document_number: string | null
    due_date: string; postponed_to: string | null; amount_cents: number; is_intercompany: boolean | null
    supplier_registry: { category: string | null; exclude_from_treasury: boolean; treasury_as_staff: boolean; treasury_installments_only: boolean } | null
  }
  const invoices: MonthInvoice[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('payment_schedule')
      .select('id, company_id, supplier_id, supplier_name, document_number, due_date, postponed_to, amount_cents, is_intercompany, supplier_registry(category, exclude_from_treasury, treasury_as_staff, treasury_installments_only)')
      .eq('entry_type', 'accounting').eq('flow_type', 'out').neq('status', 'cancelled')
      .gte('due_date', addDays(firstDay.slice(0, 8) + '01', -62)).lte('due_date', lastDay)
      .order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as unknown as InvRow[]) {
      const date = r.postponed_to ?? r.due_date
      if (date < firstDay.slice(0, 8) + '01' || date > lastDay) continue
      const reg = r.supplier_registry
      invoices.push({
        id: r.id, companyId: r.company_id, supplierId: r.supplier_id, label: r.supplier_name ?? r.document_number ?? '—',
        doc: r.document_number, date, cents: Math.abs(r.amount_cents),
        generic: !r.is_intercompany && !reg?.exclude_from_treasury && !reg?.treasury_as_staff && !reg?.treasury_installments_only
          && reg?.category !== 'stipendi' && reg?.category !== 'tributi_f24',
      })
    }
    if (!data || data.length < 1000) break
  }
  // …e gli impegni con fornitore (spese e pro forma pagate): «gli impegni collassano» nelle stime
  {
    const { data, error } = await supabase.from('payment_schedule')
      .select('id, company_id, supplier_id, supplier_name, document_number, due_date, postponed_to, amount_cents, is_intercompany, supplier_registry(category, exclude_from_treasury, treasury_as_staff, treasury_installments_only)')
      .eq('entry_type', 'commitment').eq('flow_type', 'out').neq('status', 'cancelled')
      .not('supplier_id', 'is', null).or('commitment_type.is.null,commitment_type.eq.manual')
      .gte('due_date', addDays(firstDay.slice(0, 8) + '01', -62)).lte('due_date', lastDay)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as unknown as InvRow[]) {
      const date = r.postponed_to ?? r.due_date
      if (date < firstDay.slice(0, 8) + '01' || date > lastDay) continue
      const reg = r.supplier_registry
      invoices.push({
        id: r.id, companyId: r.company_id, supplierId: r.supplier_id,
        label: (r.supplier_name ?? '—') + (r.document_number?.startsWith('PF-') ? ' (pro forma)' : ' (impegno)'),
        doc: null, date, cents: Math.abs(r.amount_cents),
        generic: !r.is_intercompany && !reg?.exclude_from_treasury && !reg?.treasury_as_staff && !reg?.treasury_installments_only
          && reg?.category !== 'stipendi' && reg?.category !== 'tributi_f24',
      })
    }
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
  const codeOf = new Map(allCompanies.map(c => [c.id, c.code as string]))

  // Piano della decade (Marco, 19/10/2026): piani della decade in corso e della prossima,
  // provviste fra società, pagamenti registrati nella decade in corso
  const [{ data: plansRaw }, { data: transfersRaw }, { data: decTxRaw }] = await Promise.all([
    supabase.from('decade_plans').select('id, month, idx, status, approved_by, approved_at').in('month', months.slice(0, 2)),
    supabase.from('intercompany_transfers')
      .select('id, plan_month, plan_idx, from_company_id, to_company_id, amount_cents, due_date, paid_date, paid_by, notes')
      .or(`paid_date.is.null,paid_date.gte.${addDays(today, -90)}`),
    supabase.from('payment_transactions')
      .select('id, payment_schedule_id, paid_date, amount_cents, note, payment_schedule!inner(company_id, supplier_id, supplier_name, entry_type, commitment_type, payment_method, is_intercompany, flow_type, supplier_registry(category, treasury_as_staff, treasury_installments_only, exclude_from_treasury))')
      .gte('paid_date', decades[0].from).lte('paid_date', decades[0].to)
      .eq('payment_schedule.flow_type', 'out').limit(1000),
  ])
  const plans = (plansRaw ?? []).map(p => ({
    id: p.id as string, key: `${p.month}|${p.idx}`, month: p.month as string, idx: p.idx as DecadeIdx,
    status: p.status as 'bozza' | 'approvato', approvedBy: p.approved_by as string | null, approvedAt: p.approved_at as string | null,
  }))
  const planSuppliers: (PlanSupplier & { planId: string })[] = []
  if (plans.length) {
    const { data, error } = await supabase.from('decade_plan_suppliers')
      .select('id, plan_id, company_id, supplier_key, supplier_name, planned_cents, priority, row_ids')
      .in('plan_id', plans.map(p => p.id))
    if (error) throw new Error(error.message)
    for (const r of data ?? []) planSuppliers.push({
      id: r.id, planId: r.plan_id, companyId: r.company_id, key: `${r.company_id}|${r.supplier_key}`,
      name: r.supplier_name, plannedCents: r.planned_cents, priority: r.priority, rowIds: r.row_ids ?? [],
    })
  }
  const transferRows = transfersRaw ?? []
  const transfers: Transfer[] = transferRows.map(t => {
    const from = codeOf.get(t.from_company_id) ?? '?', to = codeOf.get(t.to_company_id) ?? '?'
    const kind = from === 'APPIAE' ? 'Provvista' : to === 'APPIAE' ? 'Restituzione' : 'Giroconto'
    return {
      id: t.id, fromCompanyId: t.from_company_id, toCompanyId: t.to_company_id, cents: t.amount_cents,
      dueDate: t.due_date, paidDate: t.paid_date, label: `${kind} ${from} → ${to}`,
    }
  })
  type TxRow = {
    id: string; payment_schedule_id: string; paid_date: string; amount_cents: number; note: string | null
    payment_schedule: {
      company_id: string; supplier_id: string | null; supplier_name: string | null; entry_type: string; commitment_type: string | null
      payment_method: string | null; is_intercompany: boolean | null
      supplier_registry: { category: string | null; treasury_as_staff: boolean; treasury_installments_only: boolean; exclude_from_treasury: boolean } | null
    }
  }
  // Pagamenti della decade in corso. «Discrezionale» = fattura di un fornitore che si decide:
  // non muro (utenze, personale, F24, solo rate), non automatica (RID, RI.BA.), non infragruppo
  const decadeTxs: DecadeTx[] = ((decTxRaw ?? []) as unknown as TxRow[]).map(t => {
    const ps = t.payment_schedule, reg = ps.supplier_registry
    const discretionary = ps.entry_type === 'accounting' && !ps.is_intercompany
      && !['utenze', 'stipendi', 'tributi_f24'].includes(reg?.category ?? '')
      && !reg?.treasury_as_staff && !reg?.treasury_installments_only && !reg?.exclude_from_treasury
      && ps.payment_method !== 'RID' && ps.payment_method !== 'RI.BA.'
    return {
      id: t.id, rowId: t.payment_schedule_id, companyId: ps.company_id, supplierId: ps.supplier_id, supplierName: ps.supplier_name,
      paidDate: t.paid_date, cents: Math.abs(t.amount_cents), note: t.note, discretionary,
    }
  })
  const paidInDecade = paidByKey(decadeTxs.filter(t => t.discretionary))
  // Fatture del piano in corso chiuse dall'import senza un pagamento registrato: pagate fuori dal
  // sistema. Contano come pagate (altrimenti il cruscotto toglierebbe una seconda volta), e si segnalano.
  const importClosed: { key: string; rowId: string; name: string; cents: number }[] = []
  {
    const running = plans.find(p => p.key === decades[0].key)
    const lines = running ? planSuppliers.filter(s => s.planId === running.id) : []
    const ids = lines.flatMap(l => l.rowIds ?? [])
    if (ids.length) {
      const [{ data: closed }, { data: withTx }] = await Promise.all([
        supabase.from('payment_schedule').select('id, amount_cents, supplier_name').in('id', ids).eq('status', 'paid'),
        supabase.from('payment_transactions').select('payment_schedule_id').in('payment_schedule_id', ids),
      ])
      const hasTx = new Set((withTx ?? []).map(t => t.payment_schedule_id))
      for (const r of closed ?? []) {
        if (hasTx.has(r.id)) continue
        const line = lines.find(l => l.rowIds?.includes(r.id))!
        importClosed.push({ key: line.key, rowId: r.id, name: r.supplier_name ?? line.name, cents: Math.abs(r.amount_cents) })
        paidInDecade.set(line.key, (paidInDecade.get(line.key) ?? 0) + Math.abs(r.amount_cents))
      }
    }
  }
  // Importi del piano per la finestra: nella decade in corso solo quello che resta da pagare
  const planFor = (i: number): Map<string, number> | null => {
    const plan = plans.find(p => p.key === decades[i]?.key)
    if (!plan) return null
    const mine = planSuppliers.filter(s => s.planId === plan.id)
    return i === 0 ? plannedRemaining(mine, paidInDecade) : new Map(mine.map(s => [s.key, s.plannedCents]))
  }
  const estimates: Estimate[] = (estimatesRaw ?? []).map(e => ({
    id: e.id, companyId: e.company_id, label: e.label, kind: e.kind, category: e.category,
    monthlyCents: e.monthly_cents, pct: [Number(e.pct_d1), Number(e.pct_d2), Number(e.pct_d3)],
    replacedBy: e.replaced_by ?? [],
    supplierId: e.supplier_id ?? null,
  }))
  const overrides = new Map((overridesRaw ?? []).map(o => [`${o.estimate_id}|${o.month}|${o.idx}`, o.amount_cents]))
  const realStaff = new Map<string, { date: string; cents: number }[]>()
  for (const r of (staffRaw ?? []).filter(r => !r.document_number?.startsWith('BDG-'))) {
    const date = r.postponed_to ?? r.due_date
    const k = `${r.company_id}|${r.commitment_type}|${date.slice(0, 7)}`
    if (!realStaff.has(k)) realStaff.set(k, [])
    realStaff.get(k)!.push({ date, cents: Math.abs(r.amount_cents) })
  }
  const manualRevenue = new Map((forecastsRaw ?? []).map(f =>
    [`${f.company_id}|${f.year}-${String(f.month).padStart(2, '0')}`, f.forecast_gross_cents]))
  const backlogBefore = new Map(allCompanies.map(c => [c.id, c.backlog_before as string | null]))

  // Fornitori «solo rate»: una riga è una rata se il suo documento ha più scadenze (anche già pagate)
  const ratedIds = [...new Set(openRows.filter(r => r.supplier_registry?.treasury_installments_only && r.supplier_id).map(r => r.supplier_id!))]
  const docCount = new Map<string, number>()
  if (ratedIds.length) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('payment_schedule')
        .select('company_id, supplier_id, document_number')
        .in('supplier_id', ratedIds).eq('entry_type', 'accounting').neq('status', 'cancelled')
        .order('id').range(from, from + 999)
      if (error) throw new Error(error.message)
      for (const d of data ?? []) {
        const k = `${d.company_id}|${d.supplier_id}|${d.document_number}`
        docCount.set(k, (docCount.get(k) ?? 0) + 1)
      }
      if (!data || data.length < 1000) break
    }
  }

  // Istruttori P.IVA: l'impegno di Staff si spegne quando arriva la sua fattura (conta lei, regola del 15/10)
  const pivaFrom = addDays(firstDay.slice(0, 8) + '01', -190).slice(0, 7)
  const pivaInvoiced = await loadPivaInvoiced(supabase, pivaFrom)

  const rows: OutRow[] = openRows.map(r => ({
    id: r.id,
    companyId: r.company_id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    supplierCategory: r.supplier_registry?.category ?? null,
    excludeFromTreasury: r.supplier_registry?.exclude_from_treasury ?? false,
    supplierAsStaff: r.supplier_registry?.treasury_as_staff ?? false,
    installmentsOnly: r.supplier_registry?.treasury_installments_only ?? false,
    isInstallment: (docCount.get(`${r.company_id}|${r.supplier_id}|${r.document_number}`) ?? 0) > 1,
    dueDate: r.due_date,
    postponedTo: r.postponed_to,
    residualCents: r.commitment_type === 'piva_item' && pivaInvoiced.has(r.id)
      ? 0 : Math.max(0, Math.abs(r.amount_cents) - (r.paid_amount_cents ?? 0)),
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
      estimates, overrides, realStaff, manualRevenue, coffa, installments, realIncassi, paidAfter, invoices, transfers,
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
  }), planFor)
  const windows: Record<string, WindowResult> = { GRUPPO: groupWindow }
  for (const b of blocks) {
    windows[b.code] = allocateWindow(b, i => ({ suggerita: groupWindow.decades[i].applicata, decisa: null }), planFor)
  }


  return {
    today, decades, months, blocks, group, windows, creditors, rows,
    allCompanies, allAccounts, snapshot, coffaFresh: !!coffaFresh,
    noticesRaw: noticesRaw ?? [], requestsRaw: requestsRaw ?? [],
    plans, planSuppliers, transfers, transferRows, decadeTxs, importClosed, paidInDecade,
  }
}

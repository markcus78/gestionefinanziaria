import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import PianoClient, { type PianoProps } from './piano-client'
import { loadTreasury } from '@/lib/treasury-load'
import {
  addDays, blockSpace, suggestedTransfer, supplierDues, lineStatus, offPlan, paidByKey, txKey,
  type RowKey, type BlockCode,
} from '@/lib/decadi'

// Ordine della call (Marco, 19/10/2026): prima Hangar, poi WT e Aries, per ultima Appiae,
// che fa le provviste agli altri due.
const ORDER: BlockCode[] = ['HANGAR', 'WT_ARIES', 'APPIAE']
const PER_INTERO: { key: RowKey; kind: string }[] = [
  { key: 'muro', kind: 'Muro' },
  { key: 'f24', kind: 'F24 da recuperare' },
  { key: 'automatici', kind: 'Automatica' },
  { key: 'arretrati', kind: 'Arretrato (piano di rientro)' },
  { key: 'pianificati', kind: 'Impegno' },
  { key: 'fattureSotto', kind: 'Fattura sotto 300 €' },
]
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export default async function PianoPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const t = await loadTreasury(supabase)
  const { today, decades, blocks, windows, allCompanies, allAccounts, plans, planSuppliers, transferRows, decadeTxs } = t

  // Dal 6° giorno della decade si lavora sulla prossima (la call è il 6, il 16 e il 26)
  const defaultI = today >= addDays(decades[0].from, 5) ? 1 : 0
  const i = sp.d === '0' || sp.d === '1' ? Number(sp.d) : defaultI
  const dec = decades[i]
  const codeOf = new Map(allCompanies.map(c => [c.id, c.code as string]))
  const idOf = new Map(allCompanies.map(c => [c.code as string, c.id as string]))
  const plan = plans.find(p => p.key === dec.key) ?? null
  const lines = plan ? planSuppliers.filter(s => s.planId === plan.id) : []
  const running = i === 0   // decade in corso: c'è già da eseguire e da controllare

  // Fornitori: chi ha qualcosa da pagare entro la decade, più chi è nel piano
  const gw = windows.GRUPPO
  const dues = supplierDues(gw, i)
  const pct = gw.decades[i].suggerita
  const paid = running ? paidByKey(decadeTxs.filter(x => x.discretionary)) : new Map<string, number>()
  const keys = new Set([...dues.map(d => d.key), ...lines.map(l => l.key)])
  const suppliers: PianoProps['suppliers'] = [...keys].map(k => {
    const due = dues.find(d => d.key === k)
    const line = lines.find(l => l.key === k)
    const companyId = due?.companyId ?? line!.companyId
    const planned = line?.plannedCents ?? 0
    const p = paid.get(k) ?? 0
    return {
      key: k, supplierKey: k.slice(companyId.length + 1), companyId, company: codeOf.get(companyId) ?? '?',
      name: line?.name ?? due!.name, dovuto: due?.dovuto ?? 0, oldest: due?.oldest ?? null, invoices: due?.invoices ?? 0,
      reference: Math.round((due?.dovuto ?? 0) * pct), lineId: line?.id ?? null, planned, priority: line?.priority ?? null,
      paid: p, state: line ? lineStatus(planned, p, today, dec.to).state : (p > 0 ? 'oltre' : 'da_pagare'),
    }
  }).sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999) || b.dovuto - a.dovuto)

  // Blocchi: spazio per i fornitori, fabbisogno e provvista suggerita
  const blockViews: PianoProps['blocks'] = ORDER.map(code => {
    const b = blocks.find(x => x.code === code)!
    const space = blockSpace(b, windows[code], i)
    return {
      code, label: b.label, space, suggested: code === 'APPIAE' ? 0 : suggestedTransfer(space),
      receiverId: code === 'HANGAR' ? idOf.get('HANGAR') ?? null : code === 'WT_ARIES' ? idOf.get('ARIES') ?? null : null,
    }
  })

  // Quello che si paga per intero (vivo dal cruscotto): le provviste stanno nella loro sezione
  const perIntero: PianoProps['perIntero'] = []
  for (const b of blocks) {
    const r = b.decades[i].rows
    for (const { key, kind } of PER_INTERO) {
      for (const it of r[key].items) {
        if (it.source === 'provvista' || it.cents <= 0) continue
        perIntero.push({
          kind, label: it.label, company: codeOf.get(it.companyId ?? '') ?? b.label, companyId: it.companyId ?? null, cents: it.cents, date: it.date ?? null,
          rowId: it.rowId ?? null, installmentId: it.installmentId ?? null, estimate: !it.rowId && !it.installmentId,
          late: !!it.date && it.date < today, automatic: key === 'automatici',
        })
      }
    }
  }
  perIntero.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))

  // Provviste della decade e debito progressivo verso Appiae
  const transfers: PianoProps['transfers'] = transferRows
    .filter(x => (x.plan_month === dec.month && x.plan_idx === dec.idx) || (!x.paid_date && x.due_date <= dec.to))
    .map(x => ({
      id: x.id, from: codeOf.get(x.from_company_id) ?? '?', to: codeOf.get(x.to_company_id) ?? '?', cents: x.amount_cents,
      dueDate: x.due_date, paidDate: x.paid_date, notes: x.notes,
    }))
  const { data: allTr } = await supabase.from('intercompany_transfers').select('from_company_id, to_company_id, amount_cents').not('paid_date', 'is', null)
  const apId = idOf.get('APPIAE')
  const debts = new Map<string, number>()
  for (const x of allTr ?? []) {
    if (x.from_company_id === apId) debts.set(x.to_company_id, (debts.get(x.to_company_id) ?? 0) + x.amount_cents)
    if (x.to_company_id === apId) debts.set(x.from_company_id, (debts.get(x.from_company_id) ?? 0) - x.amount_cents)
  }

  // Controllo della decade in corso: pagamenti fatti e fuori piano
  const offs = running ? offPlan(lines, decadeTxs) : []
  const lineKeys = new Set(lines.map(l => l.key))
  const paidList: PianoProps['paidList'] = running ? decadeTxs.map(x => ({
    id: x.id, date: x.paidDate, company: codeOf.get(x.companyId) ?? '?', name: x.supplierName ?? '—', cents: x.cents,
    inPlan: !x.discretionary || lineKeys.has(txKey(x)) || !!x.note?.startsWith('Quota arretrato'),
  })).sort((a, b) => b.date.localeCompare(a.date)) : []

  // Data del saldo per società: un pagamento con data precedente è già nel saldo della banca
  const balanceDate: Record<string, string | null> = {}
  for (const c of allCompanies) {
    const ds = allAccounts.filter(a => a.company_id === c.id).map(a => a.balance_date).filter((d): d is string => !!d).sort()
    balanceDate[c.id] = ds.length ? ds[ds.length - 1] : null
  }

  const label = (k: number) => {
    const d = decades[k]
    const m = MONTHS[Number(d.month.slice(5, 7)) - 1]
    return `${Number(d.from.slice(8, 10))}-${Number(d.to.slice(8, 10))} ${m}`
  }

  const props: PianoProps = {
    today, i, tabs: [0, 1].map(k => ({ i: k, label: label(k), running: k === 0 })),
    decade: { month: dec.month, idx: dec.idx, from: dec.from, to: dec.to, label: label(i) },
    plan: plan ? { id: plan.id, status: plan.status, approvedBy: plan.approvedBy, approvedAt: plan.approvedAt } : null,
    blocks: blockViews, suppliers, perIntero, transfers,
    debts: [...debts].filter(([, v]) => v !== 0).map(([id, v]) => ({ company: codeOf.get(id) ?? '?', cents: v })),
    offPlan: offs.map(o => ({ company: codeOf.get(o.companyId) ?? '?', name: o.name, cents: o.cents, why: o.why, dates: o.dates })),
    paidList, running, balanceDate, appiaeId: apId ?? null,
    dueInputs: dues.map(d => ({ companyId: d.companyId, supplierKey: d.key.slice(d.companyId.length + 1), name: d.name })),
    pct,
  }

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-center gap-3 mb-6">
        <ListChecks className="w-5 h-5 text-sky-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Pagamenti della decade</h1>
      </div>
      <PianoClient {...props} />
    </div>
  )
}

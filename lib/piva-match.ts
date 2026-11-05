// Istruttori a partita IVA (Marco, 15/10/2026): Athletis dice quanto spetta a ognuno nel mese e
// Orianna lo carica in Staff come impegno; poi l'istruttore manda la fattura, che arriva dallo
// scadenzario. È un impegno che diventa fattura: quando la fattura c'è, conta solo lei.
//
// L'impegno è il mese in cui si PAGA (Marco, 05/11/2026): l'impegno di luglio paga il lavoro di
// giugno, quindi la sua fattura è di fine giugno o dei primi di luglio. Finestra di una fattura per
// l'impegno del mese M: dal primo del mese M-1 alla fine del mese M+1; la più vicina è quella del
// mese M-1 (il mese lavorato), poi quella del mese M, poi M+1.
//
// Abbinamento: stessa società e stessa persona (nome e cognome in qualsiasi ordine), in due giri.
// 1. Per importo: la fattura va all'impegno il cui importo torna con quello della fattura (uguale,
//    + 4 % di rivalsa, oppure + 4 % e IVA); a parità, la fattura più vicina. Senza questo giro una
//    fattura mancante o due fatture nello stesso mese facevano scivolare tutte le fatture sui mesi
//    vecchi (Buontempo e Guaci a ottobre 2026: impegno e fattura contati due volte).
// 2. Per data, solo per quello che resta: in ordine di mese, ogni impegno prende la prima fattura
//    non ancora usata dentro la sua finestra.

import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// amount: in centesimi, positivo; se manca, l'impegno o la fattura entrano solo nel giro per data
export type PivaItem = { id: string; companyId: string; name: string; refMonth: string; amount?: number }
export type PivaInvoice = { id: string; companyId: string; name: string; date: string; doc: string | null; amount?: number }

// fattura ÷ impegno: senza rivalsa, + 4 % di rivalsa, + 4 % e IVA al 22 %
const PIVA_RATIOS = [1, 1.04, 1.04 * 1.22]
const RATIO_TOL = 0.01        // 1 % dell'importo atteso…
const FIXED_TOL = 250         // …più 2,50 € (marca da bollo da 2 €, arrotondamenti)

export function amountFits(item: number, invoice: number): number | null {
  let best: number | null = null
  for (const r of PIVA_RATIOS) {
    const want = item * r
    const diff = Math.abs(invoice - want)
    if (diff <= want * RATIO_TOL + FIXED_TOL && (best === null || diff < best)) best = diff
  }
  return best
}

function monthIndex(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return y * 12 + m
}

// finestra della fattura per l'impegno del mese di pagamento M: dal primo di M-1 alla fine di M+1
function invoiceWindow(refMonth: string): { from: string; to: string } {
  return { from: monthEnd(refMonth, -1).slice(0, 8) + '01', to: monthEnd(refMonth, 1) }
}

// 0 = fattura del mese lavorato (M-1), 1 = del mese di pagamento (M), 2 = del mese dopo (M+1)
function invoiceGap(refMonth: string, date: string): number {
  const d = monthIndex(date.slice(0, 7)) - monthIndex(refMonth)
  return d === -1 ? 0 : d === 0 ? 1 : 2
}

export function personKey(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/).filter(t => t.length > 1).sort().join(' ')
}

function monthEnd(month: string, plus: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m + plus, 0))
  return d.toISOString().slice(0, 10)
}

// id dell'impegno → fattura che lo sostituisce
export function matchPivaInvoices(items: PivaItem[], invoices: PivaInvoice[]): Map<string, PivaInvoice> {
  const out = new Map<string, PivaInvoice>()
  const byPerson = new Map<string, PivaInvoice[]>()
  for (const inv of invoices) {
    const k = `${inv.companyId}|${personKey(inv.name)}`
    if (!byPerson.has(k)) byPerson.set(k, [])
    byPerson.get(k)!.push(inv)
  }
  for (const list of byPerson.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const used = new Set<string>()
  const sorted = [...items].sort((a, b) => a.refMonth.localeCompare(b.refMonth) || a.id.localeCompare(b.id))

  // 1. per importo: tutte le coppie che tornano, dalla più vicina in date
  const pairs: { it: PivaItem; inv: PivaInvoice; gap: number; diff: number }[] = []
  for (const it of sorted) {
    if (!it.amount) continue
    const list = byPerson.get(`${it.companyId}|${personKey(it.name)}`)
    if (!list) continue
    const { from, to } = invoiceWindow(it.refMonth)
    for (const inv of list) {
      if (!inv.amount || inv.date < from || inv.date > to) continue
      const diff = amountFits(it.amount, inv.amount)
      if (diff === null) continue
      pairs.push({ it, inv, gap: invoiceGap(it.refMonth, inv.date), diff })
    }
  }
  pairs.sort((a, b) => a.gap - b.gap || a.diff - b.diff || a.inv.date.localeCompare(b.inv.date)
    || a.it.refMonth.localeCompare(b.it.refMonth) || a.it.id.localeCompare(b.it.id) || a.inv.id.localeCompare(b.inv.id))
  for (const p of pairs) {
    if (out.has(p.it.id) || used.has(p.inv.id)) continue
    used.add(p.inv.id)
    out.set(p.it.id, p.inv)
  }

  // 2. per data, su quello che resta
  for (const it of sorted) {
    if (out.has(it.id)) continue
    const list = byPerson.get(`${it.companyId}|${personKey(it.name)}`)
    if (!list) continue
    const { from, to } = invoiceWindow(it.refMonth)
    const inv = list.find(i => !used.has(i.id) && i.date >= from && i.date <= to)
    if (!inv) continue
    used.add(inv.id)
    out.set(it.id, inv)
  }
  return out
}

// Legge impegni P.IVA e fatture dei fornitori trattati come personale dal mese indicato in poi
export async function loadPivaInvoiced(supabase: SupabaseServerClient, fromMonth: string): Promise<Map<string, PivaInvoice>> {
  const [{ data: items, error: e1 }, { data: invs, error: e2 }] = await Promise.all([
    supabase.from('payment_schedule')
      .select('id, company_id, supplier_name, reference_month, due_date, amount_cents')
      .eq('entry_type', 'commitment').eq('commitment_type', 'piva_item').neq('status', 'cancelled')
      .gte('due_date', fromMonth + '-01').limit(1000),
    supabase.from('payment_schedule')
      .select('id, company_id, supplier_name, document_number, document_date, due_date, amount_cents, supplier_registry!inner(treasury_as_staff)')
      .eq('entry_type', 'accounting').eq('flow_type', 'out').neq('status', 'cancelled')
      .eq('supplier_registry.treasury_as_staff', true)
      .gte('due_date', fromMonth + '-01').limit(1000),
  ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)
  return matchPivaInvoices(
    (items ?? []).map(r => ({
      id: r.id, companyId: r.company_id, name: r.supplier_name ?? '',
      refMonth: r.reference_month ?? String(r.due_date).slice(0, 7),
      amount: Math.abs(Number(r.amount_cents ?? 0)),
    })),
    (invs ?? []).map(r => ({
      id: r.id, companyId: r.company_id, name: r.supplier_name ?? '',
      date: r.document_date ?? r.due_date, doc: r.document_number,
      amount: Math.abs(Number(r.amount_cents ?? 0)),
    })),
  )
}

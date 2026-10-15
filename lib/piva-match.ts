// Istruttori a partita IVA (Marco, 15/10/2026): Athletis dice quanto spetta a ognuno nel mese e
// Orianna lo carica in Staff come impegno; poi l'istruttore manda la fattura, che arriva dallo
// scadenzario. È un impegno che diventa fattura: quando la fattura c'è, conta solo lei.
//
// Abbinamento: stessa società e stessa persona (nome e cognome in qualsiasi ordine). In ordine di
// mese, ogni impegno prende la prima fattura non ancora usata datata dal primo del suo mese alla
// fine del secondo mese dopo (chi fattura giugno lo fa a fine giugno o nei primi giorni di luglio).

import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type PivaItem = { id: string; companyId: string; name: string; refMonth: string }
export type PivaInvoice = { id: string; companyId: string; name: string; date: string; doc: string | null }

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
  for (const it of sorted) {
    const list = byPerson.get(`${it.companyId}|${personKey(it.name)}`)
    if (!list) continue
    const from = it.refMonth + '-01', to = monthEnd(it.refMonth, 2)
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
      .select('id, company_id, supplier_name, reference_month, due_date')
      .eq('entry_type', 'commitment').eq('commitment_type', 'piva_item').neq('status', 'cancelled')
      .gte('due_date', fromMonth + '-01').limit(1000),
    supabase.from('payment_schedule')
      .select('id, company_id, supplier_name, document_number, document_date, due_date, supplier_registry!inner(treasury_as_staff)')
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
    })),
    (invs ?? []).map(r => ({
      id: r.id, companyId: r.company_id, name: r.supplier_name ?? '',
      date: r.document_date ?? r.due_date, doc: r.document_number,
    })),
  )
}

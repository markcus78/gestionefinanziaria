// Lavoro quotidiano: letture dal database (attività e segnalazioni).
import type { createClient } from '@/lib/supabase/server'
import { planTasks, addDaysStr, missingSaleDays, type TaskRule, type DoneMap } from '@/lib/lavoro'
import { loadPivaInvoiced } from '@/lib/piva-match'

type Supa = Awaited<ReturnType<typeof createClient>>

const OPEN = ['pending', 'scheduled', 'partial', 'postponed']

// ─── Attività ────────────────────────────────────────────────────────────────

export async function loadTasks(supabase: Supa, today: string) {
  const { data: rulesRaw, error } = await supabase.from('daily_task_rules').select('*').eq('active', true).order('sort')
  if (error) throw new Error(error.message)
  const rules: TaskRule[] = (rulesRaw ?? []).map(r => ({
    id: r.id, title: r.title, description: r.description, href: r.href, freq: r.freq, days: r.days ?? [],
    companyId: r.company_id, holiday: r.holiday, superseded: r.superseded, auto: r.auto,
    startDate: r.start_date, sort: r.sort,
  }))
  const since = rules.reduce((m, r) => (r.startDate < m ? r.startDate : m), today)
  const from = addDaysStr(since, -45)

  const [{ data: doneRaw }, { data: imports }, { data: staff }, { data: accounts }, { data: colls }] = await Promise.all([
    supabase.from('daily_task_done').select('rule_id, period_key, done_by, done_at').gte('period_key', from),
    supabase.from('import_batches').select('company_id, imported_at').gte('imported_at', from),
    supabase.from('payment_schedule').select('company_id, commitment_type, reference_month')
      .eq('entry_type', 'commitment').in('commitment_type', ['salary_item', 'collab_item', 'piva_item', 'tax_item'])
      .gte('reference_month', from.slice(0, 7)).not('document_number', 'like', 'BDG-%').neq('status', 'cancelled').limit(1000),
    supabase.from('bank_accounts').select('company_id, balance_date').eq('is_active', true),
    // solo gli ultimi 45 giorni: le voci di incassi guardano oggi e le decadi recenti (resta sotto le 1000 righe)
    supabase.from('daily_collections').select('company_id, created_at').gte('created_at', addDaysStr(today, -45)).limit(1000),
  ])

  const done: DoneMap = new Map((doneRaw ?? []).map(d => [`${d.rule_id}|${d.period_key}`, { by: d.done_by, at: d.done_at }]))
  const romeDate = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ts))
  const importDates = (imports ?? []).map(i => ({ company: i.company_id as string, date: romeDate(i.imported_at) }))
  const staffKeys = new Set((staff ?? []).map(s => `${s.company_id}|${s.commitment_type}|${s.reference_month}`))
  const balanceDates = (accounts ?? []).map(a => ({ company: a.company_id as string, date: a.balance_date as string | null }))
  const collDates = (colls ?? []).map(c => ({ company: c.company_id as string, date: romeDate(c.created_at) }))

  // Il sistema vede da solo che è fatta (un flag a mano senza il caricamento non serve)
  const autoDone = (rule: TaskRule, key: string): boolean => {
    const c = rule.companyId, month = key.slice(0, 7), from2 = addDaysStr(key, -2)
    switch (rule.auto) {
      case 'import': return importDates.some(i => (!c || i.company === c) && i.date >= from2)
      case 'saldi': {
        const list = balanceDates.filter(b => !c || b.company === c)
        return list.length > 0 && list.every(b => !!b.date && b.date >= from2)
      }
      case 'paghe': return staffKeys.has(`${c}|salary_item|${month}`)
      case 'collaboratori': return staffKeys.has(`${c}|collab_item|${month}`) || staffKeys.has(`${c}|piva_item|${month}`)
      case 'f24': return staffKeys.has(`${c}|tax_item|${month}`)
      // incassi: registrati quel giorno (le voci di ogni giorno) o dalla data prevista in poi (gli affitti alle decadi)
      case 'incassi': return collDates.some(i => i.company === c && i.date >= (rule.freq === 'giornaliera' ? key : from2))
      default: return false
    }
  }
  return { rules, ...planTasks(rules, done, autoDone, today) }
}

// ─── Segnalazioni: le cose che non tornano ───────────────────────────────────

export type SignalItem = { key: string; label: string; detail: string; href: string }
export type Signal = { id: string; title: string; why: string; href: string; dismissable: boolean; items: SignalItem[] }

const eur = (c: number) => (Math.abs(c) / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const it = (d: string) => d.split('-').reverse().join('/')

export async function loadSignals(supabase: Supa, today: string): Promise<Signal[]> {
  const [{ data: companies }, { data: dismissed }] = await Promise.all([
    supabase.from('companies').select('id, code'),
    supabase.from('signal_dismissals').select('key'),
  ])
  const code = new Map((companies ?? []).map(c => [c.id, c.code as string]))
  const seen = new Set((dismissed ?? []).map(d => d.key as string))

  // impegni in uscita aperti (pochi: sotto le 1000 righe)
  const { data: imp, error: e1 } = await supabase.from('payment_schedule')
    .select('id, company_id, supplier_id, supplier_name, due_date, postponed_to, amount_cents, paid_amount_cents, commitment_type, document_number, new_supplier, reference_month')
    .eq('entry_type', 'commitment').eq('flow_type', 'out').in('status', OPEN).limit(1000)
  if (e1) throw new Error(e1.message)
  const commitments = imp ?? []
  const isSpesa = (t: string | null) => !t || t === 'manual'

  // 1. Spese senza fornitore
  // una riga per spesa: le rate di un impegno ricorrente (stessa società e stesso nome) stanno insieme
  const senzaGroups = new Map<string, typeof commitments>()
  for (const c of commitments.filter(c => isSpesa(c.commitment_type) && !c.supplier_id && !c.new_supplier)) {
    const k = `${c.company_id}|${(c.supplier_name ?? '').trim().toLowerCase()}`
    if (!senzaGroups.has(k)) senzaGroups.set(k, [])
    senzaGroups.get(k)!.push(c)
  }
  const senza: SignalItem[] = [...senzaGroups.values()].map(g => {
    const dates = g.map(c => c.postponed_to ?? c.due_date).sort()
    return {
      key: `senza-fornitore:${g.map(c => c.id).sort().join(',')}`,
      label: `${code.get(g[0].company_id)} · ${g[0].supplier_name ?? '—'}`,
      detail: g.length === 1
        ? `${eur(g[0].amount_cents)} · ${it(dates[0])}`
        : `${g.length} rate da ${eur(g[0].amount_cents)} · dal ${it(dates[0])} al ${it(dates[dates.length - 1])}`,
      href: '/impegni?status=pending',
    }
  })

  // 2. Impegno e fattura dello stesso fornitore: probabile doppione
  const withSup = commitments.filter(c => isSpesa(c.commitment_type) && c.supplier_id)
  const doppioni: SignalItem[] = []
  if (withSup.length) {
    const { data: inv } = await supabase.from('payment_schedule')
      .select('id, company_id, supplier_id, supplier_name, document_number, due_date, amount_cents')
      .eq('entry_type', 'accounting').neq('status', 'cancelled')
      .in('supplier_id', [...new Set(withSup.map(c => c.supplier_id as string))])
      .gte('due_date', addDaysStr(today, -400)).limit(1000)
    for (const c of withSup) {
      const d = c.postponed_to ?? c.due_date
      const near = (inv ?? [])
        .filter(f => f.company_id === c.company_id && f.supplier_id === c.supplier_id)
        .map(f => ({ f, gap: Math.abs(Date.parse(f.due_date) - Date.parse(d)) / 86400000 }))
        .filter(x => x.gap <= 60).sort((a, b) => a.gap - b.gap)[0]
      if (!near) continue
      doppioni.push({
        key: `doppione:${c.id}:${near.f.id}`,
        label: `${code.get(c.company_id)} · ${c.supplier_name ?? '—'}`,
        detail: `impegno ${eur(c.amount_cents)} del ${it(d)} ↔ fattura ${near.f.document_number ?? ''} ${eur(near.f.amount_cents)} del ${it(near.f.due_date)}`,
        href: '/impegni?status=pending',
      })
    }
  }

  // 3. Impegni scaduti da più di 7 giorni e non pagati: pagati e non segnati, o ancora da pagare?
  const piva = await loadPivaInvoiced(supabase, addDaysStr(today, -200).slice(0, 7))
  const limite = addDaysStr(today, -7)
  const scaduti: SignalItem[] = commitments
    .filter(c => (c.postponed_to ?? c.due_date) < limite)
    .filter(c => !c.document_number?.startsWith('BDG-') && c.commitment_type !== 'forecast')
    .filter(c => !(c.commitment_type === 'piva_item' && piva.has(c.id)))
    .map(c => {
      const residuo = Math.abs(c.amount_cents) - (c.paid_amount_cents ?? 0)
      const staff = ['salary_item', 'collab_item', 'piva_item', 'tax_item', 'extra_item'].includes(c.commitment_type ?? '')
      return {
        key: `scaduto:${c.id}:${residuo}`, label: `${code.get(c.company_id)} · ${c.supplier_name ?? '—'}`,
        detail: `${eur(residuo)} da pagare, scadenza ${it(c.postponed_to ?? c.due_date)}`,
        href: staff ? `/staff?month=${c.reference_month ?? (c.due_date as string).slice(0, 7)}` : '/impegni?status=pending',
      }
    })

  // 4. Stessa fattura due volte nello scadenzario (righe aperte)
  const dup: SignalItem[] = []
  {
    const rows: { id: string; company_id: string; supplier_name: string | null; document_number: string | null; due_date: string; amount_cents: number }[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('payment_schedule')
        .select('id, company_id, supplier_name, document_number, due_date, amount_cents')
        .eq('entry_type', 'accounting').in('status', OPEN).order('id').range(from, from + 999)
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    const groups = new Map<string, typeof rows>()
    for (const r of rows) {
      if (!r.document_number) continue
      const k = `${r.company_id}|${(r.supplier_name ?? '').toLowerCase()}|${r.document_number}|${r.due_date}|${r.amount_cents}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    }
    for (const g of groups.values()) if (g.length > 1) dup.push({
      key: `dup-scad:${g.map(r => r.id).sort().join(',')}`,
      label: `${code.get(g[0].company_id)} · ${g[0].supplier_name ?? '—'} · doc. ${g[0].document_number}`,
      detail: `${g.length} righe uguali da ${eur(g[0].amount_cents)}, scadenza ${it(g[0].due_date)}`, href: '/schedule',
    })
  }

  // 5. Date impossibili
  const { data: strane } = await supabase.from('payment_schedule')
    .select('id, company_id, supplier_name, due_date, amount_cents, entry_type').neq('status', 'cancelled')
    .or('due_date.lt.2000-01-01,due_date.gt.2035-12-31').limit(100)
  const date: SignalItem[] = (strane ?? []).map(r => ({
    key: `data:${r.id}:${r.due_date}`, label: `${code.get(r.company_id)} · ${r.supplier_name ?? '—'}`,
    detail: `data ${it(r.due_date)} · ${eur(r.amount_cents)}`, href: r.entry_type === 'commitment' ? '/impegni' : '/schedule',
  }))

  // 6. Richieste di spesa da decidere
  const { data: req } = await supabase.from('spend_requests')
    .select('id, company_id, supplier_name, amount_cents, expected_date, requested_by').eq('status', 'in_attesa').order('expected_date')
  const richieste: SignalItem[] = (req ?? []).map(r => ({
    key: `richiesta:${r.id}`, label: `${code.get(r.company_id)} · ${r.supplier_name}`,
    detail: `${eur(r.amount_cents)} per il ${it(r.expected_date)}${r.requested_by ? ` · chiesta da ${r.requested_by}` : ''}`, href: '/richieste',
  }))

  // 7. Giorni di vendita senza incassi registrati (Appiae e Hangar, ultimi 30 giorni)
  const buchi: SignalItem[] = []
  {
    const { data: daily } = await supabase.from('daily_task_rules').select('company_id')
      .eq('active', true).eq('freq', 'giornaliera').eq('auto', 'incassi')
    const ids = [...new Set((daily ?? []).map(r => r.company_id as string).filter(Boolean))]
    if (ids.length) {
      const from = addDaysStr(today, -30)
      const { data: rows } = await supabase.from('daily_collections').select('company_id, collection_date')
        .in('company_id', ids).gte('collection_date', from).limit(1000)
      for (const id of ids) {
        const days = missingSaleDays((rows ?? []).filter(r => r.company_id === id).map(r => r.collection_date as string), from)
        for (const d of days) buchi.push({
          key: `incassi-mancanti:${id}:${d}`, label: `${code.get(id)} · ${it(d)}`,
          detail: 'nessun incasso registrato per questo giorno di vendita',
          href: `/operations?company=${code.get(id)}&month=${+d.slice(5, 7)}&year=${d.slice(0, 4)}`,
        })
      }
    }
  }

  const all: Signal[] = [
    { id: 'doppioni', title: 'Possibili doppioni: impegno e fattura dello stesso fornitore', why: 'Se è la stessa spesa, annulla l\'impegno: conta la fattura.', href: '/impegni', dismissable: true, items: doppioni },
    { id: 'dup-scad', title: 'Stessa fattura due volte nello scadenzario', why: 'Controlla in contabilità e reimporta lo scadenzario.', href: '/schedule', dismissable: true, items: dup },
    { id: 'senza-fornitore', title: 'Spese senza fornitore', why: 'Senza fornitore la fattura non viene riconosciuta e si conta due volte: apri la modifica e scegli il fornitore (o «fornitore nuovo»).', href: '/impegni', dismissable: false, items: senza },
    { id: 'scaduti', title: 'Impegni scaduti da più di 7 giorni e non pagati', why: 'Se sono pagati, segnali come pagati; se sono ancora da pagare, «visto».', href: '/impegni', dismissable: true, items: scaduti },
    { id: 'date', title: 'Date impossibili', why: 'Una data sbagliata sposta il pagamento in un altro anno: correggila.', href: '/schedule', dismissable: true, items: date },
    { id: 'incassi-mancanti', title: 'Giorni di vendita senza incassi registrati', why: "La Tesoreria considera coperti tutti i giorni fino all'ultimo registrato: un giorno saltato sparisce dalla cassa. Registralo; se quel giorno eravamo chiusi, «visto».", href: '/operations', dismissable: true, items: buchi },
    { id: 'richieste', title: 'Richieste di spesa da decidere', why: 'Finché è in attesa non pesa sulla cassa: portala a chi decide.', href: '/richieste', dismissable: false, items: richieste },
  ]
  return all
    .map(s => ({ ...s, items: s.items.filter(i => !seen.has(i.key)) }))
    .filter(s => s.items.length > 0)
}

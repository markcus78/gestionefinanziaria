// Tesoreria a decadi: 1-10, 11-20, 21-fine mese.
// Calcolo puro, senza accesso al DB: date sempre come stringhe 'YYYY-MM-DD' e Date.UTC,
// così il giorno 10/11 e 20/21 non dipende dal fuso del server.

export type DecadeIdx = 1 | 2 | 3
export type Decade = {
  key: string      // 'YYYY-MM|idx'
  month: string    // 'YYYY-MM'
  idx: DecadeIdx
  from: string
  to: string
  label: string    // 'Ott D1'
  entro: string    // '10/10'
}
export type BlockCode = 'APPIAE' | 'HANGAR' | 'WT_ARIES'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

export function todayRome(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(now)
}

export function decadeOf(iso: string): { month: string; idx: DecadeIdx } {
  const g = Number(iso.slice(8, 10))
  return { month: iso.slice(0, 7), idx: g <= 10 ? 1 : g <= 20 ? 2 : 3 }
}

function lastDay(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function decadeBounds(month: string, idx: DecadeIdx): { from: string; to: string } {
  if (idx === 1) return { from: `${month}-01`, to: `${month}-10` }
  if (idx === 2) return { from: `${month}-11`, to: `${month}-20` }
  return { from: `${month}-21`, to: `${month}-${String(lastDay(month)).padStart(2, '0')}` }
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function buildDecades(today: string, count: number): Decade[] {
  let { month, idx } = decadeOf(today)
  const out: Decade[] = []
  for (let i = 0; i < count; i++) {
    const { from, to } = decadeBounds(month, idx)
    const m = Number(month.slice(5, 7))
    out.push({
      key: `${month}|${idx}`, month, idx, from, to,
      label: `${MESI[m - 1]} D${idx}`,
      entro: `${to.slice(8, 10)}/${to.slice(5, 7)}`,
    })
    if (idx === 3) { month = nextMonth(month); idx = 1 } else idx = (idx + 1) as DecadeIdx
  }
  return out
}

// Indice della decade: una data precedente all'orizzonte (scaduta) va nella decade in corso (0),
// una data oltre l'ultima decade restituisce -1.
export function bucketOf(decades: Decade[], iso: string): number {
  if (iso < decades[0].from) return 0
  for (let i = 0; i < decades.length; i++) if (iso <= decades[i].to) return i
  return -1
}

// ─── Instradamento delle uscite ──────────────────────────────────────────────

export type OutRow = {
  id: string
  companyId: string
  supplierName: string | null
  supplierCategory: string | null
  excludeFromTreasury: boolean
  dueDate: string
  postponedTo: string | null
  residualCents: number
  paymentMethod: string | null
  entryType: 'accounting' | 'commitment'
  commitmentType: string | null
  documentNumber: string | null
  isIntercompany: boolean
}

export type Route = 'muro' | 'automatico' | 'pianificato' | 'fattura' | 'stock' | 'escluso'

const STAFF_TYPES = new Set(['salary_item', 'extra_item', 'collab_item', 'piva_item', 'tax_item'])

export function effectiveDate(r: Pick<OutRow, 'dueDate' | 'postponedTo'>): string {
  return r.postponedTo ?? r.dueDate
}

export function routeOut(
  r: OutRow,
  ctx: { today: string; backlogBefore: string | null; blockHasUtenzeEstimate: boolean },
): Route {
  const e = effectiveDate(r)
  if (r.residualCents <= 0) return 'escluso'
  if (r.documentNumber?.startsWith('BDG-') || r.commitmentType === 'forecast') return 'escluso'
  if (r.excludeFromTreasury || r.isIntercompany) return 'escluso'

  if (r.entryType === 'commitment') {
    return r.commitmentType && STAFF_TYPES.has(r.commitmentType) ? 'muro' : 'pianificato'
  }

  if (ctx.backlogBefore && e < ctx.backlogBefore) return 'stock'
  if (r.supplierCategory === 'utenze') {
    if (!ctx.blockHasUtenzeEstimate) return 'muro'
    return e >= ctx.today ? 'escluso' : 'stock'
  }
  if (r.supplierCategory === 'stipendi' || r.supplierCategory === 'tributi_f24') {
    return e >= ctx.today ? 'escluso' : 'stock'
  }
  if ((r.paymentMethod === 'RID' || r.paymentMethod === 'RI.BA.') && e >= ctx.today) return 'automatico'
  return 'fattura'
}

// ─── Stime ───────────────────────────────────────────────────────────────────

export type Estimate = {
  id: string
  companyId: string
  label: string
  kind: 'incasso' | 'muro' | 'automatico' | 'fornitori'
  category: string
  monthlyCents: number
  pct: [number, number, number]
  replacedBy: string[]
}

// Quote intere in centesimi: le prime due arrotondate per difetto, il resto all'ultima,
// così la somma del mese è esatta.
export function splitMonthly(monthlyCents: number, pct: [number, number, number]): [number, number, number] {
  const tot = pct[0] + pct[1] + pct[2]
  const q1 = Math.floor(monthlyCents * pct[0] / tot)
  const q2 = Math.floor(monthlyCents * pct[1] / tot)
  return [q1, q2, monthlyCents - q1 - q2]
}

// ─── Blocco ──────────────────────────────────────────────────────────────────

export type RowKey = 'incassi' | 'muro' | 'automatici' | 'pianificati' | 'fattureSotto' | 'fattureSopra' | 'nuoveFatture'
export const OUT_ROWS: RowKey[] = ['muro', 'automatici', 'pianificati', 'fattureSotto', 'fattureSopra', 'nuoveFatture']

export type CellItem = {
  label: string
  cents: number
  source: 'stima' | 'coffa' | 'previsione' | 'scadenzario' | 'impegno' | 'staff'
  date?: string
  rowId?: string
  companyId?: string
  method?: string | null
  doc?: string | null
  estimateId?: string
  month?: string
  idx?: DecadeIdx
  replaced?: boolean
}
export type Cell = { total: number; items: CellItem[] }

export type DecadeResult = {
  decade: Decade
  inizio: number
  rows: Record<RowKey, Cell>
  uscite: number
  fine: number
  fido: number
  dispFido: number
  soglia: number
  fabbisogno: number
}

export type BlockInput = {
  code: BlockCode | 'GRUPPO'
  label: string
  companyIds: string[]
  balanceCents: number
  creditLineCents: number
  balanceDate: string | null
  balanceDatesDiffer: boolean
  thresholdCents: number
  today: string
  backlogBefore: Map<string, string | null>   // companyId → taglio
  rows: OutRow[]
  estimates: Estimate[]
  overrides: Map<string, number>              // `${estimateId}|${month}|${idx}` → cents
  realStaff: Set<string>                      // `${companyId}|${commitmentType}|${month}` (mese di cassa)
  manualRevenue: Map<string, number>          // `${companyId}|${month}` → cents (monthly_revenue_forecasts)
  coffa: { days: Map<string, number>; months: Map<string, number> } | null  // giorno/mese 'YYYY-MM' → cents
}

export type BlockResult = {
  code: BlockCode | 'GRUPPO'
  label: string
  balanceCents: number
  creditLineCents: number
  balanceDate: string | null
  balanceDatesDiffer: boolean
  decades: DecadeResult[]
  stockCents: number
  stockCount: number
  beyondCents: number
}

function emptyRows(): Record<RowKey, Cell> {
  return {
    incassi: { total: 0, items: [] }, muro: { total: 0, items: [] }, automatici: { total: 0, items: [] },
    pianificati: { total: 0, items: [] }, fattureSotto: { total: 0, items: [] },
    fattureSopra: { total: 0, items: [] }, nuoveFatture: { total: 0, items: [] },
  }
}

function add(cell: Cell, item: CellItem) {
  cell.total += item.cents
  cell.items.push(item)
}

export const SOGLIA_FATTURA_CENTS = 30000

export function computeBlock(input: BlockInput, decades: Decade[]): BlockResult {
  const rows = decades.map(() => emptyRows())
  let stockCents = 0, stockCount = 0, beyondCents = 0

  const utenzeCompanies = new Set(
    input.estimates.filter(e => e.kind === 'muro' && e.category === 'utenze').map(e => e.companyId),
  )
  const blockHasUtenze = input.companyIds.some(id => utenzeCompanies.has(id))

  // Uscite reali dallo scadenzario e dagli impegni
  for (const r of input.rows) {
    const route = routeOut(r, {
      today: input.today,
      backlogBefore: input.backlogBefore.get(r.companyId) ?? null,
      blockHasUtenzeEstimate: blockHasUtenze,
    })
    if (route === 'escluso') continue
    if (route === 'stock') { stockCents += r.residualCents; stockCount++; continue }
    const e = effectiveDate(r)
    const b = bucketOf(decades, e)
    if (b < 0) { beyondCents += r.residualCents; continue }
    const label = r.supplierName ?? r.documentNumber ?? '—'
    const source: CellItem['source'] = r.entryType === 'accounting' ? 'scadenzario'
      : route === 'muro' ? 'staff' : 'impegno'
    const item: CellItem = {
      label, cents: r.residualCents, source, date: e, rowId: r.id, companyId: r.companyId, method: r.paymentMethod,
      doc: r.documentNumber,
    }
    const key: RowKey = route === 'muro' ? 'muro'
      : route === 'automatico' ? 'automatici'
      : route === 'pianificato' ? 'pianificati'
      : r.residualCents < SOGLIA_FATTURA_CENTS ? 'fattureSotto' : 'fattureSopra'
    add(rows[b][key], item)
  }

  // Stime per decade
  const coffaFirstMonth = decades[0].month
  const from = input.balanceDate && input.balanceDate >= decades[0].from ? input.balanceDate : null
  for (const est of input.estimates) {
    if (!input.companyIds.includes(est.companyId)) continue
    const months = [...new Set(decades.map(d => d.month))]
    for (const month of months) {
      const replaced = est.kind !== 'incasso'
        && est.replacedBy.some(t => input.realStaff.has(`${est.companyId}|${t}|${month}`))

      let monthly = est.monthlyCents
      let source: CellItem['source'] = 'stima'
      const manual = input.manualRevenue.get(`${est.companyId}|${month}`)
      if (est.kind === 'incasso' && est.category !== 'coffa' && manual && manual > 0) {
        monthly = manual; source = 'previsione'
      }
      if (est.category === 'coffa' && input.coffa) {
        if (month === coffaFirstMonth) {
          // mese in corso: giorni di cassa previsti da Coffa dopo la data del saldo
          for (let i = 0; i < decades.length; i++) {
            const d = decades[i]
            if (d.month !== month) continue
            const ovr = input.overrides.get(`${est.id}|${month}|${d.idx}`)
            let cents = 0
            for (const [day, c] of input.coffa.days) {
              if (day < d.from || day > d.to) continue
              if (from && day <= from) continue
              cents += c
            }
            add(rows[i].incassi, {
              label: est.label, cents: ovr ?? cents, source: 'coffa',
              estimateId: est.id, month, idx: d.idx,
            })
          }
          continue
        }
        const m = input.coffa.months.get(month)
        if (m !== undefined) { monthly = m; source = 'coffa' }
      }

      const quote = splitMonthly(monthly, est.pct)
      for (let i = 0; i < decades.length; i++) {
        const d = decades[i]
        if (d.month !== month) continue
        const ovr = input.overrides.get(`${est.id}|${month}|${d.idx}`)
        const cents = replaced ? 0 : (ovr ?? quote[d.idx - 1])
        const key: RowKey = est.kind === 'incasso' ? 'incassi'
          : est.kind === 'muro' ? 'muro'
          : est.kind === 'automatico' ? 'automatici' : 'nuoveFatture'
        if (cents === 0 && !replaced && ovr === undefined) continue
        add(rows[i][key], {
          label: est.label + (replaced ? ' (sostituita dalle righe reali)' : ''),
          cents, source, estimateId: est.id, companyId: est.companyId, month, idx: d.idx, replaced,
        })
      }
    }
  }

  const out: DecadeResult[] = []
  let inizio = input.balanceCents
  for (let i = 0; i < decades.length; i++) {
    const r = rows[i]
    const uscite = OUT_ROWS.reduce((s, k) => s + r[k].total, 0)
    const fine = inizio + r.incassi.total - uscite
    out.push({
      decade: decades[i], inizio, rows: r, uscite, fine,
      fido: input.creditLineCents,
      dispFido: fine + input.creditLineCents,
      soglia: input.thresholdCents,
      fabbisogno: Math.max(0, input.thresholdCents - fine),
    })
    inizio = fine
  }

  return {
    code: input.code, label: input.label,
    balanceCents: input.balanceCents, creditLineCents: input.creditLineCents,
    balanceDate: input.balanceDate, balanceDatesDiffer: input.balanceDatesDiffer,
    decades: out, stockCents, stockCount, beyondCents,
  }
}

// Somma dei blocchi: le righe si sommano, il saldo si ricalcola con la soglia di gruppo.
export function sumBlocks(blocks: BlockResult[], groupThresholdCents: number, label = 'Gruppo'): BlockResult {
  const n = blocks[0]?.decades.length ?? 0
  const decades: DecadeResult[] = []
  const balanceCents = blocks.reduce((s, b) => s + b.balanceCents, 0)
  const creditLineCents = blocks.reduce((s, b) => s + b.creditLineCents, 0)
  let inizio = balanceCents
  for (let i = 0; i < n; i++) {
    const rows = emptyRows()
    for (const b of blocks) {
      for (const k of Object.keys(rows) as RowKey[]) {
        rows[k].total += b.decades[i].rows[k].total
        rows[k].items.push(...b.decades[i].rows[k].items)
      }
    }
    const uscite = OUT_ROWS.reduce((s, k) => s + rows[k].total, 0)
    const fine = inizio + rows.incassi.total - uscite
    decades.push({
      decade: blocks[0].decades[i].decade, inizio, rows, uscite, fine,
      fido: creditLineCents, dispFido: fine + creditLineCents,
      soglia: groupThresholdCents, fabbisogno: Math.max(0, groupThresholdCents - fine),
    })
    inizio = fine
  }
  const dates = blocks.map(b => b.balanceDate).filter((d): d is string => !!d)
  return {
    code: 'GRUPPO', label, balanceCents, creditLineCents,
    balanceDate: dates.length ? dates.sort()[dates.length - 1] : null,
    balanceDatesDiffer: new Set(dates).size > 1 || blocks.some(b => b.balanceDatesDiffer),
    decades,
    stockCents: blocks.reduce((s, b) => s + b.stockCents, 0),
    stockCount: blocks.reduce((s, b) => s + b.stockCount, 0),
    beyondCents: blocks.reduce((s, b) => s + b.beyondCents, 0),
  }
}

// ─── La finestra di pagamento (regole del 07/09/2026) ───────────────────────
//
// In ogni decade il muro, le uscite automatiche, gli impegni e le fatture sotto
// 300 € si pagano per intero. Quello che resta, tolta la soglia minima, si divide
// fra TUTTI i fornitori sopra 300 € con una sola percentuale: nessuno a zero,
// nessuno scelto. Quello che non si paga slitta alla decade dopo e si somma al
// dovuto. La percentuale è una per tutto il gruppo: i blocchi la ricevono già decisa.

export type WindowDecade = {
  dovuto: number
  suggerita: number
  decisa: number | null
  applicata: number
  pagato: number
  riporto: number
  inizio: number
  fine: number
  dispFido: number
  fabbisogno: number
}

export type InvoiceLedger = {
  key: string
  label: string
  rowId?: string
  companyId?: string
  date?: string
  method?: string | null
  doc?: string | null
  estimate: boolean      // stima delle nuove fatture, non una fattura vera
  start: number          // decade in cui entra nel dovuto
  original: number
  before: number[]       // quanto restava all'inizio di ogni decade
  paid: number[]         // quanto si paga in ogni decade
}

export type WindowResult = { decades: WindowDecade[]; invoices: InvoiceLedger[] }

export function suggestPct(disponibile: number, dovuto: number): number {
  if (dovuto <= 0) return 1
  return Math.max(0, Math.min(1, disponibile / dovuto))
}

export function allocateWindow(
  result: BlockResult,
  pctFor: (i: number, disponibile: number, dovuto: number) => { suggerita: number; decisa: number | null },
): WindowResult {
  const n = result.decades.length
  const invoices: InvoiceLedger[] = []
  result.decades.forEach((d, i) => {
    for (const it of [...d.rows.fattureSopra.items, ...d.rows.nuoveFatture.items]) {
      if (it.cents <= 0) continue
      invoices.push({
        key: it.rowId ?? `${it.estimateId}|${it.month}|${it.idx}`,
        label: it.label, rowId: it.rowId, companyId: it.companyId, date: it.date, method: it.method,
        doc: it.doc, estimate: !it.rowId, start: i, original: it.cents, before: Array(n).fill(0), paid: Array(n).fill(0),
      })
    }
  })

  const decades: WindowDecade[] = []
  let inizio = result.balanceCents
  for (let i = 0; i < n; i++) {
    const d = result.decades[i]
    const r = d.rows
    const base = inizio + r.incassi.total - r.muro.total - r.automatici.total - r.pianificati.total - r.fattureSotto.total
    const open = invoices.filter(v => v.start <= i)
    for (const v of open) v.before[i] = v.original - v.paid.slice(0, i).reduce((a, b) => a + b, 0)
    const dovuto = open.reduce((s, v) => s + v.before[i], 0)
    const { suggerita, decisa } = pctFor(i, base - d.soglia, dovuto)
    const applicata = decisa ?? suggerita
    let pagato = 0
    for (const v of open) {
      const pay = Math.round(v.before[i] * applicata)
      v.paid[i] = pay
      pagato += pay
    }
    const fine = base - pagato
    decades.push({
      dovuto, suggerita, decisa, applicata, pagato, riporto: dovuto - pagato,
      inizio, fine, dispFido: fine + d.fido, fabbisogno: Math.max(0, d.soglia - fine),
    })
    inizio = fine
  }
  return { decades, invoices }
}

// Un fornitore è lo stesso nelle quattro società: si confronta il nome senza
// punteggiatura e senza forma societaria.
export function supplierKey(name: string): string {
  return name.toUpperCase()
    .replace(/[.,'"&()\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(S R L S|S R L|SRLS|SRL|S P A|SPA|S N C|SNC|S A S|SAS|S S D|SSD|A P S|APS|A R L|ARL|UNIPERSONALE|SOCIETA|SOCIETÀ|A SOCIO UNICO)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

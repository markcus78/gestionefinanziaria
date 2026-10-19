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

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000)
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
  supplierId: string | null
  supplierName: string | null
  supplierCategory: string | null
  excludeFromTreasury: boolean
  supplierAsStaff?: boolean     // fornitore trattato come personale (es. Casali Marco)
  installmentsOnly?: boolean    // fornitore «solo rate» (es. Acea ATO 2)
  isInstallment?: boolean       // la riga è una rata: il suo documento ha più scadenze
  dueDate: string
  postponedTo: string | null
  residualCents: number
  paymentMethod: string | null
  entryType: 'accounting' | 'commitment'
  commitmentType: string | null
  documentNumber: string | null
  isIntercompany: boolean
}

export type Route = 'muro' | 'automatico' | 'pianificato' | 'f24' | 'fattura' | 'stock' | 'escluso'

// F24 (regola di Marco, 12/10/2026): fino alla scadenza del 16 è muro. Scaduto, resta da
// recuperare col ravvedimento fino alla fine del mese dopo la scadenza (riga a parte, si può
// posticipare). Dopo quella data non si paga più subito: si aspetta la cartella e va in arretrato.
export function f24Limit(dueDate: string): string {
  return decadeBounds(nextMonth(dueDate.slice(0, 7)), 3).to
}
export function f24Phase(dueDate: string, today: string): 'muro' | 'f24' | 'stock' {
  if (dueDate >= today) return 'muro'
  return today > f24Limit(dueDate) ? 'stock' : 'f24'
}

// Impegni che non passano mai dallo scadenzario e si pagano per intero (muro): personale, F24,
// rate di finanziamenti (banche, soci, altri) e tasse e tributi (cartelle, rateizzazioni).
// Una lista sola: la usano l'instradamento e la pagina (stime sostituite dalle righe vere).
export const MURO_COMMITMENT_TYPES = ['salary_item', 'extra_item', 'collab_item', 'piva_item', 'tax_item', 'loan_item', 'tributi_item']
const STAFF_TYPES = new Set(MURO_COMMITMENT_TYPES)

export function effectiveDate(r: Pick<OutRow, 'dueDate' | 'postponedTo'>): string {
  return r.postponedTo ?? r.dueDate
}

export function routeOut(
  r: OutRow,
  ctx: { today: string; backlogBefore: string | null },
): Route {
  const e = effectiveDate(r)
  if (r.residualCents <= 0) return 'escluso'
  if (r.documentNumber?.startsWith('BDG-') || r.commitmentType === 'forecast') return 'escluso'
  if (r.excludeFromTreasury || r.isIntercompany) return 'escluso'
  // Fornitore trattato come personale: muro, anche se scaduto (lo stipendio arretrato si paga)
  if (r.supplierAsStaff && r.entryType === 'accounting') return 'muro'
  // Fornitore «solo rate»: le rate si pagano per intero (saltarne una fa saltare il piano);
  // le bollette a scadenza unica si lasciano scadere e tornano come rate
  if (r.installmentsOnly && r.entryType === 'accounting') return r.isInstallment ? 'muro' : 'escluso'

  if (r.entryType === 'commitment') {
    if (r.commitmentType === 'tax_item') return f24Phase(r.dueDate, ctx.today)
    return r.commitmentType && STAFF_TYPES.has(r.commitmentType) ? 'muro' : 'pianificato'
  }

  if (ctx.backlogBefore && e < ctx.backlogBefore) return 'stock'
  if (r.supplierCategory === 'utenze') {
    // le utenze si pagano per intero: la fattura vera conta nel muro e consuma la stima del suo
    // fornitore (regola di Marco, 14/10/2026: «elimini la stima e metti la fattura»).
    // Scaduta da poco (fino alla fine del mese dopo, come gli F24): ancora muro; più vecchia:
    // arretrato (regola del 12/10, bolletta Forini del 3/10)
    if (e >= ctx.today) return 'muro'
    return ctx.today > f24Limit(r.dueDate) ? 'stock' : 'muro'
  }
  if (r.supplierCategory === 'tributi_f24') {
    // il futuro è coperto dalla stima F24; lo scaduto segue la regola del ravvedimento
    const ph = f24Phase(r.dueDate, ctx.today)
    return ph === 'muro' ? (e >= ctx.today ? 'escluso' : 'f24') : ph
  }
  if (r.supplierCategory === 'stipendi') {
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
  supplierId?: string | null    // le fatture di questo fornitore consumano la stima
}

// Fattura dello scadenzario (anche già pagata) che può consumare una stima del suo mese
export type MonthInvoice = {
  id: string
  companyId: string
  supplierId: string | null
  label: string
  doc: string | null
  date: string        // data effettiva (posticipo o scadenza)
  cents: number       // importo intero della fattura
  generic: boolean    // può consumare la stima «altri fornitori» (non esclusa, non infragruppo, non personale…)
}

// Le fatture vere consumano la quota della LORO decade; quello che avanza consuma le decadi
// dopo dello stesso mese, poi quelle prima. Esempio (Marco, 14/10): prodotti piscina 2.000 €,
// 50% D1 e 50% D3; pagata la pro forma di D1, la quota di D3 resta intera.
export function consumeByDecade(quotes: [number, number, number], used: [number, number, number]): [number, number, number] {
  const r: [number, number, number] = [...quotes]
  let carry = 0
  for (let i = 0; i < 3; i++) {
    const take = used[i] + carry
    const u = Math.min(r[i], take)
    r[i] -= u
    carry = take - u
  }
  for (let i = 2; i >= 0 && carry > 0; i--) {
    const u = Math.min(r[i], carry)
    r[i] -= u
    carry -= u
  }
  return r
}

// Quanto della stima di un mese resta, tolte le fatture vere già arrivate (minimo zero)
export function consumeEstimate(
  est: Pick<Estimate, 'companyId' | 'kind' | 'supplierId'>, month: string, invoices: MonthInvoice[], ownEstimate: Set<string>,
): MonthInvoice[] | null {
  if (est.kind === 'incasso') return null
  if (!est.supplierId && est.kind !== 'fornitori') return null
  return invoices.filter(iv => iv.companyId === est.companyId && iv.date.slice(0, 7) === month && (
    est.supplierId
      ? iv.supplierId === est.supplierId
      : iv.generic && !(iv.supplierId && ownEstimate.has(iv.supplierId))
  ))
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

export type RowKey = 'incassi' | 'muro' | 'automatici' | 'pianificati' | 'f24' | 'arretrati' | 'fattureSotto' | 'fattureSopra' | 'nuoveFatture'
export const OUT_ROWS: RowKey[] = ['muro', 'automatici', 'pianificati', 'f24', 'arretrati', 'fattureSotto', 'fattureSopra', 'nuoveFatture']

export type CellItem = {
  label: string
  cents: number
  source: 'stima' | 'coffa' | 'previsione' | 'scadenzario' | 'impegno' | 'staff' | 'piano' | 'reale' | 'pagato' | 'provvista'
  transferId?: string
  date?: string
  rowId?: string
  companyId?: string
  supplierId?: string | null
  installmentId?: string
  itemId?: string
  method?: string | null
  doc?: string | null
  estimateId?: string
  month?: string
  idx?: DecadeIdx
  replaced?: boolean
  // solo sulle stime che si consumano: le fatture vere già arrivate di questa decade
  covered?: CellItem[]
  monthCoveredCents?: number   // fatture vere di tutto il mese
  monthEstimateCents?: number  // stima del mese prima del consumo
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
  // righe vere del personale (anche pagate): `${companyId}|${commitmentType}|${month}` (mese di cassa)
  realStaff: Map<string, { date: string; cents: number }[]>
  manualRevenue: Map<string, number>          // `${companyId}|${month}` → cents (monthly_revenue_forecasts)
  coffa: { days: Map<string, number>; months: Map<string, number> } | null  // giorno/mese 'YYYY-MM' → cents
  installments?: Installment[]                // quote non pagate dei piani di rientro
  invoices?: MonthInvoice[]                   // fatture dei mesi dell'orizzonte, anche pagate (consumano le stime)
  realIncassi?: RealIncasso[]                 // incassi registrati da Orianna (sezione Incassi)
  paidAfter?: PaidMove[]                      // pagamenti registrati in GF (payment_transactions)
  transfers?: Transfer[]                      // provviste fra società (Appiae → Hangar / Aries, e ritorno)
}

// Provvista infragruppo (Marco, 19/10/2026): Appiae dà cassa ad Hangar o ad Aries (che paga per WT),
// o una società la restituisce. Per chi dà è un'uscita con la priorità del muro, per chi riceve un incasso.
export type Transfer = {
  id: string
  fromCompanyId: string
  toCompanyId: string
  cents: number
  dueDate: string          // entro quando serve
  paidDate: string | null  // giroconto fatto
  label: string            // «Provvista Appiae → Hangar»
}

// Incasso vero registrato in GF: il giorno della vendita e il giorno in cui i soldi arrivano in banca
export type RealIncasso = {
  companyId: string
  channel: string
  saleDate: string
  arrival: string
  cents: number
  cashCounts?: boolean   // contanti che si versano in banca (Hangar, regola del 19/10): contano
}
export type PaidMove = { companyId: string; label: string; date: string; cents: number }

// Coffa mette in cassa una vendita 5 giorni dopo (crm-wt/src/lib/tesoreria.ts, GIORNI_INCASSO):
// le vendite fino all'ultimo giorno registrato da Orianna sono già contate dalle sue righe,
// quindi i giorni di Coffa fino a quel giorno + 5 non si contano (altrimenti doppio conteggio)
export const COFFA_GIORNI_INCASSO = 5

// I contanti restano in cassa per le spese piccole e vengono versati solo a volte:
// non sono soldi in banca. Il versamento si vede come differenza al saldo successivo.
export function isCashChannel(channel: string): boolean {
  return channel.trim().toLowerCase() === 'contanti'
}

// Quanta parte di una decade resta da coprire con una stima, se i giorni fino a `covered`
// sono già contati (dal saldo o dagli incassi registrati)
export function uncoveredShare(d: { from: string; to: string }, covered: string | null): number {
  if (!covered || covered < d.from) return 1
  if (covered >= d.to) return 0
  return daysBetween(covered, d.to) / (daysBetween(d.from, d.to) + 1)
}

export type Installment = {
  id: string
  itemId: string
  companyId: string
  label: string
  month: string
  idx: DecadeIdx
  cents: number
}

export type BlockResult = {
  code: BlockCode | 'GRUPPO'
  label: string
  // saldo da cui parte il cruscotto: saldo della banca + incassi arrivati dopo − pagamenti registrati dopo
  balanceCents: number
  bankBalanceCents: number
  incassiDopoSaldo: CellItem[]
  pagatiDopoSaldo: CellItem[]
  lastRegistered: string | null   // ultimo giorno di incassi registrato (il più vecchio fra le società)
  creditLineCents: number
  balanceDate: string | null
  balanceDatesDiffer: boolean
  decades: DecadeResult[]
  stockCents: number
  stockCount: number
  stockItems: CellItem[]
  beyondCents: number
  // stime superate dalle fatture vere del mese
  estimateOver: { label: string; month: string; invoicesCents: number; estimateCents: number }[]
}

function emptyRows(): Record<RowKey, Cell> {
  return {
    incassi: { total: 0, items: [] }, muro: { total: 0, items: [] }, automatici: { total: 0, items: [] },
    pianificati: { total: 0, items: [] }, f24: { total: 0, items: [] }, arretrati: { total: 0, items: [] }, fattureSotto: { total: 0, items: [] },
    fattureSopra: { total: 0, items: [] }, nuoveFatture: { total: 0, items: [] },
  }
}

function add(cell: Cell, item: CellItem) {
  cell.total += item.cents
  cell.items.push(item)
}

export const SOGLIA_FATTURA_CENTS = 30000
export const F24_CREDITOR = 'Erario – F24'

export function computeBlock(input: BlockInput, decades: Decade[]): BlockResult {
  const rows = decades.map(() => emptyRows())
  let stockCents = 0, stockCount = 0, beyondCents = 0
  const stockItems: CellItem[] = []
  const estimateOver: BlockResult['estimateOver'] = []
  const ownEstimate = new Set(input.estimates.map(e => e.supplierId).filter((x): x is string => !!x))
  const D = input.balanceDate

  // Incassi registrati: arrivati in banca dopo il saldo e fino a oggi → si sommano al saldo;
  // in arrivo dopo oggi → nella loro decade. Quelli fino alla data del saldo sono già nel saldo.
  const lastReg = new Map<string, string>()
  const incassiDopoSaldo: CellItem[] = []
  const futureReal: CellItem[] = []
  for (const r of input.realIncassi ?? []) {
    if (!input.companyIds.includes(r.companyId)) continue
    if (r.saleDate > (lastReg.get(r.companyId) ?? '')) lastReg.set(r.companyId, r.saleDate)
    // i contanti non contano (restano in cassa per le spese piccole), salvo il canale che li versa
    if ((isCashChannel(r.channel) && !r.cashCounts) || r.cents <= 0) continue
    if (r.arrival <= input.today && (!D || r.arrival <= D)) continue
    const item: CellItem = {
      label: `${r.channel} del ${r.saleDate.slice(8, 10)}/${r.saleDate.slice(5, 7)}`, cents: r.cents, source: 'reale',
      date: r.arrival, companyId: r.companyId,
    }
    if (r.arrival <= input.today) incassiDopoSaldo.push(item)
    else futureReal.push(item)
  }
  const pagatiDopoSaldo: CellItem[] = D ? (input.paidAfter ?? [])
    .filter(p => input.companyIds.includes(p.companyId) && p.date > D && p.cents > 0)
    .map(p => ({ label: p.label, cents: p.cents, source: 'pagato' as const, date: p.date, companyId: p.companyId }))
    : []
  // Provviste già fatte dopo la data del saldo: per chi riceve sono incassi, per chi dà pagamenti
  // (quelle fino alla data del saldo sono già nel saldo della banca)
  const futureTransfers: { item: CellItem; out: boolean }[] = []
  for (const t of input.transfers ?? []) {
    const isFrom = input.companyIds.includes(t.fromCompanyId)
    const isTo = input.companyIds.includes(t.toCompanyId)
    if (isFrom === isTo) continue   // fuori dal blocco, o giro dentro lo stesso blocco
    const item: CellItem = { label: t.label, cents: t.cents, source: 'provvista', date: t.paidDate ?? t.dueDate, companyId: isFrom ? t.fromCompanyId : t.toCompanyId, transferId: t.id }
    if (t.paidDate) {
      if (D && t.paidDate <= D) continue
      if (t.paidDate > input.today) { futureTransfers.push({ item, out: isFrom }); continue }
      if (isFrom) pagatiDopoSaldo.push({ ...item, source: 'pagato' })
      else incassiDopoSaldo.push(item)
    } else {
      futureTransfers.push({ item, out: isFrom })
    }
  }
  const startCents = input.balanceCents
    + incassiDopoSaldo.reduce((s, i) => s + i.cents, 0)
    - pagatiDopoSaldo.reduce((s, i) => s + i.cents, 0)
  // giorni già contati per società: fino al saldo e fino all'ultimo incasso registrato
  const coveredUntil = (companyId: string): string | null => {
    const l = lastReg.get(companyId) ?? null
    if (!D) return l
    return l && l > D ? l : D
  }

  // Uscite reali dallo scadenzario e dagli impegni
  for (const r of input.rows) {
    const route = routeOut(r, {
      today: input.today,
      backlogBefore: input.backlogBefore.get(r.companyId) ?? null,
    })
    if (route === 'escluso') continue
    const e = effectiveDate(r)
    if (route === 'stock') {
      stockCents += r.residualCents; stockCount++
      const isF24 = r.commitmentType === 'tax_item' || r.supplierCategory === 'tributi_f24'
      stockItems.push({
        label: isF24 ? F24_CREDITOR : r.supplierName ?? r.documentNumber ?? '—', cents: r.residualCents, source: 'scadenzario', date: e,
        rowId: r.id, companyId: r.companyId, supplierId: r.supplierId, method: r.paymentMethod, doc: r.documentNumber,
      })
      continue
    }
    const b = bucketOf(decades, e)
    if (b < 0) { beyondCents += r.residualCents; continue }
    const label = r.supplierName ?? r.documentNumber ?? '—'
    const source: CellItem['source'] = r.entryType === 'accounting' ? 'scadenzario'
      : route === 'muro' || route === 'f24' ? 'staff' : 'impegno'
    const item: CellItem = {
      label, cents: r.residualCents, source, date: e, rowId: r.id, companyId: r.companyId, method: r.paymentMethod,
      doc: r.documentNumber, supplierId: r.supplierId,
    }
    const key: RowKey = route === 'muro' ? 'muro'
      : route === 'f24' ? 'f24'
      : route === 'automatico' ? 'automatici'
      : route === 'pianificato' ? 'pianificati'
      : r.residualCents < SOGLIA_FATTURA_CENTS ? 'fattureSotto' : 'fattureSopra'
    add(rows[b][key], item)
  }

  for (const item of futureReal) {
    const b = bucketOf(decades, item.date!)
    if (b >= 0) add(rows[b].incassi, item)
  }
  // provviste da fare: nella decade della data (se è passata, in quella in corso)
  for (const { item, out } of futureTransfers) {
    const b = bucketOf(decades, item.date!)
    if (b < 0) continue
    add(out ? rows[b].muro : rows[b].incassi, item)
  }

  // Stime per decade
  const coffaFirstMonth = decades[0].month
  for (const est of input.estimates) {
    if (!input.companyIds.includes(est.companyId)) continue
    const months = [...new Set(decades.map(d => d.month))]
    for (const month of months) {
      // Personale e F24 (Marco, 15/10/2026): la stima si carica prima; quando in Staff si caricano i
      // file definitivi del mese (paghe, collaboratori e P.IVA di Athletis, F24) la stima si trasforma
      // negli impegni del file e sparisce tutta, anche se il file dice meno della stima.
      const staffRows = est.kind === 'incasso' ? []
        : est.replacedBy.flatMap(t => input.realStaff.get(`${est.companyId}|${t}|${month}`) ?? [])
      const staffCents = staffRows.reduce((s, r) => s + r.cents, 0)

      let monthly = est.monthlyCents
      let source: CellItem['source'] = 'stima'
      // Stime che si consumano: le fatture vere del mese (anche pagate) tolgono la loro parte
      const consumed = consumeEstimate(est, month, input.invoices ?? [], ownEstimate)
      const consumedCents = consumed?.reduce((s, iv) => s + iv.cents, 0) ?? 0
      if (consumed) {
        if (consumedCents > est.monthlyCents) {
          estimateOver.push({ label: est.label, month, invoicesCents: consumedCents, estimateCents: est.monthlyCents })
        }
      }
      const manual = input.manualRevenue.get(`${est.companyId}|${month}`)
      if (est.kind === 'incasso' && est.category !== 'coffa' && manual && manual > 0) {
        monthly = manual; source = 'previsione'
      }
      if (est.category === 'coffa' && input.coffa) {
        if (month === coffaFirstMonth) {
          // mese in corso: giorni di cassa previsti da Coffa dopo la data del saldo e dopo
          // le vendite già registrate da Orianna (+ i giorni che Coffa aspetta per l'incasso)
          const lr = lastReg.get(est.companyId)
          const lrCut = lr ? addDays(lr, COFFA_GIORNI_INCASSO) : null
          const from = D && lrCut ? (D > lrCut ? D : lrCut) : (D ?? lrCut)
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

      let quote = splitMonthly(monthly, est.pct)
      const replaced = staffRows.length > 0
      if (consumed?.length) {
        const used: [number, number, number] = [0, 0, 0]
        for (const iv of consumed) used[decadeOf(iv.date).idx - 1] += iv.cents
        quote = consumeByDecade(quote, used)
      }
      for (let i = 0; i < decades.length; i++) {
        const d = decades[i]
        if (d.month !== month) continue
        const ovr = input.overrides.get(`${est.id}|${month}|${d.idx}`)
        // incassi stimati: i giorni già nel saldo o già registrati non si stimano più
        const share = est.kind === 'incasso' ? uncoveredShare(d, coveredUntil(est.companyId)) : 1
        const cents = replaced ? 0 : (ovr ?? Math.round(quote[d.idx - 1] * share))
        const key: RowKey = est.kind === 'incasso' ? 'incassi'
          : est.kind === 'muro' ? 'muro'
          : est.kind === 'automatico' ? 'automatici' : 'nuoveFatture'
        if (cents === 0 && !replaced && ovr === undefined && !consumed?.length) continue
        add(rows[i][key], {
          label: est.label + (replaced
            ? ` (diventata impegni: ${Math.round(staffCents / 100).toLocaleString('it-IT')} € dal file, stima ${Math.round(monthly / 100).toLocaleString('it-IT')} €)` : ''),
          cents, source, estimateId: est.id, companyId: est.companyId, month, idx: d.idx, replaced,
          ...(consumed ? {
            covered: consumed.filter(iv => iv.date >= d.from && iv.date <= d.to).map(iv => ({
              label: iv.label, cents: iv.cents, source: 'scadenzario' as const, date: iv.date, rowId: iv.id,
              companyId: iv.companyId, doc: iv.doc,
            })),
            monthCoveredCents: consumedCents,
            monthEstimateCents: est.monthlyCents,
          } : {}),
        })
      }
    }
  }

  // Quote dei piani di rientro: una quota non pagata di una decade passata va in quella in corso
  for (const q of input.installments ?? []) {
    if (!input.companyIds.includes(q.companyId)) continue
    const key = `${q.month}|${q.idx}`
    let b = decades.findIndex(d => d.key === key)
    if (b < 0) {
      if (key < decades[0].key) b = 0
      else { beyondCents += q.cents; continue }
    }
    add(rows[b].arretrati, {
      label: q.label, cents: q.cents, source: 'piano', companyId: q.companyId,
      installmentId: q.id, itemId: q.itemId, month: q.month, idx: q.idx,
    })
  }

  const out: DecadeResult[] = []
  let inizio = startCents
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
    balanceCents: startCents, bankBalanceCents: input.balanceCents, incassiDopoSaldo, pagatiDopoSaldo,
    lastRegistered: input.companyIds.some(id => lastReg.has(id))
      ? [...lastReg.values()].sort()[0] : null,
    creditLineCents: input.creditLineCents,
    balanceDate: input.balanceDate, balanceDatesDiffer: input.balanceDatesDiffer,
    decades: out, stockCents, stockCount, stockItems, beyondCents, estimateOver,
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
        // le provviste sono giroconti fra le nostre società: nel gruppo si annullano
        const items = b.decades[i].rows[k].items.filter(it => it.source !== 'provvista')
        rows[k].total += items.reduce((s, it) => s + it.cents, 0)
        rows[k].items.push(...items)
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
    bankBalanceCents: blocks.reduce((s, b) => s + b.bankBalanceCents, 0),
    incassiDopoSaldo: blocks.flatMap(b => b.incassiDopoSaldo).filter(i => i.source !== 'provvista'),
    pagatiDopoSaldo: blocks.flatMap(b => b.pagatiDopoSaldo).filter(i => !i.transferId),
    lastRegistered: null,
    balanceDate: dates.length ? dates.sort()[dates.length - 1] : null,
    balanceDatesDiffer: new Set(dates).size > 1 || blocks.some(b => b.balanceDatesDiffer),
    decades,
    stockCents: blocks.reduce((s, b) => s + b.stockCents, 0),
    stockCount: blocks.reduce((s, b) => s + b.stockCount, 0),
    stockItems: blocks.flatMap(b => b.stockItems),
    beyondCents: blocks.reduce((s, b) => s + b.beyondCents, 0),
    estimateOver: blocks.flatMap(b => b.estimateOver),
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
  fromPlan: boolean   // importi dei fornitori presi dal piano della decade, non dalla percentuale
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
  planKey?: string       // società + fornitore, per il piano della decade
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

// Chiave del fornitore nel piano della decade: la società più il fornitore dell'anagrafica,
// oppure il nome normalizzato se la riga non ha fornitore
export function planKey(companyId: string, supplierId: string | null | undefined, name: string | null | undefined): string {
  return `${companyId}|${backlogKey(supplierId, name)}`
}

// Piano della decade (Marco, 19/10/2026): nelle decadi con un piano i fornitori sopra i 300 € non si
// pagano in percentuale, ma con l'importo deciso per ognuno, dalla fattura più vecchia.
// `planned(i)` dà, per chiave del fornitore, quanto resta da pagare nella decade i (null = nessun piano).
export function allocateWindow(
  result: BlockResult,
  pctFor: (i: number, disponibile: number, dovuto: number) => { suggerita: number; decisa: number | null },
  planned?: (i: number) => Map<string, number> | null,
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
        planKey: it.rowId && it.companyId ? planKey(it.companyId, it.supplierId, it.label) : undefined,
      })
    }
  })

  const decades: WindowDecade[] = []
  let inizio = result.balanceCents
  for (let i = 0; i < n; i++) {
    const d = result.decades[i]
    const r = d.rows
    const base = inizio + r.incassi.total - r.muro.total - r.automatici.total - r.pianificati.total - r.f24.total - r.arretrati.total - r.fattureSotto.total
    const open = invoices.filter(v => v.start <= i)
    for (const v of open) v.before[i] = v.original - v.paid.slice(0, i).reduce((a, b) => a + b, 0)
    const dovuto = open.reduce((s, v) => s + v.before[i], 0)
    const { suggerita, decisa } = pctFor(i, base - d.soglia, dovuto)
    const plan = planned?.(i) ?? null
    let applicata = decisa ?? suggerita
    let pagato = 0
    if (plan) {
      const left = new Map(plan)
      const byAge = [...open].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      for (const v of byAge) {
        const rest = v.planKey ? left.get(v.planKey) ?? 0 : 0
        const pay = Math.min(v.before[i], rest)
        v.paid[i] = pay
        pagato += pay
        if (v.planKey && pay) left.set(v.planKey, rest - pay)
      }
      applicata = dovuto > 0 ? pagato / dovuto : 1
    } else {
      for (const v of open) {
        const pay = Math.round(v.before[i] * applicata)
        v.paid[i] = pay
        pagato += pay
      }
    }
    const fine = base - pagato
    decades.push({
      fromPlan: !!plan, dovuto, suggerita, decisa, applicata, pagato, riporto: dovuto - pagato,
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

// ─── Il debito arretrato (Pezzo 3) ───────────────────────────────────────────
//
// L'arretrato sono le partite che il cruscotto lascia fuori (stockItems). Si raggruppano
// per creditore dentro la società: la decisione e il piano di rientro stanno in
// backlog_items e backlog_installments, le righe restano quelle dello scadenzario.

export type BacklogDecision = 'da_decidere' | 'pagare' | 'dilazionare' | 'stralcio' | 'non_si_paga'

export function backlogKey(supplierId: string | null | undefined, name: string | null | undefined): string {
  return supplierId ? `S:${supplierId}` : `N:${supplierKey(name ?? '')}`
}

export type BacklogItemRow = {
  id: string
  companyId: string
  creditorKey: string
  decision: BacklogDecision
  agreedCents: number | null
  notes: string | null
}
export type BacklogInstallmentRow = {
  id: string
  itemId: string
  month: string
  idx: DecadeIdx
  cents: number
  paidAt: string | null
}

export type BacklogCreditor = {
  companyId: string
  key: string
  name: string
  itemId: string | null
  decision: BacklogDecision
  agreedCents: number | null
  notes: string | null
  rows: CellItem[]         // partite aperte, la più vecchia prima
  residualCents: number    // quanto resta nello scadenzario
  targetCents: number      // quanto si è deciso di pagare: residuo, o l'importo concordato nello stralcio
  plannedCents: number     // quote non ancora pagate
  paidCents: number        // quote pagate
  installments: BacklogInstallmentRow[]
  from: string | null
  to: string | null
}

export function groupBacklog(
  stockItems: CellItem[],
  items: BacklogItemRow[],
  installments: BacklogInstallmentRow[],
): BacklogCreditor[] {
  const byKey = new Map<string, BacklogCreditor>()
  for (const it of stockItems) {
    if (!it.companyId) continue
    const key = backlogKey(it.supplierId, it.label)
    const k = `${it.companyId}|${key}`
    let c = byKey.get(k)
    if (!c) {
      c = {
        companyId: it.companyId, key, name: it.label, itemId: null, decision: 'da_decidere', agreedCents: null, notes: null,
        rows: [], residualCents: 0, targetCents: 0, plannedCents: 0, paidCents: 0, installments: [], from: null, to: null,
      }
      byKey.set(k, c)
    }
    c.rows.push(it)
    c.residualCents += it.cents
  }
  const itemById = new Map(items.map(i => [i.id, i]))
  for (const i of items) {
    const c = byKey.get(`${i.companyId}|${i.creditorKey}`)
    if (!c) continue
    c.itemId = i.id
    c.decision = i.decision
    c.agreedCents = i.agreedCents
    c.notes = i.notes
  }
  const byItem = new Map<string, BacklogCreditor>()
  for (const c of byKey.values()) if (c.itemId) byItem.set(c.itemId, c)
  for (const q of installments) {
    const c = byItem.get(q.itemId)
    if (!c || !itemById.has(q.itemId)) continue
    c.installments.push(q)
    if (q.paidAt) c.paidCents += q.cents
    else c.plannedCents += q.cents
  }
  const out = [...byKey.values()]
  for (const c of out) {
    c.rows.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    c.installments.sort((a, b) => `${a.month}|${a.idx}`.localeCompare(`${b.month}|${b.idx}`))
    c.from = c.rows[0]?.date ?? null
    c.to = c.rows[c.rows.length - 1]?.date ?? null
    c.targetCents = c.decision === 'stralcio' && c.agreedCents !== null
      ? Math.max(0, c.agreedCents - c.paidCents)
      : c.residualCents
  }
  return out.sort((a, b) => b.residualCents - a.residualCents)
}

// Le quote che vanno nel cruscotto: solo quelle non pagate di un creditore deciso
// (pagare, dilazionare, stralcio) e ancora presente nell'arretrato.
export function activeInstallments(creditors: BacklogCreditor[]): Installment[] {
  const out: Installment[] = []
  for (const c of creditors) {
    if (c.decision === 'da_decidere' || c.decision === 'non_si_paga' || !c.itemId) continue
    for (const q of c.installments) {
      if (q.paidAt) continue
      out.push({ id: q.id, itemId: c.itemId, companyId: c.companyId, label: c.name, month: q.month, idx: q.idx, cents: q.cents })
    }
  }
  return out
}

// N quote uguali da una decade: le prime arrotondate per difetto, il resto all'ultima.
export function splitPlan(totalCents: number, n: number, start: Pick<Decade, 'month' | 'idx'>): { month: string; idx: DecadeIdx; cents: number }[] {
  if (n <= 0 || totalCents <= 0) return []
  const q = Math.floor(totalCents / n)
  const out: { month: string; idx: DecadeIdx; cents: number }[] = []
  let month = start.month, idx: DecadeIdx = start.idx
  for (let i = 0; i < n; i++) {
    out.push({ month, idx, cents: i === n - 1 ? totalCents - q * (n - 1) : q })
    if (idx === 3) {
      const [y, m] = month.split('-').map(Number)
      month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      idx = 1
    } else idx = (idx + 1) as DecadeIdx
  }
  return out
}

// ─── Piano della decade (Marco, 19/10/2026) ──────────────────────────────────
//
// Il piano congela solo le decisioni: per ogni fornitore sopra i 300 € l'importo e la priorità,
// più le provviste fra società. Muro, automatiche, F24 da recuperare, quote dell'arretrato,
// impegni e fatture sotto i 300 € restano «vivi»: si leggono dal cruscotto e si pagano per intero.

export type PlanSupplier = {
  id: string
  companyId: string
  key: string            // planKey: società + fornitore
  name: string
  plannedCents: number
  priority: number
  rowIds?: string[]      // fatture del fornitore nel piano, fissate all'approvazione
}

export type SupplierDue = {
  key: string
  companyId: string
  name: string
  dovuto: number         // scaduto + in scadenza fino alla fine della decade, al netto di quanto previsto prima
  oldest: string | null  // scadenza più vecchia
  invoices: number
  rowIds: string[]       // le fatture nella finestra, dalla più vecchia: solo su queste si registra il pagamento
}

// Fornitori sopra i 300 € con qualcosa da pagare entro la decade i (dal registro della finestra:
// tiene conto di quanto le decadi prima pagano già, col piano o con la percentuale)
export function supplierDues(window: WindowResult, i: number): SupplierDue[] {
  const by = new Map<string, SupplierDue>()
  for (const v of window.invoices) {
    if (!v.planKey || v.start > i || v.before[i] <= 0) continue
    const cur = by.get(v.planKey) ?? {
      key: v.planKey, companyId: v.companyId ?? '', name: v.label, dovuto: 0, oldest: null, invoices: 0, rowIds: [] as string[],
    }
    cur.dovuto += v.before[i]
    cur.invoices++
    if (v.rowId) cur.rowIds.push(v.rowId)
    if (v.date && (!cur.oldest || v.date < cur.oldest)) cur.oldest = v.date
    by.set(v.planKey, cur)
  }
  const dateOf = new Map(window.invoices.map(v => [v.rowId, v.date ?? '']))
  for (const d of by.values()) d.rowIds.sort((a, b) => (dateOf.get(a) ?? '').localeCompare(dateOf.get(b) ?? ''))
  return [...by.values()].sort((a, b) => b.dovuto - a.dovuto)
}

// Lo spazio per i fornitori in una decade di un blocco: quello che resta dopo tutto ciò che si paga
// per intero, tolta la soglia minima di cassa
export type BlockSpace = {
  inizio: number
  incassi: number
  perIntero: number      // muro + automatiche + impegni + F24 da recuperare + arretrato + fatture sotto 300 €
  spazio: number         // inizio + incassi − perIntero − soglia
  fornitori: number      // deciso nel piano (o in percentuale, se non c'è piano)
  fine: number           // saldo a fine decade dopo i fornitori
  soglia: number
  fabbisogno: number     // quanto manca per restare sopra la soglia
  primaUscita: string | null  // data della prima uscita per intero della decade
}

export function blockSpace(result: BlockResult, window: WindowResult, i: number): BlockSpace {
  const d = result.decades[i]
  const r = d.rows
  const w = window.decades[i]
  const perIntero = r.muro.total + r.automatici.total + r.pianificati.total + r.f24.total + r.arretrati.total + r.fattureSotto.total
  const dates = [...r.muro.items, ...r.automatici.items, ...r.f24.items]
    .map(it => it.date).filter((x): x is string => !!x).sort()
  return {
    inizio: w.inizio, incassi: r.incassi.total, perIntero,
    spazio: w.inizio + r.incassi.total - perIntero - d.soglia,
    fornitori: w.pagato, fine: w.fine, soglia: d.soglia, fabbisogno: w.fabbisogno,
    primaUscita: dates[0] ?? null,
  }
}

// Provvista suggerita: quello che manca al blocco per restare sopra la soglia, arrotondato ai 100 €
export function suggestedTransfer(space: BlockSpace): number {
  if (space.fabbisogno <= 0) return 0
  return Math.ceil(space.fabbisogno / 10000) * 10000
}

// Quanto resta da pagare a ogni fornitore del piano nella decade: deciso − già pagato nella decade
export function plannedRemaining(plan: PlanSupplier[], paidByKey: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of plan) out.set(p.key, Math.max(0, p.plannedCents - (paidByKey.get(p.key) ?? 0)))
  return out
}

// ─── Esecuzione ──────────────────────────────────────────────────────────────

// Un pagamento registrato nella decade, con quello che serve per capire se era nel piano
export type DecadeTx = {
  id: string
  rowId: string
  companyId: string
  supplierId: string | null
  supplierName: string | null
  paidDate: string
  cents: number
  note: string | null
  discretionary: boolean  // fattura di un fornitore che si decide (non muro, non automatica, non infragruppo)
}

export type LineState = 'da_pagare' | 'pagato' | 'in_parte' | 'scoperto' | 'oltre'

export type LineStatus = { paid: number; state: LineState }

export function lineStatus(planned: number, paid: number, today: string, decadeEnd: string): LineStatus {
  if (paid > planned + 100) return { paid, state: 'oltre' }   // tolleranza di 1 €
  // tolleranza di 1 € sugli arrotondamenti, ma con qualcosa di pagato (un piano da 1 € non è già pagato)
  if (planned > 0 && paid > 0 && paid >= planned - 100) return { paid, state: 'pagato' }
  if (planned === 0) return { paid, state: 'pagato' }
  if (today > decadeEnd) return { paid, state: 'scoperto' }
  return { paid, state: paid > 0 ? 'in_parte' : 'da_pagare' }
}

export function txKey(t: Pick<DecadeTx, 'companyId' | 'supplierId' | 'supplierName'>): string {
  return planKey(t.companyId, t.supplierId, t.supplierName)
}

export function paidByKey(txs: DecadeTx[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of txs) {
    if (t.note?.startsWith('Quota arretrato')) continue
    m.set(txKey(t), (m.get(txKey(t)) ?? 0) + t.cents)
  }
  return m
}

// Pagamenti fuori piano: a un fornitore che si decide e che nel piano non c'è (da 300 € in su),
// o la parte pagata oltre l'importo deciso. Le quote dell'arretrato hanno il loro piano: non contano.
export type OffPlan = { key: string; companyId: string; name: string; cents: number; dates: string[]; why: 'non_nel_piano' | 'oltre' }

export function offPlan(plan: PlanSupplier[], txs: DecadeTx[]): OffPlan[] {
  const planned = new Map(plan.map(p => [p.key, p]))
  const by = new Map<string, { companyId: string; name: string; cents: number; dates: string[] }>()
  for (const t of txs) {
    if (!t.discretionary || t.note?.startsWith('Quota arretrato')) continue
    const k = txKey(t)
    const cur = by.get(k) ?? { companyId: t.companyId, name: t.supplierName ?? '—', cents: 0, dates: [] }
    cur.cents += t.cents
    cur.dates.push(t.paidDate)
    by.set(k, cur)
  }
  const out: OffPlan[] = []
  for (const [k, v] of by) {
    const p = planned.get(k)
    if (!p) {
      if (v.cents >= 30000) out.push({ key: k, ...v, why: 'non_nel_piano' })
    } else if (v.cents > p.plannedCents + 100) {
      out.push({ key: k, ...v, cents: v.cents - p.plannedCents, why: 'oltre' })
    }
  }
  return out.sort((a, b) => b.cents - a.cents)
}

// Prove del calcolo a decadi: node scripts/prove-decadi.ts
import {
  allocateWindow, suggestPct, supplierKey, groupBacklog, activeInstallments, splitPlan, backlogKey, f24Limit,
  decadeOf, decadeBounds, buildDecades, bucketOf, routeOut, splitMonthly, estimateForMonth, computeBlock, sumBlocks, uncoveredShare, consumeByDecade,
  planKey, supplierDues, blockSpace, suggestedTransfer, plannedRemaining, lineStatus, offPlan, paidByKey,
  type Estimate, type OutRow, type BlockInput, type Transfer, type DecadeTx, type PlanSupplier,
} from '../lib/decadi.ts'
import { matchPivaInvoices, personKey } from '../lib/piva-match.ts'
import { calcPayoutDate } from '../lib/channel-utils.ts'

let ok = 0, ko = 0
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { ok++; return }
  ko++; console.log(`✗ ${name}\n   atteso ${w}\n   avuto  ${g}`)
}
function near(name: string, got: number, want: number, tol: number) {
  if (Math.abs(got - want) <= tol) { ok++; return }
  ko++; console.log(`✗ ${name}: atteso ${want} ± ${tol}, avuto ${got}`)
}

// ── Confini ──
eq('10 ottobre in D1', decadeOf('2026-10-10'), { month: '2026-10', idx: 1 })
eq('11 ottobre in D2', decadeOf('2026-10-11'), { month: '2026-10', idx: 2 })
eq('20 ottobre in D2', decadeOf('2026-10-20').idx, 2)
eq('21 ottobre in D3', decadeOf('2026-10-21').idx, 3)
eq('febbraio 2026 finisce il 28', decadeBounds('2026-02', 3).to, '2026-02-28')
eq('febbraio 2028 finisce il 29', decadeBounds('2028-02', 3).to, '2028-02-29')
eq('ottobre finisce il 31', decadeBounds('2026-10', 3).to, '2026-10-31')

const dec = buildDecades('2026-10-08', 9)
eq('9 decadi da Ott D1 a Dic D3', dec.map(d => d.label), ['Ott D1', 'Ott D2', 'Ott D3', 'Nov D1', 'Nov D2', 'Nov D3', 'Dic D1', 'Dic D2', 'Dic D3'])
eq('entro il', dec.map(d => d.entro).slice(0, 4), ['10/10', '20/10', '31/10', '10/11'])
eq('cambio anno', buildDecades('2026-12-25', 2).map(d => d.label), ['Dic D3', 'Gen D1'])
eq('scaduta 2024 nella decade in corso', bucketOf(dec, '2024-07-17'), 0)
eq('15/10 in Ott D2', bucketOf(dec, '2026-10-15'), 1)
eq('oltre orizzonte', bucketOf(dec, '2027-01-02'), -1)
eq('split esatto', splitMonthly(3189800, [33.34, 33.33, 33.33]).reduce((a, b) => a + b, 0), 3189800)

// ── Instradamento ──
const base: OutRow = {
  id: 'x', companyId: 'A', supplierId: null, supplierName: 'Fornitore', supplierCategory: null, excludeFromTreasury: false,
  dueDate: '2026-09-01', postponedTo: null, residualCents: 50000, paymentMethod: 'Bonifico',
  entryType: 'accounting', commitmentType: 'manual', documentNumber: '1', isIntercompany: false,
}
const ctx = { today: '2026-10-08', backlogBefore: null }
eq('fattura scaduta', routeOut(base, ctx), 'fattura')
eq('taglio arretrato', routeOut(base, { ...ctx, backlogBefore: '2026-10-01' }), 'stock')
eq('RID futuro automatico', routeOut({ ...base, paymentMethod: 'RID', dueDate: '2026-10-30' }, ctx), 'automatico')
eq('RID scaduto si decide', routeOut({ ...base, paymentMethod: 'RID' }, ctx), 'fattura')
eq('utenza futura nel muro (consuma la stima, regola del 14/10)', routeOut({ ...base, supplierCategory: 'utenze', dueDate: '2026-10-20' }, ctx), 'muro')
eq('utenza scaduta da oltre un mese in arretrato', routeOut({ ...base, supplierCategory: 'utenze', dueDate: '2026-08-31' }, ctx), 'stock')
eq('budget BDG escluso', routeOut({ ...base, entryType: 'commitment', documentNumber: 'BDG-1', commitmentType: 'salary_item' }, ctx), 'escluso')
eq('collaboratore nel muro', routeOut({ ...base, entryType: 'commitment', commitmentType: 'collab_item' }, ctx), 'muro')
eq('impegno manuale pianificato', routeOut({ ...base, entryType: 'commitment', commitmentType: 'manual' }, ctx), 'pianificato')
eq('assicurazione nel muro', routeOut({ ...base, entryType: 'commitment', commitmentType: 'insurance_item' }, ctx), 'muro')
eq('tesseramenti e affiliazioni nel muro', routeOut({ ...base, entryType: 'commitment', commitmentType: 'membership_item' }, ctx), 'muro')
eq('intercompany escluso', routeOut({ ...base, isIntercompany: true }, ctx), 'escluso')
eq('fornitore escluso', routeOut({ ...base, excludeFromTreasury: true }, ctx), 'escluso')
eq('posticipata usa la nuova data', routeOut({ ...base, paymentMethod: 'RID', postponedTo: '2026-11-05' }, ctx), 'automatico')

// ── Numeri del foglio «Tesoreria di gruppo» (stime al mese, Ott-Dic) ──
const p = (a: number, b: number, c: number): [number, number, number] => [a, b, c]
const T = p(33.34, 33.33, 33.33), D2 = p(0, 100, 0), D3 = p(0, 0, 100)
const est = (id: string, companyId: string, kind: Estimate['kind'], category: string, eur: number, pct: [number, number, number], replacedBy: string[] = []): Estimate =>
  ({ id, companyId, label: id, kind, category, monthlyCents: eur * 100, pct, replacedBy })
const estimates: Estimate[] = [
  est('ap-dip', 'AP', 'muro', 'personale', 11200, D2, ['salary_item', 'extra_item']),
  est('ap-col', 'AP', 'muro', 'collaboratori', 33800, D2, ['collab_item', 'piva_item']),
  est('ap-f24', 'AP', 'muro', 'f24', 10000, D2, ['tax_item']),
  est('ap-banca', 'AP', 'automatico', 'banca', 1184, T),
  est('ap-cont', 'AP', 'automatico', 'contanti', 450, T),
  est('ap-coffa', 'AP', 'incasso', 'coffa', 102486, p(36.1, 28.7, 35.2)),
  est('wt-ut', 'WT', 'muro', 'utenze', 31898, T),
  est('wt-pers', 'WT', 'muro', 'personale', 1177, D2, ['salary_item']),
  est('wt-f24', 'WT', 'muro', 'f24', 182, D2, ['tax_item']),
  est('wt-rate', 'WT', 'automatico', 'rate', 2135, D3),
  est('wt-cont', 'WT', 'automatico', 'contanti', 2200, T),
  est('wt-aff', 'WT', 'incasso', 'affitti', 5112, T),
  est('hg-pers', 'HG', 'muro', 'personale', 3444, D2, ['salary_item']),
  est('hg-f24', 'HG', 'muro', 'f24', 668, D2, ['tax_item']),
  est('hg-rate', 'HG', 'automatico', 'rate', 2351, T),
  est('hg-cont', 'HG', 'automatico', 'contanti', 2500, T),
  est('hg-bar', 'HG', 'incasso', 'bar', 14000, T),
]
const blockInput = (code: BlockInput['code'], ids: string[], extra: Partial<BlockInput> = {}): BlockInput => ({
  code, label: code, companyIds: ids, balanceCents: 0, creditLineCents: 0, balanceDate: '2026-10-08',
  balanceDatesDiffer: false, thresholdCents: 0, today: '2026-10-08', backlogBefore: new Map(), rows: [],
  estimates, overrides: new Map(), realStaff: new Map(), manualRevenue: new Map(), coffa: null, ...extra,
})
const ap = computeBlock(blockInput('APPIAE', ['AP']), dec)
const hg = computeBlock(blockInput('HANGAR', ['HG']), dec)
const wt = computeBlock(blockInput('WT_ARIES', ['WT']), dec)
const g = sumBlocks([ap, hg, wt], 500000)
const eur = (c: number) => Math.round(c / 100)
near('muro di gruppo Ott D1 (foglio 10.633)', eur(g.decades[0].rows.muro.total), 10633, 3)
near('muro di gruppo Ott D2 (foglio 71.104)', eur(g.decades[1].rows.muro.total), 71104, 3)
near('muro APPIAE D2 (foglio 55.000)', eur(ap.decades[1].rows.muro.total), 55000, 0)
near('muro Hangar D2 (foglio 4.112)', eur(hg.decades[1].rows.muro.total), 4112, 0)
near('muro WT D2 (foglio 11.992)', eur(wt.decades[1].rows.muro.total), 11992, 3)
near('automatici di gruppo D1 (foglio 2.895)', eur(g.decades[0].rows.automatici.total), 2895, 3)
near('automatici WT D3 (foglio 2.868)', eur(wt.decades[2].rows.automatici.total), 2868, 3)
near('incassi Hangar per decade (foglio 4.667)', eur(hg.decades[3].rows.incassi.total), 4667, 1)
near('incassi WT per decade (foglio 1.704)', eur(wt.decades[3].rows.incassi.total), 1704, 1)
near('Coffa di riserva Nov D1 = 102.486 × 36,1%', eur(ap.decades[3].rows.incassi.total), 36997, 1)

// ── Sostituzione della stima con le righe reali ──
const collabOtt: OutRow = {
  ...base, id: 'c1', companyId: 'AP', entryType: 'commitment', commitmentType: 'collab_item',
  dueDate: '2026-10-10', residualCents: 977400, documentNumber: 'COL-2026-10-x',
}
const apReal = computeBlock(blockInput('APPIAE', ['AP'], {
  rows: [collabOtt], realStaff: new Map([['AP|collab_item|2026-10', [{ date: '2026-10-10', cents: 977400 }]]]),
}), dec)
near('collaboratori reali di ottobre in D1', eur(apReal.decades[0].rows.muro.total), 9774, 0)
// Marco, 15/10: caricato il file definitivo, la stima diventa gli impegni del file e sparisce tutta
near('D2 ottobre: dipendenti stimati + F24, collaboratori diventati impegni', eur(apReal.decades[1].rows.muro.total), 21200, 0)
const apTutti = computeBlock(blockInput('APPIAE', ['AP'], {
  realStaff: new Map([['AP|collab_item|2026-10', [{ date: '2026-10-10', cents: 2000000 }]], ['AP|piva_item|2026-10', [{ date: '2026-10-31', cents: 1500000 }]]]),
}), dec)
near('collaboratori + P.IVA oltre la stima: stima coperta tutta', eur(apTutti.decades[1].rows.muro.total), 21200, 0)
near('novembre non sostituito', eur(apReal.decades[4].rows.muro.total), 55000, 0)

// ── Coffa: nel mese in corso contano solo i giorni dopo la data del saldo ──
const days = new Map<string, number>([['2026-10-08', 500000], ['2026-10-09', 100000], ['2026-10-10', 200000], ['2026-10-15', 700000]])
const apCoffa = computeBlock(blockInput('APPIAE', ['AP'], { coffa: { days, months: new Map([['2026-11', 9000000]]) } }), dec)
near('Ott D1: solo 9 e 10', eur(apCoffa.decades[0].rows.incassi.total), 3000, 0)
near('Ott D2: il 15', eur(apCoffa.decades[1].rows.incassi.total), 7000, 0)
near('Nov D1: mese di Coffa × peso', eur(apCoffa.decades[3].rows.incassi.total), Math.floor(90000 * 0.361), 1)

// ── Saldi a catena e fabbisogno ──
const conSaldo = computeBlock(blockInput('HANGAR', ['HG'], { balanceCents: -2964497, creditLineCents: 3000000, thresholdCents: 0 }), dec)
eq('fine D1 = inizio D2', conSaldo.decades[0].fine, conSaldo.decades[1].inizio)
eq('disponibilità con fido', conSaldo.decades[0].dispFido, conSaldo.decades[0].fine + 3000000)

// ── Fatture sotto/sopra 300 e arretrato ──
const fatt = computeBlock(blockInput('APPIAE', ['AP'], {
  rows: [
    { ...base, id: 'f1', companyId: 'AP', residualCents: 29999 },
    { ...base, id: 'f2', companyId: 'AP', residualCents: 30000 },
    { ...base, id: 'f3', companyId: 'AP', residualCents: 100000, dueDate: '2024-01-01' },
  ],
  backlogBefore: new Map([['AP', '2025-01-01']]),
}), dec)
eq('sotto 300', fatt.decades[0].rows.fattureSotto.total, 29999)
eq('sopra 300', fatt.decades[0].rows.fattureSopra.total, 30000)
eq('arretrato fuori cruscotto', [fatt.stockCents, fatt.stockCount], [100000, 1])

// ── Finestra di pagamento ──
eq('chiave: SETAV con e senza punti', supplierKey('S.E.T.A.V. SRL'), 'S E T A V')
eq('chiave: stessa ditta scritta in due modi', supplierKey('READY4FUN S.S.D. A R.L.'), supplierKey('Ready4fun SSD arl'))
eq('chiave: non taglia dentro le parole', supplierKey('SASSI SPA'), 'SASSI')
eq('suggerita senza dovuto', suggestPct(-100, 0), 1)
eq('suggerita limitata a zero', suggestPct(-100, 500), 0)
eq('suggerita 40%', suggestPct(400, 1000), 0.4)

const fw = computeBlock(blockInput('APPIAE', ['AP'], {
  estimates: [], balanceCents: 100000,
  rows: [
    { ...base, id: 'w1', companyId: 'AP', residualCents: 60000 },
    { ...base, id: 'w2', companyId: 'AP', residualCents: 40000 },
    { ...base, id: 'w3', companyId: 'AP', residualCents: 20000 },
    { ...base, id: 'w4', companyId: 'AP', residualCents: 50000, dueDate: '2026-10-15' },
  ],
}), dec)
// D1: base = 1.000 − 200 (sotto 300) = 800, soglia 0, dovuto 1.000 → 80%
const win = allocateWindow(fw, (_, disp, dov) => ({ suggerita: suggestPct(disp, dov), decisa: null }))
near('D1 % suggerita 80', Math.round(win.decades[0].suggerita * 100), 80, 0)
eq('D1 pagato 800 €', win.decades[0].pagato, 80000)
eq('D1 slittano 200 €', win.decades[0].riporto, 20000)
eq('D1 saldo a zero', win.decades[0].fine, 0)
eq('w1: 480 € in D1', win.invoices.find(v => v.rowId === 'w1')!.paid[0], 48000)
eq('D2 dovuto = riporto + w4', win.decades[1].dovuto, 70000)
eq('D2 senza soldi: 0%', win.decades[1].applicata, 0)
const decisa = allocateWindow(fw, i => ({ suggerita: 0, decisa: i === 0 ? 0.5 : null }))
eq('% decisa a mano: 50% in D1', decisa.decades[0].pagato, 50000)
eq('saldo con la decisa', decisa.decades[0].fine, 30000)


// ── Arretrato (Pezzo 3) ──
const arr = computeBlock(blockInput('WT_ARIES', ['WT'], {
  estimates: [], balanceCents: 100000,
  backlogBefore: new Map([['WT', '2026-01-01']]),
  rows: [
    { ...base, id: 'a1', companyId: 'WT', supplierId: 'S1', supplierName: 'DEA', residualCents: 300000, dueDate: '2019-05-01' },
    { ...base, id: 'a2', companyId: 'WT', supplierId: 'S1', supplierName: 'DEA', residualCents: 100000, dueDate: '2018-01-01' },
    { ...base, id: 'a3', companyId: 'WT', supplierId: null, supplierName: 'AMA S.p.a.', residualCents: 50000, dueDate: '2020-01-01' },
    { ...base, id: 'f1', companyId: 'WT', residualCents: 60000 },
  ],
}), dec)
eq('arretrato: tre partite in stock', arr.stockItems.length, 3)
const cred = groupBacklog(arr.stockItems, [
  { id: 'I1', companyId: 'WT', creditorKey: backlogKey('S1', 'DEA'), decision: 'dilazionare', agreedCents: null, notes: null },
  { id: 'I2', companyId: 'WT', creditorKey: backlogKey(null, 'AMA SPA'), decision: 'non_si_paga', agreedCents: null, notes: null },
], [
  { id: 'Q0', itemId: 'I1', month: '2026-09', idx: 3, cents: 50000, paidAt: null },
  { id: 'Q1', itemId: 'I1', month: '2026-10', idx: 2, cents: 50000, paidAt: null },
  { id: 'Q2', itemId: 'I1', month: '2026-10', idx: 1, cents: 50000, paidAt: '2026-10-05' },
  { id: 'Q3', itemId: 'I2', month: '2026-10', idx: 1, cents: 10000, paidAt: null },
])
eq('due creditori, DEA per primo', cred.map(c => c.name), ['DEA', 'AMA S.p.a.'])
eq('DEA: partite dalla più vecchia', cred[0].rows.map(r => r.rowId), ['a2', 'a1'])
eq('AMA riconosciuta per nome senza forma societaria', cred[1].decision, 'non_si_paga')
eq('DEA: pianificato e pagato', [cred[0].plannedCents, cred[0].paidCents], [100000, 50000])
const quote = activeInstallments(cred)
eq('nel cruscotto solo quote non pagate di creditori decisi', quote.map(q => q.id), ['Q0', 'Q1'])
const arr2 = computeBlock(blockInput('WT_ARIES', ['WT'], {
  estimates: [], balanceCents: 100000, backlogBefore: new Map([['WT', '2026-01-01']]),
  rows: [{ ...base, id: 'f1', companyId: 'WT', residualCents: 60000 }],
  installments: quote,
}), dec)
eq('quota di settembre non pagata nella decade in corso', arr2.decades[0].rows.arretrati.total, 50000)
eq('quota di Ott D2', arr2.decades[1].rows.arretrati.total, 50000)
const w2 = allocateWindow(arr2, (_, disp, dov) => ({ suggerita: suggestPct(disp, dov), decisa: null }))
// D1: 1.000 − 500 di quota = 500 disponibili su 600 di dovuto
eq('la quota si paga prima della percentuale', w2.decades[0].pagato, 50000)
eq('saldo dopo quota e fornitori', w2.decades[0].fine, 0)
const strl = groupBacklog(arr.stockItems, [
  { id: 'I3', companyId: 'WT', creditorKey: backlogKey('S1', 'DEA'), decision: 'stralcio', agreedCents: 150000, notes: null },
], [{ id: 'Q4', itemId: 'I3', month: '2026-10', idx: 1, cents: 50000, paidAt: '2026-10-02' }])
eq('stralcio: resta da pagare il concordato meno il pagato', strl[0].targetCents, 100000)
eq('da decidere senza scheda', strl[1].decision, 'da_decidere')
eq('piano 3 quote da Ott D3', splitPlan(100000, 3, { month: '2026-10', idx: 3 }),
  [{ month: '2026-10', idx: 3, cents: 33333 }, { month: '2026-11', idx: 1, cents: 33333 }, { month: '2026-11', idx: 2, cents: 33334 }])
eq('piano a cavallo dell\'anno', splitPlan(2, 2, { month: '2026-12', idx: 3 }).map(q => q.month), ['2026-12', '2027-01'])


// ── F24: muro, ravvedimento, arretrato (regola del 12/10) ──
eq('F24 limite: 16/09 → 31/10', f24Limit('2026-09-16'), '2026-10-31')
eq('F24 limite: 16/12 → 31/01', f24Limit('2026-12-16'), '2027-01-31')
const t12 = '2026-10-12'
const f24 = (due: string, extra: Partial<OutRow> = {}) => routeOut({ ...base, entryType: 'commitment', commitmentType: 'tax_item', dueDate: due, ...extra }, { ...ctx, today: t12 })
eq('F24 del 16/10 non scaduto: muro', f24('2026-10-16'), 'muro')
eq('F24 del 16/09 scaduto: da recuperare', f24('2026-09-16'), 'f24')
eq('F24 del 20/08 oltre il mese dopo: arretrato', f24('2026-08-20'), 'stock')
eq('F24 del 16/09 posticipato a novembre: resta da recuperare', f24('2026-09-16', { postponedTo: '2026-11-05' }), 'f24')
eq('F24 contabile scaduto: da recuperare', routeOut({ ...base, supplierCategory: 'tributi_f24', dueDate: '2026-09-16' }, { ...ctx, today: t12 }), 'f24')
eq('F24 contabile futuro: coperto dalla stima', routeOut({ ...base, supplierCategory: 'tributi_f24', dueDate: '2026-10-16' }, { ...ctx, today: t12 }), 'escluso')
const dec12 = buildDecades(t12, 3)
const fb = computeBlock(blockInput('APPIAE', ['AP'], {
  estimates: [], balanceCents: 100000, today: t12,
  rows: [
    { ...base, id: 'g1', companyId: 'AP', entryType: 'commitment', commitmentType: 'tax_item', dueDate: '2026-09-16', residualCents: 63300 },
    { ...base, id: 'g2', companyId: 'AP', entryType: 'commitment', commitmentType: 'tax_item', dueDate: '2026-08-20', residualCents: 1590000 },
    { ...base, id: 'g3', companyId: 'AP', residualCents: 50000, dueDate: '2026-10-01' },
  ],
}), dec12)
eq('F24 da recuperare nella decade in corso', fb.decades[0].rows.f24.total, 63300)
eq('F24 di agosto fuori dal muro', fb.decades[0].rows.muro.total, 0)
eq('F24 di agosto in arretrato come Erario', fb.stockItems.map(i => i.label), ['Erario – F24'])
const fw24 = allocateWindow(fb, (_, disp, dov) => ({ suggerita: suggestPct(disp, dov), decisa: null }))
// 1.000 − 633 = 367 disponibili su 500 di fattura
eq('il ravvedimento si paga prima dei fornitori', fw24.decades[0].pagato, 36700)


// ── Fornitore trattato come personale (regola del 12/10) ──
eq('Casali Marco: fattura nel muro', routeOut({ ...base, supplierAsStaff: true, dueDate: '2026-10-15' }, ctx), 'muro')
eq('Casali Marco: anche scaduta prima del taglio', routeOut({ ...base, supplierAsStaff: true }, { ...ctx, backlogBefore: '2026-10-01' }), 'muro')
eq('Casali Marco escluso resta escluso', routeOut({ ...base, supplierAsStaff: true, excludeFromTreasury: true }, ctx), 'escluso')


// ── Stime che si consumano (regola di Marco, 14/10: prima era «coperta» per le utenze) ──
// La fattura vera conta nel muro e la stima del suo fornitore si riduce: stima − arrivate, minimo zero
{
  const fv = (id: string, sup: string | null, date: string, cents: number, generic = true) =>
    ({ id, companyId: 'WT', supplierId: sup, label: id, doc: null, date, cents, generic })
  const ut = computeBlock(blockInput('WT_ARIES', ['WT'], {
    estimates: [
      { id: 'F', companyId: 'WT', label: 'Forini', kind: 'muro', category: 'utenze', monthlyCents: 3000000, pct: [33.34, 33.33, 33.33], replacedBy: [], supplierId: 'forini' },
      { id: 'A', companyId: 'WT', label: 'Altri fornitori', kind: 'fornitori', category: 'nuove_fatture', monthlyCents: 1000000, pct: [33.34, 33.33, 33.33], replacedBy: [] },
    ],
    rows: [
      { ...base, id: 'u1', companyId: 'WT', supplierId: 'forini', supplierCategory: 'utenze', dueDate: '2026-11-05', residualCents: 2500000 },
    ],
    invoices: [
      fv('u1', 'forini', '2026-11-05', 2500000),
      fv('u2', 'forini', '2026-11-25', 1000000),     // già pagata: consuma lo stesso
      fv('u3', 'forini', '2026-12-05', 500000),
      fv('x1', 'altro', '2026-11-12', 400000),
      fv('x2', null, '2026-11-12', 100000, false),   // personale/esclusa: non consuma «altri»
    ],
  }), dec)
  const nov1 = ut.decades[3].rows.muro.items.find(i => i.estimateId === 'F')!
  eq('novembre: stima Forini 30.000 consumata da 35.000 → 0', ut.decades.slice(3, 6).map(d => d.rows.muro.items.find(i => i.estimateId === 'F')!.cents), [0, 0, 0])
  eq('la fattura vera conta nel muro di Nov D1', ut.decades[3].rows.muro.total, 2500000)
  eq('fattura di Nov D1 sotto la stima di Nov D1', nov1.covered!.map(c => c.rowId), ['u1'])
  eq('novembre: arrivate 35.000 contro stima 30.000', [nov1.monthCoveredCents, nov1.monthEstimateCents], [3500000, 3000000])
  eq('avviso solo per novembre', ut.estimateOver.map(u => u.month), ['2026-11'])
  eq('dicembre: 30.000 − 5.000 = 25.000', ut.decades.slice(6, 9).reduce((s, d) => s + d.rows.muro.items.find(i => i.estimateId === 'F')!.cents, 0), 2500000)
  eq('altri fornitori di novembre: 10.000 − 4.000 (non Forini, non personale)', ut.decades.slice(3, 6).reduce((s, d) => s + d.rows.nuoveFatture.total, 0), 600000)
  eq('ottobre: nessuna fattura, stima intera', ut.decades[1].rows.nuoveFatture.total + ut.decades[2].rows.nuoveFatture.total, 666600)
}

// ── Importi per mese dell'anno (Marco, 23/10) ──
eq('mese impostato', estimateForMonth({ monthlyCents: 100, monthCents: { '7': 50 } }, '2027-07'), 50)
eq('mese vuoto: importo base', estimateForMonth({ monthlyCents: 100, monthCents: { '7': 50 } }, '2026-08'), 100)
eq('nessun profilo', estimateForMonth({ monthlyCents: 100 }, '2026-12'), 100)
eq('mese a zero vale zero', estimateForMonth({ monthlyCents: 100, monthCents: { '12': 0 } }, '2026-12'), 0)
{
  const fv = (id: string, sup: string | null, date: string, cents: number) =>
    ({ id, companyId: 'WT', supplierId: sup, label: id, doc: null, date, cents, generic: true })
  const pr = computeBlock(blockInput('WT_ARIES', ['WT'], {
    estimates: [
      { id: 'F', companyId: 'WT', label: 'Forini', kind: 'muro', category: 'utenze', monthlyCents: 3000000,
        monthCents: { '11': 3600000 }, pct: [33.34, 33.33, 33.33], replacedBy: [], supplierId: 'forini' },
    ],
    invoices: [fv('u1', 'forini', '2026-11-05', 3300000), fv('u2', 'forini', '2026-12-05', 500000)],
  }), dec)
  const fOf = (i: number) => pr.decades[i].rows.muro.items.find(x => x.estimateId === 'F')
  eq('novembre: 36.000 del mese − 33.000 arrivate = 3.000', pr.decades.slice(3, 6).reduce((s, d) => s + (d.rows.muro.items.find(x => x.estimateId === 'F')?.cents ?? 0), 0), 300000)
  eq('novembre: confronto con la stima del mese', fOf(3)!.monthEstimateCents, 3600000)
  eq('nessun avviso: 33.000 sotto i 36.000 di novembre', pr.estimateOver.length, 0)
  eq('dicembre senza importo proprio: base 30.000 − 5.000', pr.decades.slice(6, 9).reduce((s, d) => s + (d.rows.muro.items.find(x => x.estimateId === 'F')?.cents ?? 0), 0), 2500000)
  eq('ottobre D2+D3: 33,33% + 33,33% della base 30.000', pr.decades.slice(1, 3).reduce((s, d) => s + (d.rows.muro.items.find(x => x.estimateId === 'F')?.cents ?? 0), 0), 1999800)
}

// ── Utenze scadute da poco: nel muro (12/10) ──
eq('Forini del 3/10 al 12/10: muro', routeOut({ ...base, supplierCategory: 'utenze', dueDate: '2026-10-03' }, { ...ctx, today: '2026-10-12' }), 'muro')
eq('utenza del 31/08 al 12/10: arretrato', routeOut({ ...base, supplierCategory: 'utenze', dueDate: '2026-08-31' }, { ...ctx, today: '2026-10-12' }), 'stock')
eq('utenza del 20/09 al 12/10: ancora muro', routeOut({ ...base, supplierCategory: 'utenze', dueDate: '2026-09-20' }, { ...ctx, today: '2026-10-12' }), 'muro')


// ── Fornitore «solo rate» (Acea ATO 2, 12/10) ──
eq('Acea: rata nel muro, anche se utenza', routeOut({ ...base, supplierCategory: 'utenze', installmentsOnly: true, isInstallment: true, dueDate: '2026-11-01' }, ctx), 'muro')
eq('Acea: rata scaduta resta nel muro', routeOut({ ...base, supplierCategory: 'utenze', installmentsOnly: true, isInstallment: true }, { ...ctx, backlogBefore: '2026-10-01' }), 'muro')
eq('Acea: bolletta singola non si conta', routeOut({ ...base, supplierCategory: 'utenze', installmentsOnly: true, isInstallment: false, dueDate: '2026-10-09' }, ctx), 'escluso')


// ── Piano della decade (Marco, 19/10): importi decisi per fornitore al posto della percentuale ──
{
  const pw = computeBlock(blockInput('APPIAE', ['AP'], {
    estimates: [], balanceCents: 200000,
    rows: [
      { ...base, id: 'p1', companyId: 'AP', supplierId: 'S1', supplierName: 'Alfa', residualCents: 60000, dueDate: '2026-09-01' },
      { ...base, id: 'p2', companyId: 'AP', supplierId: 'S1', supplierName: 'Alfa', residualCents: 40000, dueDate: '2026-09-20' },
      { ...base, id: 'p3', companyId: 'AP', supplierId: 'S2', supplierName: 'Beta', residualCents: 50000, dueDate: '2026-10-05' },
      { ...base, id: 'p4', companyId: 'AP', supplierId: 'S3', supplierName: 'Gamma', residualCents: 80000, dueDate: '2026-10-15' },
    ],
  }), dec)
  const kA = planKey('AP', 'S1', 'Alfa'), kB = planKey('AP', 'S2', 'Beta'), kG = planKey('AP', 'S3', 'Gamma')
  eq('chiave del piano: società + fornitore', kA, 'AP|S:S1')
  const plan0 = new Map([[kA, 70000], [kB, 0]])
  const pwin = allocateWindow(pw, () => ({ suggerita: 0.5, decisa: null }), i => i === 0 ? plan0 : null)
  eq('D1 col piano: si paga quanto deciso', pwin.decades[0].pagato, 70000)
  eq('D1 col piano: segnato «dal piano»', [pwin.decades[0].fromPlan, pwin.decades[1].fromPlan], [true, false])
  eq('Alfa: prima la fattura più vecchia per intero', pwin.invoices.find(v => v.rowId === 'p1')!.paid[0], 60000)
  eq('Alfa: poi 100 € della seconda', pwin.invoices.find(v => v.rowId === 'p2')!.paid[0], 10000)
  eq('Beta a zero nel piano', pwin.invoices.find(v => v.rowId === 'p3')!.paid[0], 0)
  eq('D2 senza piano: torna la percentuale', pwin.decades[1].applicata, 0.5)
  // debiti verso i fornitori per la decade dopo: tolto quello che paga la D1
  const dues = supplierDues(pwin, 1)
  eq('dovuto in D2: Gamma, Beta, Alfa', dues.map(d => [d.name, d.dovuto]), [['Gamma', 80000], ['Beta', 50000], ['Alfa', 30000]])
  eq('Alfa: la più vecchia ancora aperta (quella dell 1/9 la paga la D1)', dues.find(d => d.key === kA)!.oldest, '2026-09-20')
  // spazio del blocco e provvista
  const sp = blockSpace(pw, pwin, 0)
  eq('spazio D1 = saldo − per intero − soglia', sp.spazio, 200000)
  eq('fine D1 dopo i fornitori del piano', sp.fine, 130000)
  eq('nessuna provvista se resta sopra la soglia', suggestedTransfer(sp), 0)
  eq('provvista arrotondata ai 100 €', suggestedTransfer({ ...sp, fabbisogno: 123456 }), 130000)
  // quanto resta da pagare del piano, tolto il già pagato
  const pl: PlanSupplier[] = [
    { id: 'a', companyId: 'AP', key: kA, name: 'Alfa', plannedCents: 70000, priority: 1 },
    { id: 'g', companyId: 'AP', key: kG, name: 'Gamma', plannedCents: 20000, priority: 2 },
  ]
  eq('resto del piano', [...plannedRemaining(pl, new Map([[kA, 50000], [kG, 30000]]))], [[kA, 20000], [kG, 0]])
  // stato delle righe
  eq('da pagare', lineStatus(70000, 0, '2026-10-08', '2026-10-10').state, 'da_pagare')
  eq('in parte', lineStatus(70000, 20000, '2026-10-08', '2026-10-10').state, 'in_parte')
  eq('pagato (tolleranza 1 €)', lineStatus(70000, 69950, '2026-10-08', '2026-10-10').state, 'pagato')
  eq('scoperto a decade finita', lineStatus(70000, 20000, '2026-10-11', '2026-10-10').state, 'scoperto')
  eq('oltre il deciso', lineStatus(70000, 90000, '2026-10-08', '2026-10-10').state, 'oltre')
  eq('piano da 1 € non pagato: da pagare', lineStatus(100, 0, '2026-10-08', '2026-10-10').state, 'da_pagare')
  // fuori piano
  const tx = (id: string, sup: string | null, name: string, cents: number, extra: Partial<DecadeTx> = {}): DecadeTx => ({
    id, rowId: 'r' + id, companyId: 'AP', supplierId: sup, supplierName: name, paidDate: '2026-10-05', cents, note: null, discretionary: true, ...extra,
  })
  const txs = [
    tx('1', 'S1', 'Alfa', 90000),                                   // 200 € oltre il deciso
    tx('2', 'S9', 'Zeta', 50000),                                   // non nel piano
    tx('3', 'S8', 'Piccolo', 12000),                                // sotto 300 €: non si segnala
    tx('4', null, 'Enel', 80000, { discretionary: false }),         // muro
    tx('5', 'S7', 'Vecchio', 40000, { note: 'Quota arretrato x' }), // quota del piano di rientro
  ]
  eq('pagato per fornitore', paidByKey(txs).get(kA), 90000)
  eq('le quote dell arretrato non contano come pagato del piano', paidByKey(txs).get(planKey('AP', 'S7', 'Vecchio')), undefined)
  eq('fatture del piano di Alfa in D1, dalla più vecchia', supplierDues(pwin, 0).find(d => d.key === kA)!.rowIds, ['p1', 'p2'])
  eq('fuori piano: Zeta intero, Alfa la parte in più', offPlan(pl, txs).map(o => [o.name, o.cents, o.why]), [['Zeta', 50000, 'non_nel_piano'], ['Alfa', 20000, 'oltre']])
}

// ── Provviste fra società (Marco, 19/10): uscita di Appiae con la priorità del muro, incasso di chi riceve ──
{
  const tr = (extra: Partial<Transfer>): Transfer => ({
    id: 't1', fromCompanyId: 'AP', toCompanyId: 'HG', cents: 400000, dueDate: '2026-10-15', paidDate: null, label: 'Provvista Appiae → Hangar', ...extra,
  })
  const apT = computeBlock(blockInput('APPIAE', ['AP'], { estimates: [], transfers: [tr({})] }), dec)
  const hgT = computeBlock(blockInput('HANGAR', ['HG'], { estimates: [], transfers: [tr({})] }), dec)
  eq('provvista da fare: muro di Appiae in D2', apT.decades[1].rows.muro.total, 400000)
  eq('provvista da fare: incasso di Hangar in D2', hgT.decades[1].rows.incassi.total, 400000)
  const gT = sumBlocks([apT, hgT], 0)
  eq('nel gruppo si annulla', [gT.decades[1].rows.muro.total, gT.decades[1].rows.incassi.total], [0, 0])
  // fatta dopo la data del saldo: entra nel saldo calcolato di tutte e due
  const paid = tr({ paidDate: '2026-10-08' })
  const apP = computeBlock(blockInput('APPIAE', ['AP'], { estimates: [], balanceDate: '2026-10-07', transfers: [paid] }), dec)
  const hgP = computeBlock(blockInput('HANGAR', ['HG'], { estimates: [], balanceDate: '2026-10-07', transfers: [paid] }), dec)
  eq('fatta: saldo calcolato di Appiae − 4.000', apP.balanceCents, -400000)
  eq('fatta: saldo calcolato di Hangar + 4.000', hgP.balanceCents, 400000)
  eq('fatta: non è più una riga del cruscotto', apP.decades[0].rows.muro.total + apP.decades[1].rows.muro.total, 0)
  // fatta fino alla data del saldo: è già nel saldo della banca
  const apOld = computeBlock(blockInput('APPIAE', ['AP'], { estimates: [], balanceDate: '2026-10-08', transfers: [tr({ paidDate: '2026-10-08' })] }), dec)
  eq('fatta prima del saldo: già nel saldo', apOld.balanceCents, 0)
  eq('giro dentro lo stesso blocco: non conta', computeBlock(blockInput('WT_ARIES', ['WT', 'AR'], { estimates: [], transfers: [tr({ fromCompanyId: 'WT', toCompanyId: 'AR' })] }), dec).decades[1].rows.muro.total, 0)
}

// ── Incassi registrati e pagamenti dopo il saldo (14/10) ──
{
  const d14 = buildDecades('2026-10-14', 9)
  const coffaEst: Estimate = { id: 'C', companyId: 'AP', label: 'Coffa', kind: 'incasso', category: 'coffa', monthlyCents: 0, pct: [33.34, 33.33, 33.33], replacedBy: [] }
  const barEst: Estimate = { id: 'B', companyId: 'HG', label: 'Bar', kind: 'incasso', category: 'bar', monthlyCents: 1000000, pct: [33.34, 33.33, 33.33], replacedBy: [] }
  const days = new Map<string, number>()
  for (let g = 13; g <= 31; g++) days.set(`2026-10-${String(g).padStart(2, '0')}`, 100000)  // 1.000 € al giorno
  const inp = (extra: Partial<BlockInput>): BlockInput => ({
    code: 'APPIAE', label: 'A', companyIds: ['AP'], balanceCents: 800000, creditLineCents: 0, balanceDate: '2026-10-12',
    balanceDatesDiffer: false, thresholdCents: 0, today: '2026-10-14', backlogBefore: new Map(), rows: [],
    estimates: [coffaEst], overrides: new Map(), realStaff: new Map(), manualRevenue: new Map(),
    coffa: { days, months: new Map() }, ...extra,
  })
  const reali = [
    { companyId: 'AP', channel: 'AlmaPay', saleDate: '2026-10-09', arrival: '2026-10-16', cents: 151956 },
    { companyId: 'AP', channel: 'POS', saleDate: '2026-10-12', arrival: '2026-10-13', cents: 22275 },
    { companyId: 'AP', channel: 'POS', saleDate: '2026-10-09', arrival: '2026-10-10', cents: 203643 },   // già nel saldo
    { companyId: 'AP', channel: 'Contanti', saleDate: '2026-10-13', arrival: '2026-10-13', cents: 50000 }, // contanti: no
    { companyId: 'AP', channel: 'AlmaPay', saleDate: '2026-10-13', arrival: '2026-10-20', cents: 960349 },
  ]
  const pagati = [
    { companyId: 'AP', label: 'Fiorda', date: '2026-10-14', cents: 32250 },
    { companyId: 'AP', label: 'Antonelli', date: '2026-10-09', cents: 36480 },  // prima del saldo: già fuori
    { companyId: 'HG', label: 'altro blocco', date: '2026-10-14', cents: 99999 },
  ]
  const r = computeBlock(inp({ realIncassi: reali, paidAfter: pagati }), d14)
  eq('saldo calcolato: + POS del 12 arrivato il 13, − Fiorda', r.balanceCents, 800000 + 22275 - 32250)
  eq('saldo banca resta quello inserito', r.bankBalanceCents, 800000)
  eq('ultimo incasso registrato', r.lastRegistered, '2026-10-13')
  const reale = r.decades[0].rows.incassi.items.filter(i => i.source === 'reale').map(i => i.cents)
  eq('Alma in arrivo il 16 e il 20 nella decade in corso', reale, [151956, 960349])
  // Coffa: vendite fino al 13 registrate → giorni di Coffa solo dal 19 (13 + 5 + 1)
  const coffaD2 = r.decades[0].rows.incassi.items.find(i => i.source === 'coffa')!.cents
  eq('Coffa Ott D2 solo dal 19 al 20 (niente doppio conteggio)', coffaD2, 200000)
  eq('Coffa Ott D3 intera', r.decades[1].rows.incassi.items.find(i => i.source === 'coffa')!.cents, 1100000)
  const senza = computeBlock(inp({}), d14)
  eq('senza registrazioni Coffa dal giorno dopo il saldo', senza.decades[0].rows.incassi.total, 800000)
  // Stima del bar: i giorni già nel saldo o registrati non si stimano
  eq('quota scoperta: saldo al 12 in D2 (11-20) → 8 giorni su 10', uncoveredShare(d14[0], '2026-10-12'), 0.8)
  const hgIn = (extra: Partial<BlockInput>) => inp({ code: 'HANGAR', companyIds: ['HG'], estimates: [barEst], coffa: null, ...extra })
  const bar0 = computeBlock(hgIn({}), d14).decades[0].rows.incassi.total
  eq('bar D2 senza registrazioni: 8/10 della quota', bar0, Math.round(333300 * 0.8))
  const bar1 = computeBlock(hgIn({ realIncassi: [{ companyId: 'HG', channel: 'POS', saleDate: '2026-10-15', arrival: '2026-10-16', cents: 50000 }] }), d14)
  eq('bar D2 registrato fino al 15: stima 5/10 + incasso vero', bar1.decades[0].rows.incassi.total, Math.round(333300 * 0.5) + 50000)
  // Contanti (Marco, 19/10): quelli di Hangar si versano e contano, gli altri no
  const cash = (cashCounts: boolean) => computeBlock(hgIn({ realIncassi: [
    { companyId: 'HG', channel: 'Contanti', saleDate: '2026-10-15', arrival: '2026-10-15', cents: 40000, cashCounts },
  ] }), d14).decades[0].rows.incassi.total
  eq('contanti che si versano: contano', cash(true), Math.round(333300 * 0.5) + 40000)
  eq('contanti che restano in cassa: non contano, ma i giorni sono coperti', cash(false), Math.round(333300 * 0.5))
}

// ── Arrivo in banca (Marco, 19/10): sabato e domenica vanno al lunedì ──
eq('Alma: venerdì 16 → venerdì 23', calcPayoutDate('2026-10-16', 'rolling_days', 7, null), '2026-10-23')
eq('Alma: sabato 17 → lunedì 26', calcPayoutDate('2026-10-17', 'rolling_days', 7, null), '2026-10-26')
eq('Alma: domenica 18 → lunedì 26', calcPayoutDate('2026-10-18', 'rolling_days', 7, null), '2026-10-26')
eq('Alma: sabato 24 → lunedì 2 novembre', calcPayoutDate('2026-10-24', 'rolling_days', 7, null), '2026-11-02')
eq('POS: giovedì 15 → venerdì 16', calcPayoutDate('2026-10-15', 'rolling_days', 1, null), '2026-10-16')
eq('POS: venerdì 16 → lunedì 19', calcPayoutDate('2026-10-16', 'rolling_days', 1, null), '2026-10-19')
eq('POS: sabato 17 → lunedì 19', calcPayoutDate('2026-10-17', 'rolling_days', 1, null), '2026-10-19')
eq('POS: domenica 18 → lunedì 19', calcPayoutDate('2026-10-18', 'rolling_days', 1, null), '2026-10-19')
eq('TSPay il martedì: sabato 17 → martedì 20', calcPayoutDate('2026-10-17', 'fixed_weekday', null, 1), '2026-10-20')
eq('TSPay il martedì: martedì 20 → martedì 27', calcPayoutDate('2026-10-20', 'fixed_weekday', null, 1), '2026-10-27')


// ── Consumo per decade (Marco, 14/10: prodotti piscina 50% D1 e 50% D3) ──
eq('pro forma di D1 consuma solo D1', consumeByDecade([100000, 0, 100000], [100000, 0, 0]), [0, 0, 100000])
eq('quello che avanza va alle decadi dopo', consumeByDecade([10002, 9999, 9999], [25000, 0, 10000]), [0, 0, 0])
eq('poi a quelle prima, dalla più vicina', consumeByDecade([1000, 1000, 1000], [0, 0, 1500]), [1000, 500, 0])
eq('altri fornitori: fattura di D2 da 4.000', consumeByDecade([3334, 3333, 3333], [0, 4000, 0]), [3334, 0, 2666])


// ── Istruttori P.IVA: l'impegno si spegne quando arriva la fattura (Marco, 15/10) ──
eq('nome e cognome in qualsiasi ordine', personKey('Monticone Fabrizio') === personKey('FABRIZIO MONTICONE'), true)
{
  const it = (id: string, name: string, m: string) => ({ id, companyId: 'A', name, refMonth: m })
  const inv = (id: string, name: string, d: string) => ({ id, companyId: 'A', name, date: d, doc: id })
  // Frolova: giugno fatturato il 3/7, luglio il 31/7, agosto il 17/8, settembre il 16/9
  const fro = matchPivaInvoices(
    [it('g', 'Frolova Ganna', '2026-06'), it('l', 'Frolova Ganna', '2026-07'), it('a', 'Frolova Ganna', '2026-08'), it('s', 'Frolova Ganna', '2026-09')],
    [inv('F11', 'FROLOVA GANNA', '2026-05-22'), inv('F13', 'FROLOVA GANNA', '2026-07-03'), inv('F15', 'FROLOVA GANNA', '2026-07-31'),
     inv('F17', 'FROLOVA GANNA', '2026-08-17'), inv('F18', 'FROLOVA GANNA', '2026-09-16')])
  eq('Frolova: ogni mese la sua fattura', ['g', 'l', 'a', 's'].map(k => fro.get(k)?.id), ['F13', 'F15', 'F17', 'F18'])
  // Marasco: settembre non ha ancora fatturato, l'impegno resta
  const mar = matchPivaInvoices([it('ago', 'marasco francesco', '2026-08'), it('set', 'marasco francesco', '2026-09')],
    [inv('37', 'MARASCO FRANCESCO', '2026-08-05')])
  eq('Marasco: agosto fatturato, settembre ancora impegno', [mar.get('ago')?.id, mar.has('set')], ['37', false])
  eq('altra società non abbina', matchPivaInvoices([it('x', 'Guaci Leonard', '2026-10')], [{ ...inv('38', 'GUACI LEONARD', '2026-10-07'), companyId: 'B' }]).size, 0)
  eq('fattura troppo lontana non abbina', matchPivaInvoices([it('x', 'Guaci Leonard', '2026-06')], [inv('40', 'GUACI LEONARD', '2026-09-01')]).size, 0)
}

console.log(`\n${ok} prove superate, ${ko} fallite`)
if (ko) process.exit(1)

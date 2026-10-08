// Prove del calcolo a decadi: node scripts/prove-decadi.ts
import {
  decadeOf, decadeBounds, buildDecades, bucketOf, routeOut, splitMonthly, computeBlock, sumBlocks,
  type Estimate, type OutRow, type BlockInput,
} from '../lib/decadi.ts'

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
  id: 'x', companyId: 'A', supplierName: 'Fornitore', supplierCategory: null, excludeFromTreasury: false,
  dueDate: '2026-09-01', postponedTo: null, residualCents: 50000, paymentMethod: 'Bonifico',
  entryType: 'accounting', commitmentType: 'manual', documentNumber: '1', isIntercompany: false,
}
const ctx = { today: '2026-10-08', backlogBefore: null, blockHasUtenzeEstimate: true }
eq('fattura scaduta', routeOut(base, ctx), 'fattura')
eq('taglio arretrato', routeOut(base, { ...ctx, backlogBefore: '2026-10-01' }), 'stock')
eq('RID futuro automatico', routeOut({ ...base, paymentMethod: 'RID', dueDate: '2026-10-30' }, ctx), 'automatico')
eq('RID scaduto si decide', routeOut({ ...base, paymentMethod: 'RID' }, ctx), 'fattura')
eq('utenza futura coperta dalla stima', routeOut({ ...base, supplierCategory: 'utenze', dueDate: '2026-10-20' }, ctx), 'escluso')
eq('utenza scaduta in arretrato', routeOut({ ...base, supplierCategory: 'utenze' }, ctx), 'stock')
eq('utenza senza stima nel muro', routeOut({ ...base, supplierCategory: 'utenze' }, { ...ctx, blockHasUtenzeEstimate: false }), 'muro')
eq('budget BDG escluso', routeOut({ ...base, entryType: 'commitment', documentNumber: 'BDG-1', commitmentType: 'salary_item' }, ctx), 'escluso')
eq('collaboratore nel muro', routeOut({ ...base, entryType: 'commitment', commitmentType: 'collab_item' }, ctx), 'muro')
eq('impegno manuale pianificato', routeOut({ ...base, entryType: 'commitment', commitmentType: 'manual' }, ctx), 'pianificato')
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
  estimates, overrides: new Map(), realStaff: new Set(), manualRevenue: new Map(), coffa: null, ...extra,
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
  rows: [collabOtt], realStaff: new Set(['AP|collab_item|2026-10']),
}), dec)
near('collaboratori reali di ottobre in D1', eur(apReal.decades[0].rows.muro.total), 9774, 0)
near('D2 ottobre: dipendenti stimati + F24, collaboratori sostituiti', eur(apReal.decades[1].rows.muro.total), 21200, 0)
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

console.log(`\n${ok} prove superate, ${ko} fallite`)
if (ko) process.exit(1)

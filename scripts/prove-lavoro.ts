// Prove del lavoro quotidiano: node scripts/prove-lavoro.ts
import { isWorkingDay, shiftToWorkingDay, planTasks, missingSaleDays, type TaskRule } from '../lib/lavoro.ts'

let ok = 0, ko = 0
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { ok++; return }
  ko++; console.log(`✗ ${name}\n   atteso ${w}\n   avuto  ${g}`)
}

eq('giovedì 15/10/2026 lavorativo', isWorkingDay('2026-10-15'), true)
eq('domenica 11/10/2026 no', isWorkingDay('2026-10-11'), false)
eq('Pasquetta 2027 (29/03) no', isWorkingDay('2027-03-29'), false)
eq('29 giugno (Roma) no', isWorkingDay('2027-06-29'), false)
eq('8 dicembre no', isWorkingDay('2026-12-08'), false)
eq('import dell\'11/10 (domenica) slitta a lunedì 12', shiftToWorkingDay('2026-10-11', 'dopo'), '2026-10-12')
eq('F24 del 15/11 (domenica) si anticipa a venerdì 13', shiftToWorkingDay('2026-11-15', 'prima'), '2026-11-13')
eq('1 novembre (domenica, festa) slitta a lunedì 2', shiftToWorkingDay('2026-11-01', 'dopo'), '2026-11-02')

// Giorni di vendita senza incassi (Marco, 19/10): solo i buchi fra il primo e l'ultimo giorno registrato
eq('nessun buco', missingSaleDays(['2026-10-16', '2026-10-17', '2026-10-18'], '2026-09-19'), [])
eq('buco in mezzo, anche di domenica', missingSaleDays(['2026-10-10', '2026-10-13', '2026-10-13'], '2026-09-19'), ['2026-10-11', '2026-10-12'])
eq("dopo l'ultimo registrato non è un buco (è la voce di oggi)", missingSaleDays(['2026-10-16'], '2026-09-19'), [])
eq('prima della finestra non si guarda', missingSaleDays(['2026-09-01', '2026-10-01', '2026-10-03'], '2026-09-30'), ['2026-09-30', '2026-10-02'])
eq('si parte dal primo giorno registrato', missingSaleDays(['2026-10-16', '2026-10-18'], '2026-09-19'), ['2026-10-17'])
eq('nessun incasso, nessun buco', missingSaleDays([], '2026-09-19'), [])

const rule = (over: Partial<TaskRule>): TaskRule => ({
  id: 'r', title: 'R', description: null, href: null, freq: 'mensile', days: [1, 11, 21], companyId: null,
  holiday: 'dopo', superseded: false, auto: null, startDate: '2026-10-01', sort: 1, ...over,
})
const none = new Map()
const never = () => false

// import alle decadi, superato dalla successiva: il 23/10 resta solo quello del 21
{
  const p = planTasks([rule({ superseded: true })], none, never, '2026-10-23')
  eq('superata: resta solo l\'ultima', p.open.map(o => o.key), ['2026-10-21'])
  eq('ritardo in giorni lavorativi (21 mer → 23 ven)', p.open[0].lateDays, 2)
}
// paghe non superate: restano tutte quelle non fatte
{
  const p = planTasks([rule({ days: [10], startDate: '2026-09-01' })], none, never, '2026-10-23')
  eq('non superata: restano settembre e ottobre', p.open.map(o => o.key), ['2026-09-10', '2026-10-10'])
}
// fatta a mano
{
  const done = new Map([['r|2026-10-10', { by: 'orianna', at: '2026-10-12' }]])
  const p = planTasks([rule({ days: [10] })], done, never, '2026-10-14')
  eq('fatta: non è da fare', p.open.length, 0)
  eq('fatta: compare fra le fatte', p.closed.map(o => o.key), ['2026-10-10'])
}
// fatta in automatico
{
  const p = planTasks([rule({ days: [10], auto: 'paghe' })], none, () => true, '2026-10-14')
  eq('auto: chiusa dal sistema', p.closed[0]?.done?.auto, true)
}
// niente arretrati prima della partenza
{
  const p = planTasks([rule({ days: [10], startDate: '2026-10-15' })], none, never, '2026-10-15')
  eq('partenza 15/10: il 10/10 non c\'è', p.open.length, 0)
  eq('in arrivo: niente nei 7 giorni', p.upcoming.length, 0)
}
// giornaliera: solo oggi, e non nel fine settimana
{
  const g = rule({ freq: 'giornaliera', days: [] })
  eq('giornaliera oggi', planTasks([g], none, never, '2026-10-15').open.map(o => o.key), ['2026-10-15'])
  eq('giornaliera il sabato: niente', planTasks([g], none, never, '2026-10-17').open.length, 0)
}
// esempio di Marco: il 10 c'è da fare, l'11 è domenica → si fa lunedì 12 e resta finché non è fatta
{
  const p = planTasks([rule({ days: [11] })], none, never, '2026-10-10')
  eq('venerdì 10: l\'import dell\'11 è in arrivo per lunedì 12', p.upcoming.map(o => o.due), ['2026-10-12'])
  const q = planTasks([rule({ days: [11] })], none, never, '2026-10-14')
  eq('mercoledì 14: ancora da fare, in ritardo di 2', [q.open[0]?.due, q.open[0]?.lateDays], ['2026-10-12', 2])
}

console.log(`${ok} prove superate, ${ko} fallite`)
if (ko) process.exit(1)

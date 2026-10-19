// Lavoro quotidiano (Marco, 15/10/2026): le attività di Orianna giorno per giorno.
// Calcolo puro, senza database: date come stringhe YYYY-MM-DD in Date.UTC.
//
// Regole:
//  · un'attività mensile vale per una data prevista (period_key); se cade in un giorno non lavorativo
//    si anticipa («prima», es. paghe e F24 che scadono il 16) o si posticipa («dopo», es. l'import);
//  · se non è fatta resta, con i giorni di ritardo; se la regola è «superata dalla successiva»
//    (import, saldi) resta solo l'ultima, perché la volta dopo copre anche quella saltata;
//  · le attività di ogni giorno non si accumulano: c'è solo quella di oggi;
//  · nessuna attività prima della data di partenza della regola (niente arretrati finti).
// Giorni lavorativi: dal lunedì al venerdì (lo storico di Orianna non ha mai sabato né domenica),
// tolti i festivi nazionali, Pasquetta e il 29 giugno (Roma).

export type TaskRule = {
  id: string
  title: string
  description: string | null
  href: string | null
  freq: 'giornaliera' | 'mensile'
  days: number[]
  companyId: string | null
  holiday: 'prima' | 'dopo'
  superseded: boolean
  auto: 'import' | 'saldi' | 'paghe' | 'collaboratori' | 'f24' | 'incassi' | 'piano' | null
  startDate: string
  sort: number
}

export type TaskOccurrence = {
  rule: TaskRule
  key: string        // data prevista
  due: string        // giorno in cui farla (spostata per i festivi)
  lateDays: number   // giorni lavorativi di ritardo (0 = oggi)
  done: null | { by: string | null; at: string; auto: boolean }
}

const ms = 86400000
const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDaysStr = (d: string, n: number) => fromUTC(toUTC(d) + n * ms)

function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const FIXED = ['01-01', '01-06', '04-25', '05-01', '06-02', '06-29', '08-15', '11-01', '12-08', '12-25', '12-26']

export function isWorkingDay(d: string): boolean {
  const dow = new Date(toUTC(d)).getUTCDay()
  if (dow === 0 || dow === 6) return false
  if (FIXED.includes(d.slice(5))) return false
  if (d === addDaysStr(easter(+d.slice(0, 4)), 1)) return false  // Pasquetta
  return true
}

export function shiftToWorkingDay(d: string, dir: 'prima' | 'dopo'): string {
  let x = d
  while (!isWorkingDay(x)) x = addDaysStr(x, dir === 'prima' ? -1 : 1)
  return x
}

function workingDaysBetween(from: string, to: string): number {
  let n = 0
  for (let x = from; x < to; x = addDaysStr(x, 1)) if (isWorkingDay(addDaysStr(x, 1))) n++
  return n
}

function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return fromUTC(Date.UTC(y, m, 0))
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const end = to.slice(0, 7)
  for (;;) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    out.push(k)
    if (k >= end) break
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

export function occurrencesOf(rule: TaskRule, today: string, horizonDays: number): { key: string; due: string }[] {
  const until = addDaysStr(today, horizonDays)
  if (rule.freq === 'giornaliera') {
    return isWorkingDay(today) && today >= rule.startDate ? [{ key: today, due: today }] : []
  }
  const out: { key: string; due: string }[] = []
  for (const month of monthsBetween(addDaysStr(rule.startDate, -40), until)) {
    const end = monthEnd(month)
    for (const day of [...rule.days].sort((a, b) => a - b)) {
      const nominal = `${month}-${String(day).padStart(2, '0')}`
      const key = nominal > end ? end : nominal
      if (key < rule.startDate) continue
      const due = shiftToWorkingDay(key, rule.holiday)
      if (due > until) continue
      out.push({ key, due })
    }
  }
  return out
}

// Giorni di vendita senza incassi registrati, fra il primo e l'ultimo giorno registrato (Marco, 19/10):
// un buco in mezzo è grave perché la Tesoreria considera coperti tutti i giorni fino all'ultimo
// registrato (Coffa e la stima del bar non li contano più), quindi quei soldi spariscono dalla cassa.
// Si vende tutti i giorni, anche sabato e domenica: i giorni di chiusura si segnano «visto».
export function missingSaleDays(saleDates: string[], from: string): string[] {
  const set = new Set(saleDates)
  const last = [...set].sort().pop()
  if (!last) return []
  const first = [...set].sort()[0]
  const start = first > from ? first : from
  const out: string[] = []
  for (let d = start; d < last; d = addDaysStr(d, 1)) if (!set.has(d)) out.push(d)
  return out
}

export type DoneMap = Map<string, { by: string | null; at: string }>   // `${ruleId}|${key}`
export type AutoCheck = (rule: TaskRule, key: string) => boolean

export function planTasks(rules: TaskRule[], done: DoneMap, autoDone: AutoCheck, today: string, horizonDays = 7): {
  open: TaskOccurrence[]       // da fare: oggi e in ritardo
  closed: TaskOccurrence[]     // fatte, previste negli ultimi 7 giorni
  upcoming: TaskOccurrence[]   // nei prossimi giorni
} {
  const open: TaskOccurrence[] = [], closed: TaskOccurrence[] = [], upcoming: TaskOccurrence[] = []
  for (const rule of rules) {
    const occ = occurrencesOf(rule, today, horizonDays).map(o => {
      const manual = done.get(`${rule.id}|${o.key}`)
      const auto = !manual && rule.auto ? autoDone(rule, o.key) : false
      const d: TaskOccurrence['done'] = manual ? { ...manual, auto: false } : auto ? { by: null, at: o.due, auto: true } : null
      return { rule, key: o.key, due: o.due, lateDays: o.due < today ? workingDaysBetween(o.due, today) : 0, done: d }
    })
    const past = occ.filter(o => o.due <= today)
    // superata dalla successiva: conta solo l'ultima già arrivata
    const relevant = rule.superseded && past.length ? [past[past.length - 1]] : past
    for (const o of relevant) {
      if (!o.done) open.push(o)
      else if (o.due >= addDaysStr(today, -7)) closed.push(o)
    }
    for (const o of occ) if (o.due > today) upcoming.push(o)
  }
  const bySort = (a: TaskOccurrence, b: TaskOccurrence) => a.due.localeCompare(b.due) || a.rule.sort - b.rule.sort
  return { open: open.sort(bySort), closed: closed.sort(bySort), upcoming: upcoming.sort(bySort) }
}

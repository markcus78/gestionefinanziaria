import type { PatternType } from '@/lib/types/database'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export type PaymentItem = {
  id: string
  companyId: string
  supplierName: string | null
  accountDescription: string | null
  category: string | null
  isCritical: boolean
  dueDate: string
  amountCents: number
  priorityScore: number | null
  priorityOverride: number | null
  isIntercompany: boolean
  status: string
}

export type TreasuryDay = {
  date: string
  inflowCertain: number   // payout settlement in arrivo (certi)
  inflowForecast: number  // incassi previsti da forecast
  outflow: number         // totale uscite pianificate
  balance: number         // saldo cumulativo fine giornata
  payments: PaymentItem[] // uscite del giorno (per expand)
}

// paymentId → data in cui può essere pagato (null = non coperto nei 30 gg)
export type SimResult = Record<string, string | null>

// ─── Distribuzione forecast ────────────────────────────────────────────────────

// Modello DOW+DOM: moltiplicatori calibrati su 14 mesi di storico WT/APPIAE
// DOW: 0=Lun … 6=Dom  (JS getDay restituisce 0=Dom → converti con (jsDow+6)%7)
const DOW_MULT: Record<number, number> = {
  0: 1.3555, // Lunedì
  1: 1.0783, // Martedì
  2: 1.0398, // Mercoledì
  3: 1.0522, // Giovedì
  4: 1.1797, // Venerdì
  5: 0.7490, // Sabato
  6: 0.5455, // Domenica
}
const DOM_MULT: Record<number, number> = {
   1: 1.2407,  2: 1.7991,  3: 1.2075,  4: 1.0494,  5: 0.8500,
   6: 0.7798,  7: 0.9497,  8: 1.0967,  9: 0.9052, 10: 1.1154,
  11: 0.8558, 12: 1.0244, 13: 0.8726, 14: 0.7186, 15: 1.1799,
  16: 0.9242, 17: 1.0140, 18: 0.9342, 19: 0.8416, 20: 0.7505,
  21: 0.7508, 22: 0.8701, 23: 0.7279, 24: 0.7928, 25: 0.7781,
  26: 0.9069, 27: 1.0672, 28: 1.1079, 29: 1.0925, 30: 1.5144,
  31: 1.6637,
}

/**
 * Distribuisce il forecast totale del mese secondo il pattern di incasso.
 * La mappa restituita contiene tutti i giorni del mese (non solo i futuri):
 * il chiamante filtra per >= today.
 *
 * daily:        lun-sab del mese, quote uguali (domenica = 0)
 * monthly:      100% tutto il giorno day_of_month (clampato all'ultimo giorno)
 * subscription: modello DOW+DOM — peso giornaliero = DOW_mult × DOM_mult,
 *               normalizzato sul totale mensile
 */
export function distributeForecast(
  totalCents: number,
  pattern: PatternType,
  dayOfMonth: number | null,
  year: number,
  month: number,
): Map<string, number> {
  const result = new Map<string, number>()
  if (totalCents <= 0) return result

  const lastDay = new Date(year, month, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthStr = pad(month)
  const dateStr = (d: number) => `${year}-${monthStr}-${pad(d)}`

  if (pattern === 'monthly') {
    const d = Math.min(dayOfMonth ?? 1, lastDay)
    result.set(dateStr(d), totalCents)
    return result
  }

  if (pattern === 'subscription') {
    // DOW+DOM: calcola il peso di ogni giorno e normalizza
    const weights: { d: number; w: number }[] = []
    let totalWeight = 0
    for (let d = 1; d <= lastDay; d++) {
      const jsDow = new Date(year, month - 1, d).getDay() // 0=Dom
      const modelDow = (jsDow + 6) % 7                    // 0=Lun
      const w = (DOW_MULT[modelDow] ?? 1) * (DOM_MULT[d] ?? 1)
      weights.push({ d, w })
      totalWeight += w
    }
    let allocated = 0
    for (let i = 0; i < weights.length; i++) {
      const { d, w } = weights[i]
      const isLast = i === weights.length - 1
      const cents = isLast
        ? totalCents - allocated
        : Math.floor(totalCents * w / totalWeight)
      allocated += cents
      result.set(dateStr(d), cents)
    }
    return result
  }

  // pattern === 'daily': lun-sab, domenica = 0
  const workDays: number[] = []
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month - 1, d).getDay() // 0=Dom
    if (dow !== 0) workDays.push(d)
  }
  if (workDays.length === 0) return result

  const perDay = Math.floor(totalCents / workDays.length)
  let rem      = totalCents - perDay * workDays.length
  for (const d of workDays) {
    const extra = rem > 0 ? 1 : 0
    if (rem > 0) rem--
    result.set(dateStr(d), perDay + extra)
  }
  return result
}

// ─── Build timeline ────────────────────────────────────────────────────────────

export function buildTimeline(params: {
  startDate: string        // YYYY-MM-DD (oggi)
  days: number             // es. 30
  initialBalance: number   // saldo iniziale in centesimi
  certain: Map<string, number>          // date → cents certi
  forecast: Map<string, number>         // date → cents previsti
  paymentsByDay: Map<string, PaymentItem[]>  // date → uscite
}): TreasuryDay[] {
  const { startDate, days, initialBalance, certain, forecast, paymentsByDay } = params
  const result: TreasuryDay[] = []
  let balance = initialBalance

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate + 'T00:00:00')
    d.setDate(d.getDate() + i)
    const date = d.toISOString().split('T')[0]

    const inflowCertain  = certain.get(date)  ?? 0
    const inflowForecast = forecast.get(date) ?? 0
    const payments       = paymentsByDay.get(date) ?? []
    const outflow        = payments.reduce((s, p) => s + p.amountCents, 0)

    balance += inflowCertain + inflowForecast - outflow

    result.push({ date, inflowCertain, inflowForecast, outflow, balance, payments })
  }

  return result
}

// ─── Simulazione avanzata ──────────────────────────────────────────────────────

/**
 * Simula l'ordine ottimale di pagamento.
 * Assegna ogni payment al primo giorno in cui il saldo base (incassi - pagamenti
 * già assegnati con priorità maggiore) è sufficiente a coprirlo.
 *
 * Restituisce: paymentId → 'YYYY-MM-DD' (data pagamento simulata) | null (non coperto)
 */
export function simulatePaymentsFromTimeline(
  timeline: TreasuryDay[],
  payments: PaymentItem[],
  initialBalance: number,
): SimResult {
  // Ricostruisci base cumulativo (solo incassi, senza uscite)
  const baseCumulative: number[] = []
  const dates: string[] = []
  let running = initialBalance

  for (const day of timeline) {
    running += day.inflowCertain + day.inflowForecast
    baseCumulative.push(running)
    dates.push(day.date)
  }

  // Delta da sottrarre man mano che assegniamo pagamenti
  const delta = new Array<number>(timeline.length).fill(0)

  // Ordina: priorità decrescente (override > score), poi data crescente
  const sorted = [...payments].sort((a, b) => {
    const pa = a.priorityOverride ?? a.priorityScore ?? 0
    const pb = b.priorityOverride ?? b.priorityScore ?? 0
    if (pb !== pa) return pb - pa
    return a.dueDate.localeCompare(b.dueDate)
  })

  const result: SimResult = {}

  for (const payment of sorted) {
    // Parti dal giorno di scadenza (o dal primo giorno se scaduta)
    const startIdx = Math.max(0, dates.findIndex(d => d >= payment.dueDate))
    let covered: string | null = null

    for (let i = startIdx; i < timeline.length; i++) {
      const avail = baseCumulative[i] + delta[i]
      if (avail >= payment.amountCents) {
        // Assegnato: scala disponibilità da questo giorno in poi
        for (let j = i; j < timeline.length; j++) delta[j] -= payment.amountCents
        covered = dates[i]
        break
      }
    }

    result[payment.id] = covered
  }

  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function priorityOf(p: PaymentItem): number {
  return p.priorityOverride ?? p.priorityScore ?? 0
}

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

/**
 * Distribuisce il forecast totale del mese secondo il pattern di incasso.
 * La mappa restituita contiene tutti i giorni del mese (non solo i futuri):
 * il chiamante filtra per >= today.
 *
 * daily:        lun-sab del mese, quote uguali (domenica = 0)
 * monthly:      100% sul giorno day_of_month (clampato all'ultimo giorno)
 * subscription: 30% gg 1-10, 30% gg 11-20, 40% gg 21-fine mese
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
    // segmento 1: gg 1-10 → 30%
    const seg1Total = Math.floor(totalCents * 0.30)
    const perDay1   = Math.floor(seg1Total / 10)
    let rem1        = seg1Total - perDay1 * 10
    for (let d = 1; d <= 10; d++) {
      const extra = rem1 > 0 ? 1 : 0
      if (rem1 > 0) rem1--
      result.set(dateStr(d), perDay1 + extra)
    }
    // segmento 2: gg 11-20 → 30%
    const seg2Total = Math.floor(totalCents * 0.30)
    const perDay2   = Math.floor(seg2Total / 10)
    let rem2        = seg2Total - perDay2 * 10
    for (let d = 11; d <= 20; d++) {
      const extra = rem2 > 0 ? 1 : 0
      if (rem2 > 0) rem2--
      result.set(dateStr(d), perDay2 + extra)
    }
    // segmento 3: gg 21-lastDay → 40% (aggiusta centesimi residui sull'ultimo giorno)
    const seg3Count = lastDay - 20
    const seg3Total = totalCents - seg1Total - seg2Total
    const perDay3   = Math.floor(seg3Total / seg3Count)
    let rem3        = seg3Total - perDay3 * seg3Count
    for (let d = 21; d <= lastDay; d++) {
      const extra = rem3 > 0 ? 1 : 0
      if (rem3 > 0) rem3--
      result.set(dateStr(d), perDay3 + extra)
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

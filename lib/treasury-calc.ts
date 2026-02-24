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

// ─── Distribuzione forecast rimanente ─────────────────────────────────────────

/**
 * Distribuisce il forecast rimanente del mese nei giorni futuri,
 * secondo il pattern di incasso della società.
 *
 * payout_fixed_weekday: 0=Lun … 6=Dom (non usato qui, solo rolling/daily)
 */
export function distributeRemainingForecast(
  remainingCents: number,
  pattern: PatternType,
  avgSettlementDays: number,
  today: string,   // YYYY-MM-DD
  year: number,
  month: number,
): Map<string, number> {
  const result = new Map<string, number>()
  if (remainingCents <= 0) return result

  const lastDay = new Date(year, month, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthStr = pad(month)

  let targetDays: string[] = []

  if (pattern === 'monthly_first_10') {
    for (let d = 1; d <= 10; d++) {
      const ds = `${year}-${monthStr}-${pad(d)}`
      if (ds >= today) targetDays.push(ds)
    }
    // Oltre il 10: nessun incasso futuro nel pattern
    if (targetDays.length === 0) return result

  } else {
    // 'daily' e 'daily_with_settlement': tutti i giorni rimanenti del mese
    for (let d = 1; d <= lastDay; d++) {
      const ds = `${year}-${monthStr}-${pad(d)}`
      if (ds >= today) targetDays.push(ds)
    }
    if (pattern === 'daily_with_settlement' && avgSettlementDays > 0) {
      targetDays = targetDays.map(ds => {
        const d = new Date(ds + 'T00:00:00')
        d.setDate(d.getDate() + avgSettlementDays)
        return d.toISOString().split('T')[0]
      })
    }
  }

  if (targetDays.length === 0) return result

  const perDay = Math.floor(remainingCents / targetDays.length)
  let rem = remainingCents - perDay * targetDays.length

  for (const ds of targetDays) {
    const extra = rem > 0 ? 1 : 0
    if (rem > 0) rem--
    result.set(ds, (result.get(ds) ?? 0) + perDay + extra)
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

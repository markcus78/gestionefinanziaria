/**
 * Utility per calcoli su canali di incasso.
 * Usato sia lato client (preview) che lato server (server actions).
 */

/**
 * Calcola la commissione in centesimi.
 * @param grossCents  Importo lordo in centesimi
 * @param txCount     Numero di transazioni (per commissione fissa per-transazione)
 * @param pct         Percentuale commissione (es. 0.0149 = 1.49%)
 * @param fixedCents  Commissione fissa per transazione in centesimi (es. 25 = €0.25)
 */
export function calcCommissionCents(
  grossCents: number,
  txCount: number,
  pct: number,
  fixedCents: number
): number {
  return Math.round(grossCents * pct) + fixedCents * txCount
}

/**
 * Calcola la data di payout prevista.
 *
 * payout_fixed_weekday: 0 = Lunedì, 1 = Martedì, ..., 6 = Domenica
 * Se collectionDate cade già sul giorno target → rimanda alla settimana successiva.
 */
export function calcPayoutDate(
  collectionDate: string,
  payoutType: 'rolling_days' | 'fixed_weekday',
  rollingDays: number | null,
  fixedWeekday: number | null
): string {
  const d = new Date(collectionDate + 'T00:00:00')

  if (payoutType === 'rolling_days' && rollingDays != null) {
    d.setDate(d.getDate() + rollingDays)
  } else if (payoutType === 'fixed_weekday' && fixedWeekday != null) {
    // Converti da convenzione EU (0=Lun) a JS getDay() (0=Dom, 1=Lun, …, 6=Sab)
    const jsTarget = (fixedWeekday + 1) % 7
    const current = d.getDay()
    let daysAhead = (jsTarget - current + 7) % 7
    if (daysAhead === 0) daysAhead = 7
    d.setDate(d.getDate() + daysAhead)
  }

  return d.toISOString().split('T')[0]
}

export const WEEKDAYS = [
  'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica',
]

export const MONTHS_SHORT = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
]

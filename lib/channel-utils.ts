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
 *
 * rolling_days: N giorni dopo la vendita; se l'arrivo cade di sabato o di domenica va al
 * lunedì (regola di Marco, 19/10/2026: Alma a 7 giorni, sabato e domenica entrano il lunedì;
 * POS a 1 giorno, venerdì e sabato entrano il lunedì).
 * Date calcolate in UTC: in Italia `new Date('…T00:00:00').toISOString()` darebbe il giorno prima.
 */
export function calcPayoutDate(
  collectionDate: string,
  payoutType: 'rolling_days' | 'fixed_weekday',
  rollingDays: number | null,
  fixedWeekday: number | null
): string {
  const d = new Date(collectionDate + 'T00:00:00Z')

  if (payoutType === 'rolling_days' && rollingDays != null) {
    d.setUTCDate(d.getUTCDate() + rollingDays)
    const day = d.getUTCDay()
    if (day === 6) d.setUTCDate(d.getUTCDate() + 2)
    else if (day === 0) d.setUTCDate(d.getUTCDate() + 1)
  } else if (payoutType === 'fixed_weekday' && fixedWeekday != null) {
    // Converti da convenzione EU (0=Lun) a JS getDay() (0=Dom, 1=Lun, …, 6=Sab)
    const jsTarget = (fixedWeekday + 1) % 7
    const current = d.getUTCDay()
    let daysAhead = (jsTarget - current + 7) % 7
    if (daysAhead === 0) daysAhead = 7
    d.setUTCDate(d.getUTCDate() + daysAhead)
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

import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type ApplyResult = { success: true } | { error: string }

/**
 * Invariante mantenuta da questo modulo:
 *   payment_schedule.amount_cents  = importo totale originale, mai toccato dai pagamenti
 *   payment_schedule.paid_amount_cents = SUM(payment_transactions.amount_cents)
 *   residuo = ABS(amount_cents) - COALESCE(paid_amount_cents, 0)
 *
 * Tutte le sezioni (staff, pagamenti, scadenzario, dashboard, impegni) devono passare
 * da qui: cinque punti che scrivevano `status='paid'` a mano avevano finito per
 * sovrascrivere il totale con l'ultima rata.
 */

/** Ricalcola paid_amount_cents, paid_date e status a partire dai movimenti registrati. */
async function recalc(supabase: SupabaseServerClient, scheduleId: string): Promise<ApplyResult> {
  const { data: row, error: rowErr } = await supabase
    .from('payment_schedule')
    .select('amount_cents')
    .eq('id', scheduleId)
    .single()
  if (rowErr || !row) return { error: rowErr?.message ?? 'Riga non trovata' }

  const { data: txs, error: txErr } = await supabase
    .from('payment_transactions')
    .select('amount_cents, paid_date')
    .eq('payment_schedule_id', scheduleId)
  if (txErr) return { error: txErr.message }

  const totalCents = Math.abs(row.amount_cents)
  const paidCents = (txs ?? []).reduce((s, t) => s + t.amount_cents, 0)
  const dates = (txs ?? []).map(t => t.paid_date).filter((d): d is string => !!d).sort()
  const lastDate = dates.length ? dates[dates.length - 1] : null

  const status = paidCents <= 0 ? 'pending' : paidCents >= totalCents ? 'paid' : 'partial'

  const { error } = await supabase
    .from('payment_schedule')
    .update({
      status,
      paid_amount_cents: paidCents > 0 ? paidCents : null,
      paid_date: lastDate,
      ...(status === 'pending' ? { postponed_to: null, postpone_notes: null } : {}),
    })
    .eq('id', scheduleId)
  if (error) return { error: error.message }

  return { success: true }
}

/** Registra un pagamento (acconto o saldo) e aggiorna lo stato della riga. */
export async function applyPayment(
  supabase: SupabaseServerClient,
  scheduleId: string,
  paidDate: string,
  amountCents: number,
  note?: string
): Promise<ApplyResult> {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: 'Importo non valido' }
  if (!paidDate) return { error: 'Data obbligatoria' }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('payment_transactions').insert({
    payment_schedule_id: scheduleId,
    paid_date: paidDate,
    amount_cents: amountCents,
    note: note ?? null,
    created_by: user?.id ?? null,
  })
  if (error) return { error: error.message }

  return recalc(supabase, scheduleId)
}

/** Annulla tutti i pagamenti della riga e la riporta a 'pending'. */
export async function revertPayments(
  supabase: SupabaseServerClient,
  scheduleId: string
): Promise<ApplyResult> {
  const { error } = await supabase
    .from('payment_transactions')
    .delete()
    .eq('payment_schedule_id', scheduleId)
  if (error) return { error: error.message }

  return recalc(supabase, scheduleId)
}

/** Elimina un singolo movimento e ricalcola la riga a cui apparteneva. */
export async function removeTransaction(
  supabase: SupabaseServerClient,
  transactionId: string
): Promise<ApplyResult> {
  const { data: tx, error: fetchErr } = await supabase
    .from('payment_transactions')
    .select('payment_schedule_id')
    .eq('id', transactionId)
    .single()
  if (fetchErr || !tx) return { error: fetchErr?.message ?? 'Movimento non trovato' }

  const { error } = await supabase.from('payment_transactions').delete().eq('id', transactionId)
  if (error) return { error: error.message }

  return recalc(supabase, tx.payment_schedule_id)
}

/**
 * Correzione manuale dell'importo totale della riga.
 * Serve per le righe il cui totale è andato perso prima dell'introduzione dei movimenti.
 */
export async function setTotalAmount(
  supabase: SupabaseServerClient,
  scheduleId: string,
  totalCents: number
): Promise<ApplyResult> {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return { error: 'Importo non valido' }

  const { data: row, error: fetchErr } = await supabase
    .from('payment_schedule')
    .select('flow_type')
    .eq('id', scheduleId)
    .single()
  if (fetchErr || !row) return { error: fetchErr?.message ?? 'Riga non trovata' }

  const sign = row.flow_type === 'out' ? -1 : 1
  const { error } = await supabase
    .from('payment_schedule')
    .update({
      amount_cents: sign * totalCents,
      amount_in_cents: row.flow_type === 'in' ? totalCents : 0,
      amount_out_cents: row.flow_type === 'out' ? totalCents : 0,
    })
    .eq('id', scheduleId)
  if (error) {
    // dedup_key è UNIQUE e include l'importo: un totale identico a un'altra riga collide
    if (error.code === '23505') return { error: 'Esiste già una riga identica con questo importo' }
    return { error: error.message }
  }

  return recalc(supabase, scheduleId)
}

/** Residuo da pagare di una riga. */
export function residualCents(amountCents: number, paidAmountCents: number | null): number {
  return Math.max(0, Math.abs(amountCents) - (paidAmountCents ?? 0))
}

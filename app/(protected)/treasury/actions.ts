'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { applyPayment, residualCents } from '@/lib/payment-apply'
import { supplierKey } from '@/lib/decadi'

export async function updateAccountBalance(id: string, balanceCents: number, balanceDate: string, creditLineCents: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(balanceDate)) return { error: 'Data del saldo non valida' }
  if (creditLineCents < 0) return { error: 'Il fido non può essere negativo' }
  const supabase = await createClient()
  const { error } = await supabase.from('bank_accounts').update({
    current_balance_cents: balanceCents,
    balance_date: balanceDate,
    balance_updated_at: new Date().toISOString(),
    credit_line_cents: creditLineCents,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  revalidatePath('/settings')
  return { success: true }
}

// cents = null toglie la correzione e torna alla stima
export async function setEstimateOverride(estimateId: string, month: string, idx: number, cents: number | null) {
  const supabase = await createClient()
  const { error } = cents === null
    ? await supabase.from('treasury_estimate_overrides').delete()
        .eq('estimate_id', estimateId).eq('month', month).eq('idx', idx)
    : await supabase.from('treasury_estimate_overrides').upsert({
        estimate_id: estimateId, month, idx, amount_cents: Math.max(0, cents), updated_at: new Date().toISOString(),
      })
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  return { success: true }
}

// pct = null torna alla percentuale suggerita
export async function setWindowPct(month: string, idx: number, pct: number | null) {
  if (pct !== null && (pct < 0 || pct > 100)) return { error: 'La percentuale va da 0 a 100' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = pct === null
    ? await supabase.from('treasury_window_pct').delete().eq('month', month).eq('idx', idx)
    : await supabase.from('treasury_window_pct').upsert({
        month, idx, pct, decided_by: user?.id ?? null, decided_at: new Date().toISOString(),
      })
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  return { success: true }
}

export async function setSupplierNotified(key: string, name: string, notified: boolean, date: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('supplier_notices').upsert({
    supplier_key: key, display_name: name, notified,
    notified_at: notified ? date : null, notified_by: notified ? user?.id ?? null : null,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  return { success: true }
}

// ─── Arretrato (Pezzo 3) ─────────────────────────────────────────────────────

const DECISIONS = ['da_decidere', 'pagare', 'dilazionare', 'stralcio', 'non_si_paga'] as const
type Decision = typeof DECISIONS[number]

export async function saveBacklogDecision(input: {
  companyId: string; key: string; name: string; decision: Decision; agreedCents: number | null; notes: string | null
}) {
  if (!DECISIONS.includes(input.decision)) return { error: 'Decisione non valida' }
  if (input.decision === 'stralcio' && (input.agreedCents === null || input.agreedCents <= 0)) {
    return { error: 'Per lo stralcio serve l\'importo concordato' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('backlog_items').upsert({
    company_id: input.companyId, creditor_key: input.key, creditor_name: input.name,
    decision: input.decision,
    agreed_cents: input.decision === 'stralcio' ? input.agreedCents : null,
    notes: input.notes?.trim() || null,
    decided_by: user?.id ?? null, decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id,creditor_key' }).select('id').single()
  if (error) return { error: error.message }
  // Senza decisione di pagare, le quote non pagate non hanno più senso: si tolgono
  if (input.decision === 'da_decidere' || input.decision === 'non_si_paga') {
    const { error: qErr } = await supabase.from('backlog_installments').delete().eq('item_id', data.id).is('paid_at', null)
    if (qErr) return { error: qErr.message }
  }
  revalidatePath('/treasury')
  return { success: true, id: data.id as string }
}

// Sostituisce le quote non pagate del creditore; quelle già pagate restano
export async function saveBacklogPlan(itemId: string, quotes: { month: string; idx: number; cents: number }[]) {
  for (const q of quotes) {
    if (!/^\d{4}-\d{2}$/.test(q.month) || ![1, 2, 3].includes(q.idx) || !(q.cents > 0)) return { error: 'Quota non valida' }
  }
  const supabase = await createClient()
  const { error: delErr } = await supabase.from('backlog_installments').delete().eq('item_id', itemId).is('paid_at', null)
  if (delErr) return { error: delErr.message }
  if (quotes.length) {
    const { error } = await supabase.from('backlog_installments').insert(
      quotes.map(q => ({ item_id: itemId, month: q.month, idx: q.idx, amount_cents: Math.round(q.cents) })),
    )
    if (error) return { error: error.message }
  }
  revalidatePath('/treasury')
  return { success: true }
}

// Registra la quota sulle partite del creditore, dalla più vecchia, passando da applyPayment.
// Ogni movimento porta l'id della quota nella nota: se un giro si interrompe, il successivo
// riparte da quello che manca invece di pagare due volte.
export async function markInstallmentPaid(installmentId: string, paidDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return { error: 'Data non valida' }
  const supabase = await createClient()
  const { data: q, error: qErr } = await supabase.from('backlog_installments')
    .select('id, amount_cents, paid_at, backlog_items(company_id, creditor_key)')
    .eq('id', installmentId).single()
  if (qErr || !q) return { error: qErr?.message ?? 'Quota non trovata' }
  if (q.paid_at) return { success: true }
  const item = q.backlog_items as unknown as { company_id: string; creditor_key: string }

  const note = `Quota arretrato ${installmentId}`
  const { data: done } = await supabase.from('payment_transactions').select('amount_cents').eq('note', note)
  let remaining = q.amount_cents - (done ?? []).reduce((s, t) => s + t.amount_cents, 0)

  let query = supabase.from('payment_schedule')
    .select('id, supplier_name, amount_cents, paid_amount_cents, due_date, postponed_to')
    .eq('company_id', item.company_id).eq('flow_type', 'out').eq('entry_type', 'accounting')
    .in('status', ['pending', 'scheduled', 'partial', 'postponed'])
  query = item.creditor_key.startsWith('S:')
    ? query.eq('supplier_id', item.creditor_key.slice(2))
    : query.is('supplier_id', null)
  const { data: rows, error: rErr } = await query
  if (rErr) return { error: rErr.message }
  const mine = (rows ?? [])
    .filter(r => item.creditor_key.startsWith('S:') || `N:${supplierKey(r.supplier_name ?? '')}` === item.creditor_key)
    .map(r => ({ id: r.id, residual: residualCents(r.amount_cents, r.paid_amount_cents), date: r.postponed_to ?? r.due_date }))
    .filter(r => r.residual > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  for (const r of mine) {
    if (remaining <= 0) break
    const pay = Math.min(r.residual, remaining)
    const res = await applyPayment(supabase, r.id, paidDate, pay, note)
    if ('error' in res) return { error: res.error }
    remaining -= pay
  }
  if (remaining > 0) {
    revalidatePath('/treasury')
    return { error: `Le partite aperte non bastano: restano ${(remaining / 100).toFixed(2)} € da registrare a mano` }
  }
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('backlog_installments')
    .update({ paid_at: paidDate, paid_by: user?.id ?? null }).eq('id', installmentId)
  if (error) return { error: error.message }
  revalidatePath('/treasury')
  revalidatePath('/schedule')
  return { success: true }
}

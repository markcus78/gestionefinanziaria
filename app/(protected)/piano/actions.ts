'use server'

// Pagamenti della decade (Marco, 19/10/2026): il piano si decide in call il 6, il 16 e il 26,
// poi Orianna paga entro la decade, per priorità. Il piano congela solo le decisioni sui fornitori
// (importo e priorità) e le provviste fra società; il resto si legge vivo dal cruscotto.
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { applyPayment, residualCents } from '@/lib/payment-apply'

type Result = { success: true; id?: string } | { error: string }

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
const isMonth = (m: string) => /^\d{4}-\d{2}$/.test(m)

function done(): Result {
  revalidatePath('/piano')
  revalidatePath('/treasury')
  revalidatePath('/oggi')
  return { success: true }
}

async function who(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? user?.id ?? null
}

export type DueInput = { companyId: string; supplierKey: string; name: string }

// Crea la bozza del piano con l'elenco dei fornitori che hanno qualcosa da pagare (importo 0:
// si decide in call). Se il piano c'è già, aggiunge solo i fornitori nuovi.
export async function createOrRefreshPlan(month: string, idx: number, dues: DueInput[]): Promise<Result> {
  if (!isMonth(month) || ![1, 2, 3].includes(idx)) return { error: 'Decade non valida' }
  const supabase = await createClient()
  let { data: plan } = await supabase.from('decade_plans').select('id, status').eq('month', month).eq('idx', idx).maybeSingle()
  if (!plan) {
    const { data, error } = await supabase.from('decade_plans').insert({ month, idx }).select('id, status').single()
    if (error) return { error: error.message }
    plan = data
  }
  const { data: existing } = await supabase.from('decade_plan_suppliers').select('company_id, supplier_key, priority').eq('plan_id', plan.id)
  const have = new Set((existing ?? []).map(e => `${e.company_id}|${e.supplier_key}`))
  let next = Math.max(0, ...(existing ?? []).map(e => e.priority)) + 1
  const fresh = dues.filter(d => !have.has(`${d.companyId}|${d.supplierKey}`))
  if (fresh.length) {
    const { error } = await supabase.from('decade_plan_suppliers').insert(fresh.map(d => ({
      plan_id: plan.id, company_id: d.companyId, supplier_key: d.supplierKey, supplier_name: d.name,
      planned_cents: 0, priority: next++,
    })))
    if (error) return { error: error.message }
  }
  done()
  return { success: true, id: plan.id }
}

export async function setSupplierPlan(lineId: string, plannedCents: number, priority: number): Promise<Result> {
  if (!Number.isFinite(plannedCents) || plannedCents < 0) return { error: 'Importo non valido' }
  if (!Number.isInteger(priority) || priority < 1) return { error: 'Priorità non valida' }
  const supabase = await createClient()
  const { error } = await supabase.from('decade_plan_suppliers')
    .update({ planned_cents: Math.round(plannedCents), priority, updated_at: new Date().toISOString() }).eq('id', lineId)
  if (error) return { error: error.message }
  return done()
}

// Ordine di priorità: la lista intera nell'ordine nuovo (1, 2, 3…)
export async function reorderSuppliers(lineIds: string[]): Promise<Result> {
  const supabase = await createClient()
  for (let i = 0; i < lineIds.length; i++) {
    const { error } = await supabase.from('decade_plan_suppliers').update({ priority: i + 1 }).eq('id', lineIds[i])
    if (error) return { error: error.message }
  }
  return done()
}

// All'approvazione si fissano le fatture di ogni fornitore: servono a riconoscere quelle che l'import
// chiude senza un pagamento registrato (pagate fuori dal sistema)
export async function setPlanStatus(planId: string, status: 'bozza' | 'approvato', rows: { lineId: string; rowIds: string[] }[] = []): Promise<Result> {
  const supabase = await createClient()
  const by = await who(supabase)
  if (status === 'approvato') {
    for (const r of rows) {
      const { error } = await supabase.from('decade_plan_suppliers').update({ row_ids: r.rowIds }).eq('id', r.lineId).eq('plan_id', planId)
      if (error) return { error: error.message }
    }
  }
  const { error } = await supabase.from('decade_plans').update(status === 'approvato'
    ? { status, approved_by: by, approved_at: new Date().toISOString() }
    : { status, approved_by: null, approved_at: null }).eq('id', planId)
  if (error) return { error: error.message }
  return done()
}

// ─── Provviste fra società ───────────────────────────────────────────────────

export async function createTransfer(input: {
  month: string; idx: number; fromCompanyId: string; toCompanyId: string; cents: number; dueDate: string; notes?: string
}): Promise<Result> {
  if (!isMonth(input.month) || !isDate(input.dueDate)) return { error: 'Data non valida' }
  if (!(input.cents > 0)) return { error: 'Importo non valido' }
  if (input.fromCompanyId === input.toCompanyId) return { error: 'Le due società devono essere diverse' }
  const supabase = await createClient()
  const { error } = await supabase.from('intercompany_transfers').insert({
    plan_month: input.month, plan_idx: input.idx, from_company_id: input.fromCompanyId, to_company_id: input.toCompanyId,
    amount_cents: Math.round(input.cents), due_date: input.dueDate, notes: input.notes?.trim() || null, created_by: await who(supabase),
  })
  if (error) return { error: error.message }
  return done()
}

export async function deleteTransfer(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('intercompany_transfers').delete().eq('id', id).is('paid_date', null)
  if (error) return { error: error.message }
  return done()
}

// Giroconto fatto (paidDate) o annullato (null)
export async function setTransferPaid(id: string, paidDate: string | null): Promise<Result> {
  if (paidDate !== null && !isDate(paidDate)) return { error: 'Data non valida' }
  const supabase = await createClient()
  const { error } = await supabase.from('intercompany_transfers')
    .update({ paid_date: paidDate, paid_by: paidDate ? await who(supabase) : null }).eq('id', id)
  if (error) return { error: error.message }
  return done()
}

// ─── Pagamenti ───────────────────────────────────────────────────────────────

// Pagamento a un fornitore del piano: si registra solo sulle sue fatture del piano (quelle della
// finestra, dalla più vecchia), mai sull'arretrato né sui RID futuri. Il residuo si rilegge qui.
export async function paySupplier(input: {
  companyId: string; rowIds: string[]; paidDate: string; cents: number; planLabel: string
}): Promise<Result> {
  if (!isDate(input.paidDate)) return { error: 'Data non valida' }
  if (!(input.cents > 0)) return { error: 'Importo non valido' }
  if (!input.rowIds.length) return { error: 'Nessuna fattura del piano per questo fornitore' }
  const supabase = await createClient()
  const { data: rows, error } = await supabase.from('payment_schedule')
    .select('id, amount_cents, paid_amount_cents')
    .in('id', input.rowIds).eq('company_id', input.companyId).eq('flow_type', 'out').eq('entry_type', 'accounting')
    .in('status', ['pending', 'scheduled', 'partial', 'postponed'])
  if (error) return { error: error.message }
  const byId = new Map((rows ?? []).map(r => [r.id, residualCents(r.amount_cents, r.paid_amount_cents)]))
  let remaining = Math.round(input.cents)
  for (const id of input.rowIds) {
    const residual = byId.get(id) ?? 0
    if (remaining <= 0) break
    if (residual <= 0) continue
    const pay = Math.min(residual, remaining)
    const res = await applyPayment(supabase, id, input.paidDate, pay, input.planLabel)
    if ('error' in res) return { error: res.error }
    remaining -= pay
  }
  if (remaining > 0) {
    done()
    return { error: `Le fatture del piano non bastano: restano ${(remaining / 100).toFixed(2)} € da registrare a mano` }
  }
  revalidatePath('/schedule')
  revalidatePath('/payments')
  return done()
}

// Pagamento di una riga sola (muro, impegni, fatture sotto i 300 €)
export async function payRow(rowId: string, paidDate: string, cents: number, planLabel: string): Promise<Result> {
  if (!isDate(paidDate)) return { error: 'Data non valida' }
  const supabase = await createClient()
  const res = await applyPayment(supabase, rowId, paidDate, Math.round(cents), planLabel)
  if ('error' in res) return { error: res.error }
  revalidatePath('/schedule')
  revalidatePath('/payments')
  revalidatePath('/impegni')
  revalidatePath('/staff')
  return done()
}

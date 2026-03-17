'use server'

import { createClient } from '@/lib/supabase/server'
import { cancelCommitment } from '@/app/(protected)/impegni/actions'
import {
  parseXLSBuffer,
  computeDedupKey,
  buildMatchKey,
  type ParsedRow,
  type ParseStats,
} from '@/lib/xls-parser'
import { calculatePriorityScore } from '@/lib/priority-scorer'
import { revalidatePath } from 'next/cache'
import type { SupplierCategory } from '@/lib/types/database'

// ── Tipi esportati ──────────────────────────────────────────────────────────

export type ParseFileResult =
  | { error: string }
  | { stats: ParseStats; previewRows: ParsedRow[]; allRowsJson: string }

export type DiffModified = {
  dbId: string
  matchKey: string
  dbDueDate: string
  dbAmountCents: number
  row: ParsedRow
}

export type DiffRemoved = {
  dbId: string
  supplierName: string | null
  documentNumber: string | null
  dueDate: string
  amountCents: number
}

export type FileDiffResult = {
  added: ParsedRow[]
  alwaysNew: ParsedRow[]
  modified: DiffModified[]
  removed: DiffRemoved[]
  unchanged: number
}

type CommitmentMatch = {
  id: string
  supplier_name: string | null
  amount_cents: number
  due_date: string
  commitment_type: string | null
  account_description: string | null
}

export type PossibleDuplicate = {
  amount_cents: number
  due_date: string
  supplier_name: string | null
  commitment: CommitmentMatch
}

export type DiffPreviewWithDuplicates = {
  diff: FileDiffResult
  possibleDuplicates: PossibleDuplicate[]
}

export type DiffPreviewResult = { error: string } | DiffPreviewWithDuplicates

export type ImportResult =
  | { error: string }
  | { rowsNew: number; rowsModified: number; rowsMarkedPaid: number; rowsSkipped: number; suppliersNew: number; commitmentsCancelled: number }

// ── Parse ──────────────────────────────────────────────────────────────────

export async function parseFileAction(formData: FormData): Promise<ParseFileResult> {
  const file = formData.get('file') as File
  if (!file || file.size === 0) return { error: 'Nessun file selezionato' }
  if (!file.name.toLowerCase().endsWith('.xls') && !file.name.toLowerCase().endsWith('.xlsx')) {
    return { error: 'Il file deve essere in formato .XLS o .XLSX' }
  }
  try {
    const buffer = await file.arrayBuffer()
    const { rows, stats } = parseXLSBuffer(buffer)
    return { stats, previewRows: rows.slice(0, 50), allRowsJson: JSON.stringify(rows) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Errore nel parsing del file' }
  }
}

// ── Helper interni ──────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>
type SupplierInfo = {
  id: string
  category: SupplierCategory | null
  isCritical: boolean
  acceptsPostponement: boolean
}

function buildDbMatchKey(
  companyId: string,
  row: { supplier_code: string | null; document_number: string | null; document_date: string | null }
): string | null {
  if (!row.supplier_code || !row.document_number) return null
  return [companyId, row.supplier_code, row.document_number, row.document_date ?? ''].join('|')
}

function buildPaymentRow(
  row: ParsedRow,
  companyId: string,
  batchId: string,
  supplierMap: Map<string, SupplierInfo>,
  legalNameToId: Map<string, string>
) {
  const supplier = row.supplier_code ? supplierMap.get(row.supplier_code) : undefined
  const counterpartId = row.counterpart_legal_name
    ? (legalNameToId.get(row.counterpart_legal_name.toLowerCase()) ?? null)
    : null
  const priorityScore =
    row.flow_type === 'out'
      ? calculatePriorityScore({
          category: supplier?.category ?? null,
          dueDate: row.due_date,
          isCritical: supplier?.isCritical ?? false,
          acceptsPostponement: supplier?.acceptsPostponement ?? false,
        })
      : null
  const dedupKey = computeDedupKey(
    companyId,
    row.supplier_code,
    row.document_number,
    row.due_date,
    row.amount_cents
  )
  return {
    company_id: companyId,
    import_batch_id: batchId,
    supplier_name: row.supplier_name,
    supplier_code: row.supplier_code,
    account_code: row.account_code,
    account_description: row.account_description,
    document_type: row.document_type,
    document_number: row.document_number,
    document_date: row.document_date,
    due_date: row.due_date,
    payment_method: row.payment_method,
    bank_description: row.bank_description,
    amount_cents: row.amount_cents,
    amount_in_cents: row.amount_in_cents,
    amount_out_cents: row.amount_out_cents,
    flow_type: row.flow_type,
    entry_type: row.entry_type,
    is_intercompany: row.is_intercompany,
    counterpart_company_id: counterpartId,
    supplier_id: supplier?.id ?? null,
    priority_score: priorityScore,
    dedup_key: dedupKey,
  }
}

async function computeDiff(
  companyId: string,
  rows: ParsedRow[],
  supabase: SupabaseClient
): Promise<FileDiffResult | { error: string }> {
  const { data: dbRows, error: dbErr } = await supabase
    .from('payment_schedule')
    .select('id, supplier_code, document_number, document_date, due_date, amount_cents, supplier_name')
    .eq('company_id', companyId)
    .eq('entry_type', 'accounting')
  if (dbErr) return { error: dbErr.message }

  // Map matchKey → dbRow
  const dbMap = new Map<string, {
    id: string
    due_date: string
    amount_cents: number
    supplier_name: string | null
    document_number: string | null
  }>()
  for (const dbRow of dbRows ?? []) {
    const key = buildDbMatchKey(companyId, dbRow)
    if (key) dbMap.set(key, {
      id: dbRow.id,
      due_date: dbRow.due_date,
      amount_cents: dbRow.amount_cents,
      supplier_name: dbRow.supplier_name,
      document_number: dbRow.document_number,
    })
  }

  const added: ParsedRow[] = []
  const alwaysNew: ParsedRow[] = []
  const modified: DiffModified[] = []
  const xlsKeys = new Set<string>()
  let unchanged = 0

  for (const row of rows) {
    if (row.entry_type !== 'accounting') {
      alwaysNew.push(row)
      continue
    }
    const key = buildMatchKey(companyId, row)
    if (!key) {
      alwaysNew.push(row)
      continue
    }
    xlsKeys.add(key)
    const dbRow = dbMap.get(key)
    if (!dbRow) {
      added.push(row)
    } else if (dbRow.due_date !== row.due_date || dbRow.amount_cents !== row.amount_cents) {
      modified.push({
        dbId: dbRow.id,
        matchKey: key,
        dbDueDate: dbRow.due_date,
        dbAmountCents: dbRow.amount_cents,
        row,
      })
    } else {
      unchanged++
    }
  }

  const removed: DiffRemoved[] = []
  for (const [key, dbRow] of dbMap) {
    if (!xlsKeys.has(key)) {
      removed.push({
        dbId: dbRow.id,
        supplierName: dbRow.supplier_name,
        documentNumber: dbRow.document_number,
        dueDate: dbRow.due_date,
        amountCents: dbRow.amount_cents,
      })
    }
  }

  return { added, alwaysNew, modified, removed, unchanged }
}

// ── Diff Preview ────────────────────────────────────────────────────────────

export async function diffPreviewAction(
  companyCode: string,
  rowsJson: string
): Promise<DiffPreviewResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const rows: ParsedRow[] = JSON.parse(rowsJson)

  const { data: companyRow } = await supabase
    .from('companies')
    .select('id')
    .eq('code', companyCode)
    .single()
  if (!companyRow) return { error: `Società "${companyCode}" non trovata` }

  const diff = await computeDiff(companyRow.id, rows, supabase)
  if ('error' in diff) return diff

  // Cerca possibili duplicati tra le righe in arrivo (uscite) e impegni manuali attivi
  const { data: commitments } = await supabase
    .from('payment_schedule')
    .select('id, supplier_name, amount_cents, due_date, commitment_type, account_description')
    .eq('company_id', companyRow.id)
    .eq('entry_type', 'commitment')
    .not('status', 'in', '("cancelled","paid")')

  const incomingOut = rows.filter(r => r.flow_type === 'out')
  const possibleDuplicates: PossibleDuplicate[] = []

  for (const row of incomingOut) {
    const match = (commitments ?? []).find(c => {
      const sameCents = Math.abs(c.amount_cents) === Math.abs(row.amount_cents)
      const daysDiff = Math.abs(
        new Date(c.due_date).getTime() - new Date(row.due_date).getTime()
      ) / 86400000
      return sameCents && daysDiff <= 7
    })
    if (match) {
      possibleDuplicates.push({
        amount_cents: row.amount_cents,
        due_date: row.due_date,
        supplier_name: row.supplier_name,
        commitment: {
          id: match.id,
          supplier_name: match.supplier_name,
          amount_cents: match.amount_cents,
          due_date: match.due_date,
          commitment_type: match.commitment_type,
          account_description: match.account_description,
        },
      })
    }
  }

  return { diff, possibleDuplicates }
}

// ── Import Incrementale ─────────────────────────────────────────────────────

export async function importIncrementalAction(
  companyCode: string,
  rowsJson: string,
  fileName: string,
  markPaidIds: string[],
  cancelCommitmentIds: string[] = []
): Promise<ImportResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const rows: ParsedRow[] = JSON.parse(rowsJson)
  if (!rows.length) return { error: 'Nessuna riga da importare' }

  // 0. Risolvi companyCode → companyId
  const { data: companyRow } = await supabase
    .from('companies')
    .select('id')
    .eq('code', companyCode)
    .single()
  if (!companyRow) return { error: `Società con codice "${companyCode}" non trovata` }
  const companyId = companyRow.id

  // 0b. Annulla impegni duplicati selezionati dall'utente
  let commitmentsCancelled = 0
  for (const cid of cancelCommitmentIds) {
    const res = await cancelCommitment(cid)
    if ('error' in res) return { error: `Errore annullamento impegno ${cid}: ${res.error}` }
    commitmentsCancelled++
  }

  // 1. Calcola diff (ricalcolo server-side per sicurezza)
  const diff = await computeDiff(companyId, rows, supabase)
  if ('error' in diff) return { error: diff.error }

  // Sicurezza: accetta solo markPaidIds che sono effettivamente "removed"
  const removedIds = new Set(diff.removed.map(r => r.dbId))
  const safeMarkPaidIds = markPaidIds.filter(id => removedIds.has(id))

  // 2. Elimina righe DB senza matchKey (not matchable, cleanup)
  await supabase
    .from('payment_schedule')
    .delete()
    .eq('company_id', companyId)
    .eq('entry_type', 'accounting')
    .is('supplier_code', null)

  await supabase
    .from('payment_schedule')
    .delete()
    .eq('company_id', companyId)
    .eq('entry_type', 'accounting')
    .is('document_number', null)

  // 3. Elimina commitment da import XLS precedenti (import_batch_id IS NOT NULL)
  const { error: deleteErr } = await supabase
    .from('payment_schedule')
    .delete()
    .eq('company_id', companyId)
    .eq('entry_type', 'commitment')
    .not('import_batch_id', 'is', null)
  if (deleteErr) return { error: `Errore eliminazione commitment XLS: ${deleteErr.message}` }

  // 4. Fetch companies per mapping legal_name → id
  const { data: companies } = await supabase.from('companies').select('id, legal_name')
  const legalNameToId = new Map(
    (companies ?? [])
      .filter(c => c.legal_name)
      .map(c => [c.legal_name!.toLowerCase(), c.id])
  )

  // 5. Crea import batch
  const { data: batch, error: batchErr } = await supabase
    .from('import_batches')
    .insert({ company_id: companyId, imported_by: user.id, file_name: fileName, status: 'in_progress' })
    .select('id')
    .single()
  if (batchErr || !batch) return { error: batchErr?.message ?? 'Errore creazione batch' }

  // 6. Upsert fornitori
  const uniqueSuppliers = new Map<string, string>()
  for (const row of rows) {
    if (row.supplier_code && row.supplier_name && !uniqueSuppliers.has(row.supplier_code)) {
      uniqueSuppliers.set(row.supplier_code, row.supplier_name)
    }
  }
  let suppliersNew = 0
  if (uniqueSuppliers.size > 0) {
    const toInsert = Array.from(uniqueSuppliers.entries()).map(([code, name]) => ({
      company_id: companyId,
      supplier_code: code,
      supplier_name: name,
    }))
    const { data: inserted } = await supabase
      .from('supplier_registry')
      .upsert(toInsert, { onConflict: 'company_id,supplier_code', ignoreDuplicates: true })
      .select('id')
    suppliersNew = inserted?.length ?? 0
  }

  // 7. Fetch supplier registry per priority score
  const { data: supplierRegistry } = await supabase
    .from('supplier_registry')
    .select('id, supplier_code, category, is_critical, accepts_postponement')
    .eq('company_id', companyId)
  const supplierMap = new Map<string, SupplierInfo>(
    (supplierRegistry ?? []).map(s => [
      s.supplier_code as string,
      {
        id: s.id as string,
        category: s.category as SupplierCategory | null,
        isCritical: s.is_critical as boolean,
        acceptsPostponement: s.accepts_postponement as boolean,
      },
    ])
  )

  // 8. INSERT righe nuove (added + alwaysNew) — solo accounting, no commitment da XLS
  const toInsert = [
    ...diff.added,
    ...diff.alwaysNew,
  ].filter(row => row.entry_type === 'accounting')
   .map(row => buildPaymentRow(row, companyId, batch.id, supplierMap, legalNameToId))

  let rowsNew = 0
  let rowsSkipped = 0
  const CHUNK = 100
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { data: inserted, error: insErr } = await supabase
      .from('payment_schedule')
      .upsert(chunk, { onConflict: 'dedup_key', ignoreDuplicates: true })
      .select('id')
    if (insErr) {
      rowsSkipped += chunk.length
    } else {
      rowsNew += inserted?.length ?? 0
      rowsSkipped += chunk.length - (inserted?.length ?? 0)
    }
  }

  // 9. UPDATE righe modificate (preserva status/priority_override/note)
  let rowsModified = 0
  for (const m of diff.modified) {
    const supplier = m.row.supplier_code ? supplierMap.get(m.row.supplier_code) : undefined
    const priorityScore =
      m.row.flow_type === 'out'
        ? calculatePriorityScore({
            category: supplier?.category ?? null,
            dueDate: m.row.due_date,
            isCritical: supplier?.isCritical ?? false,
            acceptsPostponement: supplier?.acceptsPostponement ?? false,
          })
        : null
    const newDedupKey = computeDedupKey(
      companyId,
      m.row.supplier_code,
      m.row.document_number,
      m.row.due_date,
      m.row.amount_cents
    )
    const { error: updErr } = await supabase
      .from('payment_schedule')
      .update({
        due_date: m.row.due_date,
        amount_cents: m.row.amount_cents,
        amount_in_cents: m.row.amount_in_cents,
        amount_out_cents: m.row.amount_out_cents,
        flow_type: m.row.flow_type,
        bank_description: m.row.bank_description,
        payment_method: m.row.payment_method,
        priority_score: priorityScore,
        import_batch_id: batch.id,
        dedup_key: newDedupKey,
      })
      .eq('id', m.dbId)
    if (!updErr) rowsModified++
  }

  // 10. Marca come pagate le "sparite" selezionate dall'utente
  let rowsMarkedPaid = 0
  if (safeMarkPaidIds.length > 0) {
    const { error: paidErr } = await supabase
      .from('payment_schedule')
      .update({ status: 'paid' })
      .in('id', safeMarkPaidIds)
      .eq('company_id', companyId)
    if (!paidErr) rowsMarkedPaid = safeMarkPaidIds.length
  }

  // 11. Aggiorna batch
  await supabase
    .from('import_batches')
    .update({ rows_imported: rows.length, rows_new: rowsNew, status: 'completed' })
    .eq('id', batch.id)

  revalidatePath('/schedule')
  revalidatePath('/impegni')
  return { rowsNew, rowsModified, rowsMarkedPaid, rowsSkipped, suppliersNew, commitmentsCancelled }
}

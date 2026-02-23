'use server'

import { createClient } from '@/lib/supabase/server'
import { parseXLSBuffer, computeDedupKey, type ParsedRow, type ParseStats } from '@/lib/xls-parser'
import { calculatePriorityScore } from '@/lib/priority-scorer'
import { revalidatePath } from 'next/cache'
import type { SupplierCategory } from '@/lib/types/database'

export type ParseFileResult =
  | { error: string }
  | { stats: ParseStats; previewRows: ParsedRow[]; allRowsJson: string }

export async function parseFileAction(formData: FormData): Promise<ParseFileResult> {
  const file = formData.get('file') as File
  if (!file || file.size === 0) return { error: 'Nessun file selezionato' }
  if (!file.name.toLowerCase().endsWith('.xls') && !file.name.toLowerCase().endsWith('.xlsx')) {
    return { error: 'Il file deve essere in formato .XLS o .XLSX' }
  }

  try {
    const buffer = await file.arrayBuffer()
    const { rows, stats } = parseXLSBuffer(buffer)
    return {
      stats,
      previewRows: rows.slice(0, 50),
      allRowsJson: JSON.stringify(rows),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Errore nel parsing del file' }
  }
}

export type ImportResult =
  | { error: string }
  | { rowsNew: number; rowsSkipped: number; suppliersNew: number }

export async function importBatchAction(
  companyCode: string,
  rowsJson: string,
  fileName: string
): Promise<ImportResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const rows: ParsedRow[] = JSON.parse(rowsJson)
  if (!rows.length) return { error: 'Nessuna riga da importare' }

  // 0. Risolvi companyCode → companyId (UUID)
  const { data: companyRow } = await supabase
    .from('companies')
    .select('id')
    .eq('code', companyCode)
    .single()
  if (!companyRow) return { error: `Società con codice "${companyCode}" non trovata` }
  const companyId = companyRow.id

  // 1. Fetch companies per mapping legal_name → id
  const { data: companies } = await supabase.from('companies').select('id, legal_name')
  const legalNameToId = new Map(
    (companies ?? [])
      .filter(c => c.legal_name)
      .map(c => [c.legal_name!.toLowerCase(), c.id])
  )

  // 2. Crea import batch
  const { data: batch, error: batchErr } = await supabase
    .from('import_batches')
    .insert({ company_id: companyId, imported_by: user.id, file_name: fileName, status: 'in_progress' })
    .select('id')
    .single()

  if (batchErr || !batch) return { error: batchErr?.message ?? 'Errore creazione batch' }

  // 3. Upsert fornitori (solo nuovi, non sovrascrivere quelli esistenti con categoria già impostata)
  const uniqueSuppliers = new Map<string, string>() // code → name
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

    // Insert only — skip existing (ignoreDuplicates preserves user data)
    const { data: inserted } = await supabase
      .from('supplier_registry')
      .upsert(toInsert, { onConflict: 'company_id,supplier_code', ignoreDuplicates: true })
      .select('id')
    suppliersNew = inserted?.length ?? 0
  }

  // 4. Fetch supplier registry (per categoria e flag critico → priority score)
  const { data: supplierRegistry } = await supabase
    .from('supplier_registry')
    .select('id, supplier_code, category, is_critical, accepts_postponement')
    .eq('company_id', companyId)

  const supplierMap = new Map(
    (supplierRegistry ?? []).map(s => [
      s.supplier_code,
      {
        id: s.id as string,
        category: s.category as SupplierCategory | null,
        isCritical: s.is_critical as boolean,
        acceptsPostponement: s.accepts_postponement as boolean,
      },
    ])
  )

  // 5. Prepara righe payment_schedule
  const paymentRows = rows.map(row => {
    const supplier = row.supplier_code ? supplierMap.get(row.supplier_code) : null
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
      import_batch_id: batch.id,
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
  })

  // 6. Insert a blocchi di 100 (ON CONFLICT DO NOTHING — non sovrascrivere stati utente)
  let rowsNew = 0
  let rowsSkipped = 0
  const CHUNK = 100

  for (let i = 0; i < paymentRows.length; i += CHUNK) {
    const chunk = paymentRows.slice(i, i + CHUNK)
    const { data: inserted, error: insErr } = await supabase
      .from('payment_schedule')
      .upsert(chunk, { onConflict: 'dedup_key', ignoreDuplicates: true })
      .select('id')

    if (insErr) {
      console.error('Chunk insert error:', insErr.message)
      rowsSkipped += chunk.length
    } else {
      rowsNew += inserted?.length ?? 0
      rowsSkipped += chunk.length - (inserted?.length ?? 0)
    }
  }

  // 7. Aggiorna batch con statistiche finali
  await supabase
    .from('import_batches')
    .update({ rows_imported: rows.length, rows_new: rowsNew, status: 'completed' })
    .eq('id', batch.id)

  revalidatePath('/schedule')
  return { rowsNew, rowsSkipped, suppliersNew }
}

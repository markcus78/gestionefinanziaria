import * as XLSX from 'xlsx'

export type ParsedRow = {
  flow_type: 'in' | 'out'
  entry_type: 'accounting' | 'commitment'
  due_date: string           // YYYY-MM-DD
  document_date: string | null
  document_number: string | null
  document_type: string | null
  supplier_code: string | null
  supplier_name: string | null
  account_code: string | null
  account_description: string | null
  payment_method: string | null
  bank_description: string | null
  amount_cents: number
  amount_in_cents: number
  amount_out_cents: number
  is_intercompany: boolean
  counterpart_legal_name: string | null
}

export type ParseStats = {
  total: number
  entries: number
  exits: number
  accounting: number
  commitments: number
  overdue: number
  intercompany: number
  totalInCents: number
  totalOutCents: number
}

export type ParseResult = {
  rows: ParsedRow[]
  stats: ParseStats
}

// Ragioni sociali del gruppo per rilevamento intercompany
const INTERCOMPANY_NAMES = [
  'WELLNESS TOWN S.a.S di Aries Global Services S.r.l.',
  'ARIES GLOBAL SERVICE S.R.L.',
  'HANGAR 55 SRL',
  'GIMS SSD a r.l.',
]
const INTERCOMPANY_NAMES_LOWER = INTERCOMPANY_NAMES.map(n => n.toLowerCase())

// Converti serial date Excel → YYYY-MM-DD
function excelDateToISO(serial: number): string | null {
  if (!serial || isNaN(serial) || serial < 1) return null
  const ms = (serial - 25569) * 86400 * 1000
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

// Pulisce il campo TipoPag: '1  Rimessa diretta' → 'Rimessa diretta'
function cleanPaymentMethod(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).replace(/^\d+\s+/, '').trim()
  return s || null
}

function str(val: unknown): string {
  return String(val ?? '').trim()
}

function parseRow(raw: unknown[]): ParsedRow | null {
  if (!raw || raw.length < 20) return null

  const dueSerial = Number(raw[2])
  if (!dueSerial || isNaN(dueSerial)) return null

  const dueDate = excelDateToISO(dueSerial)
  if (!dueDate) return null

  const tipoFlusso = Number(raw[0])
  const origFlusso = str(raw[21])
  const ragSoc = str(raw[28])
  const importoUdc = Number(raw[16]) || 0
  const impEntrate = Number(raw[17]) || 0
  const impUscite = Number(raw[18]) || 0

  // supplier_code: il codice è un float (es. 19.0), lo prendiamo come intero
  const supplierCodeRaw = raw[6]
  const supplierCode =
    supplierCodeRaw != null && Number(supplierCodeRaw) !== 0
      ? String(Math.round(Number(supplierCodeRaw)))
      : null

  const isIntercompany = INTERCOMPANY_NAMES_LOWER.includes(ragSoc.toLowerCase())
  const counterpartLegalName = isIntercompany
    ? INTERCOMPANY_NAMES.find(n => n.toLowerCase() === ragSoc.toLowerCase()) ?? null
    : null

  return {
    flow_type: tipoFlusso === 0 ? 'in' : 'out',
    entry_type: origFlusso === 'Scad' ? 'accounting' : 'commitment',
    due_date: dueDate,
    document_date: excelDateToISO(Number(raw[3])),
    document_number: str(raw[4]) || null,
    document_type: str(raw[5]) || null,
    supplier_code: supplierCode,
    supplier_name: ragSoc || null,
    account_code: str(raw[8]) || null,
    account_description: str(raw[9]) || null,
    payment_method: cleanPaymentMethod(raw[14]),
    bank_description: str(raw[12]) || null,
    amount_cents: Math.round(importoUdc * 100),
    amount_in_cents: Math.round(impEntrate * 100),
    amount_out_cents: Math.round(impUscite * 100),
    is_intercompany: isIntercompany,
    counterpart_legal_name: counterpartLegalName,
  }
}

export function parseXLSBuffer(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })

  const sheet = workbook.Sheets['Foglio1']
  if (!sheet) throw new Error('Sheet "Foglio1" non trovato. Verifica che il file sia corretto.')

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })

  const dataRows = rawRows.slice(1) // salta l'header
  const today = new Date().toISOString().split('T')[0]
  const rows: ParsedRow[] = []

  for (const raw of dataRows) {
    const parsed = parseRow(raw as unknown[])
    if (parsed) rows.push(parsed)
  }

  const stats: ParseStats = {
    total: rows.length,
    entries: rows.filter(r => r.flow_type === 'in').length,
    exits: rows.filter(r => r.flow_type === 'out').length,
    accounting: rows.filter(r => r.entry_type === 'accounting').length,
    commitments: rows.filter(r => r.entry_type === 'commitment').length,
    overdue: rows.filter(r => r.due_date < today && r.flow_type === 'out').length,
    intercompany: rows.filter(r => r.is_intercompany).length,
    totalInCents: rows.reduce((s, r) => s + r.amount_in_cents, 0),
    totalOutCents: rows.reduce((s, r) => s + Math.abs(r.amount_out_cents), 0),
  }

  return { rows, stats }
}

// Calcola dedup_key (deve corrispondere al trigger nel DB)
export function computeDedupKey(
  companyId: string,
  supplierCode: string | null,
  documentNumber: string | null,
  dueDate: string,
  amountCents: number
): string {
  return [
    companyId,
    supplierCode ?? '',
    documentNumber ?? '',
    dueDate,
    amountCents.toString(),
  ].join('|')
}

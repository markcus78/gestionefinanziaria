import * as XLSX from 'xlsx'

export type SalaryItem = {
  name: string
  amountCents: number
}

export function parseSalaryFile(buffer: ArrayBuffer): SalaryItem[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })

  if (rawRows.length < 2) return []

  const header = (rawRows[0] as unknown[]).map(h => String(h ?? '').toLowerCase().trim())

  let nameCol = -1
  let surnameCol = -1
  let amountCol = -1

  // Priorità a "importo netto" per la colonna importo
  for (let i = 0; i < header.length; i++) {
    const h = header[i]
    if (h.includes('importo netto') || h === 'netto') { amountCol = i; break }
  }

  for (let i = 0; i < header.length; i++) {
    const h = header[i]
    if (h === 'cognome') surnameCol = i
    else if (nameCol === -1 && (h === 'nome' || h.includes('nominativo') || h.includes('dipendente') || h.includes('collaboratore'))) {
      nameCol = i
    }
    if (amountCol === -1 && (h.includes('importo') || h.includes('bonifico'))) amountCol = i
  }

  // Fallback: prima colonna stringa = nome, prima colonna numerica = importo
  const firstData = rawRows[1] as unknown[]
  if (nameCol === -1) {
    for (let i = 0; i < firstData.length; i++) {
      if (typeof firstData[i] === 'string' && String(firstData[i]).trim()) { nameCol = i; break }
    }
  }
  if (amountCol === -1) {
    for (let i = 0; i < firstData.length; i++) {
      if (typeof firstData[i] === 'number' && (firstData[i] as number) > 0) { amountCol = i; break }
    }
  }

  if (nameCol === -1 || amountCol === -1) return []

  const items: SalaryItem[] = []

  for (const rawRow of rawRows.slice(1) as unknown[][]) {
    let name: string
    if (surnameCol !== -1) {
      const first = String(rawRow[nameCol] ?? '').trim()
      const last  = String(rawRow[surnameCol] ?? '').trim()
      name = [first, last].filter(Boolean).join(' ')
    } else {
      name = String(rawRow[nameCol] ?? '').trim()
    }

    const rawAmount = rawRow[amountCol]
    const amount = typeof rawAmount === 'number'
      ? rawAmount
      : parseFloat(String(rawAmount ?? '').replace(',', '.'))

    if (!name || isNaN(amount) || amount <= 0) continue
    items.push({ name, amountCents: Math.round(amount * 100) })
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, 'it'))
}

function cleanInstructorName(raw: string): string {
  const noBracket = raw.replace(/\s*\[.*?\]\s*$/, '').trim()
  // Rimuovi prefisso di 2 caratteri solo se coincide con le iniziali
  // delle prime due parole del nome (es. "ZSZucchiatti Silvia" → "Zucchiatti Silvia",
  // "mfmarasco francesco" → "marasco francesco", ma "Monticone Fabrizio" resta intatto)
  if (noBracket.length >= 4) {
    const prefix = noBracket.slice(0, 2)
    const rest = noBracket.slice(2).trim()
    const words = rest.split(/\s+/)
    if (words.length >= 2 && words[0].length > 0 && words[1].length > 0) {
      const expected = (words[0][0] + words[1][0]).toLowerCase()
      if (prefix.toLowerCase() === expected) return rest
    }
  }
  return noBracket
}

function parseCollaboratorSheet(buffer: ArrayBuffer, amountKeyword: string): SalaryItem[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null })
  if (rawRows.length < 2) return []

  // Cerca la riga di header (può essere preceduta da banner/titoli del software)
  let headerIdx = -1
  let nameCol = -1
  let amountCol = -1
  const scanLimit = Math.min(rawRows.length, 10)
  for (let i = 0; i < scanLimit; i++) {
    const row = (rawRows[i] as unknown[]).map(h => String(h ?? '').toLowerCase().trim())
    const nIdx = row.findIndex(h => h.includes('collaboratore'))
    const aIdx = row.findIndex(h => h.includes(amountKeyword))
    if (nIdx !== -1 && aIdx !== -1) {
      headerIdx = i
      nameCol = nIdx
      amountCol = aIdx
      break
    }
  }
  if (headerIdx === -1) return []

  const items: SalaryItem[] = []
  for (const rawRow of rawRows.slice(headerIdx + 1) as unknown[][]) {
    const name = cleanInstructorName(String(rawRow[nameCol] ?? '').trim())
    const rawAmount = rawRow[amountCol]
    const amount = typeof rawAmount === 'number'
      ? rawAmount
      : parseFloat(String(rawAmount ?? '').replace(/\./g, '').replace(',', '.'))
    if (!name || isNaN(amount) || amount <= 0) continue
    items.push({ name, amountCents: Math.round(amount * 100) })
  }
  return items.sort((a, b) => a.name.localeCompare(b.name, 'it'))
}

export function parseInstructorsFile(buffer: ArrayBuffer): SalaryItem[] {
  return parseCollaboratorSheet(buffer, 'netto provv')
}

export function parsePivaFile(buffer: ArrayBuffer): SalaryItem[] {
  return parseCollaboratorSheet(buffer, 'totale fatturato')
}

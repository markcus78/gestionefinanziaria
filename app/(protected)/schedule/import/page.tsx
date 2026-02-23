'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, FileSpreadsheet, CheckCircle, ArrowLeft, Loader2,
  AlertCircle, FileX, FileCheck,
} from 'lucide-react'
import { parseFileAction, importBatchAction } from './actions'
import type { ParseStats } from '@/lib/xls-parser'

const COMPANIES = [
  { code: '', name: '— seleziona —' },
  { code: 'WT', name: 'Wellness Town' },
  { code: 'APPIAE', name: 'Appiae Sport' },
  { code: 'HANGAR', name: 'Hangar 55' },
  { code: 'ARIES', name: 'Aries Global Service' },
]

// Rileva il codice società dal nome del file (es. WTFLUSSISCADENZARIO.XLS → WT)
// Ordine importante: prima quelli più lunghi per evitare match parziali
const DETECT_ORDER = ['APPIAE', 'HANGAR', 'ARIES', 'WT']
function detectCompany(fileName: string): string {
  const upper = fileName.toUpperCase()
  for (const code of DETECT_ORDER) {
    if (upper.startsWith(code)) return code
  }
  return ''
}

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

type Step = 'upload' | 'preview' | 'done'

type FileParsed =
  | { ok: true;  fileName: string; stats: ParseStats; allRowsJson: string }
  | { ok: false; fileName: string; error: string }

type FileImported = {
  fileName: string
  companyName: string
  rowsNew: number
  rowsSkipped: number
  suppliersNew: number
}

export default function ImportPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('upload')
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [parseProgress, setParseProgress] = useState<{ current: number; total: number } | null>(null)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null)
  const [parsed, setParsed] = useState<FileParsed[]>([])
  // fileCompanies[i] = codice società per parsed[i] (solo per file ok)
  const [fileCompanies, setFileCompanies] = useState<string[]>([])
  const [imported, setImported] = useState<FileImported[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)

  // ── STEP 1: analizza i file ──────────────────────────────────────────────
  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGlobalError(null)

    const input = e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]')
    const files = Array.from(input?.files ?? [])
    if (!files.length) return

    setIsParsing(true)
    setParseProgress({ current: 0, total: files.length })

    const results: FileParsed[] = []

    for (let i = 0; i < files.length; i++) {
      setParseProgress({ current: i + 1, total: files.length })
      const fd = new FormData()
      fd.append('file', files[i])
      const res = await parseFileAction(fd)
      if ('error' in res) {
        results.push({ ok: false, fileName: files[i].name, error: res.error })
      } else {
        results.push({ ok: true, fileName: files[i].name, stats: res.stats, allRowsJson: res.allRowsJson })
      }
    }

    setParsed(results)
    // auto-rileva la società per ogni file
    setFileCompanies(results.map(r => detectCompany(r.fileName)))
    setIsParsing(false)
    setParseProgress(null)
    setStep('preview')
  }

  // ── STEP 2: importa ─────────────────────────────────────────────────────
  async function handleImport() {
    setGlobalError(null)
    setIsImporting(true)

    // solo i file ok con società assegnata
    const toImport = parsed
      .map((fp, i) => ({ fp, company: fileCompanies[i] ?? '' }))
      .filter(({ fp, company }) => fp.ok && !!company) as Array<{
        fp: Extract<FileParsed, { ok: true }>
        company: string
      }>

    if (!toImport.length) {
      setGlobalError('Nessun file pronto per l\'importazione.')
      setIsImporting(false)
      return
    }

    setImportProgress({ current: 0, total: toImport.length })

    const results: FileImported[] = []

    for (let i = 0; i < toImport.length; i++) {
      setImportProgress({ current: i + 1, total: toImport.length })
      const { fp, company } = toImport[i]
      const companyName = COMPANIES.find(c => c.code === company)?.name ?? company
      const res = await importBatchAction(company, fp.allRowsJson, fp.fileName)
      if ('error' in res) {
        setGlobalError(`Errore su "${fp.fileName}": ${res.error}`)
        setIsImporting(false)
        setImportProgress(null)
        return
      }
      results.push({ fileName: fp.fileName, companyName, ...res })
    }

    setImported(results)
    setIsImporting(false)
    setImportProgress(null)
    setStep('done')
  }

  // validazione: tutti i file ok devono avere una società selezionata
  const validParsed = parsed.filter((p): p is Extract<FileParsed, { ok: true }> => p.ok)
  const errorParsed = parsed.filter(p => !p.ok)
  const readyToImport = validParsed.filter((_, i) => {
    // indice in parsed (i file ok sono i primi ok nel array)
    const parsedIdx = parsed.indexOf(validParsed[i])
    return !!fileCompanies[parsedIdx]
  })
  const missingCompany = validParsed.length - readyToImport.length

  const totalRows    = readyToImport.reduce((s, p) => s + p.stats.total, 0)
  const totalOut     = readyToImport.reduce((s, p) => s + p.stats.totalOutCents, 0)
  const totalOverdue = readyToImport.reduce((s, p) => s + p.stats.overdue, 0)
  const totalNew     = imported.reduce((s, r) => s + r.rowsNew, 0)
  const totalSkipped = imported.reduce((s, r) => s + r.rowsSkipped, 0)
  const totalSupNew  = imported.reduce((s, r) => s + r.suppliersNew, 0)

  return (
    <div className="p-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Import Scadenzario XLS</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        {(['upload', 'preview', 'done'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-zinc-700" />}
            <div className={`flex items-center gap-1.5 ${
              step === s ? 'text-indigo-400'
              : step === 'done' || (step === 'preview' && i === 0) ? 'text-zinc-500'
              : 'text-zinc-600'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-indigo-600 text-white'
                : (step === 'preview' && i === 0) || step === 'done' ? 'bg-zinc-700 text-zinc-400'
                : 'bg-zinc-800 text-zinc-600'
              }`}>
                {i + 1}
              </div>
              <span>{s === 'upload' ? 'Carica file' : s === 'preview' ? 'Anteprima' : 'Completato'}</span>
            </div>
          </div>
        ))}
      </div>

      {globalError && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {globalError}
        </div>
      )}

      {/* ── STEP 1: Upload ─────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <form onSubmit={handleUpload} className="space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              File XLS{' '}
              <span className="text-zinc-500 font-normal">— puoi selezionarne più di uno</span>
            </label>
            <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center hover:border-zinc-500 transition-colors">
              <Upload className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400 mb-1">
                Seleziona uno o più file esportati da Sistemi S.p.A.
              </p>
              <p className="text-xs text-zinc-600 mb-4">
                La società verrà rilevata automaticamente dal nome del file.
                Tieni <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">Ctrl</kbd> per selezionarne più di uno.
              </p>
              <input
                type="file"
                name="file"
                accept=".xls,.xlsx"
                multiple
                required
                className="text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-sm file:cursor-pointer hover:file:bg-indigo-500"
              />
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Es: WTFLUSSISCADENZARIO.XLS → Wellness Town, APPIAEFLUSSISCADENZARIO.XLS → Appiae Sport, ecc.
            </p>
          </div>

          {isParsing && parseProgress && (
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
              <span>Analisi file {parseProgress.current}/{parseProgress.total}...</span>
              <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(parseProgress.current / parseProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isParsing}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isParsing && <Loader2 className="w-4 h-4 animate-spin" />}
            {isParsing ? 'Analisi in corso...' : 'Analizza file'}
          </button>
        </form>
      )}

      {/* ── STEP 2: Preview ────────────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-5">

          {/* Totali sui file pronti */}
          {readyToImport.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'File pronti', value: `${readyToImport.length}/${validParsed.length}` },
                { label: 'Righe totali', value: totalRows.toString() },
                { label: 'Totale uscite', value: formatEur(totalOut) },
                { label: 'Scadute', value: totalOverdue.toString(), warn: totalOverdue > 0 },
              ].map(s => (
                <div key={s.label} className={`bg-zinc-900 border rounded-xl p-4 ${s.warn ? 'border-amber-500/30' : 'border-zinc-800'}`}>
                  <p className="text-xs text-zinc-400">{s.label}</p>
                  <p className={`text-xl font-semibold mt-1 ${s.warn ? 'text-amber-400' : 'text-zinc-100'}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Lista file con selettore società */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-200">
                {parsed.length} file analizzati
              </p>
              {missingCompany > 0 && (
                <p className="text-xs text-amber-400">
                  {missingCompany} {missingCompany === 1 ? 'file senza società' : 'file senza società'}
                </p>
              )}
            </div>

            <div className="divide-y divide-zinc-800/60">
              {parsed.map((fp, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">

                  {/* Icona stato */}
                  {fp.ok ? (
                    fileCompanies[i]
                      ? <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-2" />
                      : <FileSpreadsheet className="w-4 h-4 text-amber-400 shrink-0 mt-2" />
                  ) : (
                    <FileX className="w-4 h-4 text-red-400 shrink-0 mt-2" />
                  )}

                  {/* Nome file + stats */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{fp.fileName}</p>
                    {fp.ok ? (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {fp.stats.total} righe
                        {' · '}
                        <span className="text-red-400">{fp.stats.exits} usc. {formatEur(fp.stats.totalOutCents)}</span>
                        {' · '}
                        <span className="text-emerald-400">{fp.stats.entries} entr.</span>
                        {fp.stats.overdue > 0 && <span className="text-amber-400"> · {fp.stats.overdue} scadute</span>}
                        {fp.stats.intercompany > 0 && <span className="text-amber-400"> · {fp.stats.intercompany} IC</span>}
                      </p>
                    ) : (
                      <p className="text-xs text-red-400 mt-0.5">{fp.error}</p>
                    )}
                  </div>

                  {/* Selettore società (solo per file ok) */}
                  {fp.ok ? (
                    <div className="shrink-0">
                      <select
                        value={fileCompanies[i] ?? ''}
                        onChange={e => setFileCompanies(prev => {
                          const next = [...prev]
                          next[i] = e.target.value
                          return next
                        })}
                        className={`px-2 py-1.5 bg-zinc-800 border rounded-lg text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          fileCompanies[i] ? 'border-zinc-700' : 'border-amber-500/50'
                        }`}
                      >
                        {COMPANIES.map(c => (
                          <option key={c.code} value={c.code} disabled={!c.code}>{c.name}</option>
                        ))}
                      </select>
                      {!fileCompanies[i] && (
                        <p className="text-xs text-amber-400 mt-0.5 text-right">richiesto</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-red-400 shrink-0 mt-2">saltato</span>
                  )}

                </div>
              ))}
            </div>
          </div>

          {/* Import progress */}
          {isImporting && importProgress && (
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
              <span>Importazione file {importProgress.current}/{importProgress.total}...</span>
              <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={isImporting || readyToImport.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isImporting
                ? 'Importazione in corso...'
                : readyToImport.length === 0
                  ? 'Assegna una società a ogni file'
                  : `Importa ${readyToImport.length === 1 ? '1 file' : `${readyToImport.length} file`} (${totalRows} righe)`
              }
            </button>
            <button
              onClick={() => { setStep('upload'); setParsed([]); setFileCompanies([]) }}
              disabled={isImporting}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Done ───────────────────────────────────────────────────── */}
      {step === 'done' && imported.length > 0 && (
        <div className="space-y-4">

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
            <h2 className="text-base font-semibold text-zinc-100">
              {imported.length === 1 ? '1 file importato' : `${imported.length} file importati`}
            </h2>
            <div className="flex justify-center gap-8 text-sm">
              <div>
                <p className="text-2xl font-bold text-emerald-400">{totalNew}</p>
                <p className="text-zinc-400">nuove partite</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-400">{totalSkipped}</p>
                <p className="text-zinc-400">già presenti</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-indigo-400">{totalSupNew}</p>
                <p className="text-zinc-400">nuovi fornitori</p>
              </div>
            </div>
          </div>

          {/* Dettaglio per file */}
          {imported.length > 1 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Dettaglio per file</p>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {imported.map((r, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3 text-sm">
                    <FileSpreadsheet className="w-4 h-4 text-zinc-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-300 truncate">{r.fileName}</p>
                      <p className="text-xs text-zinc-500">{r.companyName}</p>
                    </div>
                    <span className="text-emerald-400 font-medium tabular-nums">{r.rowsNew} nuove</span>
                    {r.rowsSkipped > 0 && <span className="text-zinc-600 tabular-nums">{r.rowsSkipped} skip</span>}
                    {r.suppliersNew > 0 && <span className="text-indigo-400 tabular-nums">{r.suppliersNew} forn.</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push('/schedule')}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
            >
              Vai allo Scadenzario
            </button>
            <button
              onClick={() => { setStep('upload'); setParsed([]); setImported([]); setFileCompanies([]) }}
              className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              Importa altri file
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

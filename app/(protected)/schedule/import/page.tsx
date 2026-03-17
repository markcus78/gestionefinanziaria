'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, FileSpreadsheet, CheckCircle, ArrowLeft, Loader2,
  AlertCircle, FileX, FileCheck, Plus, Pencil, Trash2, Equal,
} from 'lucide-react'
import { parseFileAction, diffPreviewAction, importIncrementalAction } from './actions'
import type { ParseStats, ParsedRow } from '@/lib/xls-parser'
import type { FileDiffResult, DiffModified, DiffRemoved, PossibleDuplicate } from './actions'
import { AlertTriangle } from 'lucide-react'

const COMPANIES = [
  { code: '', name: '— seleziona —' },
  { code: 'WT', name: 'Wellness Town' },
  { code: 'APPIAE', name: 'Appiae Sport' },
  { code: 'HANGAR', name: 'Hangar 55' },
  { code: 'ARIES', name: 'Aries Global Service' },
]

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

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('it-IT').format(new Date(iso))
}

type Step = 'upload' | 'preview' | 'diff' | 'done'

type FileParsed =
  | { ok: true;  fileName: string; stats: ParseStats; allRowsJson: string }
  | { ok: false; fileName: string; error: string }

type FileDiff = {
  fileName: string
  companyCode: string
  allRowsJson: string
  result: FileDiffResult
  selectedRemovedIds: string[]
  possibleDuplicates: PossibleDuplicate[]
}

type FileImported = {
  fileName: string
  companyName: string
  rowsNew: number
  rowsModified: number
  rowsMarkedPaid: number
  rowsSkipped: number
  suppliersNew: number
  commitmentsCancelled: number
}

export default function ImportPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('upload')
  const [isParsing, setIsParsing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [parseProgress, setParseProgress] = useState<{ current: number; total: number } | null>(null)
  const [processProgress, setProcessProgress] = useState<{ current: number; total: number } | null>(null)
  const [parsed, setParsed] = useState<FileParsed[]>([])
  const [fileCompanies, setFileCompanies] = useState<string[]>([])
  const [diffs, setDiffs] = useState<FileDiff[]>([])
  const [cancelCommitmentIds, setCancelCommitmentIds] = useState<Set<string>>(new Set())
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
    setFileCompanies(results.map(r => detectCompany(r.fileName)))
    setIsParsing(false)
    setParseProgress(null)
    setStep('preview')
  }

  // ── STEP 2: calcola diff ─────────────────────────────────────────────────
  async function handleDiffPreview() {
    setGlobalError(null)
    setIsProcessing(true)

    const toProcess = parsed
      .map((fp, i) => ({ fp, company: fileCompanies[i] ?? '' }))
      .filter(({ fp, company }) => fp.ok && !!company) as Array<{
        fp: Extract<FileParsed, { ok: true }>
        company: string
      }>

    setProcessProgress({ current: 0, total: toProcess.length })

    const results: FileDiff[] = []
    for (let i = 0; i < toProcess.length; i++) {
      setProcessProgress({ current: i + 1, total: toProcess.length })
      const { fp, company } = toProcess[i]
      const res = await diffPreviewAction(company, fp.allRowsJson)
      if ('error' in res) {
        setGlobalError(`Errore su "${fp.fileName}": ${res.error}`)
        setIsProcessing(false)
        setProcessProgress(null)
        return
      }
      results.push({
        fileName: fp.fileName,
        companyCode: company,
        allRowsJson: fp.allRowsJson,
        result: res.diff,
        selectedRemovedIds: res.diff.removed.map(r => r.dbId),
        possibleDuplicates: res.possibleDuplicates,
      })
    }

    setCancelCommitmentIds(new Set(results.flatMap(r => r.possibleDuplicates.map(d => d.commitment.id))))
    setDiffs(results)
    setIsProcessing(false)
    setProcessProgress(null)
    setStep('diff')
  }

  function toggleRemoved(fileIdx: number, dbId: string) {
    setDiffs(prev => prev.map((d, i) => {
      if (i !== fileIdx) return d
      const already = d.selectedRemovedIds.includes(dbId)
      return {
        ...d,
        selectedRemovedIds: already
          ? d.selectedRemovedIds.filter(id => id !== dbId)
          : [...d.selectedRemovedIds, dbId],
      }
    }))
  }

  function toggleAllRemoved(fileIdx: number, selectAll: boolean) {
    setDiffs(prev => prev.map((d, i) => {
      if (i !== fileIdx) return d
      return {
        ...d,
        selectedRemovedIds: selectAll ? d.result.removed.map(r => r.dbId) : [],
      }
    }))
  }

  // ── STEP 3: importa ──────────────────────────────────────────────────────
  async function handleImport() {
    setGlobalError(null)
    setIsProcessing(true)
    setProcessProgress({ current: 0, total: diffs.length })

    const results: FileImported[] = []
    for (let i = 0; i < diffs.length; i++) {
      setProcessProgress({ current: i + 1, total: diffs.length })
      const diff = diffs[i]
      const companyName = COMPANIES.find(c => c.code === diff.companyCode)?.name ?? diff.companyCode
      const res = await importIncrementalAction(
        diff.companyCode,
        diff.allRowsJson,
        diff.fileName,
        diff.selectedRemovedIds,
        [...cancelCommitmentIds]
      )
      if ('error' in res) {
        setGlobalError(`Errore su "${diff.fileName}": ${res.error}`)
        setIsProcessing(false)
        setProcessProgress(null)
        return
      }
      results.push({ fileName: diff.fileName, companyName, ...res })
    }

    setImported(results)
    setIsProcessing(false)
    setProcessProgress(null)
    setStep('done')
  }

  // ── Variabili derivate ───────────────────────────────────────────────────
  const validParsed = parsed.filter((p): p is Extract<FileParsed, { ok: true }> => p.ok)
  const errorParsed = parsed.filter(p => !p.ok)
  const readyToImport = validParsed.filter((_, i) => {
    const parsedIdx = parsed.indexOf(validParsed[i])
    return !!fileCompanies[parsedIdx]
  })
  const missingCompany = validParsed.length - readyToImport.length

  const totalRows    = readyToImport.reduce((s, p) => s + p.stats.total, 0)
  const totalOut     = readyToImport.reduce((s, p) => s + p.stats.totalOutCents, 0)
  const totalOverdue = readyToImport.reduce((s, p) => s + p.stats.overdue, 0)

  const totalNew        = imported.reduce((s, r) => s + r.rowsNew, 0)
  const totalModified   = imported.reduce((s, r) => s + r.rowsModified, 0)
  const totalPaid       = imported.reduce((s, r) => s + r.rowsMarkedPaid, 0)
  const totalSkipped    = imported.reduce((s, r) => s + r.rowsSkipped, 0)
  const totalCancelled  = imported.reduce((s, r) => s + r.commitmentsCancelled, 0)
  const totalSupNew   = imported.reduce((s, r) => s + r.suppliersNew, 0)

  const totalDiffAdded    = diffs.reduce((s, d) => s + d.result.added.length + d.result.alwaysNew.length, 0)
  const totalDiffModified = diffs.reduce((s, d) => s + d.result.modified.length, 0)
  const totalDiffRemoved  = diffs.reduce((s, d) => s + d.result.removed.length, 0)
  const totalDiffSelected = diffs.reduce((s, d) => s + d.selectedRemovedIds.length, 0)

  return (
    <div className="p-6 max-w-4xl">

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
        {(['upload', 'preview', 'diff', 'done'] as const).map((s, i) => {
          const labels = { upload: 'Carica file', preview: 'Anteprima', diff: 'Differenze', done: 'Completato' }
          const stepIdx = ['upload', 'preview', 'diff', 'done'].indexOf(step)
          const isActive = step === s
          const isDone = stepIdx > i
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-zinc-700" />}
              <div className={`flex items-center gap-1.5 ${isActive ? 'text-indigo-400' : isDone ? 'text-zinc-500' : 'text-zinc-600'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive ? 'bg-indigo-600 text-white' : isDone ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-800 text-zinc-600'
                }`}>
                  {i + 1}
                </div>
                <span>{labels[s]}</span>
              </div>
            </div>
          )
        })}
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

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-200">{parsed.length} file analizzati</p>
              {missingCompany > 0 && (
                <p className="text-xs text-amber-400">{missingCompany} file senza società</p>
              )}
            </div>

            <div className="divide-y divide-zinc-800/60">
              {parsed.map((fp, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  {fp.ok ? (
                    fileCompanies[i]
                      ? <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-2" />
                      : <FileSpreadsheet className="w-4 h-4 text-amber-400 shrink-0 mt-2" />
                  ) : (
                    <FileX className="w-4 h-4 text-red-400 shrink-0 mt-2" />
                  )}

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

          {isProcessing && processProgress && (
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
              <span>Calcolo differenze {processProgress.current}/{processProgress.total}...</span>
              <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(processProgress.current / processProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleDiffPreview}
              disabled={isProcessing || readyToImport.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
              {isProcessing
                ? 'Calcolo in corso...'
                : readyToImport.length === 0
                  ? 'Assegna una società a ogni file'
                  : `Calcola differenze (${readyToImport.length === 1 ? '1 file' : `${readyToImport.length} file`})`
              }
            </button>
            <button
              onClick={() => { setStep('upload'); setParsed([]); setFileCompanies([]) }}
              disabled={isProcessing}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Diff ───────────────────────────────────────────────────── */}
      {step === 'diff' && (
        <div className="space-y-6">

          {/* Riepilogo globale */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Nuove', value: totalDiffAdded, color: 'text-emerald-400', icon: Plus },
              { label: 'Modificate', value: totalDiffModified, color: 'text-amber-400', icon: Pencil },
              { label: 'Sparite', value: `${totalDiffSelected}/${totalDiffRemoved}`, color: 'text-red-400', icon: Trash2 },
              { label: 'Invariate', value: diffs.reduce((s, d) => s + d.result.unchanged, 0), color: 'text-zinc-400', icon: Equal },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <p className="text-xs text-zinc-400">{label}</p>
                </div>
                <p className={`text-xl font-semibold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Diff per file */}
          {diffs.map((diff, fileIdx) => {
            const companyName = COMPANIES.find(c => c.code === diff.companyCode)?.name ?? diff.companyCode
            const newCount = diff.result.added.length + diff.result.alwaysNew.length
            const modCount = diff.result.modified.length
            const remCount = diff.result.removed.length
            const selCount = diff.selectedRemovedIds.length

            return (
              <div key={fileIdx} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{diff.fileName}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{companyName}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {newCount > 0 && <span className="text-emerald-400">+{newCount} nuove</span>}
                    {modCount > 0 && <span className="text-amber-400">~{modCount} modificate</span>}
                    {remCount > 0 && <span className="text-red-400">{selCount}/{remCount} sparite</span>}
                    {diff.result.unchanged > 0 && <span className="text-zinc-600">={diff.result.unchanged} invariate</span>}
                  </div>
                </div>

                <div className="divide-y divide-zinc-800/60">

                  {/* Possibili duplicati con impegni manuali */}
                  {diff.possibleDuplicates.length > 0 && (
                    <div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-sm text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-medium">
                            {diff.possibleDuplicates.length === 1
                              ? '1 possibile duplicato con impegni manuali'
                              : `${diff.possibleDuplicates.length} possibili duplicati con impegni manuali`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            onClick={() => setCancelCommitmentIds(prev => {
                              const next = new Set(prev)
                              diff.possibleDuplicates.forEach(d => next.add(d.commitment.id))
                              return next
                            })}
                            className="text-zinc-400 hover:text-zinc-200"
                          >
                            Tutti
                          </button>
                          <span className="text-zinc-700">·</span>
                          <button
                            onClick={() => setCancelCommitmentIds(prev => {
                              const next = new Set(prev)
                              diff.possibleDuplicates.forEach(d => next.delete(d.commitment.id))
                              return next
                            })}
                            className="text-zinc-400 hover:text-zinc-200"
                          >
                            Nessuno
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 mb-3">
                        Questi impegni manuali verranno annullati automaticamente perché la voce contabile è ora disponibile.
                        Deseleziona solo se vuoi mantenerli.
                      </p>
                      <div className="space-y-1.5">
                        {diff.possibleDuplicates.map((dup, di) => {
                          const selected = cancelCommitmentIds.has(dup.commitment.id)
                          return (
                            <label
                              key={di}
                              className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                                selected ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => setCancelCommitmentIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(dup.commitment.id)) next.delete(dup.commitment.id)
                                  else next.add(dup.commitment.id)
                                  return next
                                })}
                                className="w-3.5 h-3.5 accent-amber-500 shrink-0 mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-zinc-200 font-medium">{dup.supplier_name ?? '—'}</span>
                                  <span className="text-amber-400 tabular-nums">{formatEur(Math.abs(dup.amount_cents))}</span>
                                  <span className="text-zinc-500 tabular-nums">{formatDate(dup.due_date)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 text-zinc-500">
                                  <span className="text-zinc-600">↳ Impegno:</span>
                                  <span>{dup.commitment.supplier_name ?? dup.commitment.account_description ?? '—'}</span>
                                  <span className="tabular-nums">{formatEur(Math.abs(dup.commitment.amount_cents))}</span>
                                  <span className="tabular-nums">{formatDate(dup.commitment.due_date)}</span>
                                </div>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Nuove */}
                  {newCount > 0 && (
                    <details className="group">
                      <summary className="px-4 py-3 flex items-center gap-2 cursor-pointer text-sm text-emerald-400 hover:bg-zinc-800/40 select-none list-none">
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-medium">{newCount} nuove partite</span>
                        <span className="text-zinc-500 text-xs ml-auto group-open:hidden">espandi</span>
                        <span className="text-zinc-500 text-xs ml-auto hidden group-open:inline">riduci</span>
                      </summary>
                      <div className="px-4 pb-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-zinc-500 border-b border-zinc-800">
                              <th className="text-left pb-1.5 pr-3 font-medium">Fornitore</th>
                              <th className="text-left pb-1.5 pr-3 font-medium">Documento</th>
                              <th className="text-left pb-1.5 pr-3 font-medium">Scadenza</th>
                              <th className="text-right pb-1.5 font-medium">Importo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/40">
                            {[...diff.result.added, ...diff.result.alwaysNew].slice(0, 50).map((row, j) => (
                              <tr key={j} className="text-zinc-300">
                                <td className="py-1.5 pr-3 truncate max-w-[160px]">{row.supplier_name ?? '—'}</td>
                                <td className="py-1.5 pr-3 text-zinc-500">{row.document_number ?? '—'}</td>
                                <td className="py-1.5 pr-3 tabular-nums">{formatDate(row.due_date)}</td>
                                <td className={`py-1.5 text-right tabular-nums ${row.flow_type === 'out' ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {formatEur(Math.abs(row.amount_cents))}
                                </td>
                              </tr>
                            ))}
                            {newCount > 50 && (
                              <tr><td colSpan={4} className="py-1.5 text-zinc-600 italic">... e altri {newCount - 50}</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}

                  {/* Modificate */}
                  {modCount > 0 && (
                    <details className="group">
                      <summary className="px-4 py-3 flex items-center gap-2 cursor-pointer text-sm text-amber-400 hover:bg-zinc-800/40 select-none list-none">
                        <Pencil className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-medium">{modCount} partite modificate</span>
                        <span className="text-zinc-500 text-xs ml-auto group-open:hidden">espandi</span>
                        <span className="text-zinc-500 text-xs ml-auto hidden group-open:inline">riduci</span>
                      </summary>
                      <div className="px-4 pb-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-zinc-500 border-b border-zinc-800">
                              <th className="text-left pb-1.5 pr-3 font-medium">Fornitore</th>
                              <th className="text-left pb-1.5 pr-3 font-medium">Documento</th>
                              <th className="text-left pb-1.5 pr-3 font-medium">Scadenza</th>
                              <th className="text-right pb-1.5 pr-3 font-medium">Importo</th>
                              <th className="text-left pb-1.5 pr-3 font-medium pl-3 border-l border-zinc-800">→ Scadenza</th>
                              <th className="text-right pb-1.5 font-medium">→ Importo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/40">
                            {diff.result.modified.map((m: DiffModified) => (
                              <tr key={m.dbId} className="text-zinc-300">
                                <td className="py-1.5 pr-3 truncate max-w-[140px]">{m.row.supplier_name ?? '—'}</td>
                                <td className="py-1.5 pr-3 text-zinc-500">{m.row.document_number ?? '—'}</td>
                                <td className="py-1.5 pr-3 tabular-nums text-zinc-500 line-through">{formatDate(m.dbDueDate)}</td>
                                <td className="py-1.5 pr-3 tabular-nums text-zinc-500 line-through text-right">{formatEur(Math.abs(m.dbAmountCents))}</td>
                                <td className="py-1.5 pr-3 tabular-nums text-amber-400 pl-3 border-l border-zinc-800">
                                  {m.row.due_date !== m.dbDueDate ? formatDate(m.row.due_date) : <span className="text-zinc-600">invariata</span>}
                                </td>
                                <td className="py-1.5 tabular-nums text-amber-400 text-right">
                                  {m.row.amount_cents !== m.dbAmountCents ? formatEur(Math.abs(m.row.amount_cents)) : <span className="text-zinc-600">invariato</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}

                  {/* Sparite */}
                  {remCount > 0 && (
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-sm text-red-400">
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-medium">{remCount} partite non più presenti nel file</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            onClick={() => toggleAllRemoved(fileIdx, true)}
                            className="text-zinc-400 hover:text-zinc-200"
                          >
                            Tutte
                          </button>
                          <span className="text-zinc-700">·</span>
                          <button
                            onClick={() => toggleAllRemoved(fileIdx, false)}
                            className="text-zinc-400 hover:text-zinc-200"
                          >
                            Nessuna
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 mb-3">
                        Seleziona quelle da marcare come pagate. Deseleziona se non erano ancora pagate.
                      </p>
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {diff.result.removed.map((r: DiffRemoved) => {
                          const selected = diff.selectedRemovedIds.includes(r.dbId)
                          return (
                            <label
                              key={r.dbId}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                                selected ? 'bg-red-500/10 border border-red-500/20' : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleRemoved(fileIdx, r.dbId)}
                                className="w-3.5 h-3.5 accent-red-500 shrink-0"
                              />
                              <span className="flex-1 truncate text-zinc-300">{r.supplierName ?? r.documentNumber ?? r.dbId}</span>
                              <span className="text-zinc-500 tabular-nums shrink-0">{r.documentNumber}</span>
                              <span className="text-zinc-500 tabular-nums shrink-0">{formatDate(r.dueDate)}</span>
                              <span className="text-red-400 tabular-nums shrink-0">{formatEur(Math.abs(r.amountCents))}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {newCount === 0 && modCount === 0 && remCount === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-zinc-500">
                      Nessuna differenza — tutti i dati sono già aggiornati.
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Progress */}
          {isProcessing && processProgress && (
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
              <span>Importazione file {processProgress.current}/{processProgress.total}...</span>
              <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(processProgress.current / processProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={isProcessing}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
              {isProcessing ? 'Importazione in corso...' : 'Conferma importazione'}
            </button>
            <button
              onClick={() => setStep('preview')}
              disabled={isProcessing}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              Indietro
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Done ───────────────────────────────────────────────────── */}
      {step === 'done' && imported.length > 0 && (
        <div className="space-y-4">

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
            <h2 className="text-base font-semibold text-zinc-100">
              {imported.length === 1 ? '1 file importato' : `${imported.length} file importati`}
            </h2>
            <div className="flex justify-center gap-6 text-sm flex-wrap">
              <div>
                <p className="text-2xl font-bold text-emerald-400">{totalNew}</p>
                <p className="text-zinc-400">nuove</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-400">{totalModified}</p>
                <p className="text-zinc-400">aggiornate</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{totalPaid}</p>
                <p className="text-zinc-400">marcate pagate</p>
              </div>
              {totalCancelled > 0 && (
                <div>
                  <p className="text-2xl font-bold text-orange-400">{totalCancelled}</p>
                  <p className="text-zinc-400">impegni annullati</p>
                </div>
              )}
              {totalSkipped > 0 && (
                <div>
                  <p className="text-2xl font-bold text-zinc-500">{totalSkipped}</p>
                  <p className="text-zinc-400">già presenti</p>
                </div>
              )}
              {totalSupNew > 0 && (
                <div>
                  <p className="text-2xl font-bold text-indigo-400">{totalSupNew}</p>
                  <p className="text-zinc-400">nuovi fornitori</p>
                </div>
              )}
            </div>
          </div>

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
                    {r.rowsNew > 0 && <span className="text-emerald-400 font-medium tabular-nums">+{r.rowsNew}</span>}
                    {r.rowsModified > 0 && <span className="text-amber-400 tabular-nums">~{r.rowsModified}</span>}
                    {r.rowsMarkedPaid > 0 && <span className="text-red-400 tabular-nums">{r.rowsMarkedPaid} paid</span>}
                    {r.rowsSkipped > 0 && <span className="text-zinc-600 tabular-nums">{r.rowsSkipped} skip</span>}
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
              onClick={() => { setStep('upload'); setParsed([]); setImported([]); setFileCompanies([]); setDiffs([]); setCancelCommitmentIds(new Set()) }}
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

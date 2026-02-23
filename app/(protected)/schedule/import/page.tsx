'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, CheckCircle, ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import { parseFileAction, importBatchAction } from './actions'
import type { ParsedRow, ParseStats } from '@/lib/xls-parser'

const COMPANIES = [
  { id: '', code: '', name: 'Seleziona società...' },
  { id: 'WT', code: 'WT', name: 'Wellness Town' },
  { id: 'APPIAE', code: 'APPIAE', name: 'Appiae Sport' },
  { id: 'HANGAR', code: 'HANGAR', name: 'Hangar 55' },
  { id: 'ARIES', code: 'ARIES', name: 'Aries Global Service' },
]

function formatEur(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

type Step = 'upload' | 'preview' | 'importing' | 'done'

type PreviewData = {
  stats: ParseStats
  previewRows: ParsedRow[]
  allRowsJson: string
}

type ImportResult = {
  rowsNew: number
  rowsSkipped: number
  suppliersNew: number
}

export default function ImportPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('upload')
  const [companyId, setCompanyId] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const file = formData.get('file') as File
    setFileName(file?.name ?? '')

    startParsing(async () => {
      const result = await parseFileAction(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setPreview(result)
      setStep('preview')
    })
  }

  async function handleImport() {
    if (!preview || !companyId) return
    setError(null)

    startImporting(async () => {
      const result = await importBatchAction(companyId, preview.allRowsJson, fileName)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setResult(result)
      setStep('done')
    })
  }

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
        {(['upload', 'preview', 'done'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-zinc-700" />}
            <div className={`flex items-center gap-1.5 ${step === s ? 'text-indigo-400' : step === 'done' || (step === 'preview' && i === 0) ? 'text-zinc-500' : 'text-zinc-600'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-indigo-600 text-white' :
                (step === 'preview' && i === 0) || step === 'done' ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-800 text-zinc-600'
              }`}>
                {i + 1}
              </div>
              <span>{s === 'upload' ? 'Carica file' : s === 'preview' ? 'Anteprima' : 'Completato'}</span>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <form onSubmit={handleUpload} className="space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Società</label>
              <select
                name="company_code"
                value={companyId}
                onChange={e => setCompanyId(e.target.value)}
                required
                className="w-64 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {COMPANIES.map(c => (
                  <option key={c.code} value={c.code} disabled={!c.code}>{c.name}</option>
                ))}
              </select>
              <input type="hidden" name="company_code_hidden" value={companyId} />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">File XLS</label>
              <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center hover:border-zinc-500 transition-colors">
                <Upload className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400 mb-3">
                  Carica il file esportato da Sistemi S.p.A.
                </p>
                <input
                  type="file"
                  name="file"
                  accept=".xls,.xlsx"
                  required
                  className="text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-sm file:cursor-pointer hover:file:bg-indigo-500"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                File attesi: WTFLUSSISCADENZARIO.XLS, APPIAEFLUSSISCADENZARIO.XLS, ecc.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isParsing || !companyId}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isParsing && <Loader2 className="w-4 h-4 animate-spin" />}
            {isParsing ? 'Analisi in corso...' : 'Analizza file'}
          </button>
        </form>
      )}

      {/* STEP 2: Preview */}
      {step === 'preview' && preview && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Righe totali', value: preview.stats.total.toString() },
              { label: 'Uscite', value: preview.stats.exits.toString(), sub: formatEur(preview.stats.totalOutCents) },
              { label: 'Scadute', value: preview.stats.overdue.toString(), warn: preview.stats.overdue > 0 },
              { label: 'Intercompany', value: preview.stats.intercompany.toString() },
            ].map(s => (
              <div key={s.label} className={`bg-zinc-900 border rounded-xl p-4 ${s.warn ? 'border-amber-500/30' : 'border-zinc-800'}`}>
                <p className="text-xs text-zinc-400">{s.label}</p>
                <p className={`text-xl font-semibold mt-1 ${s.warn ? 'text-amber-400' : 'text-zinc-100'}`}>{s.value}</p>
                {s.sub && <p className="text-xs text-zinc-500 mt-0.5">{s.sub}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-400">Entrate</p>
              <p className="text-lg font-semibold text-emerald-400 mt-1">{preview.stats.entries}</p>
              <p className="text-xs text-zinc-500">{formatEur(preview.stats.totalInCents)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-400">Contabili</p>
              <p className="text-lg font-semibold text-zinc-100 mt-1">{preview.stats.accounting}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-400">Impegni</p>
              <p className="text-lg font-semibold text-zinc-100 mt-1">{preview.stats.commitments}</p>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-200">
                Anteprima — prime {preview.previewRows.length} righe
              </p>
              <p className="text-xs text-zinc-500">totale: {preview.stats.total} righe</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Scadenza</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Fornitore</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Doc</th>
                    <th className="text-right px-3 py-2 text-zinc-400 font-medium">Importo</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Tipo</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">IC</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.previewRows.map((row, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                      <td className="px-3 py-2 text-zinc-300 font-mono">
                        {new Date(row.due_date).toLocaleDateString('it-IT')}
                      </td>
                      <td className="px-3 py-2 text-zinc-200 max-w-48 truncate">
                        {row.supplier_name ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {row.document_type && <span className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-300 mr-1">{row.document_type}</span>}
                        {row.document_number}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${row.flow_type === 'out' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {row.flow_type === 'out' ? '-' : '+'}{formatEur(Math.abs(row.amount_cents))}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${row.entry_type === 'accounting' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                          {row.entry_type === 'accounting' ? 'cont.' : 'imp.'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.is_intercompany && <span className="text-amber-400">IC</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isImporting ? 'Importazione in corso...' : `Conferma import (${preview.stats.total} righe)`}
            </button>
            <button
              onClick={() => { setStep('upload'); setPreview(null) }}
              disabled={isImporting}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Done */}
      {step === 'done' && result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
          <h2 className="text-lg font-semibold text-zinc-100">Importazione completata</h2>
          <div className="flex justify-center gap-8 text-sm">
            <div>
              <p className="text-2xl font-bold text-emerald-400">{result.rowsNew}</p>
              <p className="text-zinc-400">nuove partite</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-400">{result.rowsSkipped}</p>
              <p className="text-zinc-400">già presenti (saltate)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-400">{result.suppliersNew}</p>
              <p className="text-zinc-400">nuovi fornitori</p>
            </div>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => router.push('/schedule')}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
            >
              Vai allo Scadenzario
            </button>
            <button
              onClick={() => { setStep('upload'); setPreview(null); setResult(null); setCompanyId(''); setFileName('') }}
              className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              Importa altro file
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

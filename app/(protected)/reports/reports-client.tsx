'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, CheckCircle } from 'lucide-react'
import { markAsRead, updateReportStatus } from './actions'
import type { Report, ReportType, ReportStatus } from '@/lib/types/database'

const TYPE_BADGE: Record<ReportType, string> = {
  bug:          'bg-red-900/50 text-red-300 border-red-800',
  domanda:      'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  integrazione: 'bg-blue-900/50 text-blue-300 border-blue-800',
  altro:        'bg-zinc-800 text-zinc-300 border-zinc-700',
}

const TYPE_LABEL: Record<ReportType, string> = {
  bug: 'Bug', domanda: 'Domanda', integrazione: 'Integrazione', altro: 'Altro',
}

const STATUS_BADGE: Record<ReportStatus, string> = {
  aperta:   'bg-indigo-900/50 text-indigo-300 border-indigo-800',
  in_corso: 'bg-amber-900/50 text-amber-300 border-amber-800',
  risolta:  'bg-green-900/50 text-green-300 border-green-800',
  scartata: 'bg-zinc-800 text-zinc-400 border-zinc-700',
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  aperta: 'Aperta', in_corso: 'In corso', risolta: 'Risolta', scartata: 'Scartata',
}

function formatCopyText(r: Report) {
  const date = new Date(r.created_at).toLocaleDateString('it-IT')
  return `[SEGNALAZIONE — ${date}]\nDa: ${r.author_email ?? 'sconosciuto'}\nTipo: ${TYPE_LABEL[r.report_type]}\nPagina: ${r.page}\nDescrizione: "${r.description}"`
}

function ActionButton({
  label, onClick, disabled, variant = 'default',
}: {
  label: string
  onClick: () => void
  disabled: boolean
  variant?: 'default' | 'green' | 'red'
}) {
  const color = variant === 'green'
    ? 'text-green-400 hover:text-green-200 hover:bg-green-900/30'
    : variant === 'red'
    ? 'text-red-400 hover:text-red-200 hover:bg-red-900/30'
    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-40 ${color}`}
    >
      {label}
    </button>
  )
}

function ReportCard({ report }: { report: Report }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const text = formatCopyText(report)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function changeStatus(status: ReportStatus) {
    setErr(null)
    startTransition(async () => {
      const res = await updateReportStatus(report.id, status)
      if (res?.error) { setErr(res.error); return }
      router.refresh()
    })
  }

  const date = new Date(report.created_at).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
      {/* Header riga */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${TYPE_BADGE[report.report_type]}`}>
            {TYPE_LABEL[report.report_type]}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${STATUS_BADGE[report.status]}`}>
            {STATUS_LABEL[report.status]}
          </span>
        </div>
        <span className="text-xs text-zinc-500 whitespace-nowrap">{date}</span>
      </div>

      {/* Meta */}
      <div className="text-xs text-zinc-400">
        Da: <span className="text-zinc-300">{report.author_email ?? '—'}</span>
        {' · '}
        Pagina: <span className="text-zinc-300">{report.page}</span>
      </div>

      {/* Descrizione */}
      <p className="text-sm text-zinc-300 leading-relaxed">{report.description}</p>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {/* Azioni */}
      <div className="flex items-center gap-1 flex-wrap pt-1">
        {report.status === 'aperta' && (
          <>
            <ActionButton label="Prendi in carico" onClick={() => changeStatus('in_corso')} disabled={isPending} />
            <ActionButton label="Risolvi" onClick={() => changeStatus('risolta')} disabled={isPending} variant="green" />
            <ActionButton label="Scarta" onClick={() => changeStatus('scartata')} disabled={isPending} variant="red" />
          </>
        )}
        {report.status === 'in_corso' && (
          <>
            <ActionButton label="Risolvi" onClick={() => changeStatus('risolta')} disabled={isPending} variant="green" />
            <ActionButton label="Scarta" onClick={() => changeStatus('scartata')} disabled={isPending} variant="red" />
            <ActionButton label="Riapri" onClick={() => changeStatus('aperta')} disabled={isPending} />
          </>
        )}
        {(report.status === 'risolta' || report.status === 'scartata') && (
          <ActionButton label="Riapri" onClick={() => changeStatus('aperta')} disabled={isPending} />
        )}

        <span className="text-zinc-700 text-xs mx-1">·</span>

        <button
          onClick={handleCopy}
          disabled={isPending}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800 transition-colors disabled:opacity-40"
          title="Copia testo"
        >
          {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiato' : 'Copia'}
        </button>
      </div>
    </div>
  )
}

type FilterStatus = ReportStatus | 'tutte'
type FilterType = ReportType | 'tutti'

export function ReportsClient({ reports }: { reports: Report[] }) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('tutte')
  const [filterType, setFilterType] = useState<FilterType>('tutti')

  const counts: Record<ReportStatus, number> = { aperta: 0, in_corso: 0, risolta: 0, scartata: 0 }
  for (const r of reports) counts[r.status]++

  const filtered = reports.filter(r => {
    if (filterStatus !== 'tutte' && r.status !== filterStatus) return false
    if (filterType !== 'tutti' && r.report_type !== filterType) return false
    return true
  })

  const statusFilters: { value: FilterStatus; label: string }[] = [
    { value: 'tutte', label: 'Tutte' },
    { value: 'aperta', label: 'Aperta' },
    { value: 'in_corso', label: 'In corso' },
    { value: 'risolta', label: 'Risolta' },
    { value: 'scartata', label: 'Scartata' },
  ]

  const typeFilters: { value: FilterType; label: string }[] = [
    { value: 'tutti', label: 'Tutti' },
    { value: 'bug', label: 'Bug' },
    { value: 'domanda', label: 'Domanda' },
    { value: 'integrazione', label: 'Integrazione' },
    { value: 'altro', label: 'Altro' },
  ]

  if (reports.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500 text-sm">
        Nessuna segnalazione ricevuta.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-zinc-400 flex-wrap">
        <span>Aperte: <span className="text-indigo-400 font-medium">{counts.aperta}</span></span>
        <span className="text-zinc-700">·</span>
        <span>In corso: <span className="text-amber-400 font-medium">{counts.in_corso}</span></span>
        <span className="text-zinc-700">·</span>
        <span>Risolte: <span className="text-green-400 font-medium">{counts.risolta}</span></span>
        <span className="text-zinc-700">·</span>
        <span>Scartate: <span className="text-zinc-500 font-medium">{counts.scartata}</span></span>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1">
          {statusFilters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filterStatus === f.value
                  ? 'border-indigo-600 bg-indigo-900/40 text-indigo-300'
                  : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {typeFilters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilterType(f.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filterType === f.value
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-200'
                  : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-zinc-500 text-sm">
          Nessuna segnalazione per i filtri selezionati.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => <ReportCard key={r.id} report={r} />)}
        </div>
      )}
    </div>
  )
}

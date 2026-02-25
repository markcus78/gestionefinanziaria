'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { markAsRead } from './actions'
import type { Report, ReportType } from '@/lib/types/database'

const TYPE_BADGE: Record<ReportType, string> = {
  bug:          'bg-red-900/50 text-red-300 border-red-800',
  domanda:      'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  integrazione: 'bg-blue-900/50 text-blue-300 border-blue-800',
  altro:        'bg-zinc-800 text-zinc-300 border-zinc-700',
}

const TYPE_LABEL: Record<ReportType, string> = {
  bug: 'Bug', domanda: 'Domanda', integrazione: 'Integrazione', altro: 'Altro',
}

function formatCopyText(r: Report) {
  const date = new Date(r.created_at).toLocaleDateString('it-IT')
  return `[SEGNALAZIONE — ${date}]\nDa: ${r.author_email ?? 'sconosciuto'}\nTipo: ${TYPE_LABEL[r.report_type]}\nPagina: ${r.page}\nDescrizione: "${r.description}"`
}

function ReportRow({ report }: { report: Report }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const text = formatCopyText(report)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleMarkRead() {
    startTransition(async () => {
      await markAsRead(report.id)
      router.refresh()
    })
  }

  const date = new Date(report.created_at).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${report.is_read ? 'border-zinc-800' : 'border-indigo-700'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${TYPE_BADGE[report.report_type]}`}>
            {TYPE_LABEL[report.report_type]}
          </span>
          {!report.is_read && (
            <span className="text-xs bg-indigo-900/50 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded">
              Non letta
            </span>
          )}
          <span className="text-xs text-zinc-500">{date}</span>
        </div>
        {!report.is_read && (
          <button
            onClick={handleMarkRead}
            disabled={isPending}
            className="text-xs text-zinc-400 hover:text-zinc-200 whitespace-nowrap disabled:opacity-50 transition-colors"
          >
            Segna come letto
          </button>
        )}
      </div>

      <div className="text-xs text-zinc-400">
        Da: <span className="text-zinc-300">{report.author_email ?? '—'}</span>
        {' · '}
        Pagina: <span className="text-zinc-300">{report.page}</span>
      </div>

      {/* Box copiabile */}
      <div className="group relative">
        <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
          {text}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
          title="Copia testo"
        >
          {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}

export function ReportsClient({ reports }: { reports: Report[] }) {
  if (reports.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500 text-sm">
        Nessuna segnalazione ricevuta.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reports.map(r => <ReportRow key={r.id} report={r} />)}
    </div>
  )
}

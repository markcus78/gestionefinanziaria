'use client'
import { useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { createReport } from '@/app/(protected)/reports/actions'
import type { ReportType } from '@/lib/types/database'

const TYPES: { value: ReportType; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'domanda', label: 'Domanda' },
  { value: 'integrazione', label: 'Integrazione' },
  { value: 'altro', label: 'Altro' },
]

export function ReportModal({ onClose }: { onClose: () => void }) {
  const pathname = usePathname()
  const [type, setType] = useState<ReportType>('bug')
  const [page, setPage] = useState(pathname ?? '/')
  const [description, setDescription] = useState('')
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    startTransition(async () => {
      const result = await createReport(type, page, description.trim())
      if ('error' in result) {
        setErrorMsg(result.error ?? 'Errore sconosciuto')
      } else {
        setSuccess(true)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-zinc-100">Nuova segnalazione</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-6">
            <p className="text-sm text-zinc-100 font-medium mb-1">Segnalazione inviata</p>
            <p className="text-xs text-zinc-400">Marco riceverà una notifica via email.</p>
            <button
              onClick={onClose}
              className="mt-5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tipo */}
            <div>
              <p className="text-xs text-zinc-400 mb-2">Tipo</p>
              <div className="flex gap-2 flex-wrap">
                {TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      type === t.value
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pagina */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Pagina</label>
              <input
                type="text"
                value={page}
                onChange={e => setPage(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Descrizione */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Descrizione</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="Descrivi il problema o la richiesta..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg transition-colors"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={isPending || !description.trim()}
                className="flex-1 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                Invia
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

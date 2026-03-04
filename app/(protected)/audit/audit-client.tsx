'use client'

import { useState, useMemo } from 'react'
import type { AccessLog } from '@/lib/types/database'

type Props = { logs: AccessLog[] }

export function AuditClient({ logs }: Props) {
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState<'all' | 'login' | 'logout'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    return logs.filter(log => {
      if (search && !log.user_email.toLowerCase().includes(search.toLowerCase())) return false
      if (eventFilter !== 'all' && log.event_type !== eventFilter) return false
      if (dateFrom && log.created_at < dateFrom) return false
      if (dateTo && log.created_at > dateTo + 'T23:59:59') return false
      return true
    })
  }, [logs, search, eventFilter, dateFrom, dateTo])

  return (
    <div className="space-y-4">
      {/* Filtri */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Cerca per email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-2 w-56 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value as 'all' | 'login' | 'logout')}
          className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">Tutti gli eventi</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-zinc-500 text-sm self-center">{filtered.length} risultati</span>
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto rounded-lg border border-zinc-700">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">Data/Ora</th>
              <th className="px-4 py-3">Utente</th>
              <th className="px-4 py-3">Ruolo</th>
              <th className="px-4 py-3">Evento</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Browser</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Nessun log trovato
                </td>
              </tr>
            ) : (
              filtered.map(log => (
                <tr key={log.id} className="bg-zinc-900 hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('it-IT')}
                  </td>
                  <td className="px-4 py-3 text-zinc-100">{log.user_email}</td>
                  <td className="px-4 py-3 text-zinc-400">{log.user_role ?? '—'}</td>
                  <td className="px-4 py-3">
                    {log.event_type === 'login' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/50 text-emerald-400 border border-emerald-800">
                        login
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-400 border border-zinc-600">
                        logout
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{log.ip_address ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate" title={log.user_agent ?? ''}>
                    {log.user_agent ? parseUserAgent(log.user_agent) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function parseUserAgent(ua: string): string {
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari'
  if (ua.includes('Edg')) return 'Edge'
  if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera'
  return ua.slice(0, 40)
}

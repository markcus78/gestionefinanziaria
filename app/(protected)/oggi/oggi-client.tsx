'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Circle, CalendarClock, ChevronDown, Sun, Settings2, ArrowRight } from 'lucide-react'
import type { Signal } from '@/lib/lavoro-load'
import { setTaskDone, dismissSignal, updateTaskRule } from './actions'

type Task = {
  ruleId: string; title: string; description: string | null; href: string | null
  key: string; due: string; lateDays: number; auto: boolean
  done: null | { by: string | null; at: string; auto: boolean }
}
type Rule = { id: string; title: string; freq: string; days: number[]; holiday: 'prima' | 'dopo'; active: boolean; company_id: string | null; sort: number }

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
function longDate(d: string) {
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)))
  return `${GIORNI[t.getUTCDay()]} ${t.getUTCDate()} ${MESI[t.getUTCMonth()]}`
}
const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export default function OggiClient({ today, open, closed, upcoming, signals, rules, companyCodes }: {
  today: string; open: Task[]; closed: Task[]; upcoming: Task[]; signals: Signal[]; rules: Rule[]
  companyCodes: Record<string, string>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [showRules, setShowRules] = useState(false)

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setErr(null)
    start(async () => {
      const r = await fn()
      if ('error' in r) setErr(r.error)
      else router.refresh()
    })
  }

  const nSignals = signals.reduce((s, x) => s + x.items.length, 0)

  return (
    <div className="p-6 max-w-5xl space-y-8">
      <div className="flex items-center gap-3">
        <Sun className="w-5 h-5 text-amber-400" />
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Lavoro quotidiano</h1>
          <p className="text-xs text-zinc-500 capitalize">{longDate(today)}</p>
        </div>
        <div className="ml-auto flex gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300">{open.length} da fare</span>
          <span className="px-2.5 py-1 rounded-full bg-red-500/15 text-red-300">{nSignals} segnalazioni</span>
        </div>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}

      {/* ── Segnalazioni ── */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" /> Segnalazioni: cose che non tornano
        </h2>
        {signals.length === 0
          ? <p className="text-sm text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 rounded-lg px-4 py-3">Nessuna cosa strana.</p>
          : <div className="space-y-3">{signals.map(s => <SignalCard key={s.id} s={s} pending={pending} onDismiss={k => run(() => dismissSignal(k))} />)}</div>}
      </section>

      {/* ── Da fare ── */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-amber-400" /> Da fare oggi
        </h2>
        {open.length === 0
          ? <p className="text-sm text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 rounded-lg px-4 py-3">Tutto fatto per oggi.</p>
          : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
              {open.map(t => (
                <div key={`${t.ruleId}|${t.key}`} className="flex items-start gap-3 px-4 py-3">
                  <button disabled={pending} onClick={() => run(() => setTaskDone(t.ruleId, t.key, true))}
                    title="Segna come fatta" className="mt-0.5 text-zinc-500 hover:text-emerald-400">
                    <Circle className="w-5 h-5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-zinc-100">{t.title}</span>
                      {t.lateDays > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] bg-red-500/20 text-red-300">
                          in ritardo di {t.lateDays} {t.lateDays === 1 ? 'giorno' : 'giorni'} · era per {short(t.due)}
                        </span>
                      )}
                      {t.auto && <span className="text-[11px] text-zinc-500" title="Quando il caricamento c'è, il sistema la chiude da solo">si chiude da sola quando è caricato</span>}
                    </div>
                    {t.description && <p className="text-xs text-zinc-500 mt-0.5">{t.description}</p>}
                  </div>
                  {t.href && (
                    <Link href={t.href} className="shrink-0 flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 mt-0.5">
                      Vai <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

        {closed.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setShowClosed(v => !v)} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
              <ChevronDown className={`w-3 h-3 transition-transform ${showClosed ? '' : '-rotate-90'}`} /> Fatte negli ultimi giorni ({closed.length})
            </button>
            {showClosed && (
              <div className="mt-2 space-y-1">
                {closed.map(t => (
                  <div key={`${t.ruleId}|${t.key}`} className="flex items-center gap-2 text-xs text-zinc-500 px-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="line-through">{t.title}</span>
                    <span>· {short(t.due)}</span>
                    <span>· {t.done?.auto ? 'chiusa dal sistema' : `fatta${t.done?.by ? ` da ${t.done.by}` : ''}`}</span>
                    {!t.done?.auto && (
                      <button disabled={pending} onClick={() => run(() => setTaskDone(t.ruleId, t.key, false))}
                        className="text-zinc-400 hover:text-amber-300 underline">rimetti da fare</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── In arrivo ── */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-sky-400" /> In arrivo nei prossimi 7 giorni
          </h2>
          <div className="space-y-1">
            {upcoming.map(t => (
              <div key={`${t.ruleId}|${t.key}`} className="flex gap-3 text-sm">
                <span className="w-32 shrink-0 text-zinc-500 capitalize">{longDate(t.due)}</span>
                <span className="text-zinc-300">{t.title}</span>
                {t.due !== t.key && <span className="text-[11px] text-zinc-500">(previsto il {short(t.key)}, giorno non lavorativo)</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Calendario ── */}
      <section>
        <button onClick={() => setShowRules(v => !v)} className="text-sm font-semibold text-zinc-400 hover:text-zinc-200 flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> Calendario dei caricamenti
          <ChevronDown className={`w-3 h-3 transition-transform ${showRules ? '' : '-rotate-90'}`} />
        </button>
        {showRules && (
          <div className="mt-3 bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            <p className="px-4 py-2 text-xs text-zinc-500">
              Giorni del mese in cui si fa ogni attività. Se il giorno non è lavorativo (sabato, domenica, festivi) l&apos;attività si anticipa o si posticipa; se non viene fatta resta in lista finché non è fatta.
            </p>
            {rules.map(r => <RuleRow key={r.id} r={r} company={r.company_id ? companyCodes[r.company_id] : null} pending={pending}
              onSave={(days, holiday, active) => run(() => updateTaskRule(r.id, days, holiday, active))} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function SignalCard({ s, pending, onDismiss }: { s: Signal; pending: boolean; onDismiss: (key: string) => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? s.items : s.items.slice(0, 6)
  return (
    <div className="bg-zinc-900 border border-red-900/40 rounded-xl">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-start gap-3">
        <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 text-xs font-semibold">{s.items.length}</span>
        <div className="flex-1">
          <div className="text-sm text-zinc-100">{s.title}</div>
          <div className="text-xs text-zinc-500">{s.why}</div>
        </div>
        <Link href={s.href} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1">Apri <ArrowRight className="w-3 h-3" /></Link>
      </div>
      <div className="divide-y divide-zinc-800/60">
        {shown.map(i => (
          <div key={i.key} className="px-4 py-2 flex items-center gap-3 text-xs">
            <span className="text-zinc-200 min-w-0 truncate">{i.label}</span>
            <span className="text-zinc-500 flex-1 min-w-0 truncate">{i.detail}</span>
            <Link href={i.href} className="text-indigo-300 hover:text-indigo-200 shrink-0">apri</Link>
            {s.dismissable && (
              <button disabled={pending} onClick={() => onDismiss(i.key)} title="Visto, è giusto così: non la mostro più"
                className="shrink-0 text-zinc-500 hover:text-emerald-300">visto</button>
            )}
          </div>
        ))}
      </div>
      {s.items.length > 6 && (
        <button onClick={() => setAll(v => !v)} className="w-full px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 border-t border-zinc-800">
          {all ? 'Mostra meno' : `Mostra tutte (${s.items.length})`}
        </button>
      )}
    </div>
  )
}

function RuleRow({ r, company, pending, onSave }: {
  r: Rule; company: string | null; pending: boolean
  onSave: (days: number[], holiday: 'prima' | 'dopo', active: boolean) => void
}) {
  const [days, setDays] = useState(r.days.join(', '))
  const [holiday, setHoliday] = useState(r.holiday)
  const [active, setActive] = useState(r.active)
  const changed = days !== r.days.join(', ') || holiday !== r.holiday || active !== r.active
  const cls = 'px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-100'
  return (
    <div className={`px-4 py-2 flex items-center gap-3 flex-wrap text-xs ${active ? '' : 'opacity-50'}`}>
      <span className="flex-1 min-w-48 text-zinc-200">{r.title}{company && <span className="text-zinc-500"> · {company}</span>}</span>
      {r.freq === 'giornaliera'
        ? <span className="text-zinc-500">ogni giorno lavorativo</span>
        : <>
            <label className="text-zinc-500">giorni</label>
            <input value={days} onChange={e => setDays(e.target.value)} className={`${cls} w-24`} />
            <select value={holiday} onChange={e => setHoliday(e.target.value as 'prima' | 'dopo')} className={cls}>
              <option value="dopo">se festivo: dopo</option>
              <option value="prima">se festivo: prima</option>
            </select>
          </>}
      <label className="flex items-center gap-1 text-zinc-400">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> attiva
      </label>
      {changed && (
        <button disabled={pending} className="px-2 py-1 rounded bg-indigo-600 text-white"
          onClick={() => onSave(days.split(/[^0-9]+/).filter(Boolean).map(Number), holiday, active)}>Salva</button>
      )}
    </div>
  )
}

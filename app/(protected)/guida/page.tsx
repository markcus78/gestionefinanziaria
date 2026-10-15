import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { GUIDA, GUIDA_AGGIORNATA } from '@/lib/guida'

// Markdown semplice della guida: titoli, elenchi, citazioni, **grassetto**
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="text-zinc-100 font-semibold">{p.slice(2, -2)}</strong> : p)
}

function render(md: string): ReactNode[] {
  const out: ReactNode[] = []
  const lines = md.trim().split('\n')
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) { i++; continue }
    if (l.startsWith('# ')) { i++; continue }  // il titolo del capitolo è già in testa
    if (l.startsWith('## ')) { out.push(<h2 key={i} className="text-base font-semibold text-zinc-100 mt-8 mb-3 pb-1 border-b border-zinc-800">{inline(l.slice(3))}</h2>); i++; continue }
    if (l.startsWith('### ')) { out.push(<h3 key={i} className="text-sm font-semibold text-indigo-300 mt-5 mb-2">{inline(l.slice(4))}</h3>); i++; continue }
    if (l.startsWith('> ')) { out.push(<div key={i} className="my-3 px-4 py-2 rounded-lg bg-indigo-950/40 border border-indigo-900/60 text-sm text-zinc-300">{inline(l.slice(2))}</div>); i++; continue }
    if (/^\s*(- |\d+\. )/.test(l)) {
      const ordered = /^\d+\. /.test(l)
      const items: { depth: number; text: string }[] = []
      while (i < lines.length && /^\s*(- |\d+\. )/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)(- |\d+\. )(.*)$/)!
        items.push({ depth: m[1].length >= 2 ? 1 : 0, text: m[3] })
        i++
      }
      const Tag = ordered ? 'ol' : 'ul'
      out.push(
        <Tag key={`l${i}`} className={`my-2 space-y-1.5 text-sm text-zinc-300 ${ordered ? 'list-decimal' : 'list-disc'} pl-5`}>
          {items.map((it, k) => <li key={k} className={it.depth ? 'ml-5 list-[circle]' : ''}>{inline(it.text)}</li>)}
        </Tag>,
      )
      continue
    }
    out.push(<p key={i} className="my-2 text-sm text-zinc-300 leading-relaxed">{inline(l)}</p>)
    i++
  }
  return out
}

export default async function GuidaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const cap = GUIDA.find(c => c.slug === sp.c) ?? GUIDA[0]
  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="w-5 h-5 text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Guida</h1>
        <span className="text-xs text-zinc-500">aggiornata al {GUIDA_AGGIORNATA}</span>
      </div>
      <div className="flex gap-6 items-start flex-col md:flex-row">
        <nav className="md:w-60 shrink-0 space-y-1 md:sticky md:top-6">
          {GUIDA.map(c => (
            <Link key={c.slug} href={`/guida?c=${c.slug}`}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${c.slug === cap.slug ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'}`}>
              {c.titolo}
              {c.stato === 'in preparazione' && <span className="block text-[10px] opacity-70">in preparazione</span>}
            </Link>
          ))}
        </nav>
        <article className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-5">
          <h1 className="text-xl font-semibold text-zinc-100 mb-2">{cap.titolo}</h1>
          {render(cap.testo)}
        </article>
      </div>
    </div>
  )
}

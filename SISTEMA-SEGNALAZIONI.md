# Sistema di Ticketing / Segnalazioni Interne

Documento completo per replicare il sistema di segnalazioni in un altro progetto.

---

## Stack richiesto

| Tecnologia | Utilizzo |
|---|---|
| Next.js (App Router) | Framework frontend/backend |
| TypeScript strict | Tipizzazione |
| Tailwind CSS | Styling (tema dark) |
| Supabase | Auth + PostgreSQL + RLS |
| Resend (opzionale) | Notifiche email |
| Lucide React | Icone |

---

## 1. Schema Database

### Tabella `reports`

```sql
CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email TEXT,
  report_type  TEXT NOT NULL CHECK (report_type IN ('bug', 'domanda', 'integrazione', 'altro')),
  page         TEXT NOT NULL,
  description  TEXT NOT NULL,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  status       TEXT NOT NULL DEFAULT 'aperta' CHECK (status IN ('aperta', 'in_corso', 'risolta', 'scartata')),
  notes        TEXT
);

-- Indice consigliato per query frequenti sul badge sidebar
CREATE INDEX idx_reports_status ON reports(status);
```

### RLS Policies

```sql
-- Tutti gli utenti autenticati possono leggere
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_select" ON reports
  FOR SELECT TO authenticated USING (true);

-- Tutti possono creare segnalazioni
CREATE POLICY "reports_insert" ON reports
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Solo ruolo 'strategic' può aggiornare (gestire)
CREATE POLICY "reports_update" ON reports
  FOR UPDATE TO authenticated
  USING (get_user_role() = 'strategic');

-- Solo ruolo 'strategic' può eliminare
CREATE POLICY "reports_delete" ON reports
  FOR DELETE TO authenticated
  USING (get_user_role() = 'strategic');
```

> **Nota:** `get_user_role()` è una funzione SQL helper che ritorna il ruolo dell'utente corrente dalla tabella `user_profiles`. Va creata nel proprio DB.

---

## 2. Tipi TypeScript

```typescript
// lib/types/database.ts

export type ReportType = 'bug' | 'domanda' | 'integrazione' | 'altro'
export type ReportStatus = 'aperta' | 'in_corso' | 'scartata' | 'risolta'

export type Report = {
  id: string
  created_at: string
  created_by: string | null
  author_email: string | null
  report_type: ReportType
  page: string
  description: string
  is_read: boolean
  status: ReportStatus
  notes: string | null
}
```

---

## 3. Server Actions

File: `app/(protected)/reports/actions.ts`

### 3.1 `createReport`

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ReportType } from '@/lib/types/database'

const TYPE_LABEL: Record<ReportType, string> = {
  bug: 'Bug',
  domanda: 'Domanda',
  integrazione: 'Integrazione',
  altro: 'Altro',
}

export async function createReport(
  report_type: ReportType,
  page: string,
  description: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase.from('reports').insert({
    created_by: user.id,
    author_email: user.email ?? null,
    report_type,
    page,
    description,
  })

  if (error) return { error: error.message }

  // Notifica email (opzionale, richiede RESEND_API_KEY)
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const dateStr = new Date().toLocaleDateString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const body = `[SEGNALAZIONE — ${dateStr}]\nDa: ${user.email}\nTipo: ${TYPE_LABEL[report_type]}\nPagina: ${page}\n\nDescrizione:\n"${description}"`

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'GestFin <noreply@resend.tuodominio.it>',
          to: ['admin@tuodominio.it'],  // ← destinatario notifiche
          subject: `[GestFin] Segnalazione: ${TYPE_LABEL[report_type]} — ${page}`,
          html: `<div style="font-family:monospace;background:#18181b;color:#e4e4e7;padding:16px;border-radius:8px;white-space:pre-wrap">${body}</div>
                 <p style="margin-top:12px"><a href="https://tuodominio.it/reports">Apri segnalazioni →</a></p>`,
        }),
      })
    } catch { /* graceful degradation: email non blocca la creazione */ }
  }

  revalidatePath('/reports')
  revalidatePath('/')  // layout per aggiornare badge sidebar
  return { success: true }
}
```

### 3.2 `markAsRead`

```typescript
export async function markAsRead(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('reports')
    .update({ is_read: true })
    .eq('id', reportId)

  if (error) return { error: error.message }

  revalidatePath('/reports')
  revalidatePath('/')
  return { success: true }
}
```

### 3.3 `updateReportStatus`

```typescript
export async function updateReportStatus(
  reportId: string,
  status: ReportStatus
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Fetch report per eventuale email di risoluzione
  const { data: report } = await supabase
    .from('reports')
    .select('id, author_email, report_type, page, description')
    .eq('id', reportId)
    .single()

  const { error } = await supabase
    .from('reports')
    .update({ status, is_read: true })
    .eq('id', reportId)

  if (error) return { error: error.message }

  // Email all'autore quando la segnalazione viene risolta
  const resendKey = process.env.RESEND_API_KEY
  if (status === 'risolta' && resendKey && report?.author_email) {
    const typeLabel = TYPE_LABEL[report.report_type as ReportType]
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'GestFin <noreply@resend.tuodominio.it>',
          to: [report.author_email],
          subject: `[GestFin] Segnalazione risolta: ${typeLabel} — ${report.page}`,
          html: `<div style="font-family:monospace;background:#18181b;color:#e4e4e7;padding:16px;border-radius:8px">
            <p>La tua segnalazione è stata <strong>risolta</strong>.</p>
            <p>Tipo: ${typeLabel}<br>Pagina: ${report.page}<br>Descrizione: "${report.description}"</p>
          </div>`,
        }),
      })
    } catch { /* graceful degradation */ }
  }

  revalidatePath('/reports')
  revalidatePath('/')
  return { success: true }
}
```

### 3.4 `updateReportNotes`

```typescript
export async function updateReportNotes(reportId: string, notes: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('reports')
    .update({ notes })
    .eq('id', reportId)

  if (error) return { error: error.message }

  revalidatePath('/reports')
  return { success: true }
}
```

### 3.5 `deleteReports`

```typescript
export async function deleteReports(ids: string[]) {
  if (!ids.length) return { error: 'Nessun ID' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('reports')
    .delete()
    .in('id', ids)

  if (error) return { error: error.message }

  revalidatePath('/reports')
  revalidatePath('/')
  return { success: true }
}
```

---

## 4. Server Component — Pagina Reports

File: `app/(protected)/reports/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportsClient from './reports-client'
import type { Report } from '@/lib/types/database'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Accesso riservato al ruolo strategic
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'strategic') redirect('/dashboard')

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })

  return <ReportsClient reports={(reports ?? []) as Report[]} />
}
```

---

## 5. Client Component — Gestione Reports

File: `app/(protected)/reports/reports-client.tsx`

### Struttura UI

```
┌─────────────────────────────────────────────────┐
│  Segnalazioni                                    │
│  [aperte: N] [in corso: N] [risolte: N] [scart] │
│                                                   │
│  Filtri: [Status ▼] [Tipo ▼]                     │
│  [Seleziona tutto] [Deseleziona] [🗑 Elimina]    │
│                                                   │
│  ┌─ Report Card ────────────────────────────┐    │
│  │ ☐  [Bug]  [Aperta]  12/03/2026 14:30    │    │
│  │    Da: user@email.it                      │    │
│  │    Pagina: /operations                    │    │
│  │    "Descrizione della segnalazione..."    │    │
│  │                                           │    │
│  │    Note: [________________] ✓ Salvato     │    │
│  │                                           │    │
│  │    [Prendi in carico] [Risolvi] [Scarta]  │    │
│  │    [📋 Copia]                             │    │
│  └───────────────────────────────────────────┘    │
│                                                   │
│  (ripete per ogni report filtrato)               │
└─────────────────────────────────────────────────┘
```

### Configurazione Badge e Label

```typescript
const TYPE_LABEL: Record<ReportType, string> = {
  bug: 'Bug',
  domanda: 'Domanda',
  integrazione: 'Integrazione',
  altro: 'Altro',
}

const TYPE_BADGE: Record<ReportType, string> = {
  bug:          'bg-red-900/50 text-red-300 border-red-800',
  domanda:      'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  integrazione: 'bg-blue-900/50 text-blue-300 border-blue-800',
  altro:        'bg-zinc-800 text-zinc-300 border-zinc-700',
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  aperta:   'Aperta',
  in_corso: 'In corso',
  risolta:  'Risolta',
  scartata: 'Scartata',
}

const STATUS_BADGE: Record<ReportStatus, string> = {
  aperta:   'bg-indigo-900/50 text-indigo-300 border-indigo-800',
  in_corso: 'bg-amber-900/50 text-amber-300 border-amber-800',
  risolta:  'bg-green-900/50 text-green-300 border-green-800',
  scartata: 'bg-zinc-800 text-zinc-400 border-zinc-700',
}
```

### Filtri

```typescript
type FilterStatus = ReportStatus | 'tutte'
type FilterType = ReportType | 'tutti'

const [filterStatus, setFilterStatus] = useState<FilterStatus>('tutte')
const [filterType, setFilterType] = useState<FilterType>('tutti')

const filtered = reports.filter(r => {
  if (filterStatus !== 'tutte' && r.status !== filterStatus) return false
  if (filterType !== 'tutti' && r.report_type !== filterType) return false
  return true
})
```

### Selezione multipla + Eliminazione bulk

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
const [confirmDelete, setConfirmDelete] = useState(false)

// Reset selezione quando cambiano i filtri
useEffect(() => {
  setSelectedIds(new Set())
  setConfirmDelete(false)
}, [filterStatus, filterType])

// Eliminazione con doppia conferma
function handleDeleteClick() {
  if (!confirmDelete) {
    setConfirmDelete(true)   // primo click: mostra "Conferma"
    return
  }
  // secondo click: elimina
  startTransition(async () => {
    await deleteReports([...selectedIds])
    setSelectedIds(new Set())
    setConfirmDelete(false)
  })
}
```

### Auto-save Note (su blur)

```typescript
const [noteText, setNoteText] = useState(report.notes ?? '')
const prevNoteRef = useRef(report.notes ?? '')

function handleNoteBlur() {
  if (noteText === prevNoteRef.current) return  // nessuna modifica
  prevNoteRef.current = noteText
  startTransition(async () => {
    await updateReportNotes(report.id, noteText)
    // mostra feedback "Salvato" per 2 secondi
  })
}
```

### Transizioni di Stato

```
aperta    → [Prendi in carico, Risolvi, Scarta]
in_corso  → [Risolvi, Scarta, Riapri]
risolta   → [Riapri]
scartata  → [Riapri]
```

Implementazione: bottoni condizionali per ogni stato, ognuno chiama `updateReportStatus(id, nuovoStato)`.

### Copia testo formattato

```typescript
function formatCopyText(r: Report) {
  const date = new Date(r.created_at).toLocaleDateString('it-IT')
  let text = `[SEGNALAZIONE — ${date}]\nDa: ${r.author_email ?? 'sconosciuto'}\nTipo: ${TYPE_LABEL[r.report_type]}\nPagina: ${r.page}\nDescrizione: "${r.description}"`
  if (r.notes?.trim()) text += `\nNote: "${r.notes.trim()}"`
  return text
}
```

---

## 6. Modal di Segnalazione

File: `components/report-modal.tsx`

### Import dinamico (SSR disabled)

```typescript
// Dove viene usato (es. sidebar.tsx):
import dynamic from 'next/dynamic'
const ReportModal = dynamic(() => import('@/components/report-modal'), { ssr: false })
```

### UI del Modal

```
┌──────────────────────────────────────┐
│  ✕                                    │
│                                       │
│  Nuova segnalazione                  │
│                                       │
│  Tipo:                                │
│  [Bug] [Domanda] [Integrazione] [Altro] │
│                                       │
│  Pagina:                              │
│  [/operations          ] (auto-fill)  │
│                                       │
│  Descrizione:                         │
│  [                                ]   │
│  [                                ]   │
│  [                                ]   │
│  [                                ]   │
│                                       │
│  [        Invia segnalazione        ] │
│                                       │
│  ── dopo successo: ──                 │
│  ✅ Segnalazione inviata!            │
│  L'admin riceverà una notifica email. │
│  [Chiudi]                             │
└──────────────────────────────────────┘
```

### Logica

```typescript
'use client'

import { useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { createReport } from '@/app/(protected)/reports/actions'
import type { ReportType } from '@/lib/types/database'

type Props = { onClose: () => void }

export default function ReportModal({ onClose }: Props) {
  const pathname = usePathname()
  const [type, setType] = useState<ReportType>('bug')
  const [page, setPage] = useState(pathname ?? '/')
  const [description, setDescription] = useState('')
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!description.trim()) return
    startTransition(async () => {
      const res = await createReport(type, page, description)
      if (res?.error) { setErrorMsg(String(res.error)); return }
      setSuccess(true)
    })
  }

  // ... render con overlay scuro, click fuori chiude, etc.
}
```

**Dettagli UI:**
- Overlay: `fixed inset-0 bg-black/60 z-50` con `onClick={onClose}`
- Modal: `bg-zinc-900 border border-zinc-700 rounded-xl` centrato
- Bottoni tipo: toggle mutually exclusive con bordo evidenziato
- Pagina: input text pre-riempito da `usePathname()`
- Textarea: 4 righe, placeholder "Descrivi il problema..."
- Submit: disabilitato se `isPending` o `description` vuota
- Spinner durante invio
- Stato success: messaggio verde + bottone Chiudi

---

## 7. Badge Sidebar

### Nel layout server component

```typescript
// app/(protected)/layout.tsx

// Conta report con status 'aperta' (non gestiti)
const { count } = await supabase
  .from('reports')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'aperta')

const unreadCount = isStrategic ? (count ?? 0) : undefined
```

### Nel componente Sidebar

```typescript
// components/sidebar.tsx

type SidebarProps = {
  unreadCount?: number
  isStrategic?: boolean
}

// Voce "Segnalazioni" nel menu (solo per strategic)
{isStrategic && (
  <NavLink href="/reports" icon={MessageSquare}>
    Segnalazioni
    {unreadCount != null && unreadCount > 0 && (
      <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
        {unreadCount}
      </span>
    )}
  </NavLink>
)}

// Bottone "Segnala" (per TUTTI gli utenti, in fondo alla sidebar)
<button onClick={() => setModalOpen(true)} className="...">
  <MessageSquare className="w-4 h-4" />
  Segnala
</button>

{modalOpen && <ReportModal onClose={() => setModalOpen(false)} />}
```

---

## 8. Notifiche Email (Resend)

### Setup

1. Creare account su [resend.com](https://resend.com)
2. Verificare dominio mittente
3. Ottenere API key
4. Aggiungere variabile ambiente: `RESEND_API_KEY=re_xxxxx`

### Trigger email

| Evento | Destinatario | Soggetto |
|---|---|---|
| Segnalazione creata | Admin fisso (es. admin@dominio.it) | `[GestFin] Segnalazione: {tipo} — {pagina}` |
| Segnalazione risolta | Autore originale | `[GestFin] Segnalazione risolta: {tipo} — {pagina}` |

### Formato email

```html
<div style="font-family:monospace; background:#18181b; color:#e4e4e7; padding:16px; border-radius:8px; white-space:pre-wrap">
  [SEGNALAZIONE — 12/03/2026 14:30]
  Da: user@email.it
  Tipo: Bug
  Pagina: /operations

  Descrizione:
  "Testo della segnalazione..."
</div>
<p style="margin-top:12px">
  <a href="https://tuodominio.it/reports">Apri segnalazioni →</a>
</p>
```

### Graceful degradation

Se `RESEND_API_KEY` non è configurata, il sistema funziona comunque senza email. Il blocco fetch è wrappato in `try/catch` che ignora errori.

---

## 9. Flusso Completo

### Creazione (qualsiasi utente autenticato)

```
Utente clicca "Segnala" in sidebar
    ↓
Modal si apre (pathname auto-riempito)
    ↓
Seleziona tipo + scrive descrizione
    ↓
Submit → createReport()
    ↓
INSERT in DB (status='aperta', is_read=false)
    ↓
Email notifica → admin
    ↓
revalidatePath('/reports', '/')
    ↓
Badge sidebar si aggiorna (+1)
```

### Gestione (solo ruolo strategic)

```
Admin accede a /reports
    ↓
Vede lista filtrata per status/tipo
    ↓
Per ogni report può:
    ├── Cambiare status (aperta → in_corso → risolta/scartata)
    ├── Aggiungere note (auto-save su blur)
    ├── Copiare testo formattato
    └── Eliminare (selezione multipla + doppia conferma)
    ↓
Se status → 'risolta': email all'autore
    ↓
revalidatePath → badge si aggiorna
```

### Macchina a stati

```
              ┌──────────┐
              │  APERTA  │ ← stato iniziale
              └────┬─────┘
                   │
          ┌────────┼────────┐
          ▼        │        ▼
    ┌──────────┐   │   ┌──────────┐
    │ IN_CORSO │   │   │ SCARTATA │
    └────┬─────┘   │   └────┬─────┘
         │         │        │
    ┌────┴────┐    │        │
    ▼         ▼    │        │
┌────────┐ ┌──────┴──┐     │
│RISOLTA │ │SCARTATA  │     │
│(+email)│ └──────────┘     │
└───┬────┘                  │
    │                       │
    └───── Riapri ──────────┘
              ↓
         ┌──────────┐
         │  APERTA  │
         └──────────┘
```

---

## 10. Variabili Ambiente

```env
# Obbligatorie
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # per operazioni server

# Opzionale (notifiche email)
RESEND_API_KEY=re_xxxxx
```

---

## 11. Dipendenze npm

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install lucide-react        # icone (MessageSquare, X, Copy, Check, etc.)
# Se si usa Resend:
# nessun pacchetto extra — usa fetch nativo verso API REST
```

---

## 12. Checklist implementazione

- [ ] Creare tabella `reports` in Supabase con RLS policies
- [ ] Creare helper `get_user_role()` se non esiste
- [ ] Aggiungere tipi `ReportType`, `ReportStatus`, `Report` in types
- [ ] Implementare server actions (create, markAsRead, updateStatus, updateNotes, delete)
- [ ] Creare page.tsx server component con guard ruolo
- [ ] Creare reports-client.tsx con filtri, card, azioni
- [ ] Creare report-modal.tsx con dynamic import (ssr: false)
- [ ] Aggiungere badge nella sidebar (conteggio status='aperta')
- [ ] Aggiungere bottone "Segnala" nella sidebar (per tutti gli utenti)
- [ ] Configurare RESEND_API_KEY per notifiche email
- [ ] Testare flusso completo: creazione → notifica → gestione → risoluzione

# CLAUDE.md — Gestione Finanziaria WT

Istruzioni operative per Claude Code. Questo file viene letto automaticamente ad ogni sessione.

---

## Processo di lavoro

### Nuova feature o fase

1. **Richiesta** — Marco descrive cosa vuole (alto livello va bene)
2. **Piano** — Claude usa `EnterPlanMode`, esplora il codebase, scrive piano dettagliato con file, tipi, struttura dati e pseudocodice
3. **Approvazione** — Marco approva o corregge il piano. **Nessun codice viene scritto prima dell'approvazione.**
4. **Implementazione** — Claude implementa seguendo il piano approvato
5. **Verifica** — `npx tsc --noEmit` obbligatorio. Zero errori prima di procedere.
6. **Deploy** — vedi sezione dedicata

### Bug fix o modifica puntuale

1. Leggere i file coinvolti prima di toccarli
2. Fix mirato — non toccare codice non richiesto
3. `npx tsc --noEmit` → commit → deploy

---

## Deploy (procedura obbligatoria, in questo ordine)

```bash
git push
# aspettare che Vercel mostri ● Ready
npx vercel alias set [nuovo-url] gestionefinanziariawt.vercel.app
# testare in browser
```

Non saltare l'alias. Non fare push force su master.

---

## Stack tecnico

- **Next.js 16** — App Router, Turbopack, `searchParams` è una `Promise`
- **TypeScript strict** — no `any` esplicito, no cast inutili
- **Tailwind CSS v4** — configurazione in CSS, nessun `tailwind.config.ts`
- **Supabase** — Auth + PostgreSQL + RLS su tutte le tabelle
- **Middleware** — `proxy.ts` (non `middleware.ts`), export `proxy`

---

## Convenzioni di codice

### Pattern consolidati — seguirli sempre

| Pattern | Dove si trova |
|---|---|
| Fetch parallelo server-side | `treasury/page.tsx` righe 41-62 |
| Toggle single/consolidato + selettore società | `treasury-client.tsx` |
| Editing inline con `useTransition` | `operations/forecast-tab.tsx` |
| URL navigation via `useSearchParams` | `treasury-client.tsx` → `navigate()` |
| Server action con `revalidatePath` | `operations/actions.ts` |

### Regole

- `formatEur` definita inline in ogni file (non utility globale)
- `parseCents` inline dove serve
- Server components per fetch dati; client components per interattività
- `router.refresh()` dopo server actions che modificano dati visualizzati
- `key` prop sui tab figli per forzare remount a cambio vista/società
- Non usare `router.push` per reload — usare `router.refresh()`
- Tipi: preferire `type` locale nel file rispetto a import da `database.ts` quando serve solo un sottoinsieme

### Cosa NON fare

- Non creare utility/helper per usi singoli
- Non aggiungere error handling per casi impossibili
- Non aggiungere commenti dove il codice è autoesplicativo
- Non modificare file non richiesti dalla feature

---

## Struttura progetto

```
app/
  login/               ← auth (page.tsx + actions.ts)
  (protected)/         ← layout con sidebar + auth check
    dashboard/
    settings/          ← conti bancari, canali, soglie, utenti
    schedule/          ← scadenzario (Fase 2)
    operations/        ← incassi (Fase 3)
    treasury/          ← tesoreria 30gg (Fase 4)
    forecast/          ← previsione 6 mesi (Fase 5)
    intercompany/      ← netting intercompany (Fase 6)
components/
  sidebar.tsx
lib/
  supabase/client.ts + server.ts
  types/database.ts    ← tipi TypeScript del DB
  channel-utils.ts     ← MONTHS_SHORT, calcCommission, calcPayoutDate
  treasury-calc.ts     ← logica timeline tesoreria
  xls-parser.ts        ← parser Excel scadenzario
  priority-scorer.ts   ← score priorità pagamenti
proxy.ts               ← auth middleware
supabase/setup.sql     ← schema DB completo
```

---

## Database — note critiche

- RLS abilitata su tutte le tabelle. Helper `get_user_role()` nelle policy.
- `dedup_key` in `payment_schedule`: colonna TEXT normale (non GENERATED), popolata da trigger `set_dedup_key`.
- `monthly_revenue_forecasts`: `UNIQUE(company_id, channel_id, year, month)` — i NULL non sono considerati uguali in PostgreSQL, quindi upsert con `channel_id = NULL` richiede check-then-update manuale.
- Trigger `handle_new_user` su `auth.users`: **RIMOSSO**. I profili in `user_profiles` vanno inseriti manualmente.

---

## Utenti e ruoli

| Email | Ruolo |
|---|---|
| marco@wellnesstown.it | `strategic` |
| orianna@wellnesstown.it | `operational` |
| maurizio@wellnesstown.it | `supervisor` |

---

## Società attive

`WT`, `APPIAE`, `HANGAR`, `ARIES`

Canali incasso: Stripe, SumUp, AlmaPay, POS, Satispay, PayPal, Contanti, Bonifico, Assegno

---

## Stato fasi

| Fase | Stato | Descrizione |
|---|---|---|
| 1 | ✅ Completa | DB, auth, layout, settings |
| 2 | ✅ Completa | Scadenzario: import XLS, tabella, row actions, fornitori |
| 3 | ✅ Completa | Incassi giornalieri, forecast canali, settlement |
| 4 | ✅ Completa | Tesoreria 30gg: timeline, pagamenti |
| 5 | ✅ Completa | Previsione 6 mesi: cashflow, spese stimate |
| 6 | ✅ Completa | Intercompany: partite, netting, storico |

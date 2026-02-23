# ricominciamo.md — Gestione Finanziaria Gruppo Wellness Town

Leggi questo file dall'inizio alla fine prima di toccare qualsiasi cosa.
Contiene tutto quello che serve per riprendere il progetto da zero.

---

## 1. Cos'è questo progetto

Sistema interno di pianificazione finanziaria per il **Gruppo Wellness Town** (4 società).
Risponde a due domande:
- **Strategica (6 mesi):** "Avrò un problema di liquidità nei prossimi 6 mesi?"
- **Operativa (30 giorni):** "Chi devo pagare domani e con quale priorità?"

**Utenti:**
| Email | Ruolo | Accesso |
|-------|-------|---------|
| marco@wellnesstown.it | `strategic` | completo |
| orianna@wellnesstown.it | `operational` | import, incassi, pagamenti |
| maurizio@wellnesstown.it | `supervisor` | sola lettura |

**Società:**
| Codice | Nome | Legal name (usata nei file XLS) |
|--------|------|--------------------------------|
| WT | Wellness Town | WELLNESS TOWN S.a.S di Aries Global Services S.r.l. |
| APPIAE | Appiae Sport | APPIAE SPORT S.R.L. |
| HANGAR | Hangar 55 | HANGAR 55 SRL |
| ARIES | Aries Global Service | ARIES GLOBAL SERVICE S.R.L. |

---

## 2. Stack tecnico

- **Frontend:** Next.js 16 (App Router, Turbopack) + React + TypeScript + Tailwind CSS v4
- **Backend/DB:** Supabase (PostgreSQL + Auth + RLS)
- **Deploy:** Vercel
- **UI:** Dark theme (zinc palette), sidebar navigation

**Attenzione a Next.js 16:**
- Il middleware si chiama `proxy.ts` e usa `export async function proxy` (non `middleware`)
- `searchParams` nelle Server Component è `Promise<Record<string, string>>` → serve `await`
- Tailwind v4: configurazione in CSS, non in `tailwind.config.ts`

---

## 3. Ambienti e credenziali

| Cosa | Valore |
|------|--------|
| URL produzione | `https://gestionefinanziariawt.vercel.app` |
| Progetto Vercel | `gestionefinanziaria` in `wellness-towns-projects` |
| Repo GitHub | `markcus78/gestionefinanziaria`, branch `master` |
| Supabase URL | `https://xbybriivzhlehnusrqtl.supabase.co` |
| Variabili env | in `.env.local` (non committato, non esiste in repo) |

**Procedura push/deploy obbligatoria:**
```bash
git push                                    # trigger build automatico
# attendere ~35 secondi
npx vercel ls                               # trovare URL nuovo deployment (● Ready)
npx vercel alias set [nuovo-url] gestionefinanziariawt.vercel.app
```
L'alias NON si aggiorna da solo: va fatto manualmente dopo ogni push.

---

## 4. Struttura file progetto

```
app/
  page.tsx                    → redirect a /dashboard
  layout.tsx                  → html root, font
  login/
    page.tsx                  → form login
    actions.ts                → signIn, signOut (Supabase Auth)
  (protected)/
    layout.tsx                → sidebar + auth check (redirect /login se non autenticato)
    dashboard/page.tsx        → PARZIALE: mostra solo lista società
    settings/
      page.tsx                → tabs: conti bancari | canali | soglie | utenti
      actions.ts              → CRUD bank_accounts, company_cash_channels, soglie, user_profiles
      bank-accounts-section.tsx
      channels-section.tsx
      thresholds-section.tsx
      users-section.tsx
      tab-nav.tsx
    schedule/
      page.tsx                → SERVER COMPONENT: scadenzario + tab fornitori
      schedule-filters.tsx    → CLIENT: filtri URL (società/stato/flusso/periodo/ricerca)
      row-actions.tsx         → CLIENT: dropdown azioni per riga (paga/posticipa/programma)
      suppliers-tab.tsx       → CLIENT: tab fornitori con aggregazioni
      actions.ts              → markPaid, markPostponed, markScheduled, resetToPending, updateSupplier
      import/
        page.tsx              → upload XLS multi-file con auto-detect società
        actions.ts            → parseFileAction, importBatchAction
    operations/page.tsx       → PLACEHOLDER — Fase 3 non implementata
    treasury/page.tsx         → PLACEHOLDER — Fase 4 non implementata
    forecast/page.tsx         → PLACEHOLDER — Fase 5 non implementata
    intercompany/page.tsx     → PLACEHOLDER — Fase 6 non implementata

components/
  sidebar.tsx                 → nav principale (Dashboard/Incassi/Scadenzario/Tesoreria/Previsione/Intercompany/Impostazioni)

lib/
  supabase/
    client.ts                 → createBrowserClient
    server.ts                 → createClient (server-side, usa cookies)
  types/database.ts           → tutti i TypeScript types del DB
  xls-parser.ts               → parser Excel per file Sistemi S.p.A.
  priority-scorer.ts          → calcola priority_score per le scadenze

proxy.ts                      → middleware auth (Next.js 16: export proxy, non middleware)
supabase/setup.sql            → DDL completo + RLS + seed — va eseguito nel Supabase SQL Editor
```

---

## 5. Database — tabelle principali

```
companies              → le 4 società (seed applicato)
user_profiles          → profili utente con ruolo (inserire manualmente dopo auth signup)
bank_accounts          → conti bancari per società (IBAN, saldo attuale)
cash_channels          → canali di incasso globali (Stripe, SumUp, AlmaPay, POS, Satispay, PayPal, Contanti, Bonifico, Assegno)
company_cash_channels  → config canali per società (commissioni custom, settlement days, conto bancario)
collection_patterns    → pattern di manifestazione incassi (monthly_first_10 | daily | daily_with_settlement)
monthly_revenue_forecasts → previsioni incasso mensili per società/canale
daily_collections      → incassi registrati giornalmente
supplier_registry      → anagrafica fornitori (categoria, flag critico, accetta posticipo)
import_batches         → log degli import XLS
payment_schedule       → TABELLA CENTRALE: tutte le scadenze e impegni importati
expense_forecasts      → previsioni spesa manuali per mesi lontani (Fase 5)
intercompany_nettings  → log compensazioni intercompany (Fase 6)
```

**Note critiche sul DB:**
- `dedup_key` in `payment_schedule` è una colonna TEXT normale (non GENERATED), popolata dal trigger `set_dedup_key` che chiama `compute_dedup_key()`. Non usare GENERATED ALWAYS AS perché `date::TEXT` non è immutabile in PostgreSQL.
- Il trigger `handle_new_user` su `auth.users` è stato RIMOSSO perché causava "Database error creating new user". I profili vanno inseriti manualmente in `user_profiles` dopo aver creato gli utenti in Supabase Auth.
- RLS abilitata su tutte le tabelle. Helper `get_user_role()` usato nelle policy.

**Aggiungere un utente:**
1. Creare l'utente in Supabase Auth (Authentication → Users → Invite)
2. Inserire il profilo manualmente:
```sql
INSERT INTO user_profiles (id, email, role)
SELECT id, email, 'operational'   -- o 'strategic' o 'supervisor'
FROM auth.users WHERE email = 'nuovoutente@esempio.it';
```

---

## 6. Stato implementazione

### ✅ Fase 1 — Fondamenta (COMPLETA)
- Setup Next.js + Supabase + Vercel
- Tutte le tabelle DB con RLS e seed
- Autenticazione email/password, middleware di protezione rotte
- Layout con sidebar
- `/settings`: conti bancari, canali di incasso per società, soglie di cassa, gestione utenti

### ✅ Fase 2 — Scadenzario (COMPLETA)
- Parser XLS per file Sistemi S.p.A. (struttura fissa, 30 colonne, sheet "Foglio1")
- Import multi-file: auto-detect società dal nome file (`WTFLUSSISCADENZARIO.XLS` → WT), con selettore per-file modificabile
- **Comportamento import: wipe + re-import** — al caricamento di un nuovo XLS, tutti i dati precedenti della società vengono eliminati e sostituiti con i nuovi. La `supplier_registry` (categorie, flag) viene preservata.
- `/schedule` tab "Scadenzario": filtri per società/stato/flusso/periodo, ricerca per fornitore con debounce, sort per scadenza, paginazione (PAGE_SIZE=50), azioni inline per riga
- `/schedule` tab "Fornitori": lista fornitori con categoria/critico/posticipo editabili inline, colonne aggregazione (scaduto/7gg/30gg/90gg), click su nome → scadenzario filtrato per quel fornitore
- `priority_score` calcolato automaticamente ad ogni import

### ❌ Fase 3 — Incassi `/operations` (DA FARE)
- Registrazione incassi manuali giornalieri per canale
- Proiezioni mensili per società/canale
- Settlement tracker
- Riconciliazione previsto vs incassato

### ❌ Fase 4 — Tesoreria 30 giorni `/treasury` (DA FARE) — LA PIÙ IMPORTANTE
- Timeline giornaliera: incassi previsti / uscite programmate / saldo cumulativo
- Pannello "Pagamenti da gestire" ordinati per priority_score
- Suggeritore piano di pagamento automatico
- Alert (saldo sotto soglia, partite critiche in scadenza)

### ❌ Fase 5 — Previsione 6 mesi `/forecast` (DA FARE)
- Grafico incassi/uscite/saldo mensile
- Toggle singola società / consolidato (elimina intercompany nel consolidato)
- Simulazione what-if
- Previsioni spesa automatiche (media ultimi 3 mesi) + override manuale

### ❌ Fase 6 — Intercompany `/intercompany` (DA FARE)
- Matrice debiti/crediti tra società
- Calcolo netting (compensazione)
- Esecuzione: segnatura compensazioni

### ⚠️ Dashboard `/dashboard` (PARZIALE)
- Mostra solo lista società, nessun KPI reale
- Da completare dopo Fase 3-4

---

## 7. Struttura file XLS (Sistemi S.p.A.)

Ogni società esporta settimanalmente un `.XLS` dal gestionale. Struttura **sempre identica**: 30 colonne, sheet chiamato "Foglio1", riga 0 = header.

**Colonne chiave:**
| Col | Nome | Note |
|-----|------|------|
| 0 | TipoFlusso | 0.0 = ENTRATA, 1.0 = USCITA |
| 2 | ScadenzaDataEffett | Data Excel serial (serial-25569)*86400*1000 |
| 3 | DocData | Data documento (serial Excel) |
| 4 | DocNumero | Numero documento |
| 5 | DocSigla | FT, NC, FT-RC, AFT, PN-CGE, ODA, '' |
| 6 | IntCodicePartitario | Codice numerico fornitore (float → int) |
| 8 | IntCodiceConto | Codice conto contabile |
| 9 | DesConto | Descrizione conto (per impegni senza fornitore) |
| 14 | TipoPag | Tipo pagamento (es. '4  Bonifico' → pulire con regex) |
| 16 | ImportoUdc | Importo con segno: negativo=uscita, positivo=entrata |
| 17 | ImpUdcEntrate | Importo entrata |
| 18 | ImpUdcUscite | Importo uscita (negativo) |
| 21 | OrdOrigineFlusso | 'Scad' = contabile, 'Imp' = impegno |
| 28 | RagSoc | Ragione sociale fornitore/cliente (vuota per impegni) |

**Auto-detect società dal nome file:** ordine di check = `['APPIAE', 'HANGAR', 'ARIES', 'WT']` (dal più lungo al più corto per evitare match parziali). Es: `WTFLUSSISCADENZARIO.XLS` → WT.

**Rilevamento intercompany:** match `RagSoc` con le legal names delle 4 società (case-insensitive).

---

## 8. Priority Score

Calcolato in `lib/priority-scorer.ts` per ogni riga `flow_type='out'` durante l'import.

```
priority_score = categoryWeight + overdueWeight + criticalBonus + postponementDiscount
```

| Componente | Valori |
|-----------|--------|
| categoryWeight | utenze/stipendi: 10, tributi_f24: 9, leasing: 8, affitti: 7, fornitori_bar: 6, professionisti/manutenzione: 5, forniture/assicurazioni: 4, intercompany/altro: 3 |
| overdueWeight | >90gg: +5, >60gg: +4, >30gg: +3, >15gg: +2, >0gg: +1, non scaduto: 0 |
| criticalBonus | is_critical=true: +3 |
| postponementDiscount | accepts_postponement=true: -2 |

Se `priority_override` è impostato sulla riga, viene usato al posto di `priority_score`.

---

## 9. Pattern incassi (per Fase 4)

| Pattern | Comportamento |
|---------|--------------|
| `monthly_first_10` | 100% del forecast mensile distribuito uniformemente dal 1° al 10° del mese |
| `daily` | forecast / giorni lavorativi del mese, ogni giorno |
| `daily_with_settlement` | come daily, ma disponibilità sfasata di N giorni (settlement_days del canale) |

Configurati per società nella tabella `collection_patterns` (seed già applicato):
- WT, HANGAR, ARIES: `monthly_first_10` (default)
- HANGAR Bar (POS/Contanti/SumUp): `daily`
- APPIAE (Stripe/AlmaPay/SumUp/Satispay): `daily_with_settlement`

---

## 10. Decisioni prese durante lo sviluppo

- **Import wipe + re-import:** ogni caricamento XLS elimina tutti i dati della società e reinserisce da zero. Il gestionale Sistemi S.p.A. è la fonte di verità. La `supplier_registry` (categorie, flag critici) NON viene cancellata perché contiene configurazione manuale.
- **dedup_key nel DB:** calcolata via trigger, non come GENERATED ALWAYS AS (bug di immutabilità PostgreSQL con date).
- **No trigger auto-create user_profiles:** rimosso perché causava errore Supabase. Profili inseriti manualmente dopo signup.
- **useTransition vs useState per progress import:** `useTransition` batcha gli aggiornamenti di stato, quindi non mostra il progresso intermedio. L'import multi-file usa `useState` + `isImporting` booleano che invece funziona.
- **Tailwind v4:** niente `tailwind.config.ts`, tutto in CSS.
- **Next.js 16 middleware:** il file si chiama `proxy.ts` e deve esportare `proxy` (non `middleware`), altrimenti Next.js non lo riconosce.

---

## 11. Come riprendere il lavoro

1. Aprire il terminale in `C:\claudecode\gestionefinanziaria`
2. Sviluppo locale: `npm run dev` → http://localhost:3000
3. Build check prima di ogni push: `npm run build`
4. Push e alias Vercel: vedi sezione 3

**Prossima cosa da fare:** Fase 3 (Incassi) oppure direttamente Fase 4 (Tesoreria 30gg, la più importante per l'uso quotidiano). Marco usa la tesoreria ogni mattina quindi è la priorità.

**Ordine suggerito per completare:**
1. Fase 3 — Incassi (serve per alimentare i dati della Tesoreria)
2. Fase 4 — Tesoreria 30gg
3. Dashboard (KPI reali)
4. Fase 5 — Previsione 6 mesi
5. Fase 6 — Intercompany

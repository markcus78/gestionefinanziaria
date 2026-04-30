# Documentazione Tecnica — Gestione Finanziaria WT

> Versione: marzo 2026 — Fasi 1–12 complete + protezione pagamenti parziali

---

## 1. Architettura generale

### Stack tecnico

| Layer | Tecnologia |
|---|---|
| Frontend | Next.js 16 — App Router, Turbopack |
| Linguaggio | TypeScript strict (no `any` esplicito) |
| Styling | Tailwind CSS v4 (config in CSS, no `tailwind.config.ts`) |
| Backend/DB | Supabase — PostgreSQL + RLS + Auth |
| Deploy | Vercel — `gestionefinanziariawt.vercel.app` |
| Email | Resend (segnalazioni interne) |

### Struttura directory

```
app/
  login/               ← Autenticazione (page.tsx + actions.ts)
  (protected)/         ← Layout con sidebar + auth check
    dashboard/         ← Home: pagamenti di oggi, scaduti
    settings/          ← Conti bancari, canali, soglie, utenti
    schedule/          ← Scadenzario contabile (Fase 2)
      import/          ← Import XLS + diff preview + riconciliazione impegni
    operations/        ← Incassi giornalieri (Fase 3)
      collections-tab.tsx
      settlement-tab.tsx
      scostamento-tab.tsx  ← Tab Andamento DOW+DOM (Fase 12b)
    treasury/          ← Tesoreria 30gg (Fase 4)
    forecast/          ← Previsione 6 mesi (Fase 5)
    intercompany/      ← Netting intercompany (Fase 6)
    reports/           ← Segnalazioni interne (Fase 7)
    impegni/           ← Impegni + Template + Stipendi (Fase 8+10)
    audit/             ← Log accessi (Fase 9)
    payments/          ← Pagamenti operativi (Fase 11)
    staff/             ← Staff mensile dipendenti/collaboratori/F24 (Fase 12)
components/
  sidebar.tsx          ← Navigazione laterale con badge segnalazioni
  report-modal.tsx     ← Modal segnalazione (dynamic import, ssr:false)
  session-tracker.tsx  ← Tracker sessione per audit log
lib/
  supabase/client.ts + server.ts
  types/database.ts    ← Tipi TypeScript del DB
  treasury-calc.ts     ← Logica timeline tesoreria + helpers scostamento
  channel-utils.ts     ← MONTHS_SHORT, calcCommission, calcPayoutDate
  xls-parser.ts        ← Parser Excel scadenzario
  salary-parser.ts     ← Parser Excel stipendi/collaboratori
  priority-scorer.ts   ← Score priorità pagamenti
proxy.ts               ← Auth middleware (Next.js 16, export `proxy`)
supabase/setup.sql     ← Schema DB completo
KB/                    ← Documentazione operativa e tecnica
```

---

## 2. Database — Schema e note critiche

### Tabelle principali

#### `companies`
Anagrafica società attive: WT, APPIAE, HANGAR, ARIES.
```sql
id                        UUID PK
code                      TEXT (WT, APPIAE, HANGAR, ARIES)
name                      TEXT
is_active                 BOOLEAN
min_cash_threshold_cents  INTEGER  ← Soglia minima cassa per alert tesoreria
```

#### `bank_accounts`
Conti bancari per società.
```sql
id                    UUID PK
company_id            FK companies
bank_name             TEXT
account_name          TEXT
current_balance_cents INTEGER  ← Aggiornato manualmente
```

#### `cash_channels`
Catalogo globale dei canali di incasso.
```sql
id               UUID PK
name             TEXT (Stripe, SumUp, AlmaPay, POS, Satispay, PayPal, Contanti, Bonifico, Assegno)
default_rate_pct NUMERIC
default_fixed_fee INTEGER
```

#### `company_cash_channels`
Configurazione canale per società.
```sql
company_id        FK companies
channel_id        FK cash_channels
is_enabled        BOOLEAN
rate_percent      NUMERIC
fixed_fee_cents   INTEGER
payout_days       INTEGER      ← Giorni lavorativi al settlement
payout_weekday    INTEGER      ← Giorno fisso settimana (nullable)
```

#### `payment_schedule`
Tabella centrale. Raccoglie **tutti i movimenti** (contabili, impegni, intercompany).

```sql
id                    UUID PK
company_id            FK companies
entry_type            TEXT: 'accounting' | 'commitment' | 'intercompany'
flow_type             TEXT: 'in' | 'out'
amount_cents          INTEGER  ← NEGATIVO per flow_type='out'
due_date              DATE
status                TEXT: 'pending' | 'scheduled' | 'paid' | 'postponed' | 'cancelled'
dedup_key             TEXT     ← Colonna TEXT normale, popolata da trigger set_dedup_key
document_number       TEXT     ← Codice documento/riferimento
supplier_id           FK supplier_registry (nullable)
account_description   TEXT
category              TEXT
is_critical           BOOLEAN
is_intercompany       BOOLEAN
priority_score        INTEGER  ← Calcolato da priority-scorer.ts
priority_override     INTEGER  ← Override manuale priorità
commitment_type       TEXT: 'manual' | 'forecast' | 'salary_item' | 'collab_item' | 'tax_item'
recurring_template_id FK recurring_templates (nullable)
reference_month       TEXT "YYYY-MM" (nullable)
```

**CRITICO:** `amount_cents` è **NEGATIVO** per `flow_type='out'`. Usare sempre `Math.abs()` quando si tratta il valore come grandezza (es. in tesoreria, in forecast).

**`dedup_key`:** colonna TEXT normale (non GENERATED), popolata dal trigger `set_dedup_key` al momento dell'insert. Generata a partire da company_id + document_number + due_date + amount_cents.

#### `daily_collections`
Incassi giornalieri registrati in Operations.
```sql
id                      UUID PK
company_id              FK companies
channel_id              FK cash_channels
collection_date         DATE
gross_amount_cents      INTEGER
commission_cents        INTEGER
net_amount_cents        INTEGER
transaction_count       INTEGER
is_settled              BOOLEAN
settlement_expected_date DATE   ← Calcolata da calcPayoutDate()
settlement_status       TEXT: 'pending' | 'settled'
notes                   TEXT
```

#### `monthly_revenue_forecasts`
Previsioni incassi mensili.
```sql
company_id              FK companies
channel_id              FK cash_channels (nullable — NULL = totale mensile)
year                    INTEGER
month                   INTEGER
forecast_gross_cents    INTEGER
UNIQUE(company_id, channel_id, year, month)
```
**CRITICO:** `UNIQUE` con `channel_id = NULL` — in PostgreSQL i NULL non sono considerati uguali tra loro, quindi l'upsert con `channel_id = NULL` richiede check-then-update manuale (non `ON CONFLICT DO UPDATE`).

#### `recurring_templates`
Template per spese ricorrenti.
```sql
id           UUID PK
company_id   FK companies
name         TEXT
category     TEXT: 'salary' | 'collaborators' | 'tax' | 'utility' | 'other'
amount_cents INTEGER
frequency    TEXT: 'monthly' | 'quarterly' | 'annual'
day_of_month INTEGER
is_active    BOOLEAN
```

#### `supplier_registry`
Anagrafica fornitori.
```sql
id           UUID PK
company_id   FK companies (nullable — fornitori condivisi)
name         TEXT
supplier_code TEXT
category     TEXT
is_critical  BOOLEAN
```

#### `collection_patterns`
Pattern distribuzione incassi per Treasury.
```sql
company_id    FK companies
pattern_type  TEXT: 'daily' | 'monthly' | 'subscription'
day_of_month  INTEGER (nullable)
```

#### `access_logs`
Audit log accessi (Fase 9).
```sql
id         UUID PK
user_id    UUID FK auth.users
email      TEXT
event_type TEXT: 'login' | 'logout' | 'session_restored'
ip_address TEXT
user_agent TEXT
created_at TIMESTAMPTZ
```

#### `intercompany_transactions`
Partite intercompany tra società del gruppo.

#### `reports`
Segnalazioni interne.
```sql
id          UUID PK
user_id     UUID FK auth.users
type        TEXT
description TEXT
status      TEXT: 'aperta' | 'in_corso' | 'scartata' | 'risolta'
is_read     BOOLEAN
created_at  TIMESTAMPTZ
```

#### `user_profiles`
Profili utente con ruolo. **Il trigger `handle_new_user` è stato rimosso** — i profili vanno inseriti manualmente.
```sql
id    UUID PK (= auth.users.id)
email TEXT
role  TEXT: 'strategic'
```

---

## 3. Autenticazione e sicurezza

### Auth flow
- Login via `app/login/actions.ts` → `supabase.auth.signInWithPassword` → log `access_logs` + set cookie `wt_session`
- Sessione memorizzata in cookie Supabase
- Middleware `proxy.ts` intercetta ogni richiesta a `/(protected)/*` e verifica la sessione
- Logout: delete cookie `wt_session` → log `access_logs` → `supabase.auth.signOut()`

### Middleware
File: `proxy.ts` (non `middleware.ts`), export named `proxy` (non default). Obbligatorio per Next.js 16.

### Cookie `wt_session`
Session cookie (nessun `maxAge`) — sparisce alla chiusura del browser. Il componente `session-tracker.tsx` (montato nel layout protected se il cookie manca) chiama `logSessionRestored()` al mount e ricrea il cookie. Questo traccia le sessioni ripristinate (apertura nuova tab con sessione Supabase già attiva).

### RLS — Row Level Security
Abilitata su tutte le tabelle. La funzione helper `get_user_role()` ritorna il ruolo dell'utente corrente dalla tabella `user_profiles`. Il ruolo `strategic` vede tutte le società.

### Ruoli
| Ruolo | Accesso |
|---|---|
| `strategic` | Accesso completo a tutte le società, tutte le funzionalità, audit log |

---

## 4. Sezioni applicative — Funzionamento dettagliato

### 4.1 Operations — Incassi reali (`/operations`)

**File:** `page.tsx`, `operations-client.tsx`, `collections-tab.tsx`, `settlement-tab.tsx`, `scostamento-tab.tsx`

**Props passate da page.tsx a OperationsClient:**
```typescript
companies, company, channelConfigs, collections, pendingSettlements,
forecastCents, year, month, tab, today, canDelete
```

**Tab disponibili:** `incassi` | `andamento` | `settlement`

#### Tab Incassi
CRUD su `daily_collections`. Inserimento: data, canale, lordo, n° transazioni.

Calcoli in tempo reale (client-side):
```typescript
commission = Math.round(gross * (rate_percent / 100)) + fixed_fee_cents
net = gross - commission
payoutDate = calcPayoutDate(collectionDate, payoutDays, payoutWeekday)
```

#### Tab Andamento (Fase 12b)
Analisi scostamento previsto vs reale basata sull'algoritmo DOW+DOM.

**Funzioni in `lib/treasury-calc.ts`:**
```typescript
// Incasso cumulato atteso dall'algoritmo dal giorno 1 al giorno upToDay
calcExpectedCumulated(budgetCents, year, month, upToDay): number

// Proiezione fine mese basata sul ritmo reale fino a upToDay
calcMonthProjection(collectedCents, year, month, upToDay): number
```

Entrambe riutilizzano `distributeForecast(budget, 'subscription', null, year, month)`.

Logica in `scostamento-tab.tsx`:
- `upToDay`: ieri se mese corrente, ultimo giorno se mese passato
- `realByDay`: Map\<day, cents\> costruita da `collections` (props, nessun fetch aggiuntivo)
- Colori riga: verde se `reale > previsto × 1.1`, rosso se `reale < previsto × 0.75`
- Proiezione: verde ≥ 100% budget, giallo ≥ 75%, rosso < 75%
- Fallback se `forecastCents === 0`: messaggio placeholder

#### Tab Settlement
Lista `daily_collections` con `is_settled = false` e `settlement_expected_date IS NOT NULL`.

**Collegamento Treasury:** gli incassi con `is_settled = false` alimentano `certainMap` nella tesoreria: il saldo include questi come "incassi certi" alla data di settlement.

---

### 4.2 Schedule — Scadenzario contabile (`/schedule`)

**File:** `page.tsx`, `schedule-grouped.tsx`, `schedule-filters.tsx`, `suppliers-tab.tsx`, `import/page.tsx`, `import/actions.ts`

**Filtri URL:** `company`, `status`, `flow`, `from`, `to`, `q`, `supplier_id`, `supplier_label`, `tab`

#### Import XLS (`/schedule/import`)

1. `lib/xls-parser.ts` → parse file Excel → array di righe normalizzate
2. Filtra solo `entry_type = 'accounting'` (le righe `commitment` dall'XLS vengono ignorate)
3. `diffPreviewAction`: confronta con DB → ritorna `{ diff, possibleDuplicates }`
4. `diff: FileDiffResult` contiene: `added`, `alwaysNew`, `modified`, `removed`, `unchanged`, **`paidConflicts`**
5. `possibleDuplicates`: impegni aperti con `Math.abs(amount_cents)` uguale, `due_date` entro ±7gg, stessa `company_id`
6. `importIncrementalAction(companyCode, rowsJson, fileName, markPaidIds, cancelCommitmentIds[])`:
   - Step 8: INSERT solo righe `entry_type='accounting'`
   - Step 9: UPDATE righe modificate con safety filter `.not('status', 'in', '("paid","cancelled")')` — le righe con pagamento parziale non vengono mai sovrascritte
   - Chiama `cancelCommitment()` row-by-row per ogni id in `cancelCommitmentIds`

**Protezione pagamenti parziali (`paidConflicts`):** se `computeDiff` trova una riga DB con `status='paid'` che avrebbe rilevanza come `modified` (importo o data diversi dall'XLS), la separa in `paidConflicts` invece di inserirla in `modified`. Queste righe sono mostrate nell'UI come avviso blu informativo (senza checkbox, non aggiornabili). Il safety filter allo step 9 agisce come protezione lato server anche in caso di errori client.

**`PaidConflict`** — tipo esportato da `actions.ts`:
```typescript
type PaidConflict = {
  dbId: string
  supplierName: string | null
  documentNumber: string | null
  dbAmountCents: number      // importo originale nel DB
  paidAmountCents: number    // quanto già pagato (pagamento parziale)
  dueDate: string            // data DB
  xlsAmountCents: number     // importo nell'XLS (solitamente = originale)
  xlsDueDate: string         // data nell'XLS
}
```

**Navigazione post-import:** usa `window.location.href` (non `router.push`) per bypassare la router cache di Next.js.

#### Vista scadenzario
- Default: gerarchica anno→mese→giorno (`schedule-grouped.tsx`)
- Click fornitore → naviga con `?supplier_id=<uuid>&supplier_label=<name>` → vista piatta in `page.tsx`

#### Query Supabase "not in" — sintassi critica
```typescript
// CORRETTO (virgolette doppie obbligatorie nel server client):
.not('status', 'in', '("cancelled","paid")')
// SBAGLIATO (senza virgolette non funziona):
.not('status', 'in', '(cancelled,paid)')
```

---

### 4.3 Impegni — Spese manuali e pianificate (`/impegni`)

**File:** `page.tsx`, `impegni-client.tsx`, `actions.ts`, `templates-actions.ts`, `salary-actions.ts`

**Tab switching:** via `?tab=` URL param (`impegni` | `template` | `stipendi`)

#### Tab Impegni
```typescript
// actions.ts
createCommitment(data)          → insert in payment_schedule (entry_type='commitment')
updateCommitment(id, data)      → update
cancelCommitment(id)            → status='cancelled' + revalidatePath
deleteCommitment(id)            → delete
createCommitmentBatch(items[])  → insert multiplo in una transazione
```

Badge **"Già in scadenzario"** sulle righe `matchedIds[]` (calcolato in `page.tsx`):
- Matching: `Math.abs(amount_cents)` uguale + `due_date` entro ±7gg + stessa `company_id`
- Prop `matchedIds: string[]` passata a `ImpegniClient`

#### Tab Template
```typescript
// templates-actions.ts
createTemplate(data)
updateTemplate(id, data)
deleteTemplate(id)
generateMonth(templateIds[], year, month)
  // → insert row-by-row in payment_schedule, ignora conflitti dedup_key
  // document_number = 'FCST-{tid.slice(0,8)}-{YYYY-MM}'
  // commitment_type = 'forecast'
```

#### Tab Stipendi
```typescript
// salary-actions.ts
importSalaryItems(items[], companyId, month, type: 'salary_item' | 'collab_item')
  // document_number: SAL-{YYYY-MM}-{slug} | COL-{YYYY-MM}-{slug}
importTaxItem(amountCents, companyId, month)
  // document_number: F24-{YYYY-MM}
```

Parser: `lib/salary-parser.ts` — rileva colonne nome/cognome/importo con fallback su header comuni.

---

### 4.4 Treasury — Tesoreria 30 giorni (`/treasury`)

**File:** `page.tsx`, `treasury-client.tsx`, `timeline-tab.tsx`, `payments-tab.tsx`

**Calcolo timeline (`lib/treasury-calc.ts → buildTimeline`):**
```typescript
for each day D in [today, today+29]:
  certainInflow[D]  = sum(daily_collections.net_amount_cents where settlement_expected_date = D)
  forecastInflow[D] = distributeForecast(monthly_forecast, 'subscription', null, year, month).get(D) ?? 0
  outflow[D]        = sum(Math.abs(payment_schedule.amount_cents) where due_date = D and status in pending/scheduled)
  balance[D]        = balance[D-1] + certainInflow[D] + forecastInflow[D] - outflow[D]
```

**CRITICO:** `Math.abs(p.amount_cents)` in `page.tsx` prima di passare i dati a `buildTimeline`. I valori nel DB sono negativi per le uscite.

**Pattern distribuzione forecast (`distributeForecast`):**
- `daily`: forecast / giorni lavorativi del mese, distribuito uniformemente (domenica = 0)
- `monthly`: 100% nel giorno `day_of_month` del mese
- `subscription`: modello DOW+DOM (vedi sezione 5)

**Vista singola vs consolidata:** toggle nel client. Consolidata = somma tutte le società, escluse partite `is_intercompany = true`.

---

### 4.5 Forecast — Previsione 6 mesi (`/forecast`)

**File:** `page.tsx`, `forecast-client.tsx`, `cashflow-tab.tsx`

**Calcolo cashflow (server-side in `page.tsx`):**
```typescript
for each month M in [currentMonth, currentMonth+5]:
  inflow  = monthly_revenue_forecasts[company][M].forecast_gross_cents ?? 0
  outflow = sum(Math.abs(payment_schedule.amount_cents))
            where due_date in M and status NOT IN ('paid','cancelled')
  netFlow = inflow - outflow
  endBalance[M] = endBalance[M-1] + netFlow
```

**Modifica forecast:** editing inline via `useTransition`. Al blur/Enter chiama `upsertRevenueForecast` (server action) → `revalidatePath`. Pattern di riferimento: `operations/forecast-tab.tsx`.

---

### 4.6 Payments — Pagamenti operativi (`/payments`)

**File:** `page.tsx`, `payments-client.tsx`, `actions.ts`

**Tre sezioni nella pagina:**
- **Scaduto**: `due_date < today` AND `status NOT IN ('paid','cancelled')`
- **Oggi**: `due_date = today` AND `status NOT IN ('paid','cancelled')`
- **Prossimi 15gg**: `due_date BETWEEN tomorrow AND today+15` AND `status NOT IN ('paid','cancelled')`

```typescript
// actions.ts
markAsPaid(id)            → status='paid'
postponePayment(id, date) → status='postponed', due_date=newDate
markPartiallyPaid(id, paidCents)
  // → aggiorna riga originale (amount ridotto, status='paid')
  // → inserisce nuova riga per il residuo (doc='RES-{uuid8}', entry_type='commitment', commitment_type='manual')
createUrgentPayment(data)
  // → insert con doc='URG-{uuid8}', entry_type='commitment', commitment_type='manual'
cancelPayment(id)         → status='cancelled'
```

**Pattern modale:** modal multi-stato (`idle` | `confirm` | `partial`) con azioni contestuali per riga.

---

### 4.7 Staff — Gestione mensile (`/staff`)

**File:** `page.tsx`, `staff-client.tsx`, `actions.ts`

**Sorgente dati:** legge da `payment_schedule` filtrando per `reference_month = 'YYYY-MM'` e `commitment_type IN ('salary_item','collab_item','tax_item')`.

**Navigatore mese:** mese precedente / corrente / successivo via URL param `?month=YYYY-MM`.

**Modal Paga:** aggiorna `status='paid'` via server action → `revalidatePath`.

**Badge stato:** calcolato client-side da `status` della riga.

---

### 4.8 Reports — Segnalazioni interne (`/reports`)

**File:** `page.tsx`, `reports-client.tsx`, `actions.ts`

```typescript
// actions.ts
createReport(data)                     → insert in reports
updateReportStatus(id, status)         → update status + is_read=true
deleteReports(ids: string[])           → delete bulk
```

**Flusso stati:** `aperta` → `in_corso` | `risolta` | `scartata` → (riapri) → `aperta`

**Badge sidebar:** conta `reports WHERE status='aperta'` — non usa `is_read`.

**Modal:** `report-modal.tsx` importato con `dynamic(import, { ssr: false })` per evitare idratazione.

---

## 5. Algoritmo DOW+DOM

Modello di distribuzione forecast calibrato su 14 mesi di storico WT/APPIAE (~20.000 transazioni). Implementato in `lib/treasury-calc.ts → distributeForecast(..., 'subscription', ...)`.

### Moltiplicatori

**DOW (giorno settimana)** — 0=Lun … 6=Dom (conversione: `modelDow = (jsDow + 6) % 7`):
```
Lun: 1.3555  Mar: 1.0783  Mer: 1.0398  Gio: 1.0522
Ven: 1.1797  Sab: 0.7490  Dom: 0.5455
```

**DOM (giorno mese):**
```
 1: 1.2407   2: 1.7991   3: 1.2075  ...
30: 1.5144  31: 1.6637
```

### Calcolo peso giornaliero
```typescript
w[d] = DOW_MULT[modelDow(d)] × DOM_MULT[d]
totalWeight = sum(w[d] for d in [1..lastDay])
cents[d] = floor(totalCents × w[d] / totalWeight)
// Ultimo giorno: residuo per garantire somma esatta
```

### Funzioni helper scostamento (Fase 12b)
```typescript
// Incasso cumulato atteso dal giorno 1 al giorno upToDay
calcExpectedCumulated(budgetCents, year, month, upToDay): number

// Proiezione fine mese se si mantiene il ritmo reale fino a upToDay
// Usa distributeForecast(1_000_000, ...) per ottenere i pesi puri
calcMonthProjection(collectedCents, year, month, upToDay): number
  // weightPast = sum(w[d] for d in [1..upToDay])
  // weightTotal = sum(w[d] for d in [1..lastDay])
  // projection = collectedCents / (weightPast / weightTotal)
```

---

## 6. Flussi di dati tra sezioni

```
monthly_revenue_forecasts
        │
        ├──► Forecast: cashflow 6 mesi (uscite da payment_schedule)
        ├──► Treasury: forecast distribuito giornalmente via distributeForecast
        └──► Operations/Andamento: calcExpectedCumulated, calcMonthProjection

daily_collections
        │
        ├──► Treasury: certainMap (incassi certi per data settlement)
        └──► Operations: lista incassi + banner forecast vs reale

payment_schedule (entry_type='accounting')
        │
        ├──► Schedule: vista scadenzario
        ├──► Dashboard: pagamenti oggi e scaduti
        ├──► Payments: pagamenti operativi (-30/oggi/+15gg)
        ├──► Forecast: uscite aggregate per mese
        └──► Treasury: uscite giornaliere

payment_schedule (entry_type='commitment')
        │
        ├──► Impegni: lista impegni (manual/forecast/salary/collab/tax)
        ├──► Staff: lista dipendenti/collaboratori per mese (salary_item/collab_item/tax_item)
        ├──► Payments: inclusi nei pagamenti operativi
        ├──► Forecast: uscite aggregate per mese
        └──► Treasury: uscite giornaliere

recurring_templates
        └──► Impegni/Tab Template: genera righe in payment_schedule (entry_type='commitment', commitment_type='forecast')
```

---

## 7. Convenzioni di codice — Pattern consolidati

| Pattern | File di riferimento |
|---|---|
| Fetch parallelo server-side | `treasury/page.tsx` righe 41-62 |
| Toggle single/consolidato + selettore società | `treasury-client.tsx` |
| Editing inline con `useTransition` | `operations/forecast-tab.tsx` |
| URL navigation via `useSearchParams` | `treasury-client.tsx` → `navigate()` |
| Server action con `revalidatePath` | `operations/actions.ts` |
| Modal multi-stato + azioni contestuali per riga | `payments/payments-client.tsx` |
| `String(res.error)` per errori da server action | TS non restringe union dopo `'error' in res` |
| `window.location.href` per navigazione post-import | `schedule/import/page.tsx` (bypassa router cache) |

### Regole invarianti
- `formatEur` definita inline in ogni file (non utility globale)
- `parseCents` inline dove serve
- Server components per fetch dati; client components per interattività
- `router.refresh()` dopo server actions che modificano dati visualizzati
- `key` prop sui tab figli per forzare remount a cambio vista/società
- Non usare `router.push` per reload — usare `router.refresh()`
- Tipi: preferire `type` locale nel file rispetto a import da `database.ts` quando serve solo un sottoinsieme

---

## 8. Deduplicazione e integrità dati

### `dedup_key` in `payment_schedule`
Colonna TEXT normale (non GENERATED), popolata dal trigger `set_dedup_key` al momento dell'insert. Generata da: `company_id + document_number + due_date + amount_cents`.

### `document_number` — pattern univoci per tipo
```
IMP-{uuid}                ← Impegno manuale
FCST-{tid.slice(0,8)}-{YYYY-MM}  ← Generato da template ricorrente
SAL-{YYYY-MM}-{slug}     ← Stipendio dipendente
COL-{YYYY-MM}-{slug}     ← Collaboratore
F24-{YYYY-MM}            ← F24 (uno per mese per società)
RES-{uuid8}              ← Residuo pagamento parziale
URG-{uuid8}              ← Pagamento urgente non contabile
```

### Idempotenza import
- **XLS scadenzario:** stesso file → stesso `dedup_key` → upsert senza duplicati
- **Template generate:** `FCST-{tid}-{YYYY-MM}` → rigenerare lo stesso mese non duplica
- **Stipendi/collaboratori:** `SAL-{YYYY-MM}-{slug}` → re-import dello stesso mese sovrascrive
- **F24:** `F24-{YYYY-MM}` → uno per mese, re-import aggiorna l'importo

---

## 9. Deploy e configurazione

### Procedura deploy (obbligatoria, in questo ordine)
```bash
git push
# Attendere che Vercel mostri ● Ready
npx vercel alias set [nuovo-url] gestionefinanziariawt.vercel.app
# Testare in browser
```

### Progetto Vercel
- **Scope:** `wellness-towns-projects`
- **Progetto:** `gestionefinanziaria`
- **URL produzione:** `https://gestionefinanziariawt.vercel.app`
- **Branch:** `master`

### Variabili d'ambiente
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
```

---

## 10. Gap e funzionalità non implementate

| Area | Descrizione | Priorità |
|---|---|---|
| Alert fornitore duplicato | Avviso durante import XLS se esiste già un impegno aperto per lo stesso fornitore (non solo matching per importo+data) | Media |
| Ripianificazione scaduto | Click su voce scaduta → cambio data inline senza aprire un modale separato | Alta |
| Gestione carte di credito | Pagamenti eseguiti con carta → raggruppati in un'unica uscita al giorno fisso di saldo (es. 16 del mese) | Bassa (sospeso) |
| Carte prepagate Marta/Antonello | Form acquisti → Google Sheet → diminuzione saldo conto prepagato | Bassa (rimandato) |
| Righe `alwaysNew` nello scadenzario | Righe senza `supplier_code` e `document_number` vengono cancellate e reinserite ad ogni import → appaiono sempre come nuove | Bassa |
| Export dati | Nessun export XLS/CSV da schedule, impegni, treasury | Bassa |
| Storico pagamenti | Nessun log di quando è stato marcato pagato, da chi, con quale importo reale | Bassa |

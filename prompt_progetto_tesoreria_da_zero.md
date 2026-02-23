# PROGETTO DA ZERO — Gestione Tesoreria Gruppo Wellness Town

## Obiettivo
Costruire un'applicazione web per la gestione della tesoreria di un gruppo di 4 società. L'app deve rispondere a due domande fondamentali:
1. **Strategica (6 mesi):** "Avrò un problema di liquidità nei prossimi 6 mesi?"
2. **Operativa (30 giorni):** "Chi devo pagare domani e con quale priorità?"

## Stack tecnologico
- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Backend/DB:** Supabase (PostgreSQL + Auth + RLS)
- **Deploy:** Vercel
- **UI:** Design pulito, professionale, dashboard-oriented. Palette scura con accenti. Sidebar navigation. Responsive.

## Le 4 società
| Codice | Nome completo | Stato |
|--------|--------------|-------|
| WT | Wellness Town S.a.S di Aries Global Services S.r.l. | Attiva |
| APPIAE | Appiae Sport (cercala come "APPIAE" nei file) | Attiva |
| HANGAR | Hangar 55 SRL | Attiva |
| ARIES | Aries Global Service S.R.L. | Attiva |

### Relazioni intercompany
```
WT → APPIAE   (affitti + ribaltamento utenze)
WT → HANGAR   (affitti + ribaltamento utenze)
HANGAR → APPIAE (noleggio macchinari)
```
Aries ha anche rapporti con WT, Hangar e la dormiente GIMS.

### Pattern di incasso per società
| Società | Tipo incasso | Pattern |
|---------|-------------|---------|
| WT | Fatture a terzi e intercompany | Incasso concentrato nei primi 10 giorni del mese |
| HANGAR | Fatture (noleggi, affitti) | Incasso nei primi 10 giorni del mese |
| HANGAR | Bar/Bistro (scontrini) | Incasso giornaliero |
| APPIAE | Abbonamenti clienti finali | Incasso giornaliero, ma con ritardo di disponibilità per tempi di settlement dei provider digitali |
| ARIES | Fatture | Incasso nei primi 10 giorni del mese |

---

## STRUTTURA DEL FILE SCADENZARIO (CRITICO — LEGGI ATTENTAMENTE)

Ogni società esporta settimanalmente un file .XLS dal gestionale contabile "Sistemi S.p.A.". Tutti e 4 i file hanno **esattamente la stessa struttura**: 30 colonne, un foglio chiamato "Foglio1", la riga 0 è l'header.

### Colonne del file (indice 0-29)
```
 0  TipoFlusso          → 0.0 = ENTRATA (credito), 1.0 = USCITA (debito)
 1  Provenienza          → 0.0 = contabilità, 3.0 = impegno extra-contabile
 2  ScadenzaDataEffett   → Data scadenza (formato Excel serial date, epoch 30/12/1899)
 3  DocData              → Data documento (formato Excel serial date)
 4  DocNumero            → Numero documento (stringa)
 5  DocSigla             → Tipo documento: FT, NC, FT-RC, NC-RC, AFT, FT-UE, PN-CGE, ODA, '' (vuoto per impegni)
 6  IntCodicePartitario  → Codice numerico del fornitore/cliente nel partitario
 7  IntPartitario        → 2.0 = partita contabile, 0.0 = impegno
 8  IntCodiceConto       → Codice conto contabile (es. '330301' = Fornitori terzi Italia, '110301' = Clienti terzi Italia)
 9  DesConto             → Descrizione conto (es. 'Fornitori terzi Italia')
10  DecofConto           → Codice.Partitario + Ragione Sociale (es. '330301.19  AQUATEC S.r.l.')
11  BanCodicePartitario  → Codice banca (0.0 = nessuna)
12  DesBanca             → Nome banca ('' = nessuna banca)
13  Banca                → Dettaglio banca (es. '1  Banca BPM', 'Nessuna banca')
14  TipoPag              → Tipo pagamento: '1  Rimessa diretta', '2  RI.BA.', '4  Bonifico', '5  Bonifico estero', '15  RID', '0' (non definito)
15  TotUdcImporto        → Importo assoluto della partita
16  ImportoUdc           → Importo con segno: NEGATIVO = uscita, POSITIVO = entrata
17  ImpUdcEntrate        → Importo se entrata (altrimenti 0.0)
18  ImpUdcUscite         → Importo se uscita (NEGATIVO, altrimenti 0.0)
19  CodCentroImputazione → Centro di costo (solitamente 0.0)
20  bloccato             → Flag blocco (stringa, solitamente vuota)
21  OrdOrigineFlusso     → CAMPO CHIAVE: 'Scad' = scadenza contabile, 'Imp' = impegno, 'Ord' = ordine
22  FiltroOrd1           → Filtro ordinamento 1
23  FiltroOrd2           → Filtro ordinamento 2
24  FiltroOrd3           → Filtro ordinamento 3
25  TitoloOrd1           → 'Origine Flusso'
26  TitoloOrd2           → 'Origine Flusso'
27  TitoloOrd3           → 'Conto'
28  RagSoc               → RAGIONE SOCIALE del fornitore/cliente. VUOTA per molti impegni.
29  DesBancaConto        → Descrizione conto bancario
```

### Regole di interpretazione
1. **Scadenza vs Impegno:** Usa `OrdOrigineFlusso` (colonna 21): `'Scad'` = partita contabile registrata, `'Imp'` = impegno preso ma non ancora in contabilità. In alternativa: `Provenienza` (col 1): 0.0 = contabilità, 3.0 = impegno. Oppure `IntPartitario` (col 7): 2.0 = contabile, 0.0 = impegno.
2. **Entrata vs Uscita:** Usa `TipoFlusso` (col 0): 0.0 = entrata, 1.0 = uscita. Conferma con `ImportoUdc` (col 16): positivo = entrata, negativo = uscita.
3. **Date:** Formato Excel serial date (epoch = 30/12/1899). Convertire con: `new Date((serial - 25569) * 86400000)` in JS, o equivalente.
4. **Fornitore/Cliente:** Usa `RagSoc` (col 28) come nome. Per gli impegni può essere vuota. `IntCodicePartitario` (col 6) è l'ID numerico per dedup/matching.
5. **Tipo documento:** `DocSigla` (col 5): FT = fattura, NC = nota credito, FT-RC = fattura reverse charge, AFT = fattura acquisto estero, PN-CGE = partita non contabile, ODA = ordine d'acquisto. Vuoto = impegno senza documento.
6. **Identificazione intercompany:** Matchare `RagSoc` (col 28) con le ragioni sociali delle 4 società del gruppo. I nomi esatti che compaiono nei file sono:
   - `"WELLNESS TOWN S.a.S di Aries Global Services S.r.l."`
   - `"ARIES GLOBAL SERVICE S.R.L."`
   - `"HANGAR 55 SRL"`
   - `"GIMS SSD a r.l."` (società dormiente collegata)
   - APPIAE non compare negli scadenzari delle altre come creditore (non ha partite attive verso le altre)

### Statistiche reali dai file
| Società | Righe totali | Scadenze | Impegni | Uscite (€) | Entrate (€) | Fornitori unici | Date range |
|---------|-------------|----------|---------|------------|-------------|----------------|------------|
| WT | 678 | 604 | 73 | -2.354.804 | 75.653 | 76 | 2008 → 2027 |
| APPIAE | 190 | 92 | 98 | -984.237 | 0 | 40 | 2024 → 2027 |
| HANGAR | 150 | 67 | 83 | -232.852 | 2.440 | 17 | 2023 → 2027 |
| ARIES | 59 | 53 | 6 | -132.123 | 132.132 | 16 | 2010 → 2026 |

**NOTA:** Molte scadenze sono nel passato (anche dal 2008 per WT). Queste sono partite scadute mai pagate. NON vanno ignorate, vanno importate e segnalate come scadute.

---

## ARCHITETTURA DELL'APPLICAZIONE

### Modello dati Supabase

#### Tabella `companies`
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,        -- 'WT', 'APPIAE', 'HANGAR', 'ARIES'
  name TEXT NOT NULL,                -- Nome completo
  legal_name TEXT,                   -- Ragione sociale esatta per matching intercompany
  is_active BOOLEAN DEFAULT TRUE,
  minimum_cash_threshold_cents BIGINT DEFAULT 0,  -- Soglia minima di cassa per alert
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Seed con le 4 società attive + le ragioni sociali esatte per il matching intercompany.

#### Tabella `user_profiles`
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('strategic', 'operational', 'supervisor')),
  -- strategic = accesso completo (Marco)
  -- operational = import, inserimento incassi, gestione pagamenti (Orianna)
  -- supervisor = sola lettura (Maurizio)
  company_id UUID REFERENCES companies(id), -- opzionale, per filtrare la vista
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Tabella `bank_accounts`
```sql
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,                -- es. "BPM Conto principale"
  iban TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  current_balance_cents BIGINT DEFAULT 0,
  balance_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Tabella `cash_channels` (canali di incasso globali)
```sql
CREATE TABLE cash_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,         -- 'Stripe', 'SumUp', 'Contanti', 'Bonifico', 'POS', 'Satispay', 'PayPal', 'AlmaPay', 'Assegno'
  default_commission_pct NUMERIC(5,4) DEFAULT 0,
  default_commission_fixed_cents INTEGER DEFAULT 0,
  avg_settlement_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Tabella `company_cash_channels` (config canali per società)
```sql
CREATE TABLE company_cash_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  channel_id UUID NOT NULL REFERENCES cash_channels(id),
  is_enabled BOOLEAN DEFAULT TRUE,
  custom_commission_pct NUMERIC(5,4),       -- NULL = usa default
  custom_commission_fixed_cents INTEGER,     -- NULL = usa default
  custom_settlement_days INTEGER,            -- NULL = usa default
  bank_account_id UUID REFERENCES bank_accounts(id),
  UNIQUE(company_id, channel_id)
);
```

#### Tabella `collection_patterns` (pattern di manifestazione incassi)
```sql
CREATE TABLE collection_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  channel_id UUID REFERENCES cash_channels(id),  -- NULL = pattern di default per la società
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('monthly_first_10', 'daily', 'daily_with_settlement')),
  description TEXT,
  UNIQUE(company_id, channel_id)
);
```

#### Tabella `monthly_revenue_forecasts` (previsioni incasso mensili)
```sql
CREATE TABLE monthly_revenue_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  channel_id UUID REFERENCES cash_channels(id),  -- NULL = previsione aggregata per società
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  forecast_gross_cents BIGINT NOT NULL,  -- previsione lordo
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, channel_id, year, month)
);
```

#### Tabella `daily_collections` (incassi registrati)
```sql
CREATE TABLE daily_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  channel_id UUID NOT NULL REFERENCES cash_channels(id),
  collection_date DATE NOT NULL,
  gross_amount_cents BIGINT NOT NULL,
  commission_cents BIGINT NOT NULL DEFAULT 0,
  net_amount_cents BIGINT NOT NULL,
  settlement_expected_date DATE,
  is_settled BOOLEAN DEFAULT FALSE,
  settled_date DATE,
  stripe_payment_intent_id TEXT UNIQUE,  -- per dedup sync Stripe
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Tabella `supplier_registry` (anagrafica fornitori)
```sql
CREATE TABLE supplier_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  supplier_name TEXT NOT NULL,
  supplier_code TEXT,                -- IntCodicePartitario dal gestionale
  category TEXT CHECK (category IN (
    'utenze', 'stipendi', 'fornitori_bar', 'affitti', 'tributi_f24',
    'professionisti', 'leasing_noleggio', 'manutenzione', 'forniture',
    'assicurazioni', 'intercompany', 'altro'
  )),
  is_critical BOOLEAN DEFAULT FALSE,
  default_priority INTEGER CHECK (default_priority BETWEEN 1 AND 10),
  accepts_postponement BOOLEAN,
  postponement_notes TEXT,
  bank_iban TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, supplier_code)
);
```

#### Tabella `import_batches` (log degli import)
```sql
CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES auth.users(id),
  file_name TEXT,
  rows_imported INTEGER,
  rows_updated INTEGER,
  rows_new INTEGER,
  status TEXT DEFAULT 'completed'
);
```

#### Tabella `payment_schedule` (TABELLA CENTRALE — scadenzario)
```sql
CREATE TABLE payment_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  import_batch_id UUID REFERENCES import_batches(id),

  -- Dati dal gestionale
  supplier_name TEXT,                  -- RagSoc (col 28) — può essere vuota per impegni
  supplier_code TEXT,                  -- IntCodicePartitario (col 6)
  account_code TEXT,                   -- IntCodiceConto (col 8), es. '330301'
  account_description TEXT,            -- DesConto (col 9)
  document_type TEXT,                  -- DocSigla (col 5): FT, NC, FT-RC, etc.
  document_number TEXT,                -- DocNumero (col 4)
  document_date DATE,                  -- DocData (col 3), convertita da Excel serial
  due_date DATE NOT NULL,              -- ScadenzaDataEffett (col 2), convertita da Excel serial
  payment_method TEXT,                 -- TipoPag (col 14), pulito
  bank_description TEXT,               -- DesBanca (col 12)

  -- Importi
  amount_cents BIGINT NOT NULL,        -- ImportoUdc (col 16) * 100, con segno
  amount_in_cents BIGINT DEFAULT 0,    -- ImpUdcEntrate (col 17) * 100
  amount_out_cents BIGINT DEFAULT 0,   -- ImpUdcUscite (col 18) * 100, negativo

  -- Classificazione
  flow_type TEXT NOT NULL CHECK (flow_type IN ('in', 'out')),  -- da TipoFlusso: 0→'in', 1→'out'
  entry_type TEXT NOT NULL CHECK (entry_type IN ('accounting', 'commitment')),
    -- 'accounting' da OrdOrigineFlusso='Scad', 'commitment' da 'Imp'

  -- Intercompany
  is_intercompany BOOLEAN DEFAULT FALSE,
  counterpart_company_id UUID REFERENCES companies(id),

  -- Gestione pagamento/incasso
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'scheduled', 'paid', 'postponed', 'disputed', 'cancelled'
  )),
  paid_date DATE,
  paid_amount_cents BIGINT,
  postponed_to DATE,
  postpone_notes TEXT,

  -- Priorità
  priority_score NUMERIC(5,2),
  priority_override INTEGER CHECK (priority_override BETWEEN 1 AND 10),

  -- Riferimento al fornitore
  supplier_id UUID REFERENCES supplier_registry(id),

  -- Dedup
  dedup_key TEXT GENERATED ALWAYS AS (
    company_id::TEXT || '|' || COALESCE(supplier_code,'') || '|' || COALESCE(document_number,'') || '|' || due_date::TEXT || '|' || amount_cents::TEXT
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_payment_schedule_dedup ON payment_schedule(dedup_key);
```

#### Tabella `expense_forecasts` (previsioni spesa per vista 6 mesi)
```sql
CREATE TABLE expense_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  forecast_cents BIGINT NOT NULL,
  source TEXT DEFAULT 'manual' CHECK (source IN ('calculated', 'manual')),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, category, year, month)
);
```

#### Tabella `intercompany_nettings` (log compensazioni)
```sql
CREATE TABLE intercompany_nettings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  netting_date DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  total_compensated_cents BIGINT,
  details JSONB,  -- dettaglio delle partite compensate
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS (Row Level Security)
Abilita RLS su tutte le tabelle. Policy:
- **SELECT:** `TO authenticated USING (true)` — tutti gli utenti autenticati vedono tutto
- **INSERT/UPDATE:** solo `strategic` e `operational` (usa helper `get_user_role()`)
- **DELETE:** solo `strategic`

---

## PAGINE DELL'APPLICAZIONE

### Navigazione (Sidebar)
```
📊 Dashboard
📥 Incassi (Operations)
📋 Scadenzario (Import & gestione)
💰 Tesoreria 30 giorni
📈 Previsione 6 mesi
🔄 Intercompany
⚙️ Impostazioni
```

### 1. Dashboard (`/dashboard`)
KPI principali aggregate e per società:
- Saldo cassa attuale per società (da `bank_accounts.current_balance_cents`)
- Incassi del mese vs previsione
- Prossime scadenze critiche (priority_score > 8)
- Alert: saldo sotto soglia, incassi sotto target, scadenze urgenti
- Mini-chart: trend saldo cassa ultimi 30 giorni

### 2. Incassi (`/operations`)
- Registrazione incassi manuali giornalieri (batch per società/data)
- Per ogni canale abilitato: lordo → commissione → netto (calcolato automaticamente)
- Sync Stripe (se configurato)
- Proiezioni mensili (inserimento target per società/canale/mese)
- Riconciliazione (previsto vs incassato)
- Settlement tracker: incassi in attesa di accredito

### 3. Scadenzario (`/schedule`)
- **Import:** Upload file .XLS, selezionare società, preview dati, conferma import
  - Il parser è FISSO (non serve mapping colonne, la struttura è sempre identica)
  - Deduplicazione automatica su `dedup_key`
  - Al re-import: aggiorna i record esistenti, segnala record scomparsi
  - Alla prima importazione per una società, auto-popola `supplier_registry` con i fornitori trovati
  - Rileva automaticamente le partite intercompany matchando RagSoc con `companies.legal_name`
- **Vista scadenzario:** Tabella con filtri per società, stato, data, fornitore, tipo (scadenza/impegno)
  - Colonne: Scadenza | Fornitore | Documento | Importo | Tipo | Stato | Giorni scaduto | Priorità
  - Evidenzia in rosso le partite scadute, con gradazione per anzianità
  - Azioni inline: segna pagato, posticipa, segna come schedulato
- **Gestione fornitori:** Sezione per assegnare categoria, priorità, flag critico ai fornitori

### 4. Tesoreria 30 giorni (`/treasury`)
**Questa è la pagina più importante — quella che Marco usa ogni mattina.**

#### 4a. Timeline giornaliera
Tabella/griglia scrollabile con i prossimi 30 giorni. Per ogni giorno:
| Data | Incassi previsti | Incassi in pipeline | Uscite programmate | Saldo giorno | Saldo cumulativo |
- **Incassi previsti:** dalla distribuzione dei `monthly_revenue_forecasts` secondo i `collection_patterns`
  - Pattern `monthly_first_10`: 100% del forecast mensile distribuito uniformemente dal 1° al 10° del mese
  - Pattern `daily`: forecast / giorni lavorativi del mese, ogni giorno
  - Pattern `daily_with_settlement`: come daily, ma la disponibilità è sfasata di N giorni (settlement_days del canale)
- **Incassi in pipeline:** da `daily_collections` con `is_settled = false` e `settlement_expected_date` nel giorno
- **Uscite programmate:** da `payment_schedule` con `status IN ('pending', 'scheduled')` e `due_date` nel giorno
- **Saldo giorno:** incassi - uscite
- **Saldo cumulativo:** saldo iniziale (da `bank_accounts`) + somma saldi giornalieri

Colorazione: verde se saldo cumulativo sopra soglia, giallo se vicino, rosso se sotto.

#### 4b. Pannello "Pagamenti da gestire"
Sotto la timeline, lista di tutte le partite in scadenza nei prossimi 30 giorni + partite già scadute, ordinate per `priority_score` decrescente.

**Calcolo automatico `priority_score`:**
```
priority_score =
  category_weight          -- utenze:10, stipendi:10, tributi_f24:9, leasing:8, fornitori critici:8, affitti:7, manutenzione:5, altro:3
+ overdue_weight           -- scaduto >90gg:+5, >60gg:+4, >30gg:+3, >15gg:+2, >0gg:+1, non scaduto:0
+ critical_supplier_bonus  -- is_critical=true: +3
- postponement_discount    -- accepts_postponement=true: -2
```
Se `priority_override` è impostato (1-10), sostituisce il calcolo e viene scalato a una scala comparabile.

Azioni per ogni partita:
- ✅ **Segna pagato** → inserisci data e importo effettivo
- ⏭️ **Posticipa** → nuova data + note (es. "Chiamato fornitore, accettato posticipo al 15/03")
- 📅 **Schedula** → conferma che verrà pagato alla scadenza
- ⬆️⬇️ **Override priorità** → override manuale

#### 4c. Suggerimento piano di pagamento
Bottone **"Suggerisci piano"** che:
1. Prende il cash disponibile giorno per giorno dalla timeline
2. Ordina le partite per priority_score decrescente
3. Assegna le partite ai giorni con cash sufficiente, partendo dalle più prioritarie
4. Le partite non coperte → evidenziate come "da posticipare"
5. Output: piano proposto, modificabile dall'utente

#### 4d. Alert
Banner in alto alla pagina:
- 🔴 Saldo sotto soglia in una data futura
- 🟡 Incasso odierno < 80% del previsto
- 🟠 Partite critiche in scadenza entro 3 giorni

### 5. Previsione 6 mesi (`/forecast`)

#### 5a. Grafico principale
Area chart / bar chart che mostra, per mese, per i prossimi 6 mesi:
- Incassi previsti (da `monthly_revenue_forecasts` meno commissioni stimate)
- Uscite previste (mesi 1-2: da `payment_schedule`; mesi 3-6: da `expense_forecasts`)
- Saldo mensile netto
- Saldo cumulativo
- Linea soglia minima di cassa

#### 5b. Toggle società singola / consolidato gruppo
- Vista singola: una società alla volta
- Vista consolidata: somma tutte le società, ELIMINA le partite intercompany
  - Le partite con `is_intercompany = true` non vengono conteggiate nel consolidato

#### 5c. Simulazione what-if
Pannello laterale con slider/input:
- Variazione % incassi per società (es. APPIAE -10%)
- Posticipo pagamenti per categoria (es. "non critici +15 giorni")
- Aggiunta/rimozione spesa straordinaria
- Le modifiche aggiornano il grafico in tempo reale (solo frontend, non salvano)
- Opzione "Salva scenario" per confronto

#### 5d. Gestione previsioni spesa
Per i mesi 3-6, dove non ci sono ancora scadenze nello scadenzario:
- Il sistema calcola automaticamente una previsione basata sulla media degli ultimi 3 mesi di scadenze importate, per categoria
- L'utente può sovrascrivere con valori manuali
- Tabella editabile per categoria/mese

### 6. Intercompany (`/intercompany`)

#### 6a. Matrice debiti/crediti
Mostra tutte le partite intercompany aperte (da `payment_schedule` dove `is_intercompany = true`) in una matrice società × società.

#### 6b. Calcolo netting
Bottone "Calcola compensazione" che:
- Per ogni coppia di società, calcola il saldo netto
- Mostra i soli bonifici necessari dopo compensazione
- Genera un report scaricabile

#### 6c. Esecuzione
Alla conferma, le partite compensate vengono segnate come pagate con nota "Compensazione intercompany del GG/MM/AAAA".

### 7. Impostazioni (`/settings`)
- **Canali di incasso:** Config globale e override per società (commissioni, settlement days, conto bancario)
- **Conti bancari:** Anagrafica conti per società, saldo attuale
- **Pattern incassi:** Configurazione pattern per società/canale
- **Soglie alert:** Soglia minima cassa per società
- **Utenti:** Gestione ruoli (solo per strategic)

---

## AUTENTICAZIONE
- Supabase Auth con email/password
- 3 utenti iniziali: Marco (strategic), Orianna (operational), Maurizio (supervisor)
- Middleware Next.js per proteggere tutte le route tranne `/login`
- Redirect automatico a `/dashboard` dopo login

---

## ORDINE DI IMPLEMENTAZIONE

Procedi in questo ordine. **Dopo ogni fase, fammi un report di quanto implementato. NON passare alla fase successiva senza il mio OK.**

### Fase 1: Fondamenta
- Setup progetto Next.js + Supabase + Vercel
- Tutte le tabelle del DB con RLS
- Seed dati (società, canali, pattern)
- Autenticazione e layout (sidebar, theme)
- Pagina Impostazioni (canali, conti bancari, soglie)

### Fase 2: Import scadenzario
- Parser XLS con la struttura esatta documentata sopra
- Upload, preview, import con dedup
- Auto-detect intercompany
- Auto-populate supplier_registry
- Vista scadenzario con filtri e azioni inline
- Gestione fornitori (categoria, priorità, flag critico)

### Fase 3: Incassi
- Registrazione incassi manuali batch
- Proiezioni mensili
- Riconciliazione
- Settlement tracker

### Fase 4: Tesoreria 30 giorni
- Timeline giornaliera
- Pannello pagamenti con priorità
- Suggeritore piano pagamento
- Alert

### Fase 5: Previsione 6 mesi
- Grafico principale
- Toggle singola/consolidato con netting intercompany
- Simulazione what-if
- Previsioni spesa automatiche e manuali

### Fase 6: Intercompany
- Matrice
- Calcolo netting
- Esecuzione e report

---

## FILE DI ESEMPIO

Nella directory del progetto troverai 4 file .XLS di esempio (uno per società). Usali per:
1. Testare il parser
2. Verificare la corretta conversione delle date Excel serial
3. Verificare il rilevamento intercompany
4. Popolare il DB con dati reali per testare le viste

I file sono:
- `WTFLUSSISCADENZARIO.XLS` (678 righe, la più grande)
- `APPIAEFLUSSISCADENZARIO.XLS` (190 righe)
- `HANGARFLUSSISCADENZARIO.XLS` (150 righe)
- `ariesEFLUSSISCADENZARIO.XLS` (59 righe)

---

Inizia dalla Fase 1 e fammi il report quando hai finito.

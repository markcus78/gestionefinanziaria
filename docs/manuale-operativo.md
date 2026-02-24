# Manuale Operativo — Sistema di Gestione Finanziaria
**Wellness Town Group** · Versione 1.0 · Febbraio 2026

---

## 1. Il sistema in sintesi

Il sistema di gestione finanziaria centralizza il controllo di cassa e dei flussi economici delle quattro società del gruppo (WT, APPIAE, HANGAR, ARIES). Permette di:

- monitorare i pagamenti in scadenza e lo stato della cassa nei prossimi 30 giorni
- registrare gli incassi giornalieri per canale (Stripe, SumUp, POS, ecc.)
- proiettare i flussi finanziari sui prossimi 6 mesi
- gestire le partite intercompany tra le società del gruppo

L'indirizzo del sistema è: **https://gestionefinanziariawt.vercel.app**

---

## 2. Accessi e ruoli

| Utente | Email | Ruolo | Cosa può fare |
|---|---|---|---|
| Marco | marco@wellnesstown.it | Strategic | Accesso completo a tutte le funzioni e società |
| Orianna | orianna@wellnesstown.it | Operational | Tutte le operazioni quotidiane; non può eliminare dati |
| Maurizio | maurizio@wellnesstown.it | Supervisor | Solo visualizzazione — nessuna modifica |

---

## 3. Calendario operativo

### Ogni giorno — mattina

| Operazione | Chi | Dove | Tempo stimato |
|---|---|---|---|
| Controllo tesoreria e alert | Orianna | Tesoreria 30 giorni | 5 min |
| Registrazione incassi del giorno precedente | Orianna | Operazioni | 10–15 min |

### Ogni settimana — lunedì mattina

| Operazione | Chi | Dove | Tempo stimato |
|---|---|---|---|
| Import XLS scadenzario (tutte le società) | Orianna | Scadenzario → Importa | 15–20 min |
| Aggiornamento forecast incassi mese corrente | Orianna | Operazioni → Forecast | 10 min |
| Verifica partite pagate: segnare come saldate | Orianna | Scadenzario | 10–15 min |

### Ogni mese — entro il 5 del mese

| Operazione | Chi | Dove | Tempo stimato |
|---|---|---|---|
| Aggiornamento spese stimate 6 mesi | Marco | Previsione 6 mesi → Spese stimate | 20 min |
| Revisione forecast incassi 6 mesi | Marco | Previsione 6 mesi → Cashflow | 15 min |
| Netting intercompany (se ci sono posizioni) | Marco | Intercompany → Netting | 10 min |
| Aggiornamento saldi conti bancari | Marco | Impostazioni → Conti | 5 min |

---

## 4. Procedure operative dettagliate

---

### 4.1 Importare lo scadenzario da gestionale (XLS)

**Quando:** ogni lunedì mattina, per ciascuna delle 4 società.

**Chi:** Orianna

**Passi:**

1. Accedere al sistema → sezione **Scadenzario**
2. Selezionare la società dal selettore in alto (WT, APPIAE, HANGAR, ARIES)
3. Cliccare il pulsante **Importa XLS** in alto a destra
4. Scegliere il file XLS esportato dal gestionale per quella società
5. Confermare l'importazione
6. Ripetere per ogni società

**Note:**
- Ogni importazione sovrascrive (aggiorna) i dati esistenti per quella società — non crea duplicati
- Le partite già marcate come pagate non vengono sovrascritte
- Se una riga cambia importo o data rispetto all'import precedente, viene aggiornata automaticamente

---

### 4.2 Registrare gli incassi giornalieri

**Quando:** ogni mattina, riferiti al giorno precedente.

**Chi:** Orianna (sarà automatizzato in futuro)

**Passi:**

1. Andare su **Operazioni**
2. Selezionare la società
3. Verificare che la data sia corretta (default: ieri)
4. Per ogni canale attivo (Stripe, SumUp, POS, ecc.) inserire:
   - **Importo lordo** incassato
   - **Numero di transazioni**
5. Il sistema calcola automaticamente le commissioni e la data prevista di accredito
6. Cliccare **Salva** per ogni canale

**Note:**
- Se un canale non ha avuto incassi, lasciare il campo vuoto o inserire 0
- L'accredito previsto dipende dalla configurazione del canale (es. Stripe: +2 giorni lavorativi, POS: stesso giorno)
- Lo stato "In attesa di accredito" si risolve automaticamente quando si marca il settlement come ricevuto

---

### 4.3 Segnare un pagamento come eseguito

**Quando:** dopo aver effettuato un pagamento a un fornitore.

**Chi:** Orianna

**Passi:**

1. Andare su **Scadenzario**
2. Selezionare la società
3. Trovare la riga del pagamento (usare i filtri per data o stato)
4. Cliccare i tre puntini (⋮) sulla riga → **Segna come pagato**
5. Confermare la data di pagamento

---

### 4.4 Posticipare una scadenza

**Quando:** si decide di ritardare un pagamento a fornitore.

**Chi:** Orianna o Marco

**Passi:**

1. Andare su **Scadenzario**
2. Trovare la riga
3. Cliccare i tre puntini (⋮) → **Posticipa**
4. Inserire la nuova data e, facoltativamente, una nota

**Note:**
- Il posticipo viene registrato: la scadenza originale resta visibile come storico
- Posticipare troppo spesso una partita può abbassarne il punteggio di priorità

---

### 4.5 Controllare la tesoreria a 30 giorni

**Quando:** ogni mattina.

**Chi:** Orianna (poi eventualmente Marco per le decisioni)

**Cosa guardare:**

1. Aprire **Tesoreria 30 giorni**
2. Verificare la presenza di **alert in rosso** nella fascia superiore:
   - *Saldo sotto soglia*: il cassa scende sotto il minimo previsto
   - *Pagamenti critici*: forniture o stipendi in scadenza entro 7 giorni
3. Nella timeline, i giorni evidenziati in rosso indicano stress di liquidità
4. Se ci sono criticità, segnalare a Marco

**Vista singola vs consolidato:**
- **Singola**: cassa di una sola società
- **Consolidato**: cassa sommata di tutto il gruppo (escluse le partite intercompany)

---

### 4.6 Aggiornare il forecast incassi (mensile e 6 mesi)

**Quando:** ogni lunedì (mese corrente) e entro il 5 del mese (6 mesi).

**Chi:** Orianna per il mese corrente; Marco per i 6 mesi

**Mese corrente (Operazioni → Forecast):**
1. Andare su **Operazioni** → tab **Forecast**
2. Per ogni canale, inserire la previsione di incasso lordo per il mese in corso
3. La colonna "Incassato" si aggiorna automaticamente man mano che si registrano gli incassi giornalieri

**6 mesi (Previsione 6 mesi → Cashflow):**
1. Andare su **Previsione 6 mesi**
2. Selezionare la società
3. Nella riga **Incassi previsti**, cliccare su ogni cella mensile e inserire la previsione
4. Il saldo proiettato nelle card in cima si aggiorna in tempo reale

---

### 4.7 Aggiornare le spese stimate (6 mesi)

**Quando:** entro il 5 di ogni mese.

**Chi:** Marco

**Passi:**

1. Andare su **Previsione 6 mesi** → tab **Spese stimate**
2. Selezionare la società
3. Per ogni categoria di spesa (Utenze, Stipendi, Affitti, F24, ecc.) inserire la previsione mensile
4. Il totale colonna si aggiorna automaticamente
5. Il tab **Cashflow** riflette automaticamente le spese aggiornate nel saldo proiettato

**Vista consolidato:** mostra la somma di tutte le società — non è modificabile, serve solo per la lettura.

---

### 4.8 Netting intercompany

**Quando:** mensile, dopo l'import XLS settimanale di tutte le società.

**Chi:** Marco

**Cos'è:** le società del gruppo si devono denaro a vicenda (es. WT deve ad ARIES, ARIES deve a WT). Invece di fare due bonifici, si calcola il saldo netto e si esegue un solo pagamento.

**Passi:**

1. Andare su **Intercompany** → tab **Netting**
2. Verificare le coppie di società con posizioni aperte
3. Per ogni coppia, il sistema mostra:
   - quanto A deve a B (lordo)
   - quanto B deve ad A (lordo)
   - il **pagamento netto** da eseguire (chi paga, a chi, quanto)
4. Cliccare **Esegui netting** per la coppia
5. Il sistema marca le partite come saldate e registra l'operazione nello Storico
6. Eseguire il pagamento netto effettivo tramite bonifico bancario (fuori dal sistema)

---

### 4.9 Aggiornare i saldi dei conti bancari

**Quando:** entro il 5 del mese (o quando cambia il saldo reale).

**Chi:** Marco

**Passi:**

1. Andare su **Impostazioni** → **Conti bancari**
2. Per ogni conto, cliccare **Modifica** e aggiornare il saldo attuale
3. Il saldo aggiornato verrà usato come punto di partenza per tesoreria e previsioni

---

## 5. Glossario

| Termine | Significato |
|---|---|
| **Scadenzario** | Elenco di tutti i pagamenti da fare (fatture fornitori, F24, affitti, ecc.) importati dal gestionale |
| **Partita** | Singola riga del scadenzario (un pagamento da eseguire) |
| **Netting** | Compensazione tra debiti reciproci di due società: si paga solo il saldo netto |
| **Settlement** | Accredito effettivo del denaro incassato sul conto bancario (es. Stripe accredita dopo 2 giorni) |
| **Forecast** | Previsione di incasso o di spesa futura |
| **Soglia minima** | Livello minimo di cassa sotto il quale il sistema genera un alert |
| **Intercompany** | Operazioni finanziarie tra società dello stesso gruppo |
| **Vista consolidata** | Somma dei dati di tutte le società del gruppo |

---

## 6. Cosa fare in caso di problemi

| Problema | Azione |
|---|---|
| Alert "Saldo sotto soglia" | Segnalare a Marco per valutare trasferimento fondi o posticipo pagamenti |
| Partita critica in scadenza entro 7 giorni | Verificare disponibilità cassa e, se necessario, pianificare il pagamento con Marco |
| XLS non si importa correttamente | Verificare che il file sia quello giusto (esportazione standard dal gestionale); segnalare a Marco |
| Incasso non registrato correttamente | Contattare Marco — è possibile eliminare e reinserire l'incasso |
| Il saldo proiettato non corrisponde alla realtà | Aggiornare il saldo del conto bancario in Impostazioni |

---

*Documento soggetto ad aggiornamenti. Versione corrente: Febbraio 2026.*

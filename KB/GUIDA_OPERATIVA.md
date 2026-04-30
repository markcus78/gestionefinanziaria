# Guida Operativa — Gestione Finanziaria WT

> Versione: marzo 2026 — Fasi 1–12 complete

---

## Obiettivi del sistema

Il sistema risponde a tre domande fondamentali che ogni giorno guidano le decisioni finanziarie del gruppo WT:

**1. Quanto stiamo incassando?**
Risponde la sezione Incassi (`/operations`): registrazione reale giornaliera dei flussi in entrata per canale (Stripe, SumUp, POS, Bonifici, ecc.), confronto con il budget mensile e analisi dello scostamento rispetto all'algoritmo di distribuzione attesa.

**2. Cosa dobbiamo pagare e quando possiamo permettercelo?**
Risponde la sezione Tesoreria (`/treasury`): proiezione giornaliera del saldo di cassa per i prossimi 30 giorni, costruita combinando le entrate certe (settlement canali), le entrate previste (forecast distribuito), e tutte le uscite pianificate (scadenzario contabile + impegni manuali + ricorrenti + stipendi).

**3. Dove andremo a fine mese e nei prossimi sei mesi?**
Risponde la sezione Forecast (`/forecast`): cashflow previsionale a 6 mesi per società e in vista consolidata del gruppo.

**L'obiettivo operativo** è che Orianna, ogni mattina, apra il sistema e in pochi minuti sappia:
- cosa ha incassato il giorno prima
- cosa deve pagare oggi e nei prossimi giorni
- se ci sono tensioni di liquidità imminenti da segnalare a Marco

**L'obiettivo strategico** è che Marco e Maurizio abbiano in ogni momento una fotografia chiara della salute finanziaria del gruppo, senza dover aspettare report mensili dalla contabilità.

---

## Accesso al sistema

**URL:** https://gestionefinanziariawt.vercel.app

Accesso con email e password. Utenti autorizzati:
- marco@wellnesstown.it
- orianna@wellnesstown.it
- maurizio@wellnesstown.it

---

## Mappa delle sezioni

| Sezione | URL | Chi la usa | Frequenza |
|---|---|---|---|
| Dashboard | `/dashboard` | Orianna, Marco | Ogni mattina |
| Incassi | `/operations` | Orianna | Ogni giorno |
| Scadenzario | `/schedule` | Orianna | Lunedì |
| Impegni / Template | `/impegni` | Orianna | Settimanale |
| Staff / Stipendi | `/staff` | Orianna | Mensile (giorni 8–10) |
| Tesoreria 30gg | `/treasury` | Marco, Orianna | Ogni giorno |
| Previsione 6 mesi | `/forecast` | Marco | Mensile |
| Pagamenti operativi | `/payments` | Orianna | Ogni giorno |
| Intercompany | `/intercompany` | Marco, Maurizio | Al bisogno |
| Segnalazioni | `/reports` | Tutti | Al bisogno |
| Impostazioni | `/settings` | Marco | Raramente |
| Audit Log | `/audit` | Marco | Al bisogno |

---

## 1. Dashboard

**Chi:** Orianna ogni mattina, Marco quando controlla.

La Dashboard è il punto di partenza giornaliero. Mostra:

- **Pagamenti in scadenza oggi**: lista di tutto ciò che va pagato oggi, con importo e fornitore per ogni società
- **Banner rosso scaduto**: se ci sono pagamenti non pagati scaduti nelle ultime settimane, appare un banner con il totale e un link diretto allo scadenzario filtrato per scaduto

**Operatività:**
1. Aprire il sistema → la Dashboard è la prima pagina
2. Leggere i pagamenti di oggi e verificare se sono già coperti dalla disponibilità del conto
3. Se c'è il banner scaduto → cliccare il link e gestire dalla sezione Pagamenti (`/payments`)

---

## 2. Incassi giornalieri (`/operations`)

**Chi:** Orianna ogni giorno, a fine mattinata dopo aver verificato i terminali e i gateway.

### Tab Incassi — Registrazione

Ogni giorno lavorativo, Orianna registra gli incassi reali ricevuti da ogni canale.

**Procedura registrazione:**
1. Andare su `/operations` → selezionare la società → Tab **Incassi**
2. Cliccare **"+ Nuovo incasso"**
3. Compilare:
   - **Data**: il giorno dell'incasso (di norma ieri o oggi)
   - **Canale**: Stripe / SumUp / AlmaPay / POS / Satispay / PayPal / Contanti / Bonifico / Assegno
   - **Lordo**: importo lordo (quello che appare sul terminale o sul report del gateway)
   - **N° transazioni**: numero di operazioni
4. Il sistema calcola automaticamente in anteprima: commissione, netto, **data di disponibilità sul conto**
5. Confermare → il dato viene salvato

**La data di disponibilità** è cruciale: un incasso Stripe di oggi non è disponibile subito, ma dopo N giorni lavorativi configurati nelle impostazioni. Questo dato alimenta la Tesoreria come "incasso certo".

### Banner confronto forecast

In cima alla pagina `/operations` appare sempre il confronto tra:
- Totale incassato nel mese corrente
- Budget mensile previsto (inserito in Forecast)
- Delta: verde se sopra, rosso se sotto (con percentuale)

### Tab Andamento — Analisi scostamento

La tab **Andamento** risponde alla domanda: *"rispetto a quanto avremmo dovuto incassare oggi secondo il modello algoritmico, siamo sopra o sotto?"*

Il sistema usa un algoritmo DOW+DOM (calibrato su 14 mesi di storico WT/APPIAE, ~20.000 transazioni) che distribuisce il budget mensile giorno per giorno tenendo conto del giorno della settimana (i lunedì incassano tipicamente il 35% in più della media, le domeniche il 45% in meno) e del giorno del mese (il 2, il 30 e il 31 del mese sono storicamente più alti).

**3 card in cima:**
- **Atteso ad oggi (algoritmo)**: quanto avremmo dovuto incassare dalla fine del mese scorso a oggi secondo il modello
- **Reale ad oggi**: quanto abbiamo effettivamente incassato
- **Proiezione fine mese**: se continuiamo a questo ritmo, dove chiudiamo il mese (verde ≥ 100% budget, giallo ≥ 75%, rosso < 75%)

**Tabella giornaliera**: per ogni giorno passato del mese mostra previsto / reale / delta € / delta % con colorazione riga (verde = sopra di più del 10%, rosso = sotto di più del 25%).

> **Nota:** questo tab funziona solo se il budget mensile è stato inserito in Forecast. Se il campo "Incassi previsti" del mese corrente è zero, appare il messaggio di istruzione.

### Tab Settlement

Mostra gli incassi registrati ma non ancora accreditati sul conto. Per ogni riga:
- Canale, importo netto, data prevista di accredito

Questi importi compaiono in Tesoreria come "incassi certi" alla data di settlement. Quando l'accredito arriva sul conto, Orianna marca la riga come "settled".

---

## 3. Scadenzario contabile (`/schedule`)

**Chi:** Orianna, tipicamente il lunedì.

Lo scadenzario contiene tutte le fatture, rate, tributi e uscite contabilizzate nel gestionale. Viene aggiornato settimanalmente importando il file XLS esportato dalla contabilità.

### Import settimanale XLS

1. Andare su `/schedule`
2. Cliccare **"Importa XLS"**
3. Selezionare il file Excel esportato dal gestionale
4. Il sistema mostra un'anteprima del diff: quante righe nuove, quante aggiornate, quante invariate
5. **Sezione blu — Pagamenti parziali già registrati**: se il gestionale esporta ancora una fattura che nel sistema risulta già pagata parzialmente (es. Orianna aveva pagato €500 su €1.000), appare questa sezione informativa. Non richiede alcuna azione: le righe sono solo visualizzate come avviso e non verranno mai aggiornate dall'import.
6. **Sezione arancione — Possibili duplicati con impegni**: sono voci già presenti come impegni manuali. Di norma conviene selezionarle tutte (già pre-selezionate) e annullare gli impegni corrispondenti, così da evitare doppio conteggio in Tesoreria
7. Confermare l'import

**Il sistema usa il codice documento come chiave di deduplicazione:** ricaricare lo stesso file non crea duplicati. Si può importare ogni settimana senza rischio.

**Importante:** lo scadenzario contiene solo righe `entry_type='accounting'`. Gli impegni manuali rimangono separati.

### Navigazione

**Vista gerarchica (default):** anno → mese → giorno. Il mese corrente è aperto automaticamente.

**Vista fornitore:** cliccare il nome di un fornitore per vedere tutte le sue scadenze in una lista piatta con totale. Utile per verificare l'esposizione verso un singolo fornitore.

**Filtri disponibili:**
- Società (WT, APPIAE, HANGAR, ARIES, o tutte)
- Stato (pending, pagato, posticipato, annullato)
- Flusso (uscite, entrate)
- Intervallo date
- Ricerca testuale

### Azioni sulle righe

Ogni voce ha le seguenti azioni:
- **Marca come pagato** — imposta status = paid con data odierna
- **Posticipa** — inserire la nuova data di scadenza
- **Annulla** — la voce rimane nello storico ma non viene contata nei calcoli
- **Elimina** — rimozione definitiva

### Tab Fornitori

Vista aggregata: per ogni fornitore mostra il totale delle uscite già scadute, nei prossimi 7 giorni, entro 30 giorni, entro 90 giorni. Utile per la pianificazione dei pagamenti.

---

## 4. Impegni, Template e Stipendi (`/impegni`)

**Chi:** Orianna. Tre tab con tre utilizzi distinti.

### 4.1 Tab Impegni — Spese manuali non ancora contabilizzate

Usare questa tab per inserire **spese future note** che non compaiono ancora nello scadenzario (ad esempio: un pagamento concordato verbalmente, un anticipo previsto, una spesa una-tantum imminente).

Gli impegni alimentano automaticamente la Tesoreria e il Forecast. Non serve fare altro dopo averli inseriti.

**Nuovo impegno singolo:**
1. Cliccare **"+ Nuovo"**
2. Compilare: società, descrizione, importo, data prevista
3. Salvare

**Inserimento multiplo (batch):**
1. Cliccare **"Multiplo"**
2. Aggiungere righe con il pulsante "+"
3. Compilare la griglia
4. Confermare — tutte le righe vengono inserite in un'unica operazione

**Attenzione al doppio conteggio:** quando una spesa inserita come impegno manuale appare poi nello scadenzario (perché è arrivata la fattura), è necessario annullare l'impegno. Il sistema aiuta in questo: all'import XLS, se trova una corrispondenza tra una nuova voce contabile e un impegno aperto (stesso importo, stessa società, entro 7 giorni di differenza), mostra un alert e propone di annullare l'impegno automaticamente.

Le righe impegno che sono già presenti nello scadenzario vengono evidenziate con un badge arancione **"Già in scadenzario"** e un pulsante **"Annulla duplicato"**.

**Filtro default:** la tab mostra solo gli impegni in stato `pending`. Gli annullati e i pagati sono nascosti (cambio stato visibile dal selettore).

### 4.2 Tab Template — Spese ricorrenti mensili

I **template** permettono di pianificare automaticamente le spese che si ripetono ogni mese: utenze, abbonamenti, canoni, rate fisse.

**Creazione template (una-tantum, all'avvio o quando nasce un nuovo costo ricorrente):**
1. Cliccare **"+ Nuovo template"**
2. Compilare: nome del costo, categoria, importo stimato, giorno del mese di pagamento, frequenza (mensile/trimestrale/annuale)
3. Salvare → il template è attivo

**Generazione mensile (all'inizio di ogni mese):**
1. Nella sezione **"Genera mese"**, selezionare il mese target (es. Aprile 2026)
2. Verificare l'elenco dei template selezionati (tutti attivi pre-selezionati)
3. Cliccare **"Genera"**
4. Il sistema crea una riga in `payment_schedule` per ogni template, con la data di scadenza del mese target
5. Rigenerare lo stesso mese non crea duplicati

**Attivazione/disattivazione:** ogni template ha un toggle. Quelli inattivi non compaiono nella lista "Genera mese". Usare questa funzione per sospendere temporaneamente un costo (es. abbonamento in pausa).

**Aggiustamenti:** gli importi dei template sono stime. Se l'importo reale di una bolletta differisce da quello stimato, Orianna modifica la voce direttamente nella tab Impegni dopo la generazione.

### 4.3 Tab Stipendi — Import mensile

Usata ogni mese, tipicamente tra il giorno 8 e il giorno 10, quando arrivano i file con gli importi reali.

**Import dipendenti:**
1. Ricevere dal consulente del lavoro il file Excel con i cedolini del mese
2. Andare su `/impegni` → Tab **Stipendi**
3. Cliccare **"Carica dipendenti"**
4. Selezionare il mese di riferimento (es. Marzo 2026)
5. Caricare il file → il sistema rileva automaticamente le colonne nome/cognome/importo
6. Confermare — vengono create righe individuali per ogni dipendente

**Import collaboratori:**
Stessa procedura, con il file dei compensi dei collaboratori.

**F24:**
1. Ricevere l'importo totale del versamento F24 del mese
2. Inserire il valore nel campo apposito della sezione F24
3. Selezionare il mese → confermare

> **Deduplicazione stipendi:** Re-importare lo stesso mese (ad esempio se è arrivata una correzione) sovrascrive le righe precedenti senza duplicare. Il sistema usa il pattern nome+mese come chiave univoca.

---

## 5. Staff e collaboratori (`/staff`)

**Chi:** Orianna, con cadenza mensile.

La sezione Staff gestisce il ciclo mensile dei pagamenti di stipendi e collaboratori per ogni società.

**Visualizzazione:**
- Selettore società in alto
- Navigatore mese (mese precedente / corrente / successivo)
- Lista di tutti i dipendenti e collaboratori del mese con importo e stato (da pagare / pagato / annullato)
- Sezione F24 separata

**Funzioni principali:**
- **Modal Paga**: cliccare su una riga per aprire il modale di pagamento, confermare che è stato eseguito il bonifico
- **Badge stato**: verde = pagato, giallo = da pagare, grigio = annullato
- La lista viene popolata automaticamente dall'import effettuato in `/impegni` → Tab Stipendi

---

## 6. Tesoreria 30 giorni (`/treasury`)

**Chi:** Marco e Orianna, ogni mattina o quando serve una decisione di pagamento.

La Tesoreria è il cuore del sistema: mostra il saldo di cassa proiettato giorno per giorno per i prossimi 30 giorni.

### Come viene costruita la proiezione

Per ogni giorno nei prossimi 30 giorni il sistema calcola:
- **Incassi certi**: settlement dei canali già registrati in Operations (Stripe previsto giovedì, SumUp previsto lunedì, ecc.)
- **Incassi previsti**: quota giornaliera del forecast mensile, distribuita secondo il pattern configurato (subscription = algoritmo DOW+DOM, che è il più accurato)
- **Uscite**: somma di tutte le scadenze del giorno (sia contabili che impegni manuali, ricorrenti, stipendi)
- **Saldo finale**: saldo del giorno precedente + entrate − uscite

### Come leggere la Timeline

Ogni riga = un giorno. Colori:
- **Verde**: saldo sopra la soglia minima configurata per la società
- **Rosso**: saldo sotto la soglia minima → attenzione, rischio liquidità

Cliccare su una riga per espandere il dettaglio: elenco delle uscite del giorno con fornitore, importo, se critico (punto rosso).

### Alert automatici

In cima alla pagina appaiono:
- Quanti giorni nei prossimi 30 hanno il saldo sotto soglia
- Quanti pagamenti critici scadono entro 7 giorni

### Vista singola vs consolidata

- **Consolidata** (default): somma tutte e quattro le società come un unico flusso. Utile per la visione di gruppo.
- **Singola**: una sola società, con il suo conto bancario come punto di partenza. Usare questa per valutare la liquidità specifica.

### Tab Pagamenti

Lista dettagliata di tutte le uscite previste nei prossimi 60 giorni, con:
- Filtri per priorità, categoria, stato, fornitore
- Possibilità di modificare priorità inline

---

## 7. Previsione 6 mesi (`/forecast`)

**Chi:** Marco, una volta al mese (inizio mese o quando cambia lo scenario commerciale).

La Previsione mostra il cashflow mensile su un orizzonte di 6 mesi.

### Struttura della vista

Per ogni mese una riga con:
- **Incassi previsti**: valore editabile (inserito da Marco basandosi sulle aspettative commerciali)
- **Uscite previste**: calcolate automaticamente da scadenzario + impegni + template generati
- **Saldo netto**: differenza incassi − uscite del mese
- **Saldo finale**: saldo cumulativo a fine mese (partendo dal saldo bancario attuale)

### Come aggiornare il forecast mensile

1. Andare su `/forecast` → Vista **Singola** → selezionare la società
2. Cliccare sul valore "Incassi previsti" del mese da modificare
3. Digitare il nuovo valore e premere Invio (o uscire dal campo)
4. Il sistema aggiorna istantaneamente il calcolo di tutti i mesi successivi

> **In vista consolidata i valori non sono editabili.** Usare sempre vista singola per aggiornare.

### Come interpretare i risultati

- Saldo finale **verde**: il mese chiude positivo rispetto alla soglia
- Saldo finale **rosso**: il mese chiude in deficit → verificare se ci sono entrate straordinarie attese, uscite posticipabili, o se serve un'azione correttiva

---

## 8. Pagamenti operativi (`/payments`)

**Chi:** Orianna, ogni giorno (parte del controllo mattutino).

La sezione Pagamenti è lo strumento operativo per controllare ed eseguire i pagamenti. È divisa in tre sezioni:

### Sezione Scaduto (< oggi, non pagati)

Tutto ciò che andava pagato nei 30 giorni precedenti e non è ancora marcato come pagato. Orianna deve gestire queste voci giornalmente.

**Azioni disponibili per ogni riga:**
- **Paga** → marca come pagato con data odierna
- **Posticipa** → inserire nuova data (il pagamento si sposta nella sezione "Prossimi")
- **Pagamento parziale** → inserire l'importo effettivamente pagato; il sistema marca la riga come parzialmente pagata e crea automaticamente una nuova riga per il residuo

### Sezione Oggi

Pagamenti con scadenza odierna. Stesse azioni dello scaduto.

### Sezione Prossimi 15 giorni

Pagamenti in scadenza nei prossimi 15 giorni. Utile per pianificare in anticipo e verificare la copertura in Tesoreria.

### Pagamento urgente

Il pulsante **"+ Urgente"** permette di inserire un pagamento non ancora in contabilità che va eseguito subito (es. Orianna fa un bonifico urgente per una situazione imprevedibile). Questo pagamento viene registrato immediatamente e impatta il calcolo di Tesoreria.

---

## 9. Intercompany (`/intercompany`)

**Chi:** Marco, Maurizio — quando serve gestire partite tra società del gruppo.

Gestisce i crediti/debiti tra WT, APPIAE, HANGAR e ARIES:
- Inserimento partita (società creditrice, società debitrice, importo, causale, data)
- Calcolo del saldo netto tra coppie di società (netting)
- Storico delle operazioni

---

## 10. Segnalazioni interne (`/reports`)

**Chi:** Tutti gli utenti, quando si riscontra un problema o un'anomalia.

**Creare una segnalazione:**
1. Cliccare l'icona segnalazione nella sidebar o nella sezione Reports
2. Compilare: tipo (anomalia/urgente/informazione/altro), descrizione dettagliata
3. Inviare → viene recapitata via email ai destinatari configurati

**Gestione:**
- Le segnalazioni aperte appaiono con un badge rosso nella sidebar
- Flusso stati: **aperta** → **in corso** (presa in carico) → **risolta** / **scartata**
- Si può riaprire una segnalazione risolta
- Selezione multipla per eliminazione bulk

---

## 11. Impostazioni (`/settings`)

**Chi:** Marco, raramente.

### Conti bancari
Per ogni società, inserire il conto bancario con il **saldo attuale**. Questo saldo è il punto di partenza per tutti i calcoli di Tesoreria e Forecast.

**Quando aggiornare:** ogni volta che si riceve l'estratto conto mensile, oppure dopo operazioni significative (bonifici importanti in entrata o in uscita che non sono ancora tracciati nel sistema).

### Canali incasso
Per ogni società e ogni canale, configurare:
- Commissione percentuale (es. Stripe: 1,4%)
- Commissione fissa per transazione (es. 0,25€)
- Giorni di payout (es. Stripe: 2 giorni lavorativi)
- Giorno fisso della settimana (es. SumUp accredita il martedì)

### Soglia minima cassa
Per ogni società, impostare il saldo minimo sotto il quale la Tesoreria segnala un alert.

---

## 12. Routine operative

### Ogni mattina (Orianna)

1. **Dashboard** → leggere i pagamenti di oggi e lo stato degli scaduti
2. **Payments** → gestire l'elenco scaduto: pagare, posticipare o fare pagamento parziale
3. **Operations** → registrare gli incassi del giorno precedente (dati dai terminali/gateway)
4. **Treasury** → verificare la proiezione 30gg: ci sono giorni in rosso nei prossimi 7 giorni?

Tempo stimato: 20–30 minuti.

---

### Ogni lunedì (Orianna)

1. **Schedule** → importare il file XLS settimanale aggiornato dalla contabilità
   - Verificare l'anteprima diff
   - Gestire eventuali duplicati con impegni (sezione arancione)
   - Confermare l'import
2. **Impegni** → inserire eventuali nuove spese manuali emerse durante la settimana (spese previste non ancora in contabilità)
3. **Treasury** → rileggere la proiezione 30gg con i nuovi dati dello scadenzario

---

### Giorni 8–10 del mese (Orianna)

1. **Impegni → Tab Stipendi** → importare i file degli importi reali:
   - File dipendenti (dal consulente del lavoro)
   - File collaboratori
   - F24 (importo unico)
2. **Staff** → verificare che tutte le righe siano state importate correttamente, procedere ai pagamenti dalla tab Staff
3. **Impegni → Tab Impegni** → verificare che gli impegni stimati precedentemente inseriti per stipendi siano stati annullati (il sistema li marca automaticamente se erano stati generati da template)

---

### Inizio mese (Orianna, entro il giorno 3)

1. **Impegni → Tab Template** → generare il mese corrente per tutti i template attivi
2. Verificare gli importi generati (se una bolletta del mese scorso è arrivata con importo diverso dall'atteso, aggiornare il template per il futuro)

---

### Inizio mese (Marco, entro il giorno 5)

1. **Forecast → Vista Singola** → aggiornare le previsioni di incasso per i mesi futuri se lo scenario commerciale è cambiato
2. **Settings → Conti bancari** → aggiornare i saldi con i dati degli estratti conto del mese precedente
3. **Treasury** → leggere la proiezione consolidata del nuovo mese: ci sono tensioni di liquidità da pianificare?
4. **Operations → Tab Andamento** → analizzare come è andato il mese precedente rispetto all'algoritmo: quali giorni/settimane hanno performato sopra o sotto le attese?

---

## 13. Note operative critiche

### Il doppio conteggio è il rischio principale

La Tesoreria e il Forecast sommano scadenzario + impegni. Se una spesa è presente sia come impegno manuale (inserita da Orianna prima che arrivasse la fattura) che come voce nello scadenzario (importata dall'XLS quando è arrivata la fattura), viene contata due volte.

**Come evitarlo:** durante l'import XLS, il sistema evidenzia le corrispondenze tra voci nuove e impegni aperti (stessa società, stesso importo, data entro 7 giorni). Selezionare l'annullamento degli impegni corrispondenti prima di confermare l'import. Se si notano voci duplicate in un secondo momento, annullare l'impegno manualmente dalla tab Impegni.

### I pagamenti parziali sono protetti dall'import

Quando Orianna registra un pagamento parziale (es. €500 su una fattura da €1.000), la voce originale viene marcata come pagata e viene creata automaticamente una riga residuo (€500) come impegno. Il gestionale non conosce questo pagamento parziale, quindi la settimana successiva esporta ancora la fattura originale per intero. Il sistema riconosce questa situazione e **non sovrascrive mai** la voce già pagata: nell'anteprima diff appare la sezione blu informativa, ma nessun dato viene modificato. Non è necessaria nessuna azione da parte di Orianna.

### Il saldo bancario non si aggiorna da solo

Il saldo dei conti bancari inserito in Settings è statico. Va aggiornato manualmente. Se il saldo è obsoleto, tutti i calcoli di Tesoreria e Forecast partono da un dato errato. Aggiornarlo almeno una volta al mese (con l'estratto conto) e dopo movimenti importanti.

### Il forecast mensile è il motore dell'algoritmo

Il tab Andamento in Operations e la distribuzione giornaliera in Tesoreria usano entrambi il forecast mensile inserito in Forecast. Se il valore è zero o non aggiornato, queste viste non sono affidabili. Priorità mensile di Marco: aggiornare il forecast prima di leggere la Tesoreria.

### I template generano stime, non certezze

Le righe generate dai template (bollette, canoni, ecc.) usano importi stimati basati sullo storico. Quando arriva la fattura reale con importo diverso, Orianna aggiorna la voce direttamente nella tab Impegni. Se la differenza è sistematica, aggiornare anche l'importo nel template per i mesi futuri.

### La vista consolidata esclude le partite intercompany

In Tesoreria e Forecast, la vista consolidata (tutte le società insieme) esclude automaticamente le partite intercompany (`is_intercompany = true`) per evitare doppio conteggio. I flussi interni al gruppo non impattano il cash flow consolidato.

---

## 14. Glossario

| Termine | Significato |
|---|---|
| **Accounting** | Voce contabile importata dallo scadenzario XLS |
| **Commitment** | Impegno: spesa futura inserita manualmente o generata da template |
| **Settlement** | Data in cui un incasso tramite canale digitale (es. Stripe) è effettivamente disponibile sul conto |
| **DOW** | Day Of Week — giorno della settimana (moltiplicatore algoritmo incassi) |
| **DOM** | Day Of Month — giorno del mese (moltiplicatore algoritmo incassi) |
| **Forecast** | Previsione di incasso mensile inserita manualmente da Marco |
| **Dedup key** | Chiave univoca che impedisce la creazione di righe duplicate durante l'import |
| **Template** | Spesa ricorrente configurata una volta e generata automaticamente ogni mese |
| **F24** | Versamento fiscale mensile (contributi, ritenute) — importo unico inserito da Orianna |
| **Soglia minima** | Saldo al di sotto del quale la Tesoreria segnala un alert rosso |
| **Vista consolidata** | Vista che somma tutte le società del gruppo (WT + APPIAE + HANGAR + ARIES) |

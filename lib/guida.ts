// Guida di Gestione Finanziaria (Marco, 15/10/2026).
// Fonte unica: la pagina /guida la mostra e il bot delle domande di Orianna risponderà su questo testo.
// Formato: markdown semplice (#, ##, ###, elenchi con «-» o «1.», **grassetto**, citazioni con «>»).
// Quando cambia il funzionamento del software, si aggiorna qui nello stesso giro.

export type CapitoloGuida = { slug: string; titolo: string; stato: 'completo' | 'in preparazione'; testo: string }

export const GUIDA_AGGIORNATA = '19/10/2026'

export const GUIDA: CapitoloGuida[] = [
  {
    slug: 'come-funziona',
    titolo: 'Come funziona il sistema',
    stato: 'completo',
    testo: `
# Come funziona il sistema

Gestione Finanziaria serve a una cosa: sapere **in quale decade la cassa va sotto** e decidere **chi pagare, quanto e quando**, per le quattro società (Appiae, Hangar 55, Wellness Town e Aries).

Il mese è diviso in tre **decadi**: dal 1 al 10, dall'11 al 20, dal 21 alla fine del mese.

Il lavoro è diviso in **tre fasi**, una dopo l'altra:

1. **Inserimento dei pagamenti** — tutto quello che dobbiamo pagare entra nel sistema, una volta sola, completo e corretto. Senza questa fase le altre due danno numeri sbagliati.
2. **Inserimento degli incassi** — quello che è entrato e quello che entrerà (abbonamenti, bar, affitti).
3. **Pianificazione dei pagamenti** — con uscite e incassi a posto, si decide decade per decade cosa pagare e cosa rimandare.

> Regola di fondo: **ogni uscita sta in un posto solo**. Se la stessa spesa compare due volte (per esempio come impegno e come fattura), la cassa sembra più corta di quello che è; se manca, sembra più lunga. Tutta la fase 1 è costruita per evitare i doppioni e i buchi.
`,
  },
  {
    slug: 'fase-1-pagamenti',
    titolo: 'Fase 1 — Inserimento dei pagamenti',
    stato: 'completo',
    testo: `
# Fase 1 — Inserimento dei pagamenti

## In breve

- Le uscite entrano da **due fonti**: **Scadenze** (le fatture, dallo scadenzario della contabilità) e **Impegni** (spese decise che non sono ancora fatture, o che non lo saranno mai). Un impegno è **certo** (importo e data noti) o **stimato** (sappiamo che arriverà, ma non ancora l'importo esatto): le stime sono impegni, nella scheda **Stimati** di Impegni.
- Le **scadenze non si scrivono mai a mano**: arrivano solo con l'import dello scadenzario di Spring. Se la contabilità cambia un piano di pagamento, l'import successivo lo aggiorna da solo.
- Un **impegno** ha due destini: o **diventa una fattura** (una spesa verso un fornitore) e allora va tolto quando la fattura arriva, oppure **resta impegno** fino al pagamento (stipendi, collaboratori, F24, rate di finanziamento, tasse).
- Una **stima** ha due destini: o **diventa impegno** (il personale, quando si carica il file del mese) o **diventa scadenza** (le utenze, quando arrivano le bollette). Il sistema la toglie da solo.
- Ogni spesa verso un fornitore **deve avere il fornitore**, scelto dall'elenco dello scadenzario. Se il fornitore non ha ancora fatture, si spunta **«fornitore nuovo»**.
- Le **richieste di spesa** sono il modo per chiedere una spesa: quando vengono approvate diventano impegni.
- **Ogni giorno**: impegni e richieste nuove, pagamenti fatti. **A ogni decade (6, 16, 26)**: import dello scadenzario, saldi e call di pianificazione con Marco. **Durante la decade**: pagamenti per priorità in Pagamenti della decade. **Ogni mese**: file del personale e F24, controllo delle stime.

## Le tre fonti, spiegate

### 1. Le scadenze (menu Scadenzario)

Sono le **fatture vere** registrate dalla contabilità in Spring, con la loro data di scadenza. Sono la fonte più affidabile: quando una fattura c'è, conta lei.

- Arrivano **solo con l'import** del file di Spring (report **EFLUSSISCADENZARIO**), una società alla volta.
- In Spring, **prima di esportare** si rigenerano i flussi finanziari (Generazione flussi finanziari): ogni generazione sostituisce la precedente, e se non si rigenera il file contiene dati vecchi.
- Nell'import il sistema mostra cosa è **nuovo**, cosa è **cambiato** e cosa è **sparito** dal file. Le righe sparite di solito sono fatture pagate: si spuntano quelle da segnare come pagate e si tolgono le spunte da quelle che non lo sono.
- Se la contabilità rateizza una fattura o cambia una scadenza, basta il nuovo import: le scadenze si aggiornano da sole.
- Le fatture delle **utenze** (luce, gas, acqua, telefono) e dei **fornitori trattati come personale** (gli istruttori a partita IVA) vanno nel «muro»: si pagano per intero.

### 2. Gli impegni (menu Impegni e menu Staff)

Un impegno è una **spesa già decisa** che nello scadenzario non c'è ancora. Può essere:

- **certo** — si conoscono importo e data (scheda **Certi**);
- **stimato** — l'uscita ci sarà di sicuro, ma l'importo preciso non si conosce ancora (spunta **«Importo stimato»**; vedi il punto 3).

Le uscite sono poi di due tipi, e il tipo dell'impegno dice quale:

**Passa dallo scadenzario** (arriverà una fattura):

- **Spesa verso un fornitore** — un acquisto, un lavoro, un preventivo accettato. **Diventerà una fattura.** Il fornitore è obbligatorio: si sceglie dall'elenco (sono i fornitori dello scadenzario di quella società). Se è un fornitore che non ci ha mai fatturato, si scrive il nome e si spunta **«fornitore nuovo»**.

**Non passa mai dallo scadenzario** (non arriverà nessuna fattura; si paga sempre per intero, nel muro):

- **Rata di finanziamento** — mutui, prestiti di banche o soci.
- **Tasse e tributi** — cartelle, rateizzazioni con l'Agenzia delle Entrate.
- **Assicurazione** — i premi delle polizze: la compagnia rilascia la quietanza, non la fattura. Si scrive il nome della compagnia (non serve sceglierlo dall'elenco).
- **Tesseramenti e affiliazioni** — affiliazioni e tesseramenti a enti e federazioni. Servono per il regime fiscale sportivo, quindi non si saltano.
- **Personale e F24** — non si inseriscono da qui ma dal menu **Staff** (vedi sotto).

Si inserisce con **Nuovo impegno** scegliendo il tipo. Se un impegno ha il tipo sbagliato, si apre la modifica e si cambia il tipo.

Per una spesa che si ripete (ogni mese, ogni trimestre, ogni anno) si usa la spunta **Ripeti**: si scelgono la frequenza, quante rate e **il giorno della rata** — un giorno fisso del mese (quello della prima scadenza; nei mesi più corti diventa l'ultimo giorno) oppure **l'ultimo giorno del mese**. Il sistema crea tutte le rate. Un mutuo o un finanziamento è un impegno **certo** (importo e giorno noti): si inserisce così, come «Rata di finanziamento», non come stima.

Il **personale** non si inserisce da Impegni ma dal menu **Staff**, mese per mese:

- **Dipendenti**: si carica il file **Distinta netti** (più l'eventuale file **Extra**).
- **Collaboratori**: si carica il file **Istruttori** di Athletis. Il file contiene anche gli istruttori a partita IVA: il sistema li riconosce da solo (sono quelli che mandano fatture alla società) e li segna come **P.IVA**. C'è anche il caricamento **Istruttori P.IVA** per il loro file a parte.
- **F24**: si inseriscono importo e data.

> Gli istruttori a partita IVA sono impegni che diventano fattura: quando nello scadenzario arriva la fattura di quell'istruttore per quel mese, l'impegno si spegne da solo e in Staff compare **«fattura arrivata: …»**. Da quel momento si paga la fattura, dallo Scadenzario.

### 3. Gli impegni stimati (menu Impegni, scheda Stimati)

Una stima è un **impegno**: una spesa che sappiamo che arriverà, ma di cui non conosciamo ancora l'importo esatto (le bollette, il personale prima dei file, i prodotti della piscina). Serve a non avere buchi nella previsione. Si inserisce da **Nuovo impegno** con la spunta **«Importo stimato»**:

- **una volta sola** (si sa quando, non quanto) — diventa un impegno normale con il segno **«Stimato»** e l'importo preceduto da «≈». In cassa conta come gli altri. Quando l'importo è confermato si apre la modifica e si toglie la spunta; quando arriva la fattura, l'impegno va tolto come ogni spesa verso un fornitore;
- **con «Ripeti»** — diventa una **stima mensile**, nella scheda **Stimati**: invece di data, frequenza e mesi si scelgono l'importo al mese, il riparto sulle decadi e il gruppo in Tesoreria.

Le stime mensili si vedono e si correggono nella scheda **Stimati** (una scheda per società). Ogni stima ha:

- **la società**;
- **l'importo al mese**;
- **come si divide fra le decadi**: un terzo per decade, tutto nella 1ª, nella 2ª o nella 3ª decade, oppure le tre percentuali scritte a mano;
- **il gruppo**:
  - **Muro** — si paga sempre per intero, prima dei fornitori (personale, F24, utenze, rate, tributi, assicurazioni, tesseramenti e affiliazioni);
  - **Automatico** — parte da solo dalla banca (mutuo, commissioni, addebiti diretti);
  - **Fornitori** — fatture che arriveranno e che si possono ridurre quando la cassa è stretta;
- **il fornitore**, quando la stima riguarda un fornitore preciso (per esempio Forini per la luce e il gas).

Come la stima si trasforma, senza doppioni:

- **Stima con un fornitore** — le fatture vere di quel fornitore (anche già pagate) **consumano** la stima nella loro decade. Se le fatture superano la stima, il sistema lo segnala.
- **Stima del personale e degli F24** — quando in Staff si carica il **file definitivo del mese**, la stima **diventa gli impegni del file e sparisce tutta**, anche se il file dice meno della stima. In Tesoreria si legge «diventata impegni: X € dal file, stima Y €».
- **Pagata su pro forma** — alcuni fornitori si pagano prima, su pro forma, e la fattura vera poi non passa dallo scadenzario. In quel caso, sulla riga della stima si usa **«Pagata pro forma»**: si registra il pagamento e la stima si consuma per quella decade.

### 4. Le richieste di spesa (menu Richieste)

Chi ha bisogno di spendere inserisce una **richiesta**: società, fornitore, cosa si chiede, importo, data prevista, chi la chiede. Finché è «in attesa» **non pesa sulla cassa**: la Tesoreria la mostra a parte.

- **Approvata** → diventa da sola un **impegno** del tipo «spesa verso un fornitore».
- **Respinta** → resta nello storico con la nota.
- Le richieste di spese **extra** si portano a Marco prima di approvarle.

## Come il sistema evita i doppioni

- **Fattura nello scadenzario** → conta sempre la fattura.
- **Impegno «spesa verso un fornitore»** → conta finché non arriva la fattura; quando arriva, l'impegno va tolto. Oggi accanto all'impegno compare **«Già in scadenzario»** con il pulsante **«Annulla duplicato»** quando nello scadenzario c'è una fattura con lo stesso importo vicina di data. A breve il sistema proporrà la fattura dello **stesso fornitore** e basterà un clic per confermare: per questo il fornitore è obbligatorio.
- **Impegno P.IVA** (Staff) → si spegne da solo quando arriva la fattura dell'istruttore.
- **Stima con fornitore** → consumata dalle fatture di quel fornitore.
- **Stima del personale e F24** → sostituita dal file del mese.
- **Richiesta** → conta solo quando è approvata (diventa impegno).
- **Partite fra le nostre società** (infragruppo) → non contano in Tesoreria.

## I segnali da guardare

- **Senza fornitore** (rosso, in Impegni) — l'impegno non potrà essere riconosciuto quando arriva la fattura. Si apre la modifica e si sceglie il fornitore, oppure si spunta «fornitore nuovo».
- **Fornitore nuovo** (azzurro, in Impegni) — va collegato quando arriva la sua prima fattura.
- **Già in scadenzario** (arancione, in Impegni) — probabile doppione: se è la stessa spesa, **Annulla duplicato**.
- **Fattura arrivata** (in Staff, sugli istruttori P.IVA) — l'impegno non conta più: si paga la fattura.
- **Date in rosso** (in Impegni) — impegno scaduto e non pagato: o è stato pagato e va segnato, o è ancora da pagare (e allora è giusto che resti).

## Cosa fare e quando

Il calendario sta in un posto solo: la pagina **Lavoro quotidiano**, il pulsante giallo in cima al menu. Ogni giorno dice **cosa fare oggi** (con quello rimasto indietro) e **cosa non torna**. Qui sotto ci sono le regole generali; le date precise si leggono e si cambiano lì, in **Calendario dei caricamenti**.

### Ogni giorno

1. **Impegni nuovi**: ogni spesa autorizzata (anche per email, anche con importo stimato) entra in Impegni **lo stesso giorno**, con il fornitore.
2. **Pagamenti fatti**: segnarli come pagati — gli impegni con **Segna come pagato** in Impegni, il personale con **Pagato** in Staff, le fatture in **Pagamenti** (Paga, pagamento parziale, posticipo).
3. **Incassi** di Appiae e di Hangar, nel menu Incassi, per giorno di vendita (vedi la fase 2).
4. **Pro forma pagate**: registrarle in Impegni → Stimati con **Pagata pro forma**.
5. **Segnalazioni** del Lavoro quotidiano: guardarle e sistemarle.

### A ogni decade (il 6, il 16 e il 26, prima della call di pianificazione)

1. In Spring: **rigenerare i flussi finanziari**, poi esportare **EFLUSSISCADENZARIO** per Appiae, Hangar, Wellness Town e Aries.
2. In Gestione Finanziaria: **Scadenzario → Importa XLS** per ognuna delle quattro società, controllando le righe sparite (pagate sì / no).
3. **Saldi delle banche** aggiornati in Tesoreria.
4. **Affitti** arrivati con bonifico sul conto di Aries, nel menu Incassi.

> Oggi l'import si fa a ogni decade e comunque prima di pianificare i pagamenti. Si sta decidendo se farlo ogni giorno o renderlo automatico (estrazione programmata da Spring).

### Ogni mese

1. In **Staff**: **Distinta netti** (paghe), **Istruttori** (collaboratori e P.IVA, da Athletis) e **F24** di ogni società. Da quel momento la stima del personale diventa impegni.
2. In **Impegni → Stimati** e in **Incassi → Stime**: controllare che gli importi siano ancora giusti (bollette, personale, F24, e fra gli incassi il bar di Hangar e gli affitti dai contratti attivi).

### Come funziona il Lavoro quotidiano

- **Da fare oggi**: le attività del giorno e quelle rimaste indietro, con «in ritardo di N giorni». Si spunta il cerchio quando è fatta; se non è fatta, resta il giorno dopo.
- **Sabato, domenica e festivi** (compresi Pasquetta e il 29 giugno) non si lavora: un'attività che cade lì si sposta al giorno lavorativo **dopo** (per esempio l'import) o **prima** (paghe e F24, che scadono il 16).
- **Si chiudono da sole** l'import dello scadenzario, i saldi, le paghe, i collaboratori, gli F24 e gli incassi: appena il caricamento c'è, il sistema lo vede.
- Per l'import e i saldi conta solo l'ultima volta: se l'import dell'11 salta, quello del 21 lo copre.
- **Segnalazioni**: doppioni fra impegni e fatture dello stesso fornitore, stessa fattura due volte, spese senza fornitore, impegni scaduti e non pagati, date impossibili, richieste da decidere, **giorni di vendita senza incassi registrati**. Quando una cosa è giusta così, **«visto»** la toglie; ricompare solo se cambia.

### Cose che non si usano più

- In **Staff**, la riga **«Budget previsto»**: la Tesoreria non la legge. La stima del personale si mette in **Impegni → Stimati**.
- In **Impegni**, i **«Costi ricorrenti»**: non sono più fra le schede. Per una spesa che si ripete si usa **Nuovo impegno** con la spunta **Ripeti**.
- Il menu **Stime**: dal 23/10/2026 le stime delle uscite stanno in **Impegni → Stimati**, quelle degli incassi in **Incassi → Stime**.

## Domande frequenti

**Arriva la fattura di una spesa che avevo messo come impegno: cosa faccio?**
Annulli l'impegno: in Impegni compare «Già in scadenzario» con il pulsante «Annulla duplicato». Se il segnale non compare (importo diverso), annullalo con «Annulla impegno». A breve il sistema lo proporrà da solo per lo stesso fornitore.

**Il fornitore non c'è nell'elenco.**
Se non ci ha mai fatturato, scrivi il nome e spunta «fornitore nuovo». Se invece ci ha già fatturato, cercalo con un pezzo del nome: nell'elenco c'è il nome come è scritto in contabilità.

**Ho caricato i collaboratori ma la stima del personale è sparita anche se il totale è più basso.**
È giusto: il file del mese è quello definitivo e sostituisce la stima. In Tesoreria vedi «diventata impegni: X € dal file, stima Y €».

**Un istruttore a partita IVA compare sia in Staff sia nello Scadenzario.**
Se in Staff c'è scritto «fattura arrivata», l'impegno non conta più: si paga la fattura dallo Scadenzario. Se non c'è scritto, la fattura non è ancora arrivata (oppure il nome è scritto in modo diverso: segnalalo).

**Una spesa che non è mai una fattura (stipendio, F24, rata di un mutuo): dove va?**
Stipendi, collaboratori e F24 in Staff. Rate di finanziamento e tasse in Impegni, con il tipo giusto.

**Ho pagato un fornitore su pro forma.**
In Impegni → Stimati, sulla riga di quel fornitore: «Pagata pro forma», importo e data. Se il fornitore non ha una stima, inserisci un impegno «spesa verso un fornitore» e segnalo come pagato.
`,
  },
  {
    slug: 'fase-2-incassi',
    titolo: 'Fase 2 — Inserimento degli incassi',
    stato: 'completo',
    testo: `
# Fase 2 — Inserimento degli incassi

## In breve

- Gli incassi sono di due tipi: **registrati** (quelli veri) e **previsti** (Coffa e stime).
- Gli incassi **registrati** si inseriscono ogni giorno nel menu **Incassi**, per società e per canale.
- Contano alla data in cui **arrivano in banca**, non a quella della vendita: il sistema la calcola da solo.
- Quando un giorno è registrato, le previsioni di quel giorno **non contano più**: niente doppioni.
- Il controllo è il **saldo della banca**, inserito a ogni decade.

## Gli incassi registrati (menu Incassi)

Ogni giorno lavorativo si inseriscono gli incassi (quelli del sabato e della domenica il lunedì), **una riga per giorno di vendita e per canale**: lordo, numero di transazioni e note. Il sistema calcola la commissione, il netto e il giorno in cui i soldi arrivano in banca.

I canali per società:

- **Appiae**: Alma, POS, TSPay, bonifico, Stripe, contanti.
- **Hangar 55**: POS e contanti.
- **Aries**: bonifico (gli **affitti degli spazi**, che Aries incassa **per conto di Wellness Town**, perché i conti di WT sono bloccati).
- **Wellness Town**: nessun canale finché i conti sono bloccati.

Quando arrivano in banca:

- **Alma**: 7 giorni dopo la vendita.
- **POS**: il giorno dopo.
- **TSPay**: il martedì successivo.
- **Bonifico**: il giorno stesso.
- Se l'arrivo cade di **sabato o di domenica**, va al **lunedì**. Per esempio, il POS del venerdì e del sabato arriva il lunedì; l'Alma del sabato e della domenica arriva il lunedì della settimana dopo.

I giorni di ogni canale si cambiano in **Impostazioni → Canali di incasso**.

Nel **Lavoro quotidiano** ci sono tre voci, che si chiudono da sole quando gli incassi sono registrati:

- **Registra gli incassi di Appiae**: ogni giorno lavorativo;
- **Registra gli incassi di Hangar**: ogni giorno lavorativo;
- **Registra i bonifici degli affitti (Aries)**: a ogni decade (il 6, il 16 e il 26), prima della call di pianificazione.

C'è anche una segnalazione, **«Giorni di vendita senza incassi registrati»**: un giorno saltato in mezzo agli altri. È importante, perché la Tesoreria considera coperti tutti i giorni fino all'ultimo registrato, e quel giorno sparirebbe dalla cassa. Se quel giorno eravamo chiusi, si segna **«visto»**.

> Non serve più spuntare gli incassi come «accreditati»: la Tesoreria li conta alla data di arrivo prevista. Se un canale arriva in giorni diversi da quelli scritti, lo si vede dallo scarto con il saldo della banca (vedi sotto).

### I contanti

- **Appiae**: i contanti restano in cassa per le spese piccole e **non contano** in Tesoreria. Si registrano lo stesso, perché dicono quanto si è venduto.
- **Hangar 55**: i contanti **contano**, perché si versano in banca quando se ne accumulano un po'. Se con i contanti si paga una fattura, il pagamento va **registrato con la data vera**, così il sistema lo toglie.
- Si decide canale per canale in **Impostazioni → Canali di incasso**, con la casella **«Contano in Tesoreria»** sul canale Contanti.

## Gli incassi previsti

### Coffa (Appiae)

Coffa manda ogni giorno la previsione degli incassi di Appiae: rinnovi, Scuole dello Sport, vendite nuove e la domanda che deve ancora arrivare. Coffa vede **solo il venduto commerciale di Appiae**: non vede il bar, gli affitti, i distributori.

La previsione di Coffa conta solo per i giorni **dopo l'ultimo incasso registrato, più 5 giorni** (il tempo medio fra vendita e arrivo in banca). I giorni prima sono già coperti dalle righe vere.

Se Coffa non manda i dati, resta la stima di riserva «Incassi abbonamenti (Coffa)» in Incassi → Stime.

### Le stime degli incassi (menu Incassi, scheda Stime)

Per gli incassi che Coffa non vede si usa una stima, con l'importo al mese e come si divide fra le decadi:

- **Bar di Hangar 55**: stima mensile.
- **Affitti degli spazi** (su Aries): la stima si fa **sulla base dei contratti attivi** e si aggiorna quando un contratto comincia o finisce.

Una stima di incasso **non conta per i giorni già coperti** dal saldo della banca o dagli incassi registrati di quella società: conta solo per i giorni che mancano.

## Come il sistema evita i doppioni

- **Incasso registrato** → conta sempre, alla data di arrivo in banca.
- **Coffa** → conta solo dopo l'ultimo giorno registrato + 5.
- **Stima di incasso** → conta solo per i giorni non ancora registrati.
- **Saldo della banca** → contiene già tutto quello che è arrivato fino alla sua data: gli incassi arrivati prima non si contano di nuovo.

## Il controllo: il saldo della banca

A ogni decade (il 6, il 16 e il 26, prima della call di pianificazione) si inserisce il **saldo vero** di ogni conto, con la data. La Tesoreria parte dal **saldo calcolato**: saldo della banca + incassi registrati arrivati dopo − pagamenti registrati dopo.

Se al saldo successivo il saldo vero e quello calcolato non tornano, c'è un movimento non registrato: un incasso dimenticato, un pagamento non segnato, un canale che arriva in giorni diversi, contanti versati. Si cerca e si sistema.

## Domande frequenti

**Ho registrato un incasso con la data sbagliata. Cosa faccio?**
Si cancella la riga e si inserisce di nuovo: la data di arrivo in banca si ricalcola.

**Un incasso è arrivato in banca in un giorno diverso da quello previsto. Devo correggerlo?**
No. Se succede sempre per lo stesso canale, si cambiano i giorni del canale in Impostazioni; il saldo della banca a ogni decade rimette le cose a posto.

**Perché gli affitti stanno su Aries e non su Wellness Town?**
Perché i conti di Wellness Town sono bloccati e gli affitti arrivano sul conto di Aries. La Tesoreria guarda dove stanno i soldi.
`,
  },
  {
    slug: 'fase-3-pianificazione',
    titolo: 'Fase 3 — Pianificazione dei pagamenti',
    stato: 'completo',
    testo: `
# Fase 3 — Pianificazione dei pagamenti

## In breve

- Le uscite sono **scadenze** (dallo scadenzario) o **impegni** (spese decise, personale, F24, rate, tributi; le **stime** sono impegni di cui non si conosce ancora l'importo).
- Si dividono in quattro gruppi: **muro** (si paga sempre e tutto), **automatiche** (escono da sole dalla banca), **fornitori** (si decide chi e quanto), **arretrato** (si decide creditore per creditore).
- Ogni decade si pianifica **prima che cominci**, in una call fra Marco e Orianna: il **6** per la decade 11-20, il **16** per il 21-fine mese, il **26** per l'1-10 del mese dopo. Se il giorno cade di sabato o di domenica, la call è il lunedì; se è festivo, il primo giorno lavorativo dopo.
- Durante la decade Orianna paga **per priorità** e registra ogni pagamento in **Pagamenti della decade**.
- La schermata mostra se il piano è stato rispettato: pagato, da pagare, scoperto, **fuori piano**.

## Il giorno della pianificazione (6, 16, 26)

**Prima della call**, la mattina:

1. **Import dello scadenzario** delle quattro società (in Spring: rigenerare i flussi finanziari, poi esportare EFLUSSISCADENZARIO).
2. **Saldi delle banche** di tutti i conti, con la data.
3. **Affitti** arrivati sul conto di Aries, nel menu Incassi.

**In call**, nel menu **Pagamenti della decade** (la decade da pianificare è già selezionata):

1. **Crea il piano della decade**: compare l'elenco dei fornitori sopra 300 € che hanno qualcosa da pagare entro la fine della decade.
2. **Il conto della decade**, blocco per blocco, nell'ordine **Hangar → WT e Aries → Appiae**: saldo a inizio decade + incassi previsti − quello che si paga per intero − soglia minima = **spazio per i fornitori**.
3. **Provviste**: se Hangar o WT non ce la fanno (c'è un **fabbisogno**), si crea la **provvista da Appiae**: ad Hangar, oppure **ad Aries** per WT (i conti di WT sono bloccati, Aries paga per WT). L'importo suggerito è quello che manca per restare sopra la soglia. Se un blocco ha cassa in più, può **restituire** ad Appiae. Appiae si guarda per ultima, perché le provviste sono sue uscite.
4. **Fornitori**: per ognuno si scrive **quanto paghiamo** (zero, una parte o tutto) e l'**ordine** di priorità. L'importo copre le fatture del fornitore **dalla più vecchia**. Accanto c'è il «riferimento»: quanto toccherebbe con la percentuale uguale per tutti.
5. **Approva il piano**. Da quel momento il cruscotto della Tesoreria usa gli importi decisi per quella decade, e così le schede «Fatture da pagare» e «Avvisi ai fornitori». Per cambiare qualcosa: «Riapri per modificare», poi di nuovo «Approva».

> Il piano congela solo le **decisioni sui fornitori e le provviste**. Muro, automatiche, F24 da recuperare, quote dell'arretrato, impegni e fatture sotto i 300 € si pagano per intero e si aggiornano da soli: le stime diventano righe vere quando arrivano i file del personale e le fatture.

## Durante la decade: pagare per priorità

L'ordine è sempre questo:

1. **Muro** (personale, utenze, F24, rate, piani di rientro, tributi, assicurazioni, tesseramenti e affiliazioni) e **provviste** fra società;
2. **automatiche** (RID, RI.BA.): escono da sole, non si fa niente;
3. **quote dell'arretrato**;
4. **fornitori**, nell'ordine deciso in call, **entro la fine della decade**.

Se gli incassi vanno peggio del previsto, si paga dall'alto finché c'è cassa: quello che resta **scoperto** torna da solo nella pianificazione successiva. Non serve una nuova call.

**Come si registra:**

- Su ogni riga c'è **Pagato**: si scrivono la **data vera** del bonifico e l'importo. È la registrazione del pagamento, non un passaggio in più: aggiorna lo scadenzario, gli impegni e il saldo calcolato.
- Per un fornitore, l'importo si registra sulle sue fatture **dalla più vecchia**.
- Per una provvista, **Fatta** con la data del giroconto.
- Se la data è uguale o precedente alla data del saldo della banca, compare un avviso: quel pagamento è già dentro il saldo e verrebbe tolto due volte.
- I pagamenti si possono registrare anche da Pagamenti, Impegni o Staff: la schermata li vede lo stesso.

## Il controllo

Nella decade in corso la schermata mostra, per ogni fornitore del piano: **✅ pagato**, **⏳ da pagare / in parte**, **🔴 scoperto** (decade finita e non pagato tutto), **⚠️ oltre il deciso**.

**Fuori piano**: un pagamento a un fornitore che nel piano non c'è (da 300 € in su), o la parte pagata oltre l'importo deciso. È il caso delle richieste di pagamento in più: **non si fa senza parlarne con Marco**.

In fondo c'è l'elenco di tutti i pagamenti registrati nella decade.

## Le provviste fra società

- La provvista è una **uscita di Appiae** con la stessa priorità del muro e un **incasso** per chi la riceve. Nel totale del gruppo si annulla: è un giroconto.
- Finché non è fatta, sta nel cruscotto nella decade della sua data. Fatta, entra nel saldo calcolato delle due società.
- La schermata tiene il conto di quanto ogni società **deve ad Appiae** per le provviste ricevute, al netto delle restituzioni.

## Domande frequenti

**Un fornitore nuovo ha mandato una fattura dopo la call. Cosa faccio?**
Se il piano è in bozza, «Aggiorna l'elenco dei fornitori». Se è approvato, si riapre, si aggiorna, si decide e si riapprova; se non è urgente, entra nella pianificazione successiva.

**Ho pagato un fornitore che non era nel piano.**
Compare fra i **fuori piano**. Va detto a Marco.

**Perché le fatture sotto i 300 € non sono fra i fornitori da decidere?**
Perché si pagano sempre per intero (regola del 07/09): un acconto piccolo costa più in gestione di quanto pesi in cassa.
`,
  },
]

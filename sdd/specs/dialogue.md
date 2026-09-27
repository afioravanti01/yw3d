# Dialogo (DIALOG)

Spec viva: il giocatore parla con i personaggi: messaggi, console, comprensione. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### DIALOG-001 — Il giocatore parla
*Introdotto in F06 · ultima modifica: F07 (emendamento A7.5).*
- **a** `[e2e]` Il giocatore scrive dalla console dei messaggi (DIALOG-005). Le viste che guardano leggono la console ma non scrivono.
- **b** `[unit]` Un messaggio senza destinatario (1–500 caratteri) è detto ad alta voce: lo sentono i personaggi entro 16 blocchi, come le frasi dei personaggi (PROTO-002.b). Un messaggio con `@` arriva al personaggio indicato solo se è entro 16 blocchi dal giocatore, e lo sentono anche gli altri personaggi vicini; altrimenti non parte e la console risponde «Personaggio non in prossimità».
- **c** `[unit]` Il destinatario è solo quello indicato con `@` (DIALOG-005.d).
- **d** `[manuale]` La frase del giocatore compare in un fumetto sopra la sua figura, visibile in terza persona e dalle viste che guardano (CHAR-002.c).

### DIALOG-002 — Registro delle conversazioni
*Introdotto in F06 · ultima modifica: F07.*
- **a** `[e2e]` Il registro delle conversazioni è la console dei messaggi (DIALOG-005.a): contiene tutti i messaggi del mondo, a qualunque distanza dal giocatore. I messaggi del giocatore compaiono come «Tu» nella vista che guida e con il suo nome nelle viste che guardano.

### DIALOG-003 — Comprensione delle frasi
*Introdotto in F06 · ultima modifica: F07.*
Regole deterministiche, senza LLM, applicate dall'host a ogni frase: il risultato arriva ai controllori e ai programmi Python con l'evento della frase (PROTO-002.b).
- **a** `[unit]` Una frase nomina un elemento della mappa se ne contiene l'id o il nome come parole intere, ignorando maiuscole, accenti e punteggiatura. Una corrispondenza contenuta in una più lunga non conta: con gli elementi «Casa» e «Casa del fabbro», «vai alla casa del fabbro» nomina solo il secondo.
- **b** `[unit]` Una risposta che attende un elemento è capita se la frase nomina esattamente un elemento; se non ne nomina nessuno o più di uno, non è capita.
- **c** `[unit]` Una risposta sì/no è capita se contiene parole di assenso o di diniego, in italiano o in inglese, ma non di entrambi i tipi (Q5). Una risposta a opzioni è capita se nomina esattamente una delle opzioni dichiarate, con le regole di a.
- **d** `[unit]` Stessa frase e stessa mappa danno sempre la stessa interpretazione.
- **e** `[unit]` L'evento di una frase riporta anche se la frase è un sì o un no secondo le regole di c.

### DIALOG-004 — Console dell'host
*Introdotto in F06 · ultima modifica: F07 (emendamento A7.2).*
- **a** `[unit]` Il terminale dell'host mostra tutti i messaggi del mondo, come la console delle viste (DIALOG-005.a); i messaggi del giocatore compaiono come «Tu».
- **b** `[unit]` Una riga scritta nel terminale è un messaggio del giocatore con le regole di DIALOG-001.b e DIALOG-005.d (anche `@nome`), o un comando con quelle di DIALOG-005.f.
- **c** `[unit]` La console si attiva solo se il terminale è interattivo, e dopo l'eventuale richiesta di consenso (PROTO-005).

### DIALOG-005 — Console dei messaggi
*Introdotto in F07 · ultima modifica: F09.*
- **a** `[e2e]` Ogni vista mostra sulla destra la console: un blocco trasparente alto quanto la finestra, sempre presente, con i messaggi in alto e la casella del giocatore in basso. Contiene tutti i messaggi del mondo, dal più vecchio al più recente: chi parla, a chi (se c'è) e il testo. I messaggi sono testo libero e selezionabile, mostrato con il Markdown (grassetto, corsivo, codice, elenchi, titoli, link http e https), mai come HTML. Restano finché non si ricarica la pagina, e si scorrono.
- **b** `[e2e]` La console non ostacola il gioco: fuori dal blocco il mouse e i tasti agiscono sulla scena; l'area dei messaggi prende il mouse per scorrerli e selezionarli, la casella per scrivere.
- **c** `[e2e]` Nella vista che guida il giocatore la casella, di due righe, è sempre presente: Invio vi porta il cursore, Invio manda il messaggio, Maiusc+Invio va a capo, Esc torna al gioco. Mentre si scrive i tasti non muovono il giocatore né la visuale.
- **d** `[unit]` Un messaggio che inizia con `@` seguito dall'id o dal nome di un personaggio (maiuscole e accenti ignorati) è rivolto a quel personaggio; con nomi simili vale il più lungo che corrisponde. Un `@` che non corrisponde a nessun personaggio non parte e la console mostra l'errore con i nomi disponibili. Scrivendo `@` la console suggerisce i nomi, e Tab completa quello scelto.
- **e** `[manuale]` Scrivere a un personaggio vicino è comodo: senza puntarlo, si manda un messaggio in pochi secondi, e nessuna risposta si perde.
- **f** `[unit]` Un messaggio che inizia con `/` è un comando della console e non è detto nel mondo. `/help` descrive l'uso della console, `/time` compreso (TIME-002); `/world` si apre con l'ora del mondo e la parte del giorno, poi elenca il giocatore e i personaggi con la posizione attuale, i luoghi, le strutture e i gruppi di strutture con la loro posizione, in blocchi; `/describe @nome` mostra nome, id e descrizione di un personaggio e i suoi dati tecnici: posizione, chi lo guida (agente con modalità, cervello, modello, effort, risposte, iniziativa; programma con file; controllore con comando; nessuno), stato, azione in corso, persona e obiettivi dell'agente. La risposta di un comando è un unico blocco; un comando sconosciuto mostra un errore che rimanda a `/help`.
- **g** `[manuale]` La console si riduce a un piccolo pulsante e si riapre, come l'overlay (DEBUG-001.a); la vista ricorda la scelta. I messaggi che arrivano mentre è ridotta si contano sul pulsante.

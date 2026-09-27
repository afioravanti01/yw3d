# Dialogo (DIALOG)

Spec viva: il giocatore parla con i personaggi: frasi, registro, comprensione, console. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### DIALOG-001 — Il giocatore parla
*Introdotto in F06 · ultima modifica: F06.*
- **a** `[e2e]` Nella vista che guida il giocatore, Invio apre una casella di testo; Invio dice la frase, Esc la annulla. Mentre la casella è aperta i tasti non muovono il giocatore né la visuale. Le viste che guardano non scrivono.
- **b** `[unit]` Una frase del giocatore (1–500 caratteri) è sentita dai personaggi entro 16 blocchi, come le frasi dei personaggi (PROTO-002.b), e compare nel registro (DIALOG-002).
- **c** `[unit]` Il destinatario è il personaggio indicato con `@id` all'inizio della frase; altrimenti il personaggio guardato, cioè il più vicino al centro della visuale entro 10° e 16 blocchi; altrimenti nessuno. Con un `@id` inesistente la frase non parte e il registro mostra l'errore.
- **d** `[manuale]` La frase del giocatore compare in un fumetto sopra la sua figura, visibile in terza persona e dalle viste che guardano (CHAR-002.c).

### DIALOG-002 — Registro delle conversazioni
*Introdotto in F06 · ultima modifica: F06 (emendamento A6.2).*
- **a** `[e2e]` Ogni vista mostra il registro delle frasi che il giocatore sente, cioè dette entro 16 blocchi da lui, sue comprese, con il nome di chi parla e, se c'è, del destinatario. Le frasi del giocatore compaiono come «Tu» nella vista che guida e con il suo nome nelle viste che guardano.
- **b** `[manuale]` Il registro mostra le ultime righe senza coprire la scena; le righe vecchie sbiadiscono e tornano visibili quando la casella di testo è aperta.

### DIALOG-003 — Comprensione delle frasi
*Introdotto in F06 · ultima modifica: F06.*
Regole deterministiche, senza LLM, uguali per comportamenti e protocollo.
- **a** `[unit]` Una frase nomina un elemento della mappa se ne contiene l'id o il nome come parole intere, ignorando maiuscole, accenti e punteggiatura. Una corrispondenza contenuta in una più lunga non conta: con gli elementi «Casa» e «Casa del fabbro», «vai alla casa del fabbro» nomina solo il secondo.
- **b** `[unit]` Una risposta che attende un elemento è capita se la frase nomina esattamente un elemento; se non ne nomina nessuno o più di uno, non è capita.
- **c** `[unit]` Una risposta sì/no è capita se contiene parole di assenso o di diniego, in italiano o in inglese, ma non di entrambi i tipi (Q5). Una risposta a opzioni è capita se nomina esattamente una delle opzioni dichiarate, con le regole di a.
- **d** `[unit]` Stessa frase e stessa mappa danno sempre la stessa interpretazione.

### DIALOG-004 — Console dell'host
*Introdotto in F06 · ultima modifica: F06 (emendamento A6.2).*
- **a** `[unit]` Il terminale dell'host mostra le frasi che il giocatore sente, con il nome di chi parla e del destinatario, come il registro della vista che guida: le frasi del giocatore compaiono come «Tu» (Q6).
- **b** `[unit]` Una riga scritta nel terminale è detta dal giocatore con le regole di DIALOG-001.b; il destinatario si indica con `@id`.
- **c** `[unit]` La console si attiva solo se il terminale è interattivo, e dopo l'eventuale richiesta di consenso (PROTO-005).

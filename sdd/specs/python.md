# Personaggi in Python (PY)

Spec viva: la libreria Python per programmare i personaggi, i programmi nella cartella del mondo, esempi e guida. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### PY-001 — Libreria Python
*Introdotto in F07 · ultima modifica: F07.*
- **a** `[unit]` Un programma Python lanciato dall'host importa la libreria `yw3d` senza installare nulla: l'host la mette a disposizione del processo.
- **b** `[unit]` La libreria usa solo la libreria standard e funziona con Python 3.10 o successivo.
- **c** `[unit]` La libreria parla il protocollo dei controllori (PROTO-001, PROTO-002) al posto del programma: il programma non legge né scrive JSON.

### PY-002 — Struttura di un programma
*Introdotto in F07 · ultima modifica: F09.*
- **a** `[unit]` Un personaggio è una classe che estende quella della libreria, con una **routine** che si ripete e **gestori** per i messaggi che riceve e per gli eventi; un programma avvia la classe con una sola istruzione.
- **b** `[unit]` Le azioni di PROTO-001.b (`walk_to`, `look_at`, `say`, `follow`, `wait`, `stop`) si chiamano come funzioni da attendere, con le mete della mappa (MAP-003); terminano quando l'azione è completata. Un'azione fallita solleva un'eccezione con la causa; un'azione sostituita non solleva errori.
- **c** `[unit]` Quando arriva un messaggio, il suo gestore interrompe la routine; finito il gestore, la routine riprende dall'azione interrotta.
- **d** `[unit]` Il programma legge dalla libreria, senza chiederli: posizione e stato del personaggio, entità vicine (PROTO-002.a), la mappa del mondo con id, nomi e descrizioni (MAP-002), l'ora del mondo e la parte del giorno.
- **e** `[unit]` Un programma può fare una domanda al giocatore o a un altro personaggio e attenderne la risposta con un tempo limite: la risposta arriva come messaggio, con l'elemento della mappa nominato e il sì o no capiti secondo DIALOG-003; senza risposta entro il tempo limite la domanda restituisce nulla.

### PY-003 — Programmi nella cartella del mondo
*Introdotto in F07 · ultima modifica: F07.*
- **a** `[unit]` Un personaggio dichiara `program: <file.py>`, un percorso relativo alla cartella del mondo, in alternativa a `controller`. L'host lo lancia con l'interprete Python della macchina, con il consenso e la verifica di PROTO-005 (il comando mostrato è quello realmente eseguito).
- **b** `[unit]` Un file inesistente, fuori dalla cartella del mondo o non `.py` è un errore del file del mondo nel formato di YAML-002. Un interprete Python mancante o più vecchio di 3.10 è segnalato con il personaggio (PROTO-005.b).
- **c** `[unit]` Un'eccezione non gestita nel programma compare nel terminale con il file, la riga e il messaggio; il personaggio si ferma. Salvando il file Python il mondo si ricarica e il programma riparte (HOST-003).

### PY-004 — Esempi
*Introdotto in F07 · ultima modifica: F07 (emendamento A7.7).*
- **a** `[manuale]` Le cartelle di esempio sono in Python e si comportano come descritto nei commenti: un personaggio che fa un giro, uno che chiede al giocatore e aspetta un sì o un no, uno che risponde ai messaggi, uno che su richiesta del giocatore va da un altro personaggio, gli fa una domanda, torna e riferisce la risposta (l'altro è esperto di un argomento), e una folla di 20 personaggi con lo stesso programma.

### PY-005 — Guida ed esperienza d'uso
*Introdotto in F07 · ultima modifica: F07.*
- **a** `[manuale]` Una guida spiega la struttura di un programma, ogni azione, la mappa, i messaggi e le domande, con esempi eseguibili; contiene un template commentato da copiare nella cartella del mondo.
- **b** `[manuale]` Partendo dal template, un personaggio con un giro di tre tappe, un saluto al giocatore quando si avvicina e una risposta a una domanda si scrive in meno di 40 righe, e si rilegge a colpo d'occhio: la routine è in cima, un gestore per ogni cosa a cui reagisce.

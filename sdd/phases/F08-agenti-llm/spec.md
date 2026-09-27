# F08 — Agenti LLM

| | |
|---|---|
| Stato | **approved** (G1, 2026-09-27) |
| Versione | 0.2: domande aperte risolte |
| Data | 2026-09-27 |
| Piano | [plan.md](plan.md) |

## Obiettivo
Un personaggio si affida a un agente LLM scrivendo poche righe nel `world.yaml`, senza Python né altri programmi. L'host chiama l'LLM, con una CLI già installata sulla macchina (Claude Code, Codex, opencode) o con una chiave API (Anthropic, compatibile OpenAI). Gli dà tutto ciò che il personaggio sa del mondo ed esegue la sua risposta con le azioni dei personaggi. Il giocatore gli parla dalla console come a ogni altro personaggio.

## Contesto
- D-012 (agenti nell'host, configurati nel file del mondo, risposta strutturata, niente MCP in F08), D-011 (si parla solo con chi è vicino), costituzione v1.4: P3 (solo la fisica muove), P10 (controllori, consenso, il mondo non aspetta).
- Spec vive coinvolte: [characters.md](../../specs/characters.md), [protocol.md](../../specs/protocol.md), [map.md](../../specs/map.md), [dialogue.md](../../specs/dialogue.md), [host.md](../../specs/host.md), [debug.md](../../specs/debug.md).
- Retro di F07: le regole d'interazione si provano presto (process.md); la checklist di G3 elenca a parte le misure.

## Fuori scope
- Server MCP e agenti esterni che si collegano da fuori (D-012).
- Agenti nel browser senza host: senza host un personaggio con un agente sta fermo, come quelli con un programma.
- Un agente che scrive o modifica codice (programmi, strutture, file del mondo).
- Modalità a turni per esperimenti riproducibili.
- Funzioni dedicate agli LLM nella libreria Python: un programma Python può chiamare un LLM per conto suo.

## Storie utente
- **US-1** Come autore, trasformo un personaggio in un agente aggiungendo `agent:` al `world.yaml`, con la CLI che ho già o con una chiave API.
- **US-2** Come giocatore, chiedo a un agente «Cosa vedi?» e mi descrive quello che ha intorno, con i nomi dei posti e dei personaggi.
- **US-3** Come giocatore, chiedo alla pescatrice dove si pesca meglio: mi risponde e mi accompagna al laghetto.
- **US-4** Come giocatore, faccio a un agente una domanda che non riguarda il mondo: risponde con le sue conoscenze, restando nel personaggio.
- **US-5** Come autore, se l'LLM è lento, sbaglia o non risponde, il mondo va avanti e il terminale mi dice cosa è successo.

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### AGENT-001 — Agenti nel file del mondo
- **a** `[unit]` Un personaggio dichiara `agent:` in alternativa a `program` e `controller`, non insieme a loro. L'agente ha una modalità: `headless`, con la CLI da usare (`claude`, `codex`, `opencode`), oppure `api`, con il fornitore (`anthropic`, `openai`), un indirizzo facoltativo per i servizi compatibili con OpenAI e il nome della variabile d'ambiente con la chiave, oppure `fake`, con risposte fisse e senza LLM, per le prove (Q7). Facoltativi: modello, effort (`low`, `medium`, `high`; Q6), una persona (testo libero che si aggiunge alla descrizione del personaggio), obiettivi, iniziativa (AGENT-004). Gli errori seguono YAML-002.
- **b** `[unit]` In modalità `headless`, senza modello o effort l'host non li indica alla CLI, che usa quelli già configurati; con modello o effort li passa alla CLI nel modo che la CLI prevede. Se una CLI o un fornitore non gestisce l'effort, il terminale lo segnala e l'agente funziona senza (Q6).
- **c** `[unit]` In modalità `api` il modello è obbligatorio. La chiave si legge dalla variabile d'ambiente indicata, o da quella predefinita del fornitore (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`; Q8); se manca, il terminale lo segnala con il personaggio, che sta fermo. La chiave non compare mai nei file, nel terminale, nei messaggi alle viste.
- **d** `[unit]` Gli agenti passano dal consenso di PROTO-005: l'elenco mostra, per ogni agente, il comando della CLI o il fornitore e il modello. Una CLI che non si trova sulla macchina è segnalata con il personaggio (PROTO-005.b).

### AGENT-002 — Conoscenza del mondo
- **a** `[unit]` Ogni richiesta all'LLM contiene: chi è il personaggio (nome, descrizione, persona, obiettivi); dove si trova (posizione e luoghi o strutture in cui è); la mappa del mondo con id, nomi, tipi, descrizioni e coordinate; le entità vicine con posizione, distanza e direzione; il tempo del mondo; la conversazione recente (AGENT-005); e ciò che ha fatto scattare la richiesta.
- **b** `[unit]` I dintorni elencano gli elementi della mappa e i personaggi entro 32 blocchi (16 m; Q2), con distanza e direzione (nord, nord-est, …): abbastanza per rispondere a «Cosa vedi?».
- **c** `[manuale]` A una domanda sul mondo l'agente risponde con ciò che il mondo contiene (posti, personaggi, dove si trovano); a una domanda d'altro tipo risponde con le sue conoscenze, restando nel personaggio.

### AGENT-003 — Risposta e azioni
- **a** `[unit]` L'LLM risponde in una forma strutturata fissa: cosa dire e a chi (facoltativo), e una breve sequenza di azioni tra `walk_to`, `look_at`, `follow`, `wait`, `stop`, con mete della mappa o coordinate. L'host esegue la frase e le azioni in ordine, con le azioni dei personaggi (PROTO-001.b): valgono la fisica (P3) e le distanze di D-011.
- **b** `[unit]` Una risposta non valida, o una sua parte non valida (azione sconosciuta, meta inesistente), non ferma l'agente: la parte valida si esegue, il resto si scarta e il terminale lo riporta.
- **c** `[unit]` Una nuova richiesta che scatta mentre l'agente esegue le azioni precedenti (per esempio un nuovo messaggio) ottiene una nuova risposta, che sostituisce le azioni rimaste.

### AGENT-004 — Iniziativa
- **a** `[unit]` Con l'iniziativa `reactive` (predefinita) l'agente interroga l'LLM solo quando serve (Q1): un messaggio rivolto a lui; il giocatore che si avvicina, solo se prima era lontano da un po'; il tasto E. Le frasi dette vicino ma non rivolte a lui non fanno partire richieste. Nel resto del tempo sta al suo posto.
- **b** `[unit]` Con l'iniziativa autonoma e un intervallo, l'agente interroga l'LLM anche da solo, a quell'intervallo, quando non ha azioni in corso, perché decida cosa fare secondo i suoi obiettivi.
- **c** `[unit]` Tra agenti: un agente risponde a un altro personaggio solo se gli si rivolge; una conversazione tra due agenti senza il giocatore si ferma dopo 4 scambi di fila (Q5), finché non succede altro.

### AGENT-005 — Memoria
- **a** `[unit]` L'agente ricorda gli ultimi scambi e le ultime azioni della sessione, e li riceve a ogni richiesta (AGENT-002.a). Alla ricarica del mondo o al riavvio dell'host la memoria riparte da zero (Q3).

### AGENT-006 — Limiti e ripiego
- **a** `[unit]` Il mondo non aspetta mai un agente: le richieste all'LLM non rallentano il passo di simulazione né le altre viste.
- **b** `[unit]` Ogni agente fa una richiesta alla volta; ciò che succede nel frattempo confluisce nella richiesta successiva.
- **c** `[unit]` Una richiesta che supera il tempo limite (60 s in `headless`, 30 s in `api`; Q4), o fallisce, si abbandona: il personaggio tace, o dice la frase di ripiego se configurata, e il terminale riporta la causa.
- **d** `[unit]` Ogni agente fa al più 6 richieste al minuto (Q4); oltre, le richieste aspettano.

### AGENT-007 — Esempi e guida
- **a** `[manuale]` Una cartella d'esempio ha una pescatrice agente: le chiedo dove si pesca meglio, mi risponde e mi accompagna al laghetto; le chiedo «Cosa vedi?» e descrive i dintorni.
- **b** `[manuale]` Una guida spiega la configurazione di un agente, con un esempio per ogni modalità e ogni CLI, cosa l'agente sa del mondo, i limiti e gli errori frequenti.
- **c** `[manuale]` Un agente si dichiara in meno di 10 righe di YAML e si prova in pochi minuti.

## Requisiti MODIFICATI

### CHAR-001 — Personaggi nel file del mondo
- **Prima:** a `[unit]` […] e, facoltativo, un programma Python (PY-003) o un controllore (PROTO-003): non entrambi. c `[unit]` Un personaggio senza programma né controllore, o con il programma o il controllore fermo o assente, sta fermo.
- **Dopo:** criteri b e d invariati; a e c diventano:
- **a** `[unit]` […] e, facoltativo, un programma Python (PY-003), un controllore (PROTO-003) o un agente (AGENT-001): uno solo.
- **c** `[unit]` Un personaggio senza programma, controllore o agente, o con uno di questi fermo o assente, sta fermo.
- **Motivo:** gli agenti sono un terzo modo di guidare un personaggio.

### PROTO-005 — Consenso e verifica dei comandi
- **Prima:** a `[unit]` Prima di lanciare i comandi dei controllori l'host li elenca nel terminale e chiede il consenso […].
- **Dopo:** criteri b–c invariati; a diventa:
- **a** `[unit]` Prima di lanciare i comandi dei controllori e dei programmi, e prima di avviare gli agenti, l'host li elenca nel terminale (per gli agenti: CLI o fornitore e modello) e chiede il consenso; senza consenso i personaggi restano fermi e l'host funziona comunque. L'opzione `--allow-commands` dà il consenso senza chiederlo.
- **Motivo:** un agente lancia una CLI o usa la rete e la chiave dell'utente.

### HOST-001 — Host headless
- **Prima:** c `[unit]` Il terminale dell'host riporta: […] personaggi con il loro programma o controllore, avvio e terminazione dei programmi e dei controllori, errori dei programmi con file e riga.
- **Dopo:** criteri a e b invariati; c diventa:
- **c** `[unit]` Il terminale dell'host riporta: […] personaggi con il loro programma, controllore o agente (modalità, CLI o fornitore, modello), avvio e terminazione dei programmi e dei controllori, errori dei programmi con file e riga, richieste degli agenti fallite o scadute, parti scartate delle loro risposte.
- **Motivo:** l'autore deve capire cosa fa un agente senza aprire altri strumenti.

### DEBUG-001 — Overlay diagnostico
- **Prima:** a `[manuale]` […] per il più vicino, id, nome, controllore (tipo e stato), azione in corso e, se ha un programma, il file e lo stato […].
- **Dopo:** a `[manuale]` Come prima; se il personaggio più vicino ha un agente: modalità, CLI o fornitore, modello, stato (in attesa dell'LLM, in azione, fermo, in errore) e durata dell'ultima richiesta.
- **Motivo:** la latenza dell'LLM è la prima cosa da guardare quando un agente sembra non rispondere.

## Requisiti RIMOSSI
Nessuno.

## Domande risolte
Chiuse con l'utente il 2026-09-27, prima di G1: tutte sulla proposta.

| # | Domanda | Decisione | Effetto sulla spec |
|---|---|---|---|
| Q1 | Cosa fa scattare una richiesta in modalità `reactive` | Messaggio rivolto all'agente; giocatore che si avvicina dopo essere stato lontano; tasto E. Non le frasi dette vicino | AGENT-004.a |
| Q2 | Raggio dei dintorni | 32 blocchi (16 m), come la percezione | AGENT-002.b |
| Q3 | Memoria tra sessioni | Solo la sessione corrente | AGENT-005.a |
| Q4 | Tempo limite, frequenza, ripiego | 60 s in `headless`, 30 s in `api`; 6 richieste al minuto; silenzio salvo frase configurata | AGENT-006.c–d |
| Q5 | Conversazioni tra agenti | Al più 4 scambi di fila senza il giocatore | AGENT-004.c |
| Q6 | Valori dell'effort | `low`, `medium`, `high`; ignorato con avviso dove non esiste | AGENT-001.a–b |
| Q7 | Agente di prova senza LLM | Modalità `fake` con risposte fisse | AGENT-001.a |
| Q8 | Chiavi d'ambiente predefinite | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`; `api_key_env` per altre | AGENT-001.c |

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
| A8.1 | 2026-09-27 | AGENT-001.a, AGENT-003.a, CHAR-002.c | L'agente ha `answers: short` (predefinito, una-tre frasi) o `long`: con `long` risponde per intero quando la domanda lo chiede, fino a 2000 caratteri, che la console mostra tutti; la vignetta mostra l'inizio del testo, tagliato a una parola, e resta al più quanto una frase di 500 caratteri | Un'esperta deve poter rispondere per esteso; la vignetta resta leggibile | Utente, alla prova d'uso (richiesta diretta) |
| A8.2 | 2026-09-27 | DIALOG-005.f | Comando `/describe @nome` (anche senza `@`): mostra nome, id e descrizione del personaggio; un nome che non è di un personaggio dà l'errore con i nomi disponibili | Sapere chi è un personaggio prima di parlargli | Utente, alla prova d'uso (richiesta diretta) |
| A8.3 | 2026-09-27 | DIALOG-005.f | `/describe` mostra anche i dati tecnici: posizione; chi guida il personaggio (agente con modalità, cervello, modello, effort, risposte, iniziativa; programma con file; controllore con comando; nessuno); stato (per l'agente anche la durata dell'ultima richiesta); azione in corso; persona e obiettivi dell'agente. Nel browser senza host gli agenti e i programmi risultano fermi | yw3d è una simulazione da ispezionare, non un gioco | Utente (richiesta diretta) |
| A8.4 | 2026-09-27 | AGENT-004.a | Oltre ai messaggi rivolti all'agente, fa partire una richiesta anche la risposta di un personaggio a cui l'agente ha appena rivolto la parola (entro 60 s), anche se non è rivolta a lui | Una commissione («chiedi ad Anselmo…») si chiude anche se l'altro risponde ad alta voce o al giocatore | Proposto alla prova d'uso per far funzionare la richiesta dell'utente; da confermare |
| A8.5 | 2026-09-27 | AGENT-003.a, AGENT-004.a | La risposta dell'LLM dice anche se vuole decidere di nuovo quando le sue azioni sono finite (`continue`); in quel caso, finite le azioni (o fallita una), l'agente lo interroga ancora, con l'esito. Chi si avvicina e l'iniziativa autonoma non interrompono le azioni in corso; li interrompono i messaggi e il tasto E | Gli LLM pianificano un passo alla volta: senza, una commissione si fermava dopo il primo passo | Proposto alla prova d'uso per far funzionare la richiesta dell'utente; da confermare |
| A8.6 | 2026-09-27 | AGENT-004.c, YAML-001.a, A8.5 | Una conversazione tra agenti senza il giocatore dura al più N battute in tutto, contando le battute di entrambi; N si imposta nel file del mondo (`agents: { conversation_turns: N }`, predefinito 12) e supera il limite di 4 scambi di Q5. A ogni battuta l'agente sa quante ne restano, per chiudere il discorso in modo naturale. Quando il giocatore gli chiede di parlare con qualcuno o di chiedergli qualcosa, l'agente ci va e ci parla, senza tornare a riferire (il giocatore legge tutto nella console), salvo che il giocatore non lo chieda | L'utente vuole osservare come gli agenti si parlano: il resoconto era un doppione e i 4 scambi troppo pochi | Utente (richiesta diretta) |

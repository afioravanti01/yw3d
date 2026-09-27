# Agenti LLM (AGENT)

Spec viva: personaggi guidati da agenti LLM dichiarati nel file del mondo e guidati dall'host (D-012). Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### AGENT-001 — Agenti nel file del mondo
*Introdotto in F08 · ultima modifica: F08 (emendamento A8.1).*
- **a** `[unit]` Un personaggio dichiara `agent:` in alternativa a `program` e `controller`, non insieme a loro. L'agente ha una modalità: `headless`, con la CLI da usare (`claude`, `codex`, `opencode`), oppure `api`, con il fornitore (`anthropic`, `openai`), un indirizzo facoltativo per i servizi compatibili con OpenAI e il nome della variabile d'ambiente con la chiave, oppure `fake`, con risposte fisse e senza LLM, per le prove. Facoltativi: modello, effort (`low`, `medium`, `high`), una persona (testo libero che si aggiunge alla descrizione del personaggio), obiettivi, iniziativa (AGENT-004), una frase di ripiego, e la lunghezza delle risposte: `short` (predefinita, una-tre frasi) o `long` (risposte complete fino a 2000 caratteri). Gli errori seguono YAML-002.
- **b** `[unit]` In modalità `headless`, senza modello o effort l'host non li indica alla CLI, che usa quelli già configurati; con modello o effort li passa alla CLI nel modo che la CLI prevede. Se una CLI o un fornitore non gestisce l'effort, il terminale lo segnala e l'agente funziona senza.
- **c** `[unit]` In modalità `api` il modello è obbligatorio. La chiave si legge dalla variabile d'ambiente indicata, o da quella predefinita del fornitore (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`); se manca, il terminale lo segnala con il personaggio, che sta fermo. La chiave non compare mai nei file, nel terminale, nei messaggi alle viste.
- **d** `[unit]` Gli agenti passano dal consenso di PROTO-005: l'elenco mostra, per ogni agente, la CLI o il fornitore e il modello; gli agenti `fake` non lo chiedono. Una CLI che non si trova sulla macchina è segnalata con il personaggio (PROTO-005.b).

### AGENT-002 — Conoscenza del mondo
*Introdotto in F08 · ultima modifica: F08.*
- **a** `[unit]` Ogni richiesta all'LLM contiene: chi è il personaggio (nome, descrizione, persona, obiettivi); dove si trova (posizione e luoghi o strutture in cui è); la mappa del mondo con id, nomi, tipi, descrizioni e coordinate; le entità vicine con posizione, distanza e direzione; il tempo del mondo; la conversazione recente (AGENT-005); e ciò che ha fatto scattare la richiesta.
- **b** `[unit]` I dintorni elencano gli elementi della mappa e i personaggi entro 32 blocchi (16 m), con distanza e direzione (nord, nord-est, …): abbastanza per rispondere a «Cosa vedi?».
- **c** `[manuale]` A una domanda sul mondo l'agente risponde con ciò che il mondo contiene (posti, personaggi, dove si trovano); a una domanda d'altro tipo risponde con le sue conoscenze, restando nel personaggio.

### AGENT-003 — Risposta e azioni
*Introdotto in F08 · ultima modifica: F08 (emendamenti A8.1, A8.5).*
- **a** `[unit]` L'LLM risponde in una forma strutturata fissa: cosa dire e a chi (facoltativo), una breve sequenza di azioni tra `walk_to`, `look_at`, `follow`, `wait`, `stop`, con mete della mappa o coordinate, e se vuole decidere di nuovo quando le azioni sono finite. L'host esegue la frase e le azioni in ordine, con le azioni dei personaggi (PROTO-001.b): valgono la fisica (P3) e le distanze di D-011. Se l'LLM ha chiesto di continuare, finite le azioni (o fallita una) l'agente lo interroga ancora, con l'esito: così un compito procede per passi.
- **b** `[unit]` Una risposta non valida, o una sua parte non valida (azione sconosciuta, meta inesistente), non ferma l'agente: la parte valida si esegue, il resto si scarta e il terminale lo riporta.
- **c** `[unit]` Una nuova richiesta che scatta per un messaggio o per il tasto E mentre l'agente esegue le azioni precedenti ottiene una nuova risposta, che sostituisce le azioni rimaste; chi si avvicina e l'iniziativa autonoma non le interrompono.

### AGENT-004 — Iniziativa e conversazioni
*Introdotto in F08 · ultima modifica: F08 (emendamenti A8.4, A8.6).*
- **a** `[unit]` Con l'iniziativa `reactive` (predefinita) l'agente interroga l'LLM solo quando serve: un messaggio rivolto a lui, o la risposta di un personaggio a cui ha appena rivolto la parola (entro 60 s); il giocatore che si avvicina, solo se prima era lontano da almeno un minuto; il tasto E. Le altre frasi dette vicino non fanno partire richieste. Nel resto del tempo sta al suo posto.
- **b** `[unit]` Con l'iniziativa autonoma e un intervallo, l'agente interroga l'LLM anche da solo, a quell'intervallo, quando non ha azioni in corso, perché decida cosa fare secondo i suoi obiettivi.
- **c** `[unit]` Una conversazione tra agenti senza il giocatore dura al più le battute impostate nel file del mondo (`agents.conversation_turns`, predefinito 12), contando quelle di entrambi; a ogni battuta l'agente sa quante ne restano, per chiudere il discorso con naturalezza. Quando il giocatore interviene il conto riparte. Chiesto di parlare con qualcuno, l'agente ci va e ci parla senza tornare a riferire, salvo che il giocatore non lo chieda: il giocatore legge tutto nella console.

### AGENT-005 — Memoria
*Introdotto in F08 · ultima modifica: F08.*
- **a** `[unit]` L'agente ricorda gli ultimi scambi e le ultime azioni della sessione, e li riceve a ogni richiesta (AGENT-002.a). Alla ricarica del mondo o al riavvio dell'host la memoria riparte da zero.

### AGENT-006 — Limiti e ripiego
*Introdotto in F08 · ultima modifica: F08.*
- **a** `[unit]` Il mondo non aspetta mai un agente: le richieste all'LLM non rallentano il passo di simulazione né le altre viste.
- **b** `[unit]` Ogni agente fa una richiesta alla volta; ciò che succede nel frattempo confluisce nella richiesta successiva.
- **c** `[unit]` Una richiesta che supera il tempo limite (60 s in `headless`, 30 s in `api`), o fallisce, si abbandona: il personaggio tace, o dice la frase di ripiego se configurata, e il terminale riporta la causa.
- **d** `[unit]` Ogni agente fa al più 6 richieste al minuto; oltre, le richieste aspettano.

### AGENT-007 — Esempi e guida
*Introdotto in F08 · ultima modifica: F08.*
- **a** `[manuale]` Una cartella d'esempio ha una pescatrice agente: le chiedo dove si pesca meglio, mi risponde e mi accompagna al laghetto; le chiedo «Cosa vedi?» e descrive i dintorni.
- **b** `[manuale]` Una guida spiega la configurazione di un agente, con un esempio per ogni modalità e ogni CLI, cosa l'agente sa del mondo, i limiti e gli errori frequenti.
- **c** `[manuale]` Un agente si dichiara in meno di 10 righe di YAML e si prova in pochi minuti.

# Agenti LLM

Un personaggio può essere guidato da un **agente LLM** dichiarato nel `world.yaml`, senza scrivere programmi. L'host di yw3d chiama l'LLM quando serve, gli dà tutto ciò che il personaggio sa del mondo, ed esegue la sua risposta: cosa dire, a chi, dove andare. Il personaggio resta soggetto alla fisica del mondo come ogni altro.

Gli agenti girano solo con l'host (`yw3d <cartella>`); nel browser senza host stanno fermi.

## Il minimo

```yaml
characters:
  - id: pescatrice
    name: Marta
    description: La pescatrice del laghetto del borgo, esperta di pesci.
    at: [182, 108]
    agent: { mode: headless, cli: claude, model: sonnet }
```

Avvia il mondo, avvicinati a Marta (entro 16 blocchi, 8 m) e scrivile nella console: `@Marta dove si pesca meglio?`. L'esempio completo è [examples/agenti](../examples/agenti): Marta guidata da Codex, Anselmo il saggio da opencode, Nina dal cervello finto; nei commenti, la stessa configurazione per ogni altro cervello.

## Modalità

**`headless`: una CLI già installata sulla macchina.** Usa il tuo account della CLI, senza chiavi nel mondo.

| `cli` | Programma | Note |
|---|---|---|
| `claude` | Claude Code | risposta garantita dallo schema; senza `model` usa il modello predefinito della CLI, che può essere caro (Opus): per gli agenti conviene `sonnet` o `haiku` |
| `codex` | Codex | risposta garantita dallo schema; sandbox in sola lettura |
| `opencode` | opencode | agente `plan`, in sola lettura; l'effort non esiste come opzione: si scrive nel modello come variante (`provider/modello#high`); il modello gratuito predefinito può essere lento |

Senza `model` né `effort` valgono quelli configurati nella CLI.

**`api`: una chiamata diretta con una chiave.**

| `provider` | Servizi | Chiave predefinita |
|---|---|---|
| `anthropic` | API di Anthropic | `ANTHROPIC_API_KEY` |
| `openai` | OpenAI e i servizi compatibili: Ollama, LM Studio, OpenRouter… con `base_url` | `OPENAI_API_KEY` |

Il `model` è obbligatorio. La chiave sta **sempre** in una variabile d'ambiente, mai nel file del mondo; `api_key_env` sceglie un'altra variabile. Per Ollama in locale:

```yaml
agent:
  mode: api
  provider: openai
  base_url: http://localhost:11434/v1
  model: llama3.1
  api_key_env: OLLAMA_KEY   # Ollama non la usa, ma deve esserci: export OLLAMA_KEY=ollama
```

**`fake`: nessun LLM.** Risposte fisse: descrive ciò che vede, va dove gli si nomina un posto, altrimenti ripete. Serve a provare un mondo senza chiavi né CLI.

## Tutti i campi di `agent`

| Campo | Valori | Predefinito | Cosa fa |
|---|---|---|---|
| `mode` | `headless`, `api`, `fake` | — | da dove viene il cervello |
| `cli` | `claude`, `codex`, `opencode` | — | solo `headless` |
| `provider` | `anthropic`, `openai` | — | solo `api` |
| `base_url` | indirizzo `http(s)://…` | quello di OpenAI | solo `api` con `openai` |
| `api_key_env` | nome di variabile | vedi sopra | solo `api` |
| `model` | testo | quello della CLI | obbligatorio in `api` |
| `effort` | `low`, `medium`, `high` | quello della CLI | quanto ragiona l'LLM prima di rispondere |
| `persona` | testo | — | carattere, modo di parlare, specializzazione |
| `goals` | elenco di testi | — | cosa vuole fare, soprattutto con l'iniziativa autonoma |
| `answers` | `short`, `long` | `short` | `short`: una-tre frasi; `long`: risposte complete fino a 2000 caratteri, per intero nella console e con l'inizio nella vignetta |
| `initiative` | `reactive`, `autonomous` | `reactive` | vedi [Iniziativa](#iniziativa) |
| `every` | secondi, 10–3600 | 60 | ogni quanto decide da solo, con `autonomous` |
| `fallback` | testo | — | cosa dice se l'LLM non risponde; altrimenti tace |

La `description` del personaggio e la `persona` insieme fanno il personaggio. Per esempio Marta ha studiato biologia marina: a una domanda sui salmoni, che nel mondo non ci sono, risponde da esperta, a modo suo.

## Cosa sa l'agente

A ogni richiesta l'agente riceve:

- chi è: nome, descrizione, persona, obiettivi;
- dove si trova: coordinate e luoghi o strutture in cui è;
- i **dintorni** entro 32 blocchi (16 m): posti e personaggi con distanza e direzione; così risponde a «Cosa vedi?»;
- la **mappa** di tutto il mondo, con id, nomi, descrizioni e coordinate;
- il tempo del mondo, gli ultimi 12 eventi (ciò che ha sentito, detto e fatto), e cosa lo ha fatto pensare.

Risponde prima con ciò che il mondo contiene; per il resto, con le sue conoscenze.

## Come agisce

La risposta dell'LLM è una frase (a chi è rivolta, se a qualcuno) e fino a 5 azioni: `walk_to`, `look_at`, `follow`, `wait`, `stop`. L'host le esegue in ordine; una risposta nuova sostituisce le azioni rimaste. Una parte non valida (un'azione inventata, un posto che non esiste) si scarta e il terminale lo dice.

Le richieste del giocatore si eseguono: il carattere colora il modo di parlare, non la scelta di aiutare. Per un compito in più passi l'agente chiede di continuare: finite le azioni, decide il passo dopo. Così `@Marta vai da Anselmo e chiedigli una perla di saggezza` diventa: Marta va, chiede, Anselmo risponde; tu leggi tutto nella console.

## Iniziativa

- **`reactive`** (predefinita): l'agente pensa quando gli si rivolge un messaggio, quando preme E il giocatore vicino, e quando il giocatore arriva dopo essere stato lontano almeno un minuto. Le frasi dette intorno, ma non a lui, non lo fanno pensare.
- **`autonomous`**: in più, ogni `every` secondi, se non sta facendo niente, decide da solo cosa fare secondo i suoi `goals`.

## Conversazioni tra agenti

Gli agenti si parlano: `@Marta parla con Anselmo di come si sceglie il momento giusto per pescare`. Una conversazione tra agenti senza il giocatore dura al più 12 battute in tutto; gli agenti sanno quante ne restano e la chiudono con naturalezza. Se intervieni, il conto riparte. Il limite si cambia nel mondo:

```yaml
agents:
  conversation_turns: 20
```

## Limiti e costi

- Il mondo non aspetta mai un agente: pensa a parte, e intanto tutto continua.
- Una richiesta alla volta per agente; ciò che succede nel frattempo arriva nella richiesta successiva.
- Tempo limite: 60 s con le CLI, 30 s con le API. Poi la richiesta si abbandona: l'agente tace, o dice la frase di `fallback`.
- Al più 6 richieste al minuto per agente.
- **Ogni battuta è una richiesta all'LLM**, pagata dal tuo account o dalla tua chiave. Una commissione sono alcune richieste, una conversazione tra agenti fino a 12. Con Claude Code, `sonnet` ed effort `low` rispondono in 4–8 s; il modello predefinito (Opus) costa molto di più.

## Consenso e sicurezza

Alla prima avvio yw3d elenca gli agenti insieme ai comandi (per esempio `agent claude (sonnet, effort low)`) e chiede il consenso, ricordato per la cartella; `--allow-commands` lo dà senza chiedere. Gli agenti `fake` non lo chiedono. Le CLI girano in una cartella temporanea, fuori dal mondo, senza strumenti per leggere o modificare file.

## Vedere cosa fanno

- **Console**: tutti i messaggi, anche tra agenti lontani da te.
- **`/describe @nome`**: descrizione e dati tecnici: chi lo guida, modalità, modello, effort, risposte, iniziativa, stato, durata dell'ultima richiesta, azione in corso, posizione, persona, obiettivi.
- **`/world`**: dove sono tutti.
- **Overlay (F3)**: per il personaggio più vicino, cervello, modello, stato (`thinking`, `acting`, `idle`, `error`) e durata dell'ultima richiesta.
- **Terminale di yw3d**: avvio degli agenti, richieste fallite o scadute, parti di risposta scartate, righe `[id]`.

## Errori frequenti

- **`cannot start the agent: the CLI "codex" was not found in the PATH`**: la CLI non è installata, o il `PATH` del terminale da cui lanci `yw3d` non la contiene. Se ci sono due versioni installate, conta la prima del `PATH`.
- **`the key is missing: set ANTHROPIC_API_KEY`**: esporta la variabile prima di lanciare `yw3d`.
- **`no reply within 60 s`**: la CLI o il modello sono lenti (succede con i modelli gratuiti di opencode); prova un modello più rapido o un effort più basso.
- **`reply set aside: …`**: l'LLM ha chiesto qualcosa che il mondo non ha; il resto della risposta è stato eseguito.
- **Un `@nome` che non arriva**: il personaggio è oltre 16 blocchi («Personaggio non in prossimità»), o il nome ha più parole: scrivilo per intero, o usa l'id.
- **Dopo aver cambiato il codice di yw3d o il `world.yaml`**: il file del mondo si ricarica da solo; per il codice di yw3d riavvia l'host (Ctrl+C e di nuovo `yw3d`), ricaricare la pagina non basta.

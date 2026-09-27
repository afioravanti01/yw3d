# Costituzione di yw3d

> Principi non negoziabili del progetto. Ogni spec e ogni piano devono rispettarli.
> Si modifica solo con una decisione esplicita registrata in [decisions.md](decisions.md).

Versione: 1.4 — 2026-09-27 (D-012: agenti LLM nell'host, configurati nel file del mondo, senza MCP in F08)

## Visione

yw3d è un mondo 3D a blocchi immerso nella natura e interamente **programmabile**: lo stato iniziale del mondo (terreno, strutture, personaggi) è descritto in un file YAML, e nuovi tipi di strutture si aggiungono via codice. Il mondo è il contenitore di personaggi animati guidati da programmi scritti dall'utente, in Python come linguaggio di riferimento o in qualunque altro linguaggio, e da agenti LLM (Claude Code, Codex, opencode, oppure le API di Anthropic e compatibili con OpenAI), con cui il giocatore interagisce da una console dei messaggi. Il mondo gira in un host headless avviato da riga di comando a partire da una cartella con il YAML e gli script; il browser è una vista collegata, e per i mondi senza controllori esterni può funzionare da solo. Tutto ciò che si muove rispetta la fisica del mondo.

Non è un clone di Minecraft: grafica senza texture pixel-art, voxel più piccoli, un mondo finito e "scritto" invece che infinito e casuale, strutture con un carattere proprio.

## Principi

### P1 — Spec prima del codice
Nessun codice di prodotto senza spec e piano approvati per la fase corrente (vedi [process.md](process.md)). Il codice che contraddice la spec è un difetto, anche se "funziona meglio".

### P2 — Il core è puro, deterministico e testabile senza browser
`src/core` contiene lo stato e la logica del mondo: blocchi, generazione, fisica, personaggi, navigazione, dialogo. Non importa Three.js e non usa il DOM. Con gli stessi input (YAML, seed, sequenza di comandi) produce gli stessi risultati. Il rendering è una vista: legge il core e non lo modifica.

### P3 — La fisica è l'unica autorità sul movimento
Giocatore, personaggi scriptati e personaggi AI esprimono **intenzioni** (vai là, salta, guarda); solo il sistema fisico e di movimento cambia le posizioni. Nessuno, nemmeno un modello AI, può teletrasportare un'entità o farle attraversare un blocco solido. Unica eccezione: lo spawn iniziale dichiarato nel YAML.

### P4 — Il mondo è dichiarativo
Stesso YAML e stesso codice registrato producono lo stesso mondo iniziale. Il YAML è validato: un errore produce un messaggio che indica file, percorso del campo e causa, mai un crash o un errore silenzioso.

### P5 — Estendibilità tramite registri tipizzati
Tipi di blocco e strutture si aggiungono registrandoli tramite API tipizzate; i personaggi si programmano con programmi esterni che parlano il protocollo (P10). Aggiungere un tipo non richiede di modificare il core.

### P6 — Identità visiva propria
- Nessuna texture bitmap sui blocchi: colore per vertice da una palette naturale, con variazioni deterministiche.
- Voxel di 0,5 m.
- Luce morbida: occlusione ambientale, luce emisferica, nebbia atmosferica.

Ogni scelta grafica che avvicina il look a quello di Minecraft va motivata nella spec.

### P7 — Tracciabilità
Ogni requisito ha un ID stabile (`AREA-NNN`) e criteri di accettazione (`AREA-NNN.x`). Ogni task cita i requisiti che implementa; ogni test automatico cita nel titolo i criteri che verifica. `npm run sdd:trace` deve essere verde alla chiusura di una fase.

### P8 — Segreti fuori dal client
Chiavi API e credenziali non finiscono mai nel codice eseguito dal browser né nel repository.

### P9 — Semplicità
Nuove dipendenze solo se motivate nel piano. Codice semplice e leggibile prima delle ottimizzazioni; le ottimizzazioni sono guidate dai requisiti di prestazione della spec.

### P10 — Personaggi guidati da controllori esterni
Un personaggio può essere guidato da qualunque programma che parli il protocollo del mondo: script in qualunque linguaggio, client di rete, agenti LLM. Il controllore riceve percezioni e invia azioni di alto livello; l'host le traduce in intenzioni per la fisica (P3) e resta l'autorità sullo stato. Il mondo non aspetta i controllori, e un controllore lento o bloccato non lo rallenta. I comandi dichiarati in una cartella del mondo si eseguono solo con il consenso dell'utente (D-008).

## Stack tecnologico

| Ambito | Scelta |
|---|---|
| Linguaggio | TypeScript (strict) |
| Runtime | Browser moderno (Chrome, Edge, Firefox recenti); Node.js ≥ 20 per tool, test e backend |
| Build e dev server | Vite |
| Rendering | Three.js (WebGL2) |
| Test unitari | Vitest, ambiente Node (headless) |
| Test end-to-end | Playwright (Chromium) |
| Formato del mondo | YAML (da F02) |
| Host | Processo Node headless, avviato con `yw3d <cartella del mondo>` (da F04) |
| Protocollo dei controllori | Un modello di messaggi su due canali: JSON a righe su stdio, WebSocket (da F05); un server MCP resta possibile più avanti (D-012) |
| Agenti LLM | Nell'host, configurati nel file del mondo: CLI della macchina in modalità headless (Claude Code, Codex, opencode) o API di Anthropic e compatibili con OpenAI (da F08; D-012) |

Motivazioni in [decisions.md](decisions.md) (D-001, D-008, D-009).

## Qualità
- `npm run check` (typecheck, lint, test unitari) è verde alla fine di ogni task.
- Le prestazioni sono requisiti: ogni spec che tocca rendering o simulazione dichiara budget misurabili.

## Convenzioni
- Documentazione (spec, piani, retro) in italiano. Codice, identificatori, commenti nel codice e messaggi di commit in inglese.
- 1 blocco = 0,5 m. Nelle API del core le coordinate sono in blocchi, salvo indicazione esplicita.
- Assi: y verso l'alto, x verso est, z verso sud (sistema destrorso, come Three.js).

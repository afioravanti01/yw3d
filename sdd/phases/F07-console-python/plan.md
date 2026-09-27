# F07 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-27) |
| Versione | 0.1 |
| Spec | [spec.md](spec.md) v0.2 |
| Data | 2026-09-27 |

## Panoramica
La fase toglie più codice di quanto ne aggiunga. Prima si rimuove il linguaggio dei comportamenti (`src/core/behaviors`, circa 2500 righe e 1200 di test) e tutto ciò che lo collega a composizione, simulazione, host e viste: la `Simulation` di F06 resta, ma diventa fisica, giocatore, personaggi e dialogo.

Il **dialogo** cambia regola: il destinatario è solo quello scritto con `@`, per id o per nome, e il messaggio gli arriva a qualunque distanza; ogni messaggio del mondo va a tutte le viste e al terminale. Destinatari, suggerimenti e comandi `/` stanno nel core, così la console del browser e quella del terminale si comportano allo stesso modo.

La **console dei messaggi** sostituisce casella e registro di `chat.ts`. I **programmi Python** sono controllori stdio che l'host lancia con l'interprete della macchina e con la libreria `yw3d` sul percorso di importazione. La libreria traduce il protocollo in una classe con routine e gestori, su `asyncio`, e non richiede installazione.

Il primo task è lo strumento di commit chiesto dalla retro di F06. A metà fase, prima di completare la libreria, gli esempi e la guida, c'è la **prova d'uso**: l'utente scrive un personaggio vero con la bozza del template (process.md).

## Struttura del codice

```
scripts/commit.ts                   commit solo con `npm run check` verde
src/
├─ core/
│  ├─ behaviors/                    rimosso
│  ├─ yaml/worldFile.ts             `program`; errore per `behaviors` e `behavior`
│  ├─ compose/composeWorld.ts       senza comportamenti né lettore di file esterni
│  ├─ dialogue/
│  │  ├─ understand.ts              + sì/no nell'evento (DIALOG-003.e)
│  │  ├─ address.ts                 `@` per id o nome, il più lungo, suggerimenti
│  │  └─ commands.ts                comandi `/`: solo `/help`
│  ├─ agents/agentWorld.ts          frasi a distanza, eventi di sospensione e ripresa
│  └─ sim/simulation.ts             senza comportamenti; tutti i messaggi ai listener
├─ protocol/controller.ts           versione 3
├─ host/
│  ├─ python.ts                     interprete, versione, comando, PYTHONPATH
│  ├─ session.ts                    programmi e controllori; stato dei programmi
│  ├─ console.ts                    tutti i messaggi, `@nome`, `/help`
│  └─ watch.ts                      ricarica anche per i `.py`
└─ app/
   ├─ messageConsole.ts             console dei messaggi (al posto di chat.ts)
   ├─ localSimulation.ts            senza comportamenti: personaggi fermi
   └─ main.ts, overlay              programma e suo stato nell'overlay
python/
├─ yw3d/                            libreria: __init__, protocol, character, world
└─ tests/                           test della libreria (unittest)
examples/valle, examples/folla      personaggi in Python; examples/paese rimosso
docs/python.md                      guida con il template; docs/comportamenti.md rimosso
```

## Decisioni tecniche

| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | **Strumento di commit**: `npm run commit -- -m "…"` esegue `npm run check` e, solo con codice di uscita 0, `git commit` con gli stessi argomenti; altrimenti stampa la coda dell'output e si ferma | Hook `pre-commit` di git | Un hook scatta anche sui commit di spec e documenti e si aggira con `--no-verify`; lo script è esplicito e si usa a fine task (retro F06, proposta 3) |
| P2 | Rimozione **completa** dei comportamenti: codice, test, esempi, e2e, guida, PERF-006. Anche il lettore di file esterni (F06 P14) e i testi dei file nel messaggio del mondo, che servivano solo ai comportamenti. `insideFolder` passa all'host | Lasciare il codice spento | D-010; codice morto da mantenere e da testare |
| P3 | **Destinatario** (`address.ts`): dopo `@` si confrontano id e nomi dei personaggi con la normalizzazione di DIALOG-003 (minuscole, senza accenti, parole intere); vince la corrispondenza con più parole, a parità l'id. `suggest(prefisso)` restituisce i personaggi il cui id o nome inizia con il prefisso, in ordine alfabetico | Solo id; nomi di una parola | DIALOG-005.d: nomi come «Nina la pescatrice» sono naturali; regola deterministica, uguale in browser e terminale |
| P4 | **Consegna dei messaggi** nella `Simulation`: ogni frase, del giocatore o dei personaggi, va ai listener delle viste e del terminale senza filtro di distanza. Il destinatario di un `@` riceve `heard` a qualunque distanza; gli altri personaggi entro 16 blocchi dal giocatore la sentono come oggi. Il personaggio guardato non conta più | Filtro di distanza nelle viste | DIALOG-001.b–c, DIALOG-002.a: la regola vive in un solo posto |
| P5 | **Comandi** (`commands.ts`): una riga che inizia con `/` si interpreta come comando e restituisce un testo da mostrare solo a chi l'ha scritta; `/help` descrive `@`, Tab, Esc e la riduzione della console | Comandi solo nel browser | DIALOG-005.f, DIALOG-004.b; è il punto dove cresceranno i comandi di programmazione |
| P6 | **Protocollo versione 3**: `heard` con `yes_no` (`"yes"`, `"no"` o `null`); `say` con `to` facoltativo, per le frasi rivolte (le domande dei programmi); eventi `paused` e `resumed` quando un client prende o restituisce un personaggio con un programma (PROTO-004). Mentre è sospeso, le azioni del programma ricevono `action_failed` con causa `paused`, così ogni azione ha sempre un esito | Versione 2 con campi in più; azioni ignorate senza risposta | Il significato di `heard` cambia (distanza); un esito per ogni azione tiene semplice la libreria e i controllori scritti a mano |
| P7 | **Programmi**: `program: <file.py>` nel file del mondo; l'host lo avvia come controllore stdio (F05 P9) con il comando `python3 -u <file>` (`python` su Windows, o `--python <percorso>`), `cwd` nella cartella del mondo, `PYTHONPATH` verso `python/` del pacchetto e `PYTHONDONTWRITEBYTECODE=1`. Il consenso (PROTO-005) mostra il comando così com'è eseguito. Versione dell'interprete verificata una volta all'avvio, solo se c'è almeno un programma | Installare la libreria con `pip`; un interprete incluso | PY-001.a, PY-003.a–b, Q2: niente installazione, niente dipendenze |
| P8 | **Libreria su `asyncio`**. `Character` ha `routine()` (ripetuta finché il programma vive) e gestori facoltativi: `on_message(message)`, `on_interact()`, `on_near(entity)` e `on_far(entity)` (entità che entra o esce da `near_distance`, 8 blocchi, calcolato dalla percezione). `run(Classe)` avvia tutto. Le azioni sono coroutine che si risolvono all'esito; il fallimento solleva `ActionFailed` con la causa | Thread e code; callback | PY-002.a–b: il codice si legge dall'alto in basso; un solo thread, niente sincronizzazione per l'autore |
| P9 | **Interruzione e ripresa**: un gestore mette in pausa la routine. L'azione in corso della routine viene sostituita da quelle del gestore; alla fine del gestore la libreria richiede di nuovo l'azione interrotta (per `wait`, il tempo rimasto) e la coroutine attesa dalla routine si risolve solo con il nuovo esito. La routine non vede l'interruzione. I gestori non si interrompono tra loro: si accodano. `paused` e `resumed` usano lo stesso meccanismo | Cancellare e riavviare la routine; lasciare all'autore la ripresa | PY-002.c e la lezione di F06 (Q3): riprendere dall'azione interrotta senza codice dell'autore |
| P10 | **Domande**: `await self.ask(testo, timeout=30)` dice la frase rivolta al giocatore e restituisce il primo messaggio del giocatore che arriva al personaggio, con `mentions` e `yes_no`, oppure `None` allo scadere. Una risposta non passa da `on_message` | Domande come stato del programma | PY-002.e; come le domande di F06, senza il linguaggio |
| P11 | **Stato leggibile**: `self.position`, `self.nearby`, `self.map` (voci con id, nome, descrizione), `self.time`, aggiornati dalla percezione e dall'`hello` prima che parta la routine; `self.map[id]` dà una voce della mappa | Metodi che chiedono all'host | PY-002.d: la percezione arriva già a 4 Hz |
| P12 | **Errori del programma**: un'eccezione non gestita in routine o gestore stampa su stderr una riga `file:riga: Tipo: messaggio` dal frame del file dell'autore, poi la traccia completa, e il processo termina; il terminale la mostra con il personaggio (F05) e l'overlay segna il programma «in errore» | Traccia completa soltanto | PY-003.c: la riga utile per prima |
| P13 | **Compatibilità 3.10**: solo libreria standard e niente funzioni successive (`TaskGroup`, `asyncio.timeout`, `Self`); un test analizza i sorgenti con `ast.parse(…, feature_version=(3, 10))` | Installare Python 3.10 per i test | PY-001.b verificabile con un solo interprete sulla macchina |
| P14 | **Console delle viste** (`messageConsole.ts`): pannello trasparente sulla destra, altezza fino al 60 % della finestra, fino a 500 messaggi nel DOM, sempre come nodi di testo. Il pannello non riceve il mouse (`pointer-events: none`) tranne la lista, per scorrere, e la casella; un clic sulla lista non cattura il puntatore. Suggerimenti sopra la casella dopo `@`, frecce per scegliere, Tab per completare. Pulsante per ridurla con il numero di non letti, scelta ricordata nel browser come l'overlay | Pannello opaco; registro che sbiadisce | DIALOG-005.a–c e .g |
| P15 | **Stato dei programmi**: la sessione tiene per personaggio file e stato (`running`, `stopped`, `error`) e lo invia alle viste con lo stato del mondo, per l'overlay (DEBUG-001.a) | Solo nel terminale | L'overlay mostra già il personaggio più vicino |
| P16 | **Esempi**: `examples/valle` con quattro personaggi in Python (giro del guardiano, Tobia che chiede dove andare, Nina che risponde ai messaggi, la pescatrice); `examples/folla` con 20 personaggi e un solo programma; `examples/paese` rimosso perché coincide con la folla. `e2e/host` tiene `pino.mjs` (i controllori restano) e aggiunge un personaggio Python | Esempi misti Python e JavaScript | PY-004.a; il protocollo per altri linguaggi resta in `docs/controllori.md` |

## Libreria Python (bozza della forma)
Un programma completo, come sarà nel template:

```python
from yw3d import Character, run

class Guardiano(Character):
    async def routine(self):
        for tappa in ["piazza", "laghetto1", "casolare"]:
            await self.walk_to(tappa)
            await self.wait(5)

    async def on_near(self, entity):
        if entity.id == "player":
            await self.say("Buongiorno!", to="player")

    async def on_message(self, message):
        if message.mentions:
            await self.say(f"Vado a {message.mentions.name}")
            await self.walk_to(message.mentions.id)

run(Guardiano)
```

Questa è la forma che la prova d'uso (T7.09) mette alla prova: nomi dei metodi e dei gestori possono cambiare dopo il riscontro dell'utente, con una deviazione registrata.

## Emendamenti alla spec
Nessuno per ora.

## Strategia di test
- **Unit (Vitest, Node).**
  - Destinatari, suggerimenti e comandi con tabelle di casi; consegna dei messaggi nella `Simulation` a distanze diverse.
  - Errore YAML-001.f; `program` con percorsi sbagliati; comando e ambiente del processo; interprete mancante o vecchio con un `--python` finto.
  - Protocollo 3 con client `ws` e controllori stdio, come in F06.
  - Libreria: programmi Python veri contro una `HostSession` con un mondo piccolo, lanciati dai test Vitest (i titoli portano i criteri, così `sdd:trace` li vede). Le regole interne di pausa e ripresa si provano con `unittest` in `python/tests`, eseguito da un test Vitest per caso.
  - I test che lanciano Python richiedono `python3` ≥ 3.10 e falliscono con un messaggio chiaro se manca.
- **E2E (Playwright).** Console nelle due modalità: messaggi, `@`, Tab, tasti bloccati mentre si scrive, spettatori in sola lettura, personaggi fermi senza host; nel progetto host un personaggio Python che risponde.
- **Manuale.** Checklist a T7.14: DIALOG-005.e e .g, PY-004.a, PY-005.a e .b, DEBUG-001.a, DIALOG-001.d. PY-005.b si misura contando le righe del programma scritto dall'utente alla prova d'uso e di quello della guida.
- **Criteri modificati.** Come in F06: ogni test dei criteri modificati (DIALOG-001…004, PROTO-002, PROTO-004, CHAR-001, YAML-001, MAP-001, MAP-002, HOST-001) si aggiorna al testo nuovo; i test di BEHAV e PERF-006 si cancellano con il codice.

## Dipendenze nuove
Nessuna in npm. Python ≥ 3.10 sulla macchina per eseguire i programmi e i test della libreria.

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Pausa e ripresa della routine sbagliate in casi limite (gestore durante `ask`, doppia interruzione, `paused` durante un gestore) | PY-002.c | Un solo meccanismo (P9) e un test `unittest` per ogni combinazione |
| La forma della libreria non piace all'utente, come il DSL | Rifacimento tardivo | Prova d'uso a T7.09, prima di esempi e guida |
| Python assente o vecchio sulla macchina dell'utente | Personaggi fermi | Errore chiaro con il personaggio (PY-003.b); `--python` |
| Processi Python orfani dopo ricariche o chiusure | Risorse, doppie azioni | Stesso ciclo di vita dei controllori F05; test che conta i processi dopo la ricarica |
| La console ruba clic o tasti alla scena | DIALOG-005.b | `pointer-events` solo su lista e casella; e2e sulla cattura del puntatore |
| La rimozione rompe test e mondi di F06 | Regressioni | T7.02 da solo, con `check` ed `e2e` verdi prima di proseguire |
| Compatibilità 3.10 non provata con un interprete 3.10 | PY-001.b | Analisi con `feature_version` (P13) ed elenco delle funzioni vietate nella guida del codice |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T7.01** Commit con verifica
  - Req: — · Dip: —
  - `scripts/commit.ts` e script `commit` (P1); process.md e `CLAUDE.md` indicano di usarlo a fine task.
  - Fatto quando: con un test rosso il commit non parte, con `check` verde parte; da qui ogni task si registra con lo strumento.

- [x] **T7.02** Rimozione del linguaggio dei comportamenti
  - Req: YAML-001, CHAR-001, MAP-001, MAP-002 · Dip: T7.01
  - P2: `src/core/behaviors`, `behaviors.test.ts`, PERF-006, lettore di file esterni, `examples/paese`, e2e con comportamenti, `docs/comportamenti.md`; errore per `behaviors` e `behavior` con rimando a `docs/python.md`. Tobia e Nina restano fermi fino a T7.11.
  - Fatto quando: test di YAML-001.a e .f, CHAR-001.a e .c, MAP-001.c, MAP-002.d verdi; `check` ed `e2e` verdi; nessun riferimento ai comportamenti nel codice.

- [x] **T7.03** Messaggi e destinatari nel core
  - Req: DIALOG-001, DIALOG-003, DIALOG-005, PROTO-002 · Dip: T7.02
  - `address.ts` (P3), `commands.ts` (P5), consegna nella `Simulation` (P4), `yes_no` nell'evento.
  - Fatto quando: test di DIALOG-001.b–c, DIALOG-003.e, DIALOG-005.d e .f, PROTO-002.b verdi.

- [ ] **T7.04** Console dei messaggi nelle viste
  - Req: DIALOG-005, DIALOG-001, DIALOG-002, CHAR-001 · Dip: T7.03
  - `messageConsole.ts` (P14) al posto di `chat.ts`; tutti i messaggi dall'host alle viste; modalità solo browser senza comportamenti.
  - Fatto quando: e2e di DIALOG-005.a–c, DIALOG-001.a, DIALOG-002.a, CHAR-001.d verdi; console provata nel browser.

- [ ] **T7.05** Console dell'host
  - Req: DIALOG-004 · Dip: T7.03
  - Tutti i messaggi, `@nome`, `/help` nel terminale.
  - Fatto quando: test di DIALOG-004.a–b verdi.

- [ ] **T7.06** Protocollo dei controllori, versione 3
  - Req: PROTO-002, PROTO-004 · Dip: T7.03
  - P6: `yes_no`, `say` con `to`, `paused` e `resumed`, esito `paused` delle azioni sospese; `docs/controllori.md` aggiornato.
  - Fatto quando: test di PROTO-004.a–b e del nuovo `heard` verdi.

- [ ] **T7.07** Programmi nella cartella del mondo
  - Req: PY-001, PY-003, HOST-001, CHAR-001 · Dip: T7.02, T7.06
  - `program` nel file del mondo; `python.ts` (P7) con `--python`; consenso; ricarica per i `.py`; stato dei programmi (P15) nel terminale.
  - Fatto quando: test di PY-001.a, PY-003.a–b, HOST-001.c verdi; un programma Python minimo parte, riceve `hello` e muove il personaggio.

- [ ] **T7.08** Libreria Python: struttura, azioni, stato e messaggi
  - Req: PY-001, PY-002 · Dip: T7.07
  - `python/yw3d` (P8, P9, P11, P13): `Character`, `run`, azioni attese, `ActionFailed`, stato, mappa, `on_message` con interruzione e ripresa; bozza del template.
  - Fatto quando: test di PY-001.b–c e PY-002.a–d verdi.

- [ ] **T7.09** Prova d'uso con l'utente
  - Req: PY-005, DIALOG-005 · Dip: T7.04, T7.08
  - **Punto di controllo**: l'utente copia la bozza del template, scrive un personaggio suo in un mondo e gli parla dalla console. Si raccolgono le osservazioni su leggibilità della libreria e comodità della console; ciò che cambia la forma diventa una deviazione o un emendamento, prima di T7.10.
  - Fatto quando: l'utente ha scritto e fatto girare il suo personaggio e le osservazioni sono registrate nel piano.

- [ ] **T7.10** Libreria: domande, altri gestori, errori
  - Req: PY-002, PY-003 · Dip: T7.09
  - `ask` (P10), `on_interact`, `on_near`, `on_far`, `paused` e `resumed`, riga d'errore (P12), overlay con il programma (DEBUG-001.a); correzioni dalla prova d'uso.
  - Fatto quando: test di PY-002.e e PY-003.c verdi.

- [ ] **T7.11** Esempi in Python
  - Req: PY-004 · Dip: T7.10
  - P16: `examples/valle`, `examples/folla`, `e2e/host` con un personaggio Python.
  - Fatto quando: `yw3d examples/valle` e `yw3d examples/folla` partono e i personaggi fanno ciò che dicono i commenti.

- [ ] **T7.12** Guida e template
  - Req: PY-005 · Dip: T7.10
  - `docs/python.md`: struttura, ogni azione, mappa, messaggi, domande, errori frequenti, template commentato; README, `worlds/README.md`.
  - Fatto quando: il template copiato così com'è gira; il programma d'esempio di PY-005.b sta sotto le 40 righe.

- [ ] **T7.13** Test end-to-end
  - Req: DIALOG-005, DIALOG-001, DIALOG-002, CHAR-001 · Dip: T7.04, T7.11
  - Suite completa nei due progetti, con il personaggio Python dell'host.
  - Fatto quando: `npm run e2e` verde.

- [ ] **T7.14** Verifica di accettazione e chiusura della fase
  - Req: — (tutti) · Dip: T7.11, T7.12, T7.13
  - `check`, `e2e`, `sdd:trace -- F07`; checklist dei criteri `[manuale]`; spec vive (nuova `python.md`, rimossa `behaviors.md`); `retro.md`; `experiment.md`, `roadmap.md`.
  - Fatto quando: G3 approvato dall'utente.

## Ordine e parallelismo

```
T7.01 ─ T7.02 ─ T7.03 ─┬─ T7.04 ────────────────────────┐
                       ├─ T7.05                          │
                       └─ T7.06 ─ T7.07 ─ T7.08 ─────────┴─ T7.09 ─ T7.10 ─┬─ T7.11 ─ T7.13 ─┐
                                                                            └─ T7.12 ─────────┴─ T7.14
```
Punti di controllo: G2 prima di T7.01; prova d'uso a T7.09; G3 a T7.14.

## Modalità di esecuzione
Task in ordine senza fermarsi fino alla prova d'uso di T7.09, poi fino a T7.14. Commit a fine task con `npm run commit` (T7.01); il push lo esegue l'utente.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
| T7.02 | Nel file del mondo non resta alcun campo che riferisce un id: la parte «file» di MAP-001.c non ha più casi, e il test verifica l'altra parte, gli id generati accettati dal protocollo. Nei test e2e senza host nessun personaggio parla: il registro si prova con le frasi del giocatore e CHAR-002.d con il fumetto del giocatore. Il mondo di prova `test-behaviors` diventa `test-dialogue` | I comportamenti erano l'unico campo con riferimenti e l'unica fonte di frasi senza host | Nessuno |

# Il laboratorio: scenari, serie e rapporti

Il laboratorio serve a fare esperimenti con gli agenti LLM: si dà un compito a un agente, lo si lascia lavorare da solo, si ripete la prova più volte e con cervelli diversi, e alla fine si confrontano i risultati. Le domande di ricerca a cui serve sono in [sdd/research.md](../sdd/research.md).

Tre idee:

- **Scenario**: un compito assegnato a un agente all'avvio del mondo, con un tempo limite, un numero massimo di passi e, se serve, degli imprevisti.
- **Esecuzione**: dall'inizio degli scenari alla fine dell'ultimo. Ogni esecuzione scrive un **tracciato** con tutto ciò che è successo.
- **Serie**: più esecuzioni dello stesso mondo, per uno o più cervelli, che si chiude con un **rapporto**.

Il mondo non si ferma mai: mentre un agente pensa, il tempo scorre e gli altri personaggi si muovono. Un modello lento trova un mondo più avanti di uno veloce, e due esecuzioni non sono mai identiche; per questo si fanno più esecuzioni per ogni cervello.

L'esempio completo è [examples/laboratorio](../examples/laboratorio): tre agenti, tre scenari, tutti con il cervello finto.

## Uno scenario

Uno scenario si scrive nel `world.yaml`, nella sezione `scenarios`:

```yaml
scenarios:
  - id: commissione
    name: La commissione
    agent: marta
    task: Vai al Pozzo, poi al Laghetto, poi torna in Piazza.
    time_limit: 300
```

oppure in un file YAML della cartella del mondo, che il `world.yaml` importa scrivendone il percorso:

```yaml
scenarios:
  - scenarios/commissione.yaml
```

e il file contiene lo scenario, senza il trattino davanti. Salvare un file di scenario ricarica il mondo come salvare il `world.yaml`.

| Campo | Obbligatorio | Descrizione |
|---|---|---|
| `id` | sì | Identificatore dello scenario, unico nel mondo. |
| `name` | sì | Nome, 1–60 caratteri. |
| `description` | no | Descrizione, per chi legge. |
| `agent` | sì | L'id del personaggio che svolge il compito: deve avere un `agent:`. Un agente ha al più uno scenario. |
| `task` | sì | Il compito, in testo libero, come lo diresti a una persona. |
| `time_limit` | sì | Secondi di tempo simulato; allo scadere lo scenario finisce. |
| `max_steps` | no | Richieste all'LLM al più (predefinite 50); finite quelle, lo scenario finisce. |
| `perturbations` | no | Imprevisti a tempo (vedi sotto). |

Più scenari su agenti diversi procedono insieme, nello stesso mondo.

## Cosa succede

All'avvio del mondo, e a ogni ricarica, ogni scenario parte da capo:

1. l'agente riceve il compito e parte subito, senza che nessuno gli scriva, qualunque sia la sua iniziativa; gli altri agenti non conoscono il compito;
2. ogni volta che le sue azioni finiscono, l'agente viene interrogato di nuovo, anche se non l'ha chiesto;
3. quando ha finito, o è sicuro di non poterci riuscire, l'agente **dichiara l'esito**: riuscito o non riuscito, con una motivazione.

Lo scenario finisce con il primo di questi esiti:

| Esito | Quando |
|---|---|
| riuscito | l'agente dichiara di avercela fatta |
| non riuscito | l'agente dichiara di non poterci riuscire |
| tempo scaduto | è passato `time_limit` di tempo simulato |
| passi esauriti | l'agente ha fatto `max_steps` richieste senza dichiarare l'esito |
| errore | l'agente non parte (niente consenso, CLI o chiave mancante), tre richieste di fila falliscono, o si raggiunge il tetto di spesa di una serie |

Dopo l'esito l'agente torna a comportarsi come dice il `world.yaml`, e il mondo va avanti. Inizio ed esito compaiono nel terminale e nella console, anche a chi apre il browser dopo.

**L'esito è quello che dichiara l'agente: il laboratorio non lo verifica.** Un agente può dirsi riuscito senza esserlo; per saperlo si rigiocano alcune esecuzioni e si legge il loro tracciato.

## Imprevisti

Ogni perturbazione ha `at`, i secondi di tempo simulato dall'inizio dello scenario, e una sola di queste azioni. Scatta una volta.

```yaml
perturbations:
  - { at: 30, say: { by: tobia, text: "Hanno murato il pozzo!", to: marta } }
  - { at: 30, blocks: { from: [69, 67, 57], to: [71, 69, 59], block: cobblestone } }
  - { at: 60, move_place: { place: pozzo, to: [80, 70] } }
  - { at: 90, goals: { agent: marta, goals: [riposare all'ombra] } }
```

| Azione | Effetto |
|---|---|
| `say` | un personaggio (`by`, oppure `player`) dice una frase, ad alta voce o a qualcuno (`to`); la sentono solo i vicini, come sempre. Il personaggio non interrompe ciò che sta facendo. |
| `blocks` | posa i blocchi `block` in un parallelepipedo da `from` a `to` (`[x, y, z]`, al più 4096 blocchi), oppure li toglie con `block: air`. Dove c'è qualcuno il blocco non si posa. I percorsi dei personaggi ne tengono conto, e le viste li mostrano. Alla ricarica il mondo torna quello del file. |
| `move_place` | sposta un luogo con `at` (non un'area): chi ci va, da quel momento va nel posto nuovo. |
| `goals` | dà nuovi obiettivi a un agente: li legge dalla richiesta successiva. |

Ogni perturbazione compare nel terminale e nel tracciato con il tempo in cui è scattata.

## Guardare uno scenario dal vivo

```sh
yw3d examples/laboratorio
```

È il solito `yw3d`: il mondo parte con i suoi scenari, e li segui nel browser e nella console. Il tracciato va in `runs/<data-ora>/trace.jsonl` nella cartella del mondo. Ogni ricarica del mondo fa partire un'esecuzione nuova, con il suo tracciato: per usare lo stesso mondo senza esperimenti, commenta la riga che importa lo scenario.

## Una serie

```sh
yw3d run examples/laboratorio --runs 5 --brain fake --brain claude,model=haiku --budget 1
```

| Opzione | Significato |
|---|---|
| `--runs <n>` | esecuzioni per ogni cervello (predefinite 5) |
| `--brain <b>` | un cervello da confrontare, ripetibile: `fake`, `claude`, `codex`, `opencode`, `anthropic` o `openai`, seguito da `model=` ed `effort=` separati da virgole, per esempio `claude,model=sonnet,effort=low` o `openai,model=llama3.1:8b`. Vale per gli agenti con uno scenario; persona, obiettivi e iniziativa restano quelli del file. Senza `--brain` valgono i cervelli del `world.yaml`. |
| `--budget <dollari>` | tetto di spesa della serie |
| `--allow-commands` | dà il consenso senza chiederlo |

La serie gira senza browser, in tempo reale, un'esecuzione dopo l'altra; ognuna riparte dal mondo del file, con la memoria degli agenti vuota. Il consenso si chiede una volta, all'inizio, con i cervelli di tutte le condizioni. Per ogni esecuzione il terminale scrive una riga con cervello, esiti, tempo e spesa fin lì.

Raggiunto il tetto di spesa, gli scenari in corso finiscono con un errore e le esecuzioni successive non partono.

Con una API compatibile OpenAI, `base_url` e la variabile della chiave restano quelle del `world.yaml` se il personaggio usa già `provider: openai`.

## Il rapporto

A fine serie, nel terminale e in `runs/<serie>/report.json`, per ogni cervello e ogni scenario:

- **esiti**: dichiarati riusciti sul totale, e quante volte non riuscito, tempo scaduto, passi esauriti, errore;
- **passi** (richieste all'LLM), **azioni**, **secondi** simulati fino all'esito;
- **token** in ingresso e in uscita, **costo** in dollari;
- **latenza** di ogni richiesta, con il massimo;
- **parti scartate** delle risposte.

I numeri sono media ± deviazione standard sulle esecuzioni. Il rapporto riporta anche la versione delle istruzioni degli agenti (un nome e un'impronta del testo: se cambiano le istruzioni, cambia l'impronta), l'impronta del mondo e la versione di yw3d, e avvisa se sono cambiati durante la serie.

`report.json` ha gli stessi dati per un programma, e l'elenco delle esecuzioni con il percorso del loro tracciato.

## Un'esecuzione

```sh
yw3d show examples/laboratorio/runs/<serie>/1-fake-1
yw3d show examples/laboratorio/runs/<serie>/1-fake-1 --step 3
```

`yw3d show` stampa la cronologia di un'esecuzione, una riga per evento: richieste all'LLM (numerate), risposte con token, costo e latenza, azioni e loro esito, frasi, perturbazioni, esiti. Con `--step n` stampa per intero il contesto mandato all'LLM al passo `n` e la sua risposta grezza.

Il tracciato è `trace.jsonl`: una riga JSON d'intestazione (impronte dei file, versione di yw3d, cervelli, istruzioni, scenari, seed, data) e poi una riga per evento, con il tempo simulato `t` in secondi dall'inizio dell'esecuzione. La chiave di un'API non c'è mai.

## Rigiocare

```sh
yw3d examples/laboratorio --replay examples/laboratorio/runs/<serie>/1-fake-1
```

Rimette in scena un'esecuzione nel browser: gli agenti ricevono le risposte registrate, nell'ordine e allo stesso tempo simulato in cui erano arrivate, senza chiamare un LLM e senza consenso. Il mondo non si ferma, quindi il rigioco segue l'originale da vicino senza esserne una copia: il riferimento esatto è la cronologia di `yw3d show`. Se il `world.yaml` o i file degli scenari sono cambiati dopo l'esecuzione, il terminale lo dice. Il rigioco non scrive un tracciato nuovo.

## Costi

Ogni passo è una richiesta all'LLM. Una commissione sono 3–10 passi, una serie è esecuzioni × cervelli × scenari × passi. Con i prezzi misurati in F08 (circa 0,04 $ a richiesta con Claude Code e il modello predefinito), 3 scenari da 10 passi per 5 esecuzioni sono 150 richieste, circa 6 $; con `haiku` o `sonnet` ed effort `low` molto meno. Il tetto `--budget` tiene conto solo dei costi che il cervello riporta:

| Cervello | Token | Costo |
|---|---|---|
| Claude Code | sì | sì, al prezzo di listino (anche con un abbonamento) |
| Codex | sì | no |
| opencode | sì | sì (0 con i modelli gratuiti) |
| API Anthropic e compatibili OpenAI | sì, se il servizio li manda | no |
| finto | 0 | 0 |

Con un costo «non disponibile» il rapporto lo dice, e quelle richieste non contano per il tetto. Prova sempre prima con `--brain fake`: costa zero e verifica che lo scenario sia scritto bene.

## Errori frequenti

- **`the character "x" has no agent`**: lo scenario è assegnato a un personaggio senza `agent:`.
- **`the agent of "x" already has the scenario "y"`**: un agente ha al più uno scenario; per più compiti usa più agenti, o più serie.
- **Esito `errore` subito, `the agent is not running`**: consenso negato, o CLI o chiave mancanti (vedi [docs/agenti.md](agenti.md#errori-frequenti)).
- **Esito `passi esauriti` senza fare nulla**: l'agente non dichiara mai l'esito; prova un compito più preciso, o un modello più capace.
- **`the world has no scenarios`** da `yw3d run`: il `world.yaml` non ha la sezione `scenarios`.

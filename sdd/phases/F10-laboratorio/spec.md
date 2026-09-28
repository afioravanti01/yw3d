# F10 — Laboratorio: scenari e misure

| | |
|---|---|
| Stato | **approved** (G1, 2026-09-28) |
| Versione | 0.3: emendamento A10.1 (niente tempo a turni) |
| Data | 2026-09-28 |
| Piano | [plan.md](plan.md) |

## Obiettivo
Un esperimento sugli agenti LLM si descrive nel file del mondo, si esegue da riga di comando più volte e con cervelli diversi, e produce dati confrontabili. Uno **scenario** assegna un compito a un agente all'avvio del mondo: l'agente lo svolge da solo, senza che nessuno gli scriva, finché non dichiara di avercela fatta o di non riuscirci. Lo scenario può anche mettere degli imprevisti lungo la strada. Il mondo non si ferma mai: mentre un agente pensa il tempo scorre e gli altri personaggi si muovono, e anche questo fa parte della prova (A10.1). Ogni **esecuzione** lascia un tracciato completo e si può rivedere. Una **serie** di esecuzioni si chiude con un rapporto: esiti, passi, costo, latenza e variabilità. È il laboratorio che serve alle domande di [research.md](../../research.md) (D-013).

## Contesto
- D-013 (prima il laboratorio, poi gli esperimenti), D-014 (niente tempo a turni), D-012 (agenti nell'host), D-011 (si parla solo con chi è vicino). Costituzione: P3 (solo la fisica muove), P10 (il mondo non aspetta i controllori, nemmeno negli scenari).
- Spec vive coinvolte: [agents.md](../../specs/agents.md), [host.md](../../specs/host.md), [cli.md](../../specs/cli.md), [world-file.md](../../specs/world-file.md), [protocol.md](../../specs/protocol.md), [navigation.md](../../specs/navigation.md).
- Oggi un agente viene interrogato mentre il mondo continua a scorrere (AGENT-006.a) e agisce solo quando qualcuno gli scrive o quando scatta la sua iniziativa autonoma (AGENT-004). Latenza e costo si sono misurati a mano (retro di F08), e le istruzioni di sistema degli agenti sono cambiate per tentativi senza lasciare traccia.
- Il cervello finto (`fake`) prova ogni regola a costo zero ed è già la base degli e2e.

## Fuori scope
- Gli esperimenti veri e propri: controllare o programmare (F11), percezione (R2), memoria (R3), socialità (R4), LLM che costruiscono (R5). F10 si chiude con una sola serie di prova.
- Verificare dall'esterno se il compito è riuscito: niente condizioni dichiarate né giudizi di un LLM. L'esito è quello che dichiara l'agente (Q3); un verificatore potrà arrivare con un esperimento che ne abbia bisogno.
- Confrontare due serie tra loro, test statistici, grafici: il rapporto dà media e variabilità di una serie.
- Esecuzioni in parallelo: le esecuzioni di una serie si fanno una dopo l'altra.
- Tempo a turni e pause del mondo (A10.1): un'esecuzione non si ripete identica, e la latenza del modello è parte del risultato.
- Accelerare il tempo oltre il tempo reale (Q5).
- Stato interno dei personaggi (umore) e perturbazioni sociali: arriveranno con R4.
- Scenari senza host: nella modalità solo browser gli agenti non esistono, e gli scenari si ignorano.
- Cambiare la percezione o le istruzioni degli agenti: F10 le versiona, non le cambia.

## Storie utente
- **US-1** Come ricercatore, scrivo uno scenario nel file del mondo o in un file che il mondo importa: a quale agente va, qual è il compito, quanto tempo c'è, cosa succede a metà.
- **US-2** Come ricercatore, avvio il mondo e l'agente si mette al lavoro da solo; lo guardo nel browser mentre il mondo continua a vivere.
- **US-3** Come ricercatore, lancio 5 esecuzioni dello stesso scenario con due modelli e alla fine leggo un rapporto: quante volte ciascuno ha dichiarato di avercela fatta, in quanti passi, con quale costo e quale latenza.
- **US-4** Come ricercatore, riapro un'esecuzione: leggo cosa ha ricevuto e risposto l'agente a ogni passo, e la rivedo nel browser.
- **US-5** Come ricercatore, fisso un tetto di spesa per una serie e sono sicuro di non superarlo.

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### LAB-001 — Scenari nel file del mondo
- **a** `[unit]` Il file del mondo può dichiarare degli scenari (`scenarios`), scritti per intero oppure importati da file YAML della cartella del mondo (Q1). Uno scenario dichiara: id, nome e descrizione; l'agente a cui è assegnato; il compito, in testo libero; un tempo limite in tempo simulato; un numero massimo di passi, cioè di richieste all'LLM (predefinito 50); le perturbazioni facoltative (LAB-004). Gli errori seguono YAML-002 e indicano il file in cui si trovano, anche se è importato.
- **b** `[unit]` Il personaggio a cui è assegnato uno scenario deve esistere e avere un agente. Un agente ha al più uno scenario; più scenari su agenti diversi procedono insieme.
- **c** `[unit]` Salvare un file di scenario importato ricarica il mondo come salvare il `world.yaml` (HOST-003.a). Gli scenari non cambiano l'hash del mondo.

### LAB-002 — Svolgimento automatico
- **a** `[unit]` All'avvio del mondo, e a ogni ricarica, ogni scenario parte da capo (Q2): l'agente riceve il compito e viene interrogato subito, senza attendere messaggi, qualunque sia la sua iniziativa. Il compito compare nel contesto dell'agente come tale; gli altri agenti non lo conoscono.
- **b** `[unit]` Durante lo scenario, quando le azioni dell'agente finiscono (o una fallisce) l'agente viene interrogato di nuovo, con l'esito, anche se non ha chiesto di continuare. Messaggi e interazioni con il giocatore restano possibili e seguono le regole di AGENT-003.c e AGENT-004.
- **c** `[unit]` Nella risposta strutturata l'agente può dichiarare l'esito del compito: **riuscito** oppure **non riuscito**, con una breve motivazione (Q3). Con la dichiarazione lo scenario finisce. Finisce anche per **tempo scaduto**, per **passi esauriti**, oppure per **errore** se l'agente non può più funzionare (CLI assente, chiave mancante, richieste fallite di seguito) o se si supera il tetto di spesa (LAB-007.c). L'esito riporta la motivazione o la causa, il tempo simulato e i passi.
- **d** `[unit]` Finito lo scenario, l'agente torna a comportarsi come dichiara il file del mondo e il mondo va avanti. Il terminale e la console delle viste riportano l'esito.
- **e** `[manuale]` Uno scenario semplice (una commissione con un tempo limite) si scrive in meno di 15 righe, leggendo solo la guida.

### LAB-004 — Perturbazioni
- **a** `[unit]` Una perturbazione scatta una volta sola, a un tempo simulato dall'inizio dello scenario. Può: far dire una frase a un personaggio o al giocatore; spostare un luogo con nome (le mete che lo usano cambiano); posare o togliere blocchi in un parallelepipedo, per esempio per bloccare un passaggio (Q4); cambiare gli obiettivi di un agente.
- **b** `[unit]` Posare o togliere blocchi rispetta P3: i blocchi non si posano dove si trova un'entità, e la parte che la toccherebbe si scarta con un avviso. I percorsi dei personaggi tengono conto dei blocchi nuovi, e le viste collegate li mostrano. Alla ricarica il mondo torna quello del file.
- **c** `[unit]` Ogni perturbazione compare nel tracciato e nel terminale, con il tempo simulato in cui è scattata.

### LAB-005 — Tracciato di un'esecuzione
Un'esecuzione va dall'inizio degli scenari alla fine dell'ultimo.
- **a** `[unit]` Ogni esecuzione scrive un tracciato in una sottocartella di `runs/` nella cartella del mondo (Q7). Il tracciato contiene un'intestazione (impronta dei file del mondo e degli scenari, versione di yw3d, cervello di ogni agente con uno scenario, cioè modalità, CLI o fornitore, modello ed effort, versione delle istruzioni, seed, data) e, in ordine di tempo simulato: ogni richiesta all'LLM con il contesto inviato per intero, il tempo simulato della richiesta e dell'arrivo della risposta, la risposta grezza, le azioni eseguite, le parti scartate, i token in ingresso e in uscita, il costo e la latenza; gli esiti delle azioni; le frasi dette; le perturbazioni; l'esito di ogni scenario.
- **b** `[unit]` Token e costo si prendono da ciò che la CLI o l'API riportano. Quando non li riportano, il tracciato lo dice («non disponibile») e non li stima.
- **c** `[unit]` La chiave API non compare mai nel tracciato (AGENT-001.c).
- **d** `[unit]` `yw3d show <esecuzione>` stampa nel terminale la cronologia di un'esecuzione, un passo per riga (tempo simulato, chi, cosa), e su richiesta il contesto e la risposta completi di un passo.

### LAB-006 — Rigioco
- **a** `[unit]` `yw3d <cartella> --replay <esecuzione>` rimette in scena un'esecuzione: gli agenti degli scenari ricevono le risposte registrate, nell'ordine in cui le avevano date e allo stesso tempo simulato in cui erano arrivate, senza chiamare un LLM. Il rigioco segue da vicino l'esecuzione originale ma non è identico, perché il mondo non si ferma (A10.1); la cronologia di `yw3d show` resta il riferimento esatto. Se i file del mondo o degli scenari sono cambiati dall'esecuzione, il terminale lo segnala.
- **b** `[manuale]` Rigiocando un'esecuzione nel browser si seguono i passi dell'agente e si capisce perché ha dichiarato quell'esito.

### LAB-007 — Serie di esecuzioni
- **a** `[unit]` `yw3d run <cartella>` esegue gli scenari del mondo senza browser, per un numero di esecuzioni (predefinito 5) e per uno o più cervelli. Ogni cervello è una condizione e vale per tutti gli agenti con uno scenario; senza cervelli indicati si usano quelli del file del mondo. Ogni esecuzione riparte dal mondo iniziale, con la memoria degli agenti vuota.
- **b** `[unit]` Il consenso segue PROTO-005: si chiede una volta, all'inizio della serie, e `--allow-commands` lo dà senza chiederlo.
- **c** `[unit]` Un tetto di spesa facoltativo vale per la serie: raggiunto il tetto, gli scenari in corso finiscono con esito errore e le esecuzioni successive non partono. I costi «non disponibili» non contano per il tetto, e il rapporto lo segnala.
- **d** `[unit]` Durante la serie il terminale mostra, per ogni esecuzione, il cervello, gli esiti, il tempo simulato e la spesa fin lì.
- **e** `[unit]` A fine serie il rapporto, nel terminale e in un file della serie leggibile da un programma, riporta per ogni condizione e per ogni scenario: gli esiti (dichiarati riusciti su esecuzioni, con i conteggi degli altri esiti); i passi, le azioni, il tempo simulato fino all'esito, i token, il costo e la latenza (media e deviazione standard; per la latenza anche il massimo); le parti scartate. Riporta anche l'intestazione comune dei tracciati e l'elenco delle esecuzioni con il loro tracciato.
- **f** `[manuale]` Il rapporto si legge senza documentazione: dice chi ha fatto meglio e a che prezzo, e ricorda che l'esito è dichiarato dall'agente.

### LAB-008 — Istruzioni versionate
- **a** `[unit]` Le istruzioni di sistema che l'host dà agli agenti hanno una versione: un nome dichiarato nel codice di yw3d e un'impronta del loro testo. Se il testo cambia, cambia l'impronta; il tracciato e il rapporto riportano entrambi.

### LAB-009 — Esempi e guida
- **a** `[manuale]` Una cartella d'esempio contiene tre scenari: una commissione in più passi; un'esplorazione in cui l'agente deve trovare qualcosa nel mondo e riferirlo a un personaggio; un compito che richiede due agenti. Ogni scenario gira con il cervello finto e con almeno un modello vero.
- **b** `[manuale]` Una guida spiega come si scrive uno scenario (compito, tempo limite, passi, perturbazioni, importazione da un file), come si lanciano un mondo con scenari, una serie e un rigioco, come si legge il rapporto, e quanto costano le esecuzioni.
- **c** `[manuale]` Una prima serie (i tre scenari, il cervello finto e almeno un modello vero, 5 esecuzioni ciascuno) è registrata nel diario di [research.md](../../research.md), con il costo reale.

## Requisiti MODIFICATI

### YAML-001 — File del mondo
- **Prima:** a `[unit]` […] i personaggi (`characters`), le impostazioni degli agenti (`agents`, AGENT-004.c) e il tempo (`time` […]). […]
- **Dopo:** b–f invariati; a diventa:
- **a** `[unit]` Un file del mondo dichiara la versione dello schema (`version: 2`), nome e descrizione del mondo (YAML-009), il terreno (`terrain`) e, facoltativi, il giocatore (`player`), le strutture (`structures`), le distribuzioni (`scatter`), i luoghi (`places`), i personaggi (`characters`), le impostazioni degli agenti (`agents`, AGENT-004.c), il tempo (`time`: ora di partenza e durata del giorno, TIME-001) e gli scenari (`scenarios`, LAB-001). Una versione dello schema non gestita è un errore.
- **Motivo:** gli scenari stanno nel file del mondo (Q1).

### AGENT-003 — Risposta e azioni
- **Prima:** a `[unit]` L'LLM risponde in una forma strutturata fissa: cosa dire e a chi (facoltativo), una breve sequenza di azioni […], e se vuole decidere di nuovo quando le azioni sono finite. […]
- **Dopo:** b–c invariati; a diventa:
- **a** `[unit]` L'LLM risponde in una forma strutturata fissa: cosa dire e a chi (facoltativo), una breve sequenza di azioni tra `walk_to`, `look_at`, `follow`, `wait`, `stop`, con mete della mappa o coordinate, se vuole decidere di nuovo quando le azioni sono finite e, solo con uno scenario in corso, l'esito dichiarato del compito (LAB-002.c). L'host esegue la frase e le azioni in ordine, con le azioni dei personaggi (PROTO-001.b): valgono la fisica (P3) e le distanze di D-011. Se l'LLM ha chiesto di continuare, finite le azioni (o fallita una) l'agente lo interroga ancora, con l'esito: così un compito procede per passi.
- **Motivo:** l'agente dichiara l'esito del proprio compito.

### CLI-001 — Comando `yw3d`
- **Prima:** c `[unit]` Il comando stampa l'indirizzo dell'app; `--port`, `--no-open`, `--lan`, `--seed`, `--help` […].
- **Dopo:** a, b, d, e invariati; c diventa:
- **c** `[unit]` Il comando stampa l'indirizzo dell'app; `--port` sceglie la porta, `--no-open` non apre il browser, `--lan` rende l'host raggiungibile dalla rete locale (per default solo dalla macchina locale), `--seed` sostituisce il seed del file, `--replay` rigioca un'esecuzione (LAB-006), `--help` descrive l'uso e i comandi `run` e `show` (LAB-005, LAB-007).
- **Motivo:** nuovi modi di avviare il mondo.

## Requisiti RIMOSSI
- **LAB-003** — tempo a turni: aggiunto da questa fase e tolto con A10.1, con tutti i criteri. AGENT-006.a e TIME-002.a, che la fase modificava per il tempo a turni, restano come erano. L'ID non si riusa.

## Costituzione
Con G1 la costituzione era passata alla v1.5, con un'eccezione a P10 per il tempo a turni. A10.1 l'ha revocata: P10 non ha eccezioni e dice esplicitamente che il mondo non aspetta nemmeno negli esperimenti (costituzione v1.6, D-014).

## Domande risolte
Chiuse con l'utente il 2026-09-28.

| # | Domanda | Decisione | Effetto sulla spec |
|---|---|---|---|
| Q1 | Dove sta uno scenario | Nel `world.yaml`, oppure in un file YAML importato dal `world.yaml` (la proposta era una cartella `scenarios/` a parte) | LAB-001.a, LAB-001.c, YAML-001.a |
| Q2 | Come riceve il compito l'agente | Lo scenario è assegnato automaticamente all'avvio e l'agente lo svolge senza input dell'utente (la proposta erano frasi del giocatore); gli scenari partono sempre all'avvio del mondo, senza opzioni | LAB-002.a–b, LAB-007.a; `--scenario` tolto da CLI-001.c |
| Q3 | Come si stabilisce l'esito | Nessuna condizione dichiarata: l'agente dichiara da sé «riuscito» o «non riuscito» (la proposta erano condizioni di vicinanza, frasi, azioni fallite) | LAB-002.c, AGENT-003.a; verificatore fuori scope |
| Q4 | Blocchi posati o tolti durante la simulazione | Sì, come perturbazione | LAB-004.a–b |
| Q5 | Accelerare il tempo | No | fuori scope |
| Q6 | Rigioco in F10 | Sì | LAB-006 |
| Q7 | Dove vanno i tracciati | In `runs/` nella cartella del mondo | LAB-005.a |

Conseguenze da tenere presenti:
- **Esito dichiarato (Q3).** Il rapporto misura quante volte un agente *dice* di esserci riuscito, non quante volte ci è riuscito davvero. È una minaccia alla validità: va scritta in [research.md](../../research.md), e la si controlla a mano rigiocando le esecuzioni. Un agente che dichiara il successo senza averlo raggiunto è già, di per sé, un dato di ricerca.
- **Scenari sempre all'avvio (Q2).** Un mondo con scenari è un mondo da esperimento: ogni avvio e ogni ricarica fanno partire un'esecuzione, che scrive il suo tracciato. Per giocare liberamente con lo stesso mondo si tolgono gli scenari, oppure si importano da un file che si può commentare.
- **Il mondo non si ferma (A10.1).** Un modello lento vede un mondo più avanti di uno veloce, e due esecuzioni non sono mai identiche. La latenza diventa quindi una variabile del risultato, non un disturbo da togliere, e il numero di esecuzioni per condizione conta ancora di più.

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
| A10.1 | 2026-09-28 | Obiettivo, US-2, fuori scope, LAB-003 (rimosso), LAB-005.a, LAB-006.a; AGENT-006.a e TIME-002.a non più modificati; P10 | Niente tempo a turni: il mondo non si ferma mentre gli agenti pensano. Il tracciato registra il tempo simulato della richiesta e della risposta; il rigioco ridà le risposte agli stessi tempi simulati e non è identico all'originale | L'utente, alla revisione del piano: «Non fa niente se il tempo va avanti e gli altri personaggi si muovono, queste sono perturbazioni normali nel mondo. La prova non deve essere uguale bit a bit» | Utente (richiesta diretta, prima di G2) |


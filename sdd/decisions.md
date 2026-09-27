# Registro delle decisioni

Formato: contesto, decisione, alternative, conseguenze. Una decisione non si riscrive: si supera con una nuova voce che la cita.

## D-001 — Piattaforma web: TypeScript, Three.js, Vite
Data: 2026-09-26 · Stato: accettata

**Contesto.** Serve una base per un mondo a voxel programmabile via YAML e codice, sviluppato in larga parte da agenti AI dentro un processo SDD.

**Decisione.** Applicazione web in TypeScript, rendering con Three.js, build con Vite, test con Vitest e Playwright.

**Alternative.**
- *Godot 4*: editor, fisica e animazione pronti; ma scene e risorse passano dall'editor, e verifica e test headless da parte di un agente sono più scomodi.
- *Rust + Bevy*: prestazioni ottime; compilazioni lente, iterazione più costosa, API ancora in evoluzione rapida.
- *Unity*: pesante, centrato sull'editor, vincoli di licenza.

**Conseguenze.** Tutto è testo e la logica è testabile senza GPU, il che aiuta sia l'SDD sia gli agenti. Si esegue nel browser senza installazioni. Fisica voxel e animazioni si scrivono a mano; per un mondo a voxel è comunque la scelta tipica (collisioni AABB contro griglia, non un motore fisico generico). Prestazioni inferiori a un motore nativo, contenute con mondo finito e meshing per chunk.

## D-002 — Voxel da 0,5 m
Data: 2026-09-26 · Stato: accettata (spec F01, Q2)

**Contesto.** Differenziarsi da Minecraft (1 m) e permettere strutture più fini: tetti, finestre, alberi più organici.
**Decisione.** 1 blocco = 0,5 m; un personaggio adulto è alto circa 3,5 blocchi.
**Alternative.** 1 m: look Minecraft, strutture grezze. 0,25 m: molto dettaglio, ma 8 volte i blocchi di 0,5 m, con fisica, navigazione e meshing più costosi.
**Conseguenze.** A parità di area servono 8 volte i blocchi rispetto a 1 m: si compensa con un mondo finito (D-003).

## D-003 — Mondo finito
Data: 2026-09-26 · Stato: accettata (spec F01, Q3)

**Decisione.** Dimensioni fissate dalla configurazione, default 256 m × 256 m (512 × 96 × 512 blocchi), senza streaming di chunk.
**Motivo.** Il mondo è scritto nel YAML, non esplorato all'infinito. Un mondo finito semplifica determinismo, fisica, navigazione e percezione dei personaggi AI.
**Alternative.** 128 m × 128 m (la proposta iniziale): un quarto dei dati, caricamento più rapido, ma meno spazio per più insediamenti. Mondo infinito con streaming: molta complessità, poco utile per un mondo dichiarativo.
**Conseguenze.** Circa 25 M voxel e 768 chunk: il budget di caricamento di PERF-001 passa da 3 s a 5 s, e il piano deve saltare i chunk senza facce visibili.

## D-004 — Spec vive più spec di fase come delta
Data: 2026-09-26 · Stato: accettata

**Decisione.** Ogni fase ha una spec *delta* (AGGIUNTI, MODIFICATI, RIMOSSI). Alla chiusura il delta si fonde nelle spec vive per area (`sdd/specs/`), che descrivono il sistema com'è oggi.
**Alternative.** Solo spec per fase (stile Spec Kit): semplice, ma la verità si disperde tra le fasi. Un'unica spec monolitica sempre aggiornata: niente storia delle decisioni e documento sempre più difficile da revisionare.
**Conseguenze.** A ogni chiusura c'è un passo di merge da fare con cura. Il suo costo si misura nelle retro: è uno dei dati chiave dell'esperimento.

## D-005 — Strumentazione SDD fatta in casa
Data: 2026-09-26 · Stato: accettata, **da rivalutare nella retro di F02**

**Decisione.** Template markdown, convenzioni e uno script di tracciabilità, senza adottare un framework (Spec Kit, OpenSpec, Kiro).
**Motivo.** L'esperimento vuole osservare il processo in sé; un framework nasconde scelte e aggiunge dipendenze. Le convenzioni restano compatibili nello spirito (spec → piano → task; delta → spec vive), quindi un passaggio a un framework resta possibile.
**Alternative.** Stessa strumentazione più comandi Claude Code (`/sdd-spec`, `/sdd-plan`, `/sdd-task`, `/sdd-close`) che rendono ripetibile ogni passo: scartata per ora, i passi si guidano a voce seguendo `process.md`. OpenSpec: spec vive native, ma meno controllo su gate e metriche. GitHub Spec Kit: organizzato per singola funzionalità, senza spec vive (in conflitto con D-004).

## D-006 — Lingua
Data: 2026-09-26 · Stato: accettata

Documentazione in italiano; codice, identificatori, commenti nel codice e commit in inglese.

## D-007 — Conferma della strumentazione SDD fatta in casa
Data: 2026-09-26 · Stato: accettata (retro di F02) · Conferma D-005

**Contesto.** D-005 prevedeva di rivalutare la strumentazione fatta in casa nella retro di F02. In due fasi template, convenzioni e `sdd:trace` hanno gestito spec delta, spec vive, emendamenti e task `+`. I costi sono stati un difetto dello script sui requisiti MODIFICATI (corretto in T2.18+) e un emendamento di sola forma (A2.1).
**Decisione.** Si mantiene la strumentazione fatta in casa, senza adottare un framework.
**Conseguenze.** `sdd:trace` va esteso con un avviso per i requisiti della fase senza criteri riconosciuti, così un problema di formato della spec emerge subito. Da fare come primo task della prossima fase.

## D-008 — Host headless e personaggi guidati da controllori esterni
Data: 2026-09-26 · Stato: accettata (dopo la chiusura di F03) · Supera la riga «AI dei personaggi» dello stack di D-001 e modifica la costituzione (v1.1)

**Contesto.** Il mondo 3D è il contenitore di personaggi guidati da programmi e da agenti LLM. I programmi devono poter essere scritti in qualunque linguaggio che gira sulla macchina dell'utente; gli agenti devono poter usare le CLI disponibili (claude, codex, opencode, ollama…) in modalità headless. Quali strumenti ci sono dipende dal computer. Finora il mondo viveva solo nel browser e l'unico backend previsto era un piccolo servizio per la Claude API (F05).

**Decisione.**
1. **Host.** Un processo Node headless, avviato con `yw3d <cartella del mondo>`, carica il YAML e gli eventuali script della cartella, fa girare la simulazione del core a passo fisso ed è l'autorità sullo stato del mondo. Il core di F01–F03 gira già in Node e non cambia.
2. **Controllori esterni.** Un personaggio può essere guidato da un controllore esterno: riceve percezioni e invia azioni tramite un modello di messaggi unico, indipendente dal linguaggio. Le azioni sono di alto livello (andare in un punto, guardare, dire, seguire, aspettare): l'host le traduce in intenzioni per la fisica (P3), calcolando percorsi e tempi.
3. **Tre canali per lo stesso modello di messaggi:** JSON a righe su stdio per i processi lanciati dall'host su dichiarazione del YAML; WebSocket per i client esterni e per il browser; un server MCP per gli agenti LLM, che usano le azioni come strumenti.
4. **Browser come vista.** Il browser si collega all'host via WebSocket, ricostruisce il mondo dallo stesso YAML (la composizione è deterministica) e riceve movimenti e modifiche; il giocatore è un controllore come gli altri. La modalità **solo browser** resta, per i mondi senza controllori esterni.
5. **Tempo reale.** Il mondo scorre in tempo reale e non aspetta gli agenti: agiscono quando rispondono. L'host registra le intenzioni di ogni sessione, che per il determinismo si può rigiocare identica. Una modalità a turni, in cui il mondo aspetta gli agenti, si valuta nella spec degli agenti LLM.
6. **Sicurezza e configurazione.** I comandi dichiarati in una cartella del mondo si eseguono solo dopo il consenso esplicito dell'utente. L'host verifica all'avvio che i comandi esistano e segnala cosa manca. Chiavi e credenziali restano sulla macchina dell'host, mai nel browser (P8).
7. **Interazione senza browser.** Minimo garantito: il terminale dell'host (avvio, errori del YAML, stato dei controllori) e i client via protocollo. Console di comandi, mappa testuale, screenshot su richiesta e riproduzione delle registrazioni sono fasi della roadmap.

**Alternative.**
- *Tutto nel browser, con script solo in JavaScript*: semplice, ma esclude gli altri linguaggi e le CLI degli agenti, che girano sulla macchina dell'utente.
- *Solo backend per la Claude API* (piano precedente di F05): lega il progetto a un fornitore e a un linguaggio.
- *Un solo canale* (solo WebSocket, o solo MCP): WebSocket obbliga ogni script a gestire una connessione di rete; MCP da solo è scomodo per semplici script. Lo stesso modello di messaggi su tre canali costa poco e copre tutti i casi.
- *Mondo a turni come default*: riproducibile, ma innaturale per il giocatore e lento con gli LLM.

**Conseguenze.**
- Il core resta com'è; l'app del browser diventa, in F04, un client dell'host oltre che una modalità autonoma.
- Roadmap rivista: F04 host e riga di comando; F05 personaggi e protocollo dei controllori; F06 agenti LLM; F07 natura viva.
- La costituzione passa alla versione 1.1: visione, stack e un principio nuovo sui controllori esterni (P10).
- Un controllore lento o bloccato non deve rallentare il mondo: il protocollo avrà tempi limite e ripieghi, da specificare in F05.

## D-009 — Comportamenti in YAML, mappa del mondo e dialogo prima degli agenti LLM
Data: 2026-09-26 · Stato: accettata (discussione con l'utente dopo la chiusura di F05) · Integra D-008 e ne aggiorna la roadmap

**Contesto.** Dopo F05 un personaggio si programma solo con un programma esterno (stdio o WebSocket): serve il consenso, il comportamento non si legge nel file del mondo né si rigioca in modo deterministico, e in modalità solo browser i personaggi stanno fermi. Per gli agenti LLM mancano inoltre un modo di riferirsi agli elementi del mondo (un personaggio conosce solo coordinate ed entità vicine) e un dialogo con il giocatore.

**Decisione.**
1. **Linguaggio dei comportamenti.** Un linguaggio dichiarativo in YAML, scritto nel file del mondo o in file esterni, è il modo normale di programmare un personaggio. Modello: una routine che si ripete, reazioni che la interrompono e poi la riprendono, stati facoltativi. Vocabolario chiuso di eventi, condizioni e istruzioni, con flag e contatori, estendibile da codice con un registro tipizzato (P5). Libreria di comportamenti con parametri. Gira nel core: deterministico, testabile senza processi, attivo anche in modalità solo browser, senza consenso perché non esegue codice.
2. **Controllori esterni.** stdio e WebSocket restano (P10), per ciò che il linguaggio non esprime e come base del canale MCP.
3. **Nomi e mappa.** Ogni elemento del file del mondo ha nome e descrizione; personaggi, luoghi, strutture e distribuzioni hanno un id in un unico spazio. La mappa di tutti gli elementi è a disposizione di comportamenti e controllori, e le azioni accettano un elemento come meta.
4. **Dialogo.** Il giocatore parla con i personaggi dal browser, dal terminale dell'host o da un client esterno; un personaggio può fare domande e usare la risposta, capita con regole deterministiche. Il linguaggio libero resta agli LLM.
5. **Roadmap.** Questi punti formano la nuova F06; gli agenti LLM passano a F07 e la natura viva a F08. Nella costituzione cambiano solo i riferimenti alle fasi (v1.2).

**Alternative.**
- *Il linguaggio al posto dei processi, o di tutti i controllori esterni*: nessun comando eseguito dalle cartelle, ma si rinuncia a «qualunque linguaggio» (P10).
- *Solo routine e reazioni; macchina a stati pura; behavior tree*: rispettivamente senza modi di comportamento, scomoda per riprendere un giro interrotto, verboso in YAML.
- *Condizioni come espressioni in stringhe*: più flessibili, ma un mini-linguaggio da specificare, con gli errori dentro le stringhe.
- *Il nome come identificatore*: un campo solo, ma rinominare cambia i riferimenti.
- *Dialogo privato con un personaggio; chat globale*: il primo esclude gli altri personaggi, la seconda ignora lo spazio del mondo.

**Conseguenze.**
- Lo schema del file del mondo passa alla versione 2; i file in versione 1 vanno aggiornati.
- Il core cresce di un interprete. Il confine del vocabolario chiuso va difeso spec dopo spec: un DSL tende a diventare un linguaggio di programmazione scritto male.
- In F07 l'agente LLM userà mappa, mete e dialogo di F06; resta da decidere se un agente può anche scrivere o modificare il comportamento del suo personaggio.

## D-010 — Personaggi programmati in Python e console dei messaggi
Data: 2026-09-27 · Stato: accettata (dopo l'uso di F06 da parte dell'utente) · Supera il punto 1 di D-009 e ne aggiorna la roadmap

**Contesto.** Usando il mondo di F06 l'utente ha trovato due problemi. Il linguaggio dei comportamenti in YAML è scomodo da scrivere e poco leggibile: un personaggio con qualche reazione diventa una lunga struttura annidata difficile da seguire. Il dialogo è scomodo: bisogna avvicinarsi, puntare il personaggio e premere Invio, e i messaggi si perdono se non si guarda nel punto giusto.

**Decisione.**
1. **Il linguaggio dei comportamenti si rimuove** del tutto: interprete, libreria, guida, esempi e requisiti. Del punto 1 di D-009 resta l'idea di fondo, programmare i personaggi dalla cartella del mondo; i punti 2–4 (controllori esterni, nomi e mappa, dialogo) restano validi.
2. **Python è il linguaggio di riferimento** per programmare i personaggi. Una libreria Python `yw3d`, solo con la libreria standard, fa da template: un programma è una classe con una routine e dei gestori di eventi e messaggi, le azioni si attendono (`await self.walk_to("laghetto1")`), mappa e percezione sono a disposizione. Il corpo del programma deve leggersi come la descrizione del personaggio.
3. **I programmi stanno nella cartella del mondo e girano come processi dell'host**, con il protocollo dei controllori (P10) e il consenso ricordato per cartella (PROTO-005). Gli altri linguaggi restano possibili tramite il protocollo.
4. **Console dei messaggi.** Ogni vista ha sulla destra una console trasparente con tutti i messaggi del mondo. `@nome testo` scrive a un personaggio a qualunque distanza; senza `@` la frase è detta ad alta voce, e la sente chi è entro 16 blocchi. La console è il punto da cui si gestisce l'interazione e in futuro ospiterà i comandi di programmazione. Avvicinarsi e puntare un personaggio non serve più.
5. **Roadmap.** Questi punti formano la nuova F07; gli agenti LLM passano a F08 e la natura viva a F09. Nella costituzione cambiano visione, P2, P5 e i riferimenti alle fasi (v1.3).

**Alternative.**
- *Tenere il linguaggio e aggiungere Python*: due modi di fare la stessa cosa, e il più scomodo da mantenere.
- *JavaScript come linguaggio di riferimento*: stesso motore del progetto, ma l'utente preferisce Python per leggibilità e diffusione.
- *Python nel browser (Pyodide)*: i personaggi vivrebbero anche senza host, ma con un runtime di circa 10 MB, più lento, e una fase molto più complessa.
- *Console con i soli messaggi uditi*: coerente con lo spazio del mondo, ma i messaggi continuerebbero a perdersi.

**Conseguenze.**
- Senza host i personaggi tornano fermi, come in F05 (CHAR-001.d); il vantaggio della modalità solo browser di D-009 si perde.
- I personaggi guidati da un programma reagiscono in tempo reale: una sessione non si rigioca identica. Il core resta deterministico per mondo, fisica e navigazione.
- Il core perde l'interprete (circa 2500 righe e 1200 di test); gli esempi si riscrivono in Python.
- F06 si chiude com'è stata consegnata; la sua retro registra che il linguaggio, provato, non ha funzionato: è il primo requisito scoperto sbagliato usando il sistema.

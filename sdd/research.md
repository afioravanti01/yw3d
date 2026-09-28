# Ricerca: agenti LLM in un mondo dichiarativo

Il filone principale di yw3d dopo F09 (D-013). Come [experiment.md](experiment.md) per l'SDD, questo documento raccoglie domande, ipotesi, protocollo e diario; i risultati di ogni serie di esecuzioni stanno nel diario, con i dati.

## Perché yw3d
Mettere un LLM in un mondo a blocchi non è nuovo (Voyager, Mindcraft, Generative Agents, AI Town, Project Sid). yw3d ha tre caratteristiche che insieme sono rare:
- **Il mondo è un file.** Lo YAML è deterministico e validato: uno scenario si versiona, si confronta, si ripete.
- **Lo stesso corpo, cervelli diversi.** CLI di agenti da programmazione (Claude Code, Codex, opencode), API, cervello finto: stessa percezione, stesse azioni, stessa fisica (P3).
- **Codice e LLM sullo stesso personaggio.** Un personaggio può essere un programma Python o un agente: si può confrontare chi agisce con chi programma.

## Domande di ricerca

### R1 — Controllare o programmare
Per un compito nel mondo conviene che l'LLM guidi il personaggio passo per passo, che scriva il suo programma, o un ibrido in cui il programma richiama l'LLM davanti a un imprevisto?
- **Variabili:** modalità (controllo, programma, ibrido); modello; perturbazioni sì/no.
- **Misure:** successo, passi, tempo di simulazione, token, costo, latenza; tenuta dopo una perturbazione.
- **Ipotesi H-R1:** il programma vince in costo e affidabilità sui compiti di routine; il controllo passo per passo regge meglio gli imprevisti; l'ibrido ottiene il successo del controllo con un costo vicino a quello del programma.

### R2 — Percezione con un contesto limitato
Quanta percezione serve, e in che forma, per agire bene spendendo poco contesto?
- **Variabili:** percezione spinta (tutta la mappa a ogni richiesta, come oggi) o tirata (riassunto breve più strumenti a richiesta: guardare, descrivere un luogo, ricordare); osservabilità completa o parziale; testo o anche immagine della propria visuale.
- **Misure:** successo, token di percezione per richiesta, strumenti usati.
- **Ipotesi H-R2:** con la percezione tirata il successo resta simile e i token scendono di molto; con l'osservabilità parziale i modelli si separano più nettamente.

### R3 — Imparare dall'esperienza
Una memoria tra episodi, salvata in SQLite, migliora un agente sullo stesso scenario o su scenari simili?
- **Variabili:** memoria azzerata, individuale o condivisa tra agenti; con o senza riflessione (sintesi periodica delle osservazioni).
- **Misure:** successo e passi in funzione dell'episodio; dimensione e pertinenza dei ricordi recuperati.
- **Ipotesi H-R3:** con la memoria i passi scendono nei primi episodi e poi si stabilizzano; senza riflessione la memoria che cresce peggiora i risultati; la memoria condivisa accelera gli agenti che arrivano dopo.
- **Nota:** con la memoria gli episodi non sono indipendenti; il disegno lo dichiara.

### R4 — Socialità e vita spontanea
Cosa fanno gli agenti tra loro, e da soli, quando nessuno dà loro un compito?
- **Scenari sociali:** un personaggio ha uno stato interno (per esempio arrabbiato) visibile all'osservatore e non agli altri agenti; ci si chiede se gli altri lo notino da ciò che dice e fa, se intervengano senza che nessuno lo chieda, se l'intervento cambi il suo stato.
- **Vita spontanea:** iniziativa autonoma a intervalli, per ore di simulazione.
- **Misure:** ripetitività delle azioni, deriva dalla persona, grafo di chi parla con chi, iniziative prese.
- **Ipotesi H-R4:** senza obiettivi gli agenti cadono in cicli ripetitivi (passeggiare, salutare, commentare); con obiettivi e memoria i cicli si allungano ma non spariscono.
- **Costo:** con i prezzi misurati in F08 (0,046 $ a richiesta con Opus via Claude Code), 10 agenti che decidono ogni 10 s per un'ora fanno 3600 richieste, circa 165 $. Le sessioni lunghe usano modelli economici o locali.

### R5 — LLM che costruiscono il mondo
Un LLM sa scrivere un mondo o un oggetto valido e coerente nello spazio a partire da una descrizione?
- **Variabili:** modello; descrizione breve o dettagliata; con o senza correzione dagli errori di validazione.
- **Misure:** validità al primo tentativo e dopo le correzioni, conflitti tra strutture, rispetto della descrizione (giudizio umano con una griglia).
- **Ipotesi H-R5:** la validità al primo tentativo è alta sulla sintassi e bassa sulla coerenza spaziale; gli errori con file, riga e campo portano a un mondo valido in pochi tentativi.

### Esplorazione
Oltre alle domande, si osserva cosa fanno gli agenti in scenari aperti, senza verificatore. Le osservazioni vanno nel diario e possono diventare domande nuove (R6, R7…).

## Protocollo
Ogni serie di esecuzioni dichiara, prima di partire:
- domanda e ipotesi;
- scenario (file del mondo alla revisione git), cervelli con modello ed effort, versione delle istruzioni;
- variabili e misure;
- numero di esecuzioni per condizione (almeno 5) e budget di costo.

Dopo: dati grezzi (tracciati) conservati; rapporto con media e variabilità; esito dell'ipotesi (confermata, smentita, dati insufficienti). Il cervello finto esegue ogni scenario prima dei modelli veri, per verificare lo scenario a costo zero.

**Minacce alla validità**, da ricordare in ogni analisi: variabilità degli LLM tra esecuzioni; sensibilità alle istruzioni; modelli che cambiano nel tempo con lo stesso nome; conoscenze pregresse dei modelli su Minecraft e simili; **esito dichiarato dall'agente** (F10), non verificato dall'esterno, da controllare a campione rigiocando le esecuzioni.

**Il mondo non si ferma (D-014).** Mentre un agente pensa il mondo va avanti: la latenza di un modello cambia il mondo che trova quando agisce. È una caratteristica del modello, da misurare e da riportare accanto agli esiti, non un disturbo da eliminare. Per questo le esecuzioni non si ripetono identiche, e le conclusioni si traggono da più esecuzioni per condizione.

## Stato
Le domande richiedono il laboratorio di F10 ([roadmap](roadmap.md)). Fino ad allora il diario raccoglie solo osservazioni.

| Serie | Domanda | Scenario | Cervelli | Esecuzioni | Costo | Esito |
|---|---|---|---|---|---|---|

## Diario
- **2026-09-28** Avvio del filone (D-013). Dalle prove d'uso di F08 restano tre osservazioni che valgono come prime ipotesi: un LLM tende a pianificare un passo alla volta e a non chiedere di continuare; un personaggio «burbero» rifiuta le richieste restando nel personaggio; un saluto interrompe una commissione. Latenza misurata: 3,8–8,3 s per Claude Code (`sonnet`, effort `low`), 8–10 s per Codex, 7,8–43 s per opencode con il modello gratuito.
- **2026-09-28** Scelta di metodo (D-014): niente tempo a turni. Gli agenti agiscono in un mondo che non li aspetta, come nell'uso reale; la latenza entra tra le misure.

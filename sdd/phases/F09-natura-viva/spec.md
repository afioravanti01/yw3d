# F09 — Natura viva: tempo e luce

| | |
|---|---|
| Stato | **approved** (G1, 2026-09-27) |
| Versione | 0.2: domande aperte risolte |
| Data | 2026-09-27 |
| Piano | [plan.md](plan.md) |

## Obiettivo
Il mondo ha un'**ora del giorno** che scorre: il sole attraversa il cielo, tramonta, arriva una notte leggibile con la luna e le finestre illuminate, poi l'alba. Agenti e programmi conoscono l'ora e decidono loro cosa farne. Le foglie ondeggiano al vento e l'acqua si muove. Particelle e audio ambientale restano a una fase successiva.

## Contesto
- Roadmap F09 (natura viva), nota di F06: un orologio del mondo a disposizione dei programmi. Costituzione: P2 (il core resta deterministico), P3 (solo la fisica muove).
- Spec vive coinvolte: [rendering.md](../../specs/rendering.md), [world-file.md](../../specs/world-file.md), [protocol.md](../../specs/protocol.md), [python.md](../../specs/python.md), [agents.md](../../specs/agents.md), [dialogue.md](../../specs/dialogue.md), [debug.md](../../specs/debug.md), [performance.md](../../specs/performance.md).
- Oggi il sole è fisso (tardo pomeriggio da ovest) e le ombre si ricalcolano solo quando cambia il terreno; acqua e foglie sono ferme.

## Fuori scope
- Particelle (polline, lucciole) e audio ambientale: fase successiva.
- Meteo (pioggia, nuvole), stagioni, latitudine: il giorno è sempre uguale.
- Erba animata: l'erba non esiste come oggetto, solo come colore dei blocchi.
- Regole del mondo per la notte (personaggi che dormono, negozi chiusi): le decide chi programma i personaggi.
- Luci portate dai personaggi (lanterne).

## Storie utente
- **US-1** Come osservatore, vedo passare il giorno: il sole sale e scende, il cielo cambia colore, al tramonto la luce diventa calda.
- **US-2** Come osservatore, di notte vedo ancora il mondo: la luna, le stelle, le finestre delle case accese.
- **US-3** Come autore, fisso nel file del mondo l'ora di partenza e la durata del giorno.
- **US-4** Come autore di un agente o di un programma, il mio personaggio sa che ore sono: Marta può dire «all'alba abboccano meglio» sapendo se è l'alba.
- **US-5** Come osservatore, porto il mondo a un'ora precisa per vedere cosa succede di notte, senza aspettare.
- **US-6** Come autore, aggiungo al mondo una scimmietta guidata da un LLM che ogni tot secondi decide dove andare (A9.1).

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### TIME-001 — Orologio del mondo
- **a** `[unit]` Il mondo ha un'ora del giorno che avanza con il tempo simulato: un giorno dura 60 minuti reali, o quanti ne dichiara il file del mondo; il file dichiara anche l'ora di partenza, alle 08:00 se non la dichiara (Q1). Stessa ora di partenza e stesso tempo simulato danno sempre la stessa ora.
- **b** `[unit]` Con l'host l'ora è una sola: la stessa per tutte le viste, per i personaggi e per il terminale. Alla ricarica del file del mondo l'ora continua, come la posizione del giocatore; riparte dall'ora del file al riavvio dell'host o se nel file cambia `time` (Q2).
- **c** `[e2e]` Senza host, la pagina fa scorrere l'ora da sé, a partire da quella del file.
- **d** `[unit]` L'ora determina la parte del giorno: alba dalle 05:30 alle 07:00, giorno fino alle 18:30, tramonto fino alle 20:00, notte fino alle 05:30 (Q4).

### TIME-002 — Comando `/time`
- **a** `[unit]` `/time` nella console mostra l'ora del mondo e la parte del giorno. `/time HH:MM` porta il mondo a quell'ora, per tutte le viste; lo può fare la vista che guida e il terminale dell'host, non le viste che guardano. Non c'è pausa né accelerazione del tempo (Q3).

### RENDER-008 — Notte leggibile
- **a** `[manuale]` Di notte il mondo si vede: una luce lunare fredda e debole, il cielo blu scuro con le stelle, le forme riconoscibili a qualche decina di metri.
- **b** `[manuale]` Di notte le finestre delle case sono illuminate di una luce calda, visibile da lontano; di giorno no.

### RENDER-009 — Vento e acqua
- **a** ~~Le foglie degli alberi ondeggiano leggermente, come mosse dal vento~~ — rimosso (A9.3).
- **b** ~~La superficie dell'acqua si muove con piccole onde~~ — rimosso (A9.4).

### TIME-003 — Osservare un giorno
- **a** `[manuale]` Seguire il mondo per un giorno intero è piacevole e leggibile: alba e tramonto si riconoscono, la notte non è mai nera, i passaggi di luce sono continui, senza scatti; le ombre cambiano direzione solo ogni decimo del giorno (A9.2).

### CHAR-003 — Animali (emendamento A9.1)
- **a** `[unit]` Un personaggio può dichiarare `body: monkey` (predefinito `human`): una scimmietta, alta circa 0,7 m, con un'entità fisica più piccola di quella di una persona. Si guida come ogni personaggio: con un agente, un programma o un controllore.
- **b** `[manuale]` La scimmietta ha una figura propria, simpatica e riconoscibile (pelo marrone, muso chiaro, coda lunga), che sta ferma, cammina, corre e salta con animazioni sue; ha il nome sopra la testa come gli altri.
- **c** `[unit]` L'agente di un animale riceve istruzioni da animale: non parla la lingua degli umani, si muove, guarda, segue, e al più emette versi brevi. Con l'iniziativa autonoma e un intervallo (`every`, AGENT-004.b) decide da sé dove andare.
- **d** `[manuale]` Con un agente autonomo, a ogni intervallo la scimmietta si sposta per il mondo in modo vivace e plausibile (verso alberi, persone, il laghetto), senza incastrarsi.

## Requisiti MODIFICATI

### RENDER-003 — Luce e ombre
- **Prima:** a `[manuale]` Una luce solare direzionale proietta sul terreno le ombre dei rilievi. b `[manuale]` Una luce ambientale cielo/terra dà luminosità diverse a facce con orientamenti diversi; le facce in ombra non sono mai nere.
- **Dopo:**
- **a** `[manuale]` Il sole si muove secondo l'ora: sorge a est, è alto a mezzogiorno, tramonta a ovest; le ombre di rilievi, alberi e case lo seguono. Di notte la luce viene dalla luna.
- **b** `[manuale]` Una luce ambientale cielo/terra, che cambia con l'ora, dà luminosità diverse a facce con orientamenti diversi; le facce in ombra non sono mai nere, nemmeno di notte.
- **Motivo:** il sole fisso diventa il ciclo del giorno.

### RENDER-004 — Cielo e nebbia
- **Prima:** a `[manuale]` Il cielo è un gradiente verticale: chiaro all'orizzonte, più saturo allo zenit. b `[manuale]` La nebbia […] ha il colore dell'orizzonte […].
- **Dopo:** b invariato; a diventa:
- **a** `[manuale]` Il cielo è un gradiente verticale, chiaro all'orizzonte e più saturo allo zenit, con colori che seguono l'ora: azzurro di giorno, caldi all'alba e al tramonto, blu scuro con le stelle di notte. Si vedono il sole e, di notte, la luna.
- **Motivo:** il cielo segue il ciclo del giorno; la nebbia, del colore dell'orizzonte, lo segue da sé.

### RENDER-007 — Acqua
- **Prima:** criteri a–c.
- **Dopo:** criteri a–c invariati; l'acqua animata è in RENDER-009.b.
- **Motivo:** nessun cambiamento ai criteri esistenti; la voce resta per rimandare al nuovo criterio.

### YAML-001 — File del mondo
- **Prima:** a `[unit]` […] i luoghi (`places`), i personaggi (`characters`) e le impostazioni degli agenti (`agents`) […].
- **Dopo:** criteri b–f invariati; a diventa:
- **a** `[unit]` […] i luoghi (`places`), i personaggi (`characters`), le impostazioni degli agenti (`agents`) e il tempo (`time`: ora di partenza e durata del giorno, TIME-001). […]
- **Motivo:** l'orologio si configura nel file del mondo.

### PROTO-002 — Percezione
- **Prima:** a `[unit]` Il controllore riceve la percezione del personaggio 4 volte al secondo: posizione, orientamento, se è a terra o in acqua, azione in corso, entità entro 32 blocchi […].
- **Dopo:** b–c invariati; a diventa:
- **a** `[unit]` Il controllore riceve la percezione del personaggio 4 volte al secondo: posizione, orientamento, se è a terra o in acqua, azione in corso, entità entro 32 blocchi (id, nome, tipo, posizione, distanza), ora del mondo e parte del giorno.
- **Motivo:** i personaggi conoscono l'ora (US-4).

### PY-002 — Struttura di un programma
- **Prima:** d `[unit]` Il programma legge dalla libreria, senza chiederli: posizione e stato del personaggio, entità vicine, la mappa del mondo […].
- **Dopo:** a–c ed e invariati; d diventa:
- **d** `[unit]` Il programma legge dalla libreria, senza chiederli: posizione e stato del personaggio, entità vicine (PROTO-002.a), la mappa del mondo con id, nomi e descrizioni (MAP-002), l'ora del mondo e la parte del giorno.
- **Motivo:** US-4.

### AGENT-002 — Conoscenza del mondo
- **Prima:** a `[unit]` Ogni richiesta all'LLM contiene: […] il tempo del mondo […].
- **Dopo:** b–c invariati; a diventa:
- **a** `[unit]` Ogni richiesta all'LLM contiene: […] l'ora del mondo e la parte del giorno […].
- **Motivo:** US-4; oggi l'agente riceve solo i secondi dall'avvio.

### DIALOG-005 — Console dei messaggi
- **Prima:** f `[unit]` […] `/help`, `/world`, `/describe` […].
- **Dopo:** f come prima, con in più `/time` (TIME-002) nell'elenco di `/help`, e l'ora del mondo nell'intestazione di `/world`.
- **Motivo:** l'ora si legge e si imposta dalla console.

### DEBUG-001 — Overlay diagnostico
- **Prima:** a `[manuale]` […].
- **Dopo:** a `[manuale]` Come prima, con in più l'ora del mondo e la parte del giorno.
- **Motivo:** l'ora è la prima cosa da sapere guardando la luce.

### PERF-001 — Prestazioni
- **Prima:** b `[manuale]` Il frame rate medio è di almeno 60 fps durante 30 s di volo a quota media sopra il mondo.
- **Dopo:** a invariato; b diventa:
- **b** `[manuale]` Il frame rate medio è di almeno 60 fps durante 30 s di volo a quota media sopra il mondo, con il ciclo del giorno, il vento sulle foglie e l'acqua animata, a qualunque ora.
- **Motivo:** ombre che si muovono e animazioni hanno un costo.

### CHAR-001 — Personaggi nel file del mondo (emendamento A9.5)
- **Prima:** criteri a–d; nessuno dice dove si ferma un personaggio accanto a un gradino.
- **Dopo:** a–d invariati; si aggiunge:
- **e** `[unit]` Un personaggio fermo non resta appoggiato solo al bordo di un gradino: se sotto il suo centro non c'è appoggio, si scosta di quel poco che basta per scendere sulla propria colonna. Vale alla partenza e ogni volta che si ferma; il giocatore resta libero di stare sui bordi.
- **Motivo:** largo 1,2 blocchi, un personaggio al centro di una colonna sporge di un decimo di blocco su quelle vicine; accanto a un gradino più alto restava sospeso su quella striscia, con i piedi in aria.

## Requisiti RIMOSSI
Nessuno.

## Domande risolte
Chiuse con l'utente il 2026-09-27, prima di G1: tutte sulla proposta.

| # | Domanda | Decisione | Effetto sulla spec |
|---|---|---|---|
| Q1 | Ora di partenza predefinita | 08:00 | TIME-001.a |
| Q2 | L'ora alla ricarica | Continua; riparte dal file al riavvio dell'host o se cambia `time` | TIME-001.b |
| Q3 | Chi imposta l'ora | La vista che guida e il terminale, con `/time HH:MM`; niente pausa né accelerazione | TIME-002.a |
| Q4 | Parti del giorno | alba 05:30–07:00, giorno 07:00–18:30, tramonto 18:30–20:00, notte 20:00–05:30 | TIME-001.d |
| Q5 | Ombre | Ricalcolate a ogni decimo del giorno (A9.2) | piano |

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
| A9.1 | 2026-09-27 | CHAR-003 (nuovo), CHAR-001.a | Un personaggio può avere il corpo di una scimmietta (`body: monkey`), con figura, dimensioni e animazioni proprie; l'agente di un animale riceve istruzioni da animale e, con l'iniziativa autonoma, si sposta da sé a intervalli configurabili | Un primo animale nel mondo, guidato da un LLM | Utente (richiesta diretta, prima di G2) |
| A9.2 | 2026-09-27 | TIME-003.a, Q5 | Le ombre non si muovono con continuità: la direzione della luce cambia a scatti, ogni decimo del giorno (6 minuti con il giorno di un'ora); i colori della luce e del cielo restano continui | Nella prova d'uso le ombre aggiornate ogni 2 s «scattano», quelle aggiornate a ogni frame creano «un continuo movimento che rende la scena strana» | Utente (proposta diretta nella prova d'uso di T9.05) |
| A9.3 | 2026-09-27 | RENDER-009.a | Rimosso: niente vento sulle foglie | Nella prova il movimento non si vedeva; l'utente: «non mi interessa questo movimento delle foglie e potrebbe appesantire molto la scena» | Utente (richiesta diretta) |
| A9.4 | 2026-09-27 | RENDER-009.b, RENDER-007 | Rimosso: niente acqua animata; RENDER-009 resta senza criteri | L'utente: «salta l'acqua» | Utente (richiesta diretta) |
| A9.5 | 2026-09-27 | CHAR-001.e (nuovo) | Un personaggio fermo appoggiato solo al bordo di un gradino si scosta e scende sulla propria colonna | L'utente: Anselmo e Nina «non si poggiano sul suolo ma sono accanto a uno scalino in aria» | Utente («si approvo A9.5») |

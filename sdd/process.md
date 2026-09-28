# Processo SDD di yw3d

## Artefatti

```
sdd/
├─ constitution.md       principi e stack (cambia raramente)
├─ process.md            questo documento
├─ roadmap.md            fasi, stato, dipendenze
├─ decisions.md          registro delle decisioni (ADR leggere)
├─ experiment.md         ipotesi e metriche dell'esperimento SDD
├─ research.md           domande, protocollo e diario della ricerca sugli agenti LLM
├─ specs/                SPEC VIVE: come si comporta il sistema oggi, per area
├─ phases/FNN-nome/
│  ├─ spec.md            cosa e perché della fase (delta rispetto alle spec vive)
│  ├─ plan.md            come: architettura, decisioni, rischi, test, TASK
│  └─ retro.md           esito, metriche e lezioni (a fine fase)
└─ templates/            modelli di spec, piano, retro
```

## Due livelli di spec

- **Spec di fase = delta.** Elenca i requisiti AGGIUNTI, MODIFICATI e RIMOSSI in quella fase. Serve a decidere e a implementare.
- **Spec vive = stato attuale.** `sdd/specs/<area>.md` contiene la verità consolidata di un'area. Serve a capire il sistema senza rileggere tutta la storia.

Alla chiusura di una fase il delta viene fuso nelle spec vive. Da quel momento la spec di fase è storia e non si modifica più.

Perché: con le sole spec di fase, dopo N fasi la verità è sparsa in N documenti che si correggono a vicenda, e il costo per capire il sistema cresce con la storia del progetto. È il primo punto in cui l'SDD smette di scalare (D-004).

## Ciclo di vita di una fase

| # | Passo | Gate | Stato della fase |
|---|---|---|---|
| 1 | Spec | **G1**: l'utente approva la spec | `specifying` |
| 2 | Piano con task | **G2**: l'utente approva il piano | `planning` |
| 3 | Implementazione, un task alla volta | — | `implementing` |
| 4 | Verifica | **G3**: l'utente accetta la fase | `verifying` |
| 5 | Chiusura: merge nelle spec vive, retro, metriche | — | `done` |

Stati dei documenti: `draft` → `approved`. Una spec approvata che riceve emendamenti resta `approved` e registra gli emendamenti nella sua tabella.

### 1. Spec
- Si scrive **just-in-time**, quando la fase precedente è chiusa, così incorpora ciò che si è imparato. Eccezione: F01.
- Contiene obiettivo, contesto, fuori scope, storie utente, requisiti con criteri di accettazione verificabili, domande aperte.
- Ogni criterio dichiara come si verifica: `[unit]`, `[e2e]` o `[manuale]`.
- Descrive comportamento osservabile, non implementazione: niente nomi di file, classi o algoritmi, salvo vincoli esterni.
- Le domande aperte si chiudono (o si rinviano esplicitamente) prima di G1.
- **Criteri sull'esperienza.** Per un linguaggio, un'interazione o un'API destinata agli autori, accanto ai criteri funzionali la spec dichiara criteri `[manuale]` sulla comodità d'uso: cosa l'utente deve riuscire a scrivere, leggere o fare, e con quale sforzo. (Dalla retro di F06: 80 criteri su 80 superati per un linguaggio poi rifiutato.)

### 2. Piano
- Si scrive dopo G1. (Per F01 spec e piano sono stati scritti insieme: la spec si approva comunque per prima.)
- Contiene struttura del codice, decisioni tecniche con alternative scartate, dipendenze nuove, strategia di test, rischi, **task**.
- Un task è piccolo (circa una sessione di lavoro di un agente), ha un ID `T<fase>.<nn>`, cita i requisiti che copre, le dipendenze e un criterio di "fatto".
- **Prova d'uso presto.** Se la fase introduce un linguaggio, un'interazione o un'API per gli autori, il piano mette subito, dopo il primo nucleo funzionante, un punto di controllo in cui l'utente scrive o usa qualcosa di vero; libreria completa, esempi e guida vengono dopo. (Dalla retro di F06.) Le **regole d'interazione** (a chi arriva un messaggio, a quale distanza, cosa vede chi guarda) si mettono alla prova d'uso prima di costruirci sopra: la spec le propone, l'uso le conferma. (Dalla retro di F07: «@nome a qualunque distanza», deciso a tavolino, è stato rovesciato usandolo.)

### 3. Implementazione
- Un task alla volta, rispettando le dipendenze. A fine task: checkbox spuntata nel piano e commit `T1.05: <descrizione>` con `npm run commit -- -m "…"`, che esegue `npm run check`, e anche `npm run e2e` se il commit tocca ciò che gli e2e verificano (viste, host, protocollo, test e2e; oppure con `--e2e`), e registra il commit solo se tutto è verde (da F07).
- Il titolo di ogni test inizia con i criteri che verifica: `it('WORLD-002.c: out-of-bounds read returns air', ...)`.
- **Scostarsi dal piano** (il *come*) è consentito: si registra nella tabella "Deviazioni" del piano e si prosegue.
- **Scostarsi dalla spec** (il *cosa*) non è consentito: ci si ferma, si propone un emendamento nel "Registro emendamenti" della spec e si attende l'approvazione.
- I task scoperti durante il lavoro si aggiungono al piano con suffisso `+` (es. `T1.15+`), così si possono contare.

### 4. Verifica
- `npm run check`, `npm run e2e` e `npm run sdd:trace -- FNN` verdi.
- I criteri `[manuale]` si verificano con l'utente tramite una checklist; l'esito va nella retro. La checklist elenca a parte le **misure da riportare** (fps, tempi, conteggi) e i controlli sì/no; alla chiusura, una misura non riportata si registra come mancante. (Dalla retro di F07.)

### 5. Chiusura
- Fondere il delta della spec nelle spec vive.
- Scrivere `retro.md` con le metriche del template.
- Aggiornare la tabella di [experiment.md](experiment.md) e lo stato in [roadmap.md](roadmap.md).

## Convenzioni degli ID

| Oggetto | Formato | Esempio |
|---|---|---|
| Requisito | `AREA-NNN`: stabile, mai riusato | `WORLD-006` |
| Criterio di accettazione | ID requisito + lettera | `WORLD-006.b` |
| Task | `T<fase>.<nn>` (`+` se non pianificato) | `T1.07`, `T1.15+` |
| Decisione | `D-NNN` | `D-002` |
| Emendamento | `A<fase>.<n>` | `A1.1` |
| Domanda aperta | `Q<n>`, locale alla spec | `Q3` |

Le aree e i file delle spec vive sono elencati in [specs/README.md](specs/README.md).

Modificare un requisito in una fase successiva: la spec di fase lo riporta in "Requisiti MODIFICATI" con il testo completo nuovo e il motivo; l'ID non cambia. I criteri rimossi non vengono riassegnati ad altro.

## Git

Un commit per ogni gate e per ogni task: `spec(F01): approved`, `plan(F01): approved`, `T1.05: add world storage`, `close(F01): merge living specs and retro`. La storia git è parte dei dati dell'esperimento: mostra quando e quanto cambiano spec e piani.

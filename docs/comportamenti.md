# Comportamenti dei personaggi

Un **comportamento** descrive in YAML cosa fa un personaggio: un giro, un saluto, una domanda al giocatore. Non è un programma: non serve permesso per eseguirlo, gira nel mondo passo dopo passo (lo stesso mondo dà sempre gli stessi risultati) e funziona anche nel browser senza host. Per ciò che il linguaggio non sa esprimere resta il protocollo dei [controllori](controllori.md), in qualunque linguaggio.

Esempi completi: [examples/valle](../examples/valle/world.yaml) (Tobia chiede dove andare, Nina ha due stati) ed [examples/paese](../examples/paese/) (venti abitanti con lo stesso comportamento della libreria).

## Dove si scrive

Nel personaggio, nel file del mondo:

```yaml
characters:
  - id: tobia
    name: Tobia
    at: [154, 70]
    behavior:
      routine:
        - walk_to: piazza
        - say: Buongiorno!
```

In un file YAML della cartella del mondo: `behavior: { file: comportamenti/tobia.yaml }`. Il file contiene il comportamento (qui sopra, tutto quello che sta sotto `behavior:`).

Dalla **libreria**, con i suoi parametri: `behavior: { use: passeggio, params: { tappe: [piazza, pozzo] } }` (vedi [Libreria e parametri](#libreria-e-parametri)).

Un personaggio ha un comportamento **oppure** un controllore (`controller`), non entrambi. Salvando il file del mondo o un file di comportamenti il mondo si ricarica e i comportamenti ripartono da capo, con la memoria vuota.

## Routine e reazioni

```yaml
behavior:
  routine:              # istruzioni in ordine; finita l'ultima, si ricomincia
    - walk_to: pozzo
    - wait: 5s
    - walk_to: piazza
  repeat: false         # facoltativo: la routine una volta sola, poi il personaggio sta fermo
  reactions:            # interrompono la routine, poi la routine riprende
    - on: interacted
      do:
        - look_at: player
        - say: Ciao {player}!
```

- **Una reazione interrompe** ciò che il personaggio sta facendo; finite le sue istruzioni, la routine riprende dall'istruzione interrotta, che **ricomincia**: un `walk_to` ricalcola la strada, un `wait` riparte da zero, una domanda si ripete.
- **Priorità**: le reazioni valgono nell'ordine in cui sono scritte. Una reazione interrompe solo quelle scritte dopo di lei; un evento che non può interrompere la reazione in corso **si ignora**. La reazione interrotta non riprende.
- **Limiti**: `every: 30s` (al più una volta ogni 30 secondi), `once: true` (una volta sola).
- **Condizioni**: `when:` con una condizione o un elenco (devono valere tutte).

```yaml
reactions:
  - on: { near: player, within: 6 }
    when: { not_flag: salutato }
    every: 60s
    do:
      - say: Salve, {player}!
      - set: salutato
```

## Istruzioni

Un'istruzione è un elemento della lista con **una** chiave che dice cosa fare, più le sue opzioni accanto. Le durate si scrivono in secondi (`5`) o come `30s`, `2min`.

| Istruzione | Esempio | Finisce |
|---|---|---|
| `walk_to` | `walk_to: laghetto1` · `walk_to: [120, 80]` · `speed: 2` (m/s, 0,5–7) | all'arrivo |
| `look_at` | `look_at: player` | subito |
| `say` | `say: Buongiorno, {player}!` (1–500 caratteri) | quando la frase è detta |
| `follow` | `follow: marta` · `distance: 3` · `speed: 2` · `for: 1min` (obbligatorio) | dopo `for` |
| `wait` | `wait: 10s` | dopo il tempo |
| `ask` | vedi [Domande al giocatore](#domande-al-giocatore) | alla risposta |
| `set`, `unset` | `set: salutato` | subito |
| `count` | `count: giri` (aggiunge 1) · `add: 5` · `to: 0` | subito |
| `if` | `if: { flag: salutato }` · `then: [...]` · `else: [...]` | subito |
| `goto` | `goto: riposo` (vedi [Stati](#stati)) | subito |

**Mete.** `walk_to` e `look_at` accettano l'id di qualunque elemento della mappa: un luogo, una struttura, una distribuzione, un personaggio, `player`. Verso una casa si arriva davanti alla porta, verso un laghetto sulla sponda più vicina, verso un albero ai piedi del tronco, verso un'area appena dentro; se il personaggio è già dentro l'area, `walk_to` è subito finito. `[x, z]` è una colonna del mondo. Un elenco di mete si visita in ordine:

```yaml
- walk_to: [piazza, pozzo, [120, 80]]
  speed: 1.2
```

**Fallimenti.** Se un'azione fallisce (una meta irraggiungibile, un personaggio che non esiste più) il terminale dell'host lo dice, con il file e la riga; il personaggio esegue le istruzioni di `on_fail`, se ci sono, altrimenti passa all'istruzione successiva.

```yaml
- walk_to: casolare
  on_fail:
    - say: Da qui non riesco ad arrivarci.
```

**Nei testi** di `say` e delle domande si possono citare i nomi: `{player}` (il giocatore), `{speaker}` (chi ha parlato, in una reazione a una frase), `{mentions}` (l'elemento nominato), `{answer}` (la risposta, nei rami di una domanda).

**Istruzioni istantanee** (`set`, `unset`, `count`, `if`, `goto`): al più 100 in un passo della simulazione. Una routine fatta solo di istruzioni istantanee non blocca il mondo: continua al passo dopo, e il terminale segnala il personaggio (è quasi sempre un ciclo che non aspetta mai).

## Eventi

| Evento | Esempio | Scatta quando |
|---|---|---|
| `interacted` | `on: interacted` | il giocatore, entro 3 m, preme E |
| `heard` | `on: { heard: { from: player, to_me: true, mentions: any } }` | qualcuno dice una frase entro 16 blocchi |
| `near` | `on: { near: player, within: 6 }` | un personaggio o il giocatore entra nel raggio |
| `away` | `on: { away: marta, within: 10 }` | ne esce |
| `enter` | `on: { enter: orti, who: marta }` | il giocatore (o `who`) entra in un'area |
| `leave` | `on: { leave: borgo }` | ne esce |
| `after` | `on: { after: 90s }` | il tempo passato nello stato corrente |

Entrare e uscire scattano **al passaggio**, non finché si resta dentro o fuori. `heard` filtra per chi parla (`from`), per le frasi rivolte al personaggio (`to_me`) e per quelle che nominano un elemento della mappa (`mentions: any` oppure un id). Nelle istruzioni di una reazione a una frase, `heard.from` e `heard.mentions` sono mete:

```yaml
- on: { heard: { from: player, mentions: any } }
  do:
    - say: Vado a {mentions}.
    - walk_to: heard.mentions
```

## Condizioni

| Condizione | Esempio | Vale quando |
|---|---|---|
| `flag` | `{ flag: salutato }` | il flag è attivo |
| `not_flag` | `{ not_flag: salutato }` | non lo è |
| `counter` | `{ counter: giri, equals: 3 }` · `below: 3` · `above: 3` | il contatore rispetta il confronto |
| `near` | `{ near: player, within: 5 }` | l'entità è entro il raggio |
| `inside` | `{ inside: orti }` · `who: player` | il personaggio (o `who`) è nell'area |
| `chance` | `{ chance: 0.3 }` | nel 30% dei casi |

Più condizioni in un elenco valgono tutte insieme: `when: [{ flag: aperto }, { chance: 0.5 }]`. Il caso è deterministico: dipende dal seed del mondo, dal personaggio e dal momento, quindi lo stesso mondo ripete le stesse scelte.

## Memoria

Flag e contatori si dichiarano; un nome non dichiarato è un errore.

```yaml
behavior:
  memory: { flags: [salutato], counters: [giri] }
  routine:
    - count: giri
    - if: { counter: giri, equals: 3 }
      then:
        - say: Terzo giro!
        - count: giri
          to: 0
```

Ogni personaggio ha la sua memoria, anche quando più personaggi usano lo stesso comportamento. La memoria si svuota quando il mondo si ricarica.

## Stati

Per i comportamenti con più modi di fare, gli stati: ognuno ha la sua routine e le sue reazioni; `start` dice il primo.

```yaml
behavior:
  start: lavoro
  states:
    lavoro:
      routine:
        - walk_to: orti
        - wait: 8s
      reactions:
        - on: { after: 90s }
          do: [{ goto: riposo }]
    riposo:
      routine:
        - walk_to: piazza
        - wait: 20s
        - goto: lavoro
  reactions:              # valgono in tutti gli stati, dopo quelle dello stato
    - on: interacted
      do: [{ say: Ho da fare! }]
```

`goto` interrompe ciò che è in corso e fa partire dall'inizio la routine del nuovo stato.

## Domande al giocatore

`ask` dice la domanda e aspetta, fermo, la risposta del giocatore: una frase rivolta a lui, oppure senza destinatario se è il personaggio più vicino tra quelli che aspettano. La frase che risponde non fa scattare reazioni.

```yaml
- ask: Dove devo andare?
  expect: place           # un elemento della mappa (il default)
  timeout: 40s            # per default 30 s
  then:
    - say: Vado a {answer}!
    - walk_to: answer
  not_understood:
    - say: Non conosco quel posto.
  no_answer:
    - say: Va bene, resto qui.
```

| `expect` | Rami | Capita quando la frase… |
|---|---|---|
| `place` | `then` (la risposta è la meta `answer`) | nomina esattamente un elemento della mappa |
| `yes_no` | `yes`, `no` | ha parole di un solo tipo: sì, si, certo, ok, va bene, d'accordo, volentieri, yes, yeah, sure; no, nope, nah |
| `{ one_of: [mela, pera] }` | `answers: { mela: [...], pera: [...] }` | nomina esattamente una delle opzioni |

Senza il ramo di una risposta si prosegue con l'istruzione dopo la domanda. **Come si capisce una frase**: si confrontano parole intere, senza maiuscole, accenti e punteggiatura; un nome dentro uno più lungo non conta («la casa del fabbro» nomina la casa del fabbro, non la casa). Così «laghetto1», «Laghetto del borgo» e «portami al laghetto del borgo» nominano lo stesso elemento; «il laghetto o la piazza?» ne nomina due e non è capita. Il linguaggio libero è compito degli agenti LLM.

## Libreria e parametri

Un comportamento usato da più personaggi va nella libreria (`behaviors` del file del mondo, o file YAML elencati lì), con nome e parametri tipizzati:

```yaml
behaviors:
  - file: comportamenti/abitanti.yaml     # un elenco di comportamenti
  - name: passeggio
    params:
      tappe: { type: list, of: id }
      pausa: { type: duration, default: 3s }
      saluto: { type: text, default: Buongiorno! }
    routine:
      - walk_to: $tappe
      - wait: $pausa
    reactions:
      - on: { near: player, within: 5 }
        every: 30s
        do: [{ say: $saluto }]

characters:
  - id: anna
    name: Anna
    at: [150, 60]
    behavior:
      use: passeggio
      params: { tappe: [piazza, pozzo], saluto: Salve! }
```

Tipi: `number`, `text`, `duration`, `point`, `id` e `list` (con `of`); `min` e `max` per i numeri. `$nome` sostituisce il valore intero di un campo. I parametri omessi prendono il default; sconosciuti, mancanti o fuori intervallo sono errori, con la riga del personaggio.

## Riferimenti e id

Nel file del mondo si usano gli id **dichiarati**: di luoghi, strutture, distribuzioni e personaggi, più `player`. Le strutture senza `id` ne hanno uno generato (`pond#1`, `stone_farmhouse#2`) che vale per i controllori e nel dialogo ma non nel file: per riferirsi a una struttura, le si dà un `id`. Riferimenti: `player`, `answer` (nei rami di una domanda), `heard.from` e `heard.mentions` (in una reazione a una frase).

## Parlare con i personaggi

- **Nel browser**: Invio apre la casella, Invio dice la frase, Esc annulla. La frase va al personaggio che guardi o a quello scritto all'inizio con `@id` (`@tobia al laghetto1`), e la sentono tutti i personaggi entro 16 blocchi (8 m). Il registro in basso mostra ciò che il giocatore sente.
- **Nel terminale di `yw3d`**: ogni riga scritta è una frase del giocatore (con `@id` per il destinatario); il terminale mostra ciò che il giocatore sente.
- **Da un programma**: un client WebSocket che parla come il giocatore (vedi [controllori](controllori.md#parlare-come-il-giocatore)).

## Errori

Il file del mondo si controlla prima di comporre il mondo: istruzioni, eventi e condizioni sconosciuti, campi mancanti o fuori intervallo, id, stati, flag e contatori che non esistono sono errori, con il file (anche esterno), la riga e il campo:

```
valle/world.yaml:84  error  characters[2].behavior.routine[0].wlak_to  unknown instruction (did you mean "walk_to"?): …
valle/comportamenti/abitanti.yaml:12  error  [0].routine[1].wait  expected a duration in seconds, such as 5 or "30s" or "2min", got "presto"
```

`npm run world:check -- <cartella>/world.yaml` controlla un file dal terminale.

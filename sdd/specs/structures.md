# Strutture (STRUCT)

Spec viva: registro, generazione e adattamento al terreno di alberi, case e laghetti. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### STRUCT-001 — Registro delle strutture
*Introdotto in F02 · ultima modifica: F06.*
- **a** `[unit]` Un tipo di struttura ha: nome univoco, schema dei parametri con tipi, intervalli e default, un generatore deterministico, un modo di adattamento al terreno (STRUCT-003) e, facoltativo, il punto d'arrivo per chi va verso la struttura (MAP-003.b).
- **b** `[unit]` Registrare un nome già usato produce un errore.
- **c** `[unit]` Codice esterno al core può registrare un nuovo tipo senza modificare il core; il tipo è subito utilizzabile nel YAML.
- **d** `[unit]` I parametri del YAML sono validati con lo schema del tipo, con errori nel formato di YAML-002.

### STRUCT-002 — Generazione deterministica delle strutture
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Stessi tipo, parametri, seed e rotazione producono gli stessi blocchi.
- **b** `[unit]` Seed diversi producono variazioni visibili dello stesso tipo (almeno una differenza nella forma, non solo nel colore).
- **c** `[unit]` Una struttura ruotata è la stessa struttura girata attorno al suo ancoraggio.

### STRUCT-003 — Adattamento al terreno
*Introdotto in F02 · ultima modifica: F02.*
Ogni tipo dichiara un modo di adattamento.
- **a** `[unit]` *Appoggio* (alberi): la struttura parte dalla superficie; sotto la base non ci sono vuoti.
- **b** `[unit]` *Livellamento* (case): il terreno sotto l'impronta è portato a una quota unica. Non ci sono vuoti sotto il pavimento né terreno dentro l'edificio.
- **c** `[unit]` Intorno a un'impronta livellata il terreno si raccorda: entro una fascia di 4 blocchi, tra colonne adiacenti il dislivello è al più di 1 blocco, salvo dove il terreno originale era già più ripido.
- **d** `[unit]` *Scavo* (laghetti): il bacino è scavato nel terreno, con il pelo dell'acqua sotto il bordo più basso.
- **e** `[unit]` Dopo l'adattamento la stratificazione di WORLD-006.d vale per le colonne modificate: erba o sabbia in superficie, terra, pietra; nessun blocco sospeso.

### STRUCT-004 — Conflitti tra strutture
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Se le impronte di due strutture posate singolarmente si sovrappongono si produce un avviso che cita entrambe (riga del file e tipo); il mondo si genera comunque e la struttura dichiarata dopo prevale.
- **b** `[unit]` Una struttura che esce dai limiti del mondo è un errore (YAML-002.c).

### STRUCT-005 — Alberi
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Sono registrate 3 specie: `oak` (quercia), `birch` (betulla), `willow` (salice piangente), con altezza, raggio della chioma e colori propri.
- **b** `[unit]` Ogni specie ha un'altezza entro un intervallo proprio, parametrizzabile: quercia 12–20 blocchi (6–10 m), betulla 14–22, salice 10–16.
- **c** `[unit]` Il tronco è fatto di blocchi di legno, la chioma di foglie; la chioma è collegata al tronco (nessun blocco di foglie isolato).
- **d** `[manuale]` Le 3 specie si riconoscono a colpo d'occhio dalla silhouette: quercia larga e tondeggiante, betulla alta e stretta con tronco chiaro, salice con rami ricadenti.

### STRUCT-006 — Case
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Sono registrati 2 stili: `stone_farmhouse` (casolare in pietra) e `wooden_hut` (capanno in legno), con larghezza e profondità parametrizzabili entro intervalli propri.
- **b** `[unit]` Ogni casa ha almeno una porta: un vano libero largo almeno 2 blocchi e alto almeno 5 (1 m × 2,5 m), raggiungibile dall'esterno a livello del terreno.
- **c** `[unit]` Ogni casa ha almeno una finestra (apertura) per lato lungo, un pavimento e un interno vuoto alto almeno 5 blocchi.
- **d** `[unit]` Il tetto è a falde: ogni falda sale di 1 blocco ogni 1–2 blocchi, con colmo lungo il lato lungo.
- **e** `[unit]` Dettagli di carattere (Q8): ogni casa ha un comignolo e travi a vista agli angoli in legno scuro; il capanno in legno poggia su un basamento in pietra alto almeno 1 blocco.
- **f** `[manuale]` I due stili hanno carattere diverso e non ricordano le case di Minecraft.

### STRUCT-007 — Laghetti
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Un laghetto ha forma irregolare (non un cerchio o un rettangolo), dimensione e profondità parametrizzabili.
- **b** `[unit]` L'acqua è contenuta: ogni blocco d'acqua ha sotto di sé e ai lati acqua o blocchi solidi.
- **c** `[unit]` Le sponde sono di sabbia o ghiaia, entro una fascia di 1–3 blocchi intorno all'acqua.
- **d** `[manuale]` Il laghetto appare naturale, con fondale e sponde digradanti.

### STRUCT-008 — Strutture dell'autore
*Introdotto in F04 · ultima modifica: F04.*
- **a** `[unit]` I file TypeScript o JavaScript nella sottocartella `structures/` della cartella del mondo registrano strutture (STRUCT-001) utilizzabili nel YAML, senza modificare il progetto yw3d.
- **b** `[unit]` Un errore in uno di questi file (sintassi, eccezione, nome già usato) produce un messaggio con il file e la causa; l'host non si ferma.
- **c** `[e2e]` Con le strutture dell'autore il browser ottiene lo stesso mondo dell'host (stesso hash).
- **d** `[unit]` Lanciare `yw3d` su una cartella equivale ad accettare di eseguirne il codice delle strutture; il comando lo ricorda nel terminale quando la cartella ne contiene (Q5).

# Tempo (TIME)

Spec viva: l'ora del mondo, il comando `/time` e il giorno che passa. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### TIME-001 — Orologio del mondo
*Introdotto in F09 · ultima modifica: F09.*
- **a** `[unit]` Il mondo ha un'ora del giorno che avanza con il tempo simulato: un giorno dura 60 minuti reali, o quanti ne dichiara il file del mondo; il file dichiara anche l'ora di partenza, alle 08:00 se non la dichiara (Q1). Stessa ora di partenza e stesso tempo simulato danno sempre la stessa ora.
- **b** `[unit]` Con l'host l'ora è una sola: la stessa per tutte le viste, per i personaggi e per il terminale. Alla ricarica del file del mondo l'ora continua, come la posizione del giocatore; riparte dall'ora del file al riavvio dell'host o se nel file cambia `time` (Q2).
- **c** `[e2e]` Senza host, la pagina fa scorrere l'ora da sé, a partire da quella del file.
- **d** `[unit]` L'ora determina la parte del giorno: alba dalle 05:30 alle 07:00, giorno fino alle 18:30, tramonto fino alle 20:00, notte fino alle 05:30 (Q4).

### TIME-002 — Comando `/time`
*Introdotto in F09 · ultima modifica: F09.*
- **a** `[unit]` `/time` nella console mostra l'ora del mondo e la parte del giorno. `/time HH:MM` porta il mondo a quell'ora, per tutte le viste; lo può fare la vista che guida e il terminale dell'host, non le viste che guardano. Non c'è pausa né accelerazione del tempo (Q3).

### TIME-003 — Osservare un giorno
*Introdotto in F09 · ultima modifica: F09 (emendamento A9.2).*
- **a** `[manuale]` Seguire il mondo per un giorno intero è piacevole e leggibile: alba e tramonto si riconoscono, la notte non è mai nera, i passaggi di luce sono continui, senza scatti; le ombre cambiano direzione solo ogni decimo del giorno (A9.2).

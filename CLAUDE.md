# yw3d: istruzioni per gli agenti

Mondo 3D a blocchi programmabile (vedi [README.md](README.md)). È anche un **esperimento di Spec-Driven Development**: il processo conta quanto il codice, e le sue metriche sono un risultato del progetto.

## Prima di iniziare
1. Leggi [sdd/constitution.md](sdd/constitution.md) e [sdd/process.md](sdd/process.md).
2. Trova la fase corrente e il suo stato in [sdd/roadmap.md](sdd/roadmap.md).
3. Leggi le spec vive delle aree toccate ([sdd/specs/](sdd/specs/)), poi `spec.md` e `plan.md` della fase.

## Regole
- Niente codice di prodotto se spec e piano della fase non sono `approved`.
- Un task alla volta, rispettando le dipendenze del piano. A fine task: `npm run check` verde, checkbox spuntata, commit `T<n>.<nn>: <descrizione>` (solo se l'utente ha autorizzato i commit).
- Il titolo di ogni test inizia con i criteri che verifica: `it('WORLD-003.b: …')`.
- Spec sbagliata o ambigua: fermati, proponi un emendamento nel registro della spec, attendi l'approvazione. Non correggere la spec in silenzio col codice.
- Scostamento dal piano: registralo nella tabella "Deviazioni" e prosegui.
- Task nuovi: aggiungili al piano con suffisso `+`.
- `src/core` non importa `three` e non usa il DOM.
- Documentazione in italiano; codice, commenti nel codice e commit in inglese.
- Spec = cosa e perché; piano = come. Niente codice nelle spec; documenti asciutti.

## Comandi (disponibili dopo T1.01)
| Comando | Uso |
|---|---|
| `npm run dev` | dev server |
| `npm run check` | typecheck + lint + test unitari |
| `npm run e2e` | test Playwright |
| `npm run sdd:trace -- F01` | matrice requisiti → task → test |

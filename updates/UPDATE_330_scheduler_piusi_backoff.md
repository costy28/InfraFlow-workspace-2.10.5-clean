# UPDATE 330 — Scheduler PIUSI cu backoff și log rar

Versiune: `2.12.310`  
Data: `2026-07-16`

## Ce s-a schimbat

- Scheduler-ul PIUSI are stare internă vizibilă: ultima rulare, ultimul succes, ultima eroare și următoarea reîncercare.
- Erorile de sincronizare folosesc backoff progresiv, până la maximum 6 ore.
- Lipsa fișierului MDB nu mai produce log repetitiv la fiecare interval.
- Sincronizarea automată persistă explicit rezultatele și `piusi_last_sync`.
- Panoul Setări afișează statusul scheduler-ului PIUSI lângă statusul importului.

## Motiv

După stabilizarea încărcării rapide a Setărilor, scheduler-ul trebuia să devină mai „politicos” cu instalările unde sursa PIUSI este pe rețea, indisponibilă temporar sau neconfigurată. Serverul nu trebuie să piardă timp și loguri pe aceeași eroare repetată.

## Validare

- `node --check server/modules/integration/piusi.js`
- test izolat pentru `piusiStatus()` și starea scheduler-ului
- `npm run build`
- `npm run audit:local`

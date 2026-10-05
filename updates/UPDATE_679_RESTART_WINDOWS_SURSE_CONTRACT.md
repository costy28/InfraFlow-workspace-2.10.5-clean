# UPDATE 679 — Restart Windows și surse contractuale (v2.12.659)

## Ce se schimbă

- Workerul de restart Windows așteaptă ca task-ul permanent `InfraFlow ERP` să se oprească și ca portul aplicației să fie eliberat înainte să pornească task-ul din nou.
- Jurnalul `runtime/restart-last.log` consemnează oprirea task-ului, eliberarea portului, relansarea și verificarea endpointului de health.
- În Contracte, lista de documente care pot fi legate include și comenzile de achiziții, respectiv recepțiile din Depozit.

## Regula consumului

- O comandă este un angajament și nu reduce valoarea disponibilă a contractului.
- Consumul se calculează în continuare doar din facturi, NIR-uri/recepții sau poziții manuale; astfel nu apare dublare înainte de recepție sau facturare.

## Fără migrare

- Nu sunt necesare migrări SQL și nu sunt schimbate documentele existente.

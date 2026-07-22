# UPDATE 374 — Contabilitate hub și roadmap task-uri

Versiune: `2.12.354`  
Data: `2026-07-22`

## Scop

Contabilitatea trebuie tratată ca hub de date pentru firmă, fără să se amestece accesul operațional granular pe HR, gestiune, achiziții sau contracte.

## Modificări

- `client/src/pages/DashboardPage.jsx`
  - profilul financiar devine `Profil financiar extins`;
  - profilul financiar include domeniile: contabilitate, documente, contracte, HR și stocuri;
  - dashboard-ul poate afișa recomandarea `Date operaționale pentru contabilitate`;
  - recomandarea sintetizează semnale din HR, stocuri și contracte care pot ajunge în contabilitate.

- `docs/PRODUCTIZARE_COMERCIALA.md`
  - adăugat pachet comercial `Task Management`;
  - adăugată secțiunea `Organizare pe roluri, task-uri și contabilitate ca hub`;
  - notată direcția pentru task-uri delegate de șefi/directori și task-uri personale ale utilizatorilor;
  - clarificat principiul: contabilitatea vede sinteze din module, dar accesul operațional rămâne pe permisiuni.

## Compatibilitate

- Nu necesită migrări MSSQL.
- Compatibil cu `DB_MODE=json`.
- Nu adaugă dependențe noi.

## Verificare

- Build frontend.
- Release check.
- Smoke test read-only module.
- Pachet update ZIP.

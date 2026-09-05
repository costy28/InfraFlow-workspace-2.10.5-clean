# UPDATE 549 — Audit comercial smoke și hotfixuri fluxuri reale

Versiune: **2.12.529**
Data: **2026-09-05**

## Ce s-a schimbat

- Adaugă `npm run audit:commercial-smoke`, un smoke test real HTTP pe server temporar și bază JSON temporară, fără impact pe datele live.
- Repară helper-ele legacy `readJsonBody(req, maxBytes)` din modulele mari, ca să nu mai aștepte la nesfârșit corpul requestului când `express.json()` l-a parsuit deja.
- Repară crearea documentelor când workflow-ul nu are încă responsabil curent calculat (`currentResponsible = null`).
- Confirmă end-to-end fluxuri comerciale principale: autentificare, gestiune, parc/resurse, contracte, task-uri, email draft, documente/watchlist, HR pontaj + concediu, sesizări, arhivă și secretariat.

## Verificări

- `node scripts/audit-commercial-smoke.js` ✅ 10/10 verificări trecute.
- `node --check` pe fișierele server atinse și scriptul nou ✅.

## Observații pentru auditul complet

- Scheduler-ele pornesc și în testele temporare; recomandat pas următor: gate explicit prin environment pentru audit/test.
- Rămâne prioritară securizarea accesului la fișierele din `/storage` și curățarea ultimelor texte/demo-uri legacy.

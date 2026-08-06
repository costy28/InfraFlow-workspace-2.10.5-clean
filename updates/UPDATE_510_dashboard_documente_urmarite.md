# UPDATE 510 — Radar Dashboard documente urmărite

Versiune: `2.12.490`
Data: `2026-08-06`

## Ce s-a schimbat

- Dashboard-ul principal afișează un panou personal pentru documentele urmărite.
- Panoul centralizează:
  - total documente urmărite;
  - activitate nouă necitită;
  - documente întârziate;
  - documente urgente;
  - documente aflate în circuit.
- Utilizatorul vede ultimele documente urmărite și ultimele notificări relevante.
- Butonul `Vezi urmărite` deschide modulul Documente direct cu filtrul `Urmărite`.

## Backend

- Endpoint nou: `GET /api/documents/watched`.
- Endpoint-ul returnează doar documentele urmărite de utilizatorul curent.
- Include notificările persistente `document_watch` necitite.
- Include sumar calculat pentru Dashboard.
- Compatibil cu stocarea JSON/app_state și cu modul relațional MSSQL.

## Frontend

- Dashboard încarcă datele din `/documents/watched`.
- Panou nou `Documente urmărite` cu KPI-uri compacte și liste scurte.
- DocumentePage acceptă `?filter=watched`, ca deep-link-ul din Dashboard să activeze filtrul corect.

## Testare recomandată

1. Marchează cel puțin un document ca urmărit.
2. Intră pe Dashboard și verifică panoul `Documente urmărite`.
3. Apasă `Vezi urmărite` și verifică dacă se deschide Documente cu filtrul activ.
4. Fă o acțiune pe document cu alt utilizator și verifică apariția activității noi în panou.

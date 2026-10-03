# UPDATE 651 — Citire curentă pentru invitațiile Demo

**Versiune:** 2.12.631  
**Data:** 3 octombrie 2026

## Ce corectează

- La aprobarea unei solicitări provenite de pe site, serverul Demo reîncarcă starea curentă din `dbo.app_state` înainte de verificarea unui cont cu aceeași adresă de email.
- Elimină conflictele false care puteau fi generate de o copie MSSQL păstrată în memoria procesului.

## Limite și protecții

- Se aplică exclusiv rutei semnate `POST /api/demo/invites`.
- Un cont activ real găsit în starea curentă continuă să blocheze invitația; nu este modificat și nu se expune nicio credențială.

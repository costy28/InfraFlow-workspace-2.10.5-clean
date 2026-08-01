# UPDATE 468 — Flux simplu Alerte legislative

Versiune: `2.12.448`  
Data: `2026-08-01`

## Scop

Pagina de Alerte legislative din Contabilitate a fost transformată dintr-un tabel brut într-un flux ghidat, ușor de urmărit de operator.

## Modificări

- `client/src/pages/accounting/AlerteLegislative.jsx`
  - adăugat panou „Monitor legislativ simplificat”;
  - adăugați pașii: preia alertele noi → stabilește impactul → leagă de declarații → închide controlul;
  - afișați indicatori rapizi pentru alerte totale, noi, citite/în lucru și implementate;
  - adăugate filtre rapide: toate, noi, citite, implementate;
  - adăugate acțiuni directe pentru „Marchează citită” și „Implementată”;
  - adăugate legături rapide către Centrul fiscal, Declarații diverse, Audit fiscal și Închidere lună.

## Impact

- Nu modifică schema DB.
- Nu modifică endpointurile existente.
- Folosește API-urile deja existente:
  - `GET /api/accounting/alerts`
  - `PATCH /api/accounting/alerts/:id/read`
  - `PATCH /api/accounting/alerts/:id/done`

## Verificări

- `npm run build` — ✅ trecut.


# UPDATE 563 — Liste compacte pentru pagini aglomerate

Versiune: `2.12.543`  
Data: `2026-09-07`

## Scop

Ecranele de administrare și audit pot deveni greu de urmărit când toate detaliile sunt afișate direct în pagină. Informația trebuie să fie disponibilă, dar nu să forțeze utilizatorul la scroll lung.

## Implementat

- Componentă reutilizabilă `CompactTable`.
- Tabelele lungi afișează implicit doar primele rânduri relevante.
- Utilizatorul poate extinde punctual lista prin `Vezi toate`.
- Poate reveni la forma scurtă prin `Arată compact`.
- Aplicare inițială în Setări → Securitate pentru:
  - sesiuni active;
  - audit stații autorizate;
  - jurnal autentificări;
  - jurnal securitate.
- Checklist-ul rapid de securitate este compact implicit și extensibil.

## Fișiere modificate

- `client/src/components/ui/CompactTable.jsx`
- `client/src/pages/SetariPage.jsx`
- `version.json`
- `package.json`
- `client/package.json`
- `server/package.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/IMBUNATATIRI_PRIORITARE_COMERCIAL.md`
- `docs/AUDIT_COMPLET_2026-09-05.md`

## Verificări

- `npm run build`

## Pas următor recomandat

Aplicarea aceluiași model în Documente și Contracte: liste compacte, detalii la click și acțiuni rare grupate sub „Avansat”.

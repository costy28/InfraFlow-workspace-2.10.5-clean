# UPDATE 450 — Flux simplu Facturi

Versiune: `2.12.430`  
Data: `2026-08-01`

## Obiectiv

Facturile trebuie să fie ușor de operat: aplicația trebuie să indice pasul următor din lista curentă, nu să oblige operatorul să caute manual prin meniuri.

## Modificări

- Am adăugat un panou „Flux simplu facturi” în paginile Facturi intrare și Facturi ieșire.
- Panoul calculează următoarea acțiune din lista filtrată:
  - configurare furnizor/client dacă nu există terți;
  - corectarea primului draft cu date lipsă;
  - validarea primului draft complet;
  - plata/încasarea primei facturi cu rest deschis;
  - pregătirea e-Factura pentru prima factură de ieșire validată fără e-Factura.
- Am adăugat indicatori rapizi pentru Terți, Drafturi, Resturi și e-Factura.

## Fișiere modificate

- `client/src/pages/accounting/FacturiContab.jsx`
- `CHANGELOG.md`
- `version.json`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`
- `package.json`, `package-lock.json`, `client/package.json`, `client/package-lock.json`, `server/package.json`

## Verificare

- `npm run build`
- `npm run release:check`
- `scripts/windows/build-update-zip.ps1`

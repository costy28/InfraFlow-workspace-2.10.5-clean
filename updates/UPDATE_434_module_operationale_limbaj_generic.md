# UPDATE 434 — Module operaționale cu limbaj generic

Versiune: `2.12.414`
Data: `2026-07-30`

## Context

După curățarea Dashboard-ului și shell-ului, unele pagini operaționale încă se prezentau ca module de nișă. Funcționalitatea specializată rămâne disponibilă, dar primul contact vizual trebuie să descrie un ERP modular, configurabil pe mai multe industrii.

## Modificări

- `MecanizarePage.jsx`
  - headerul devine `Parc & Resurse`;
  - helper-ul contextual descrie parcul operațional;
  - KPI-urile și demo-ul folosesc `resurse`, nu doar `utilaje`;
  - exemplele din formulare devin generale.
- `FlotaPage.jsx`
  - headerul devine `Parc & Resurse mobile`.
- `ProductiePage.jsx`
  - headerul devine `Producție / Operațiuni`;
  - descrierea include fluxuri și activitate operațională;
  - exportul Excel folosește `Output` în loc de `Tone asfalt`;
  - raportul printabil folosește `RAPORT ZILNIC PRODUCȚIE / OPERAȚIUNI`.
- `AsternerePage.jsx`
  - headerul devine `Lucrări / Execuție`;
  - corelarea cu producția se referă la `Producție / Operațiuni`.

## Fișiere modificate

- `client/src/pages/modules/MecanizarePage.jsx`
- `client/src/pages/modules/FlotaPage.jsx`
- `client/src/pages/modules/ProductiePage.jsx`
- `client/src/pages/modules/AsternerePage.jsx`
- `AGENTS.md`
- `CHANGELOG.md`
- `version.json`
- `package.json`
- `package-lock.json`
- `server/package.json`
- `client/package.json`
- `client/package-lock.json`

## Verificări

- Scanare texte vechi în modulele atinse: OK.
- `npm run build`: OK.
- `npm run release:check`: OK.
- Pachet update ZIP generat: `installer/output/InfraFlow-update-v2.12.414.zip`.


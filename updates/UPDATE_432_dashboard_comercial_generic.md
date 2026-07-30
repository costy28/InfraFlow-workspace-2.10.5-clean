# UPDATE 432 — Dashboard comercial generic și onboarding modular

Versiune: `2.12.412`
Data: `2026-07-30`

## Context

InfraFlow este repoziționat ca ERP comercial modular, nu ca implementare pentru un singur domeniu sau client pilot. Prima pagină trebuie să transmită imediat această direcție: aplicația se adaptează firmei, modulelor active și rolului utilizatorului.

## Modificări

- Dashboard-ul principal folosește limbaj generic de ERP modular.
- Demo-ul operațional nu mai folosește exemplul nișat „motorină utilaje”.
- Fluxul de prezentare descrie aprobări, resurse, oameni, contracte și costuri.
- A fost adăugată o zonă „Start rapid” pentru:
  - alegerea modulelor utile;
  - lucrul zilnic prin task-uri;
  - contracte și documente legate.
- Indicatorii de activitate acceptă `outputTotal` ca metrică generică și păstrează fallback pe `asphaltTotal` pentru compatibilitate cu datele existente.

## Fișiere modificate

- `client/src/pages/DashboardPage.jsx`
- `AGENTS.md`
- `CHANGELOG.md`
- `version.json`
- `package.json`
- `package-lock.json`
- `server/package.json`
- `client/package.json`
- `client/package-lock.json`
- `docs/AUDIT_COMPLET_2026-07-28.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

## Verificări

- Scanare Dashboard pentru texte vechi de pilot/demo: OK.
- `npm run build`: OK.
- `npm run release:check`: OK.
- Pachet update ZIP generat: `installer/output/InfraFlow-update-v2.12.412.zip`.


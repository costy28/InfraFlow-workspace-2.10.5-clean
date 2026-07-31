# UPDATE 439 — Checklist onboarding inteligent

Versiune: `2.12.419`  
Data: `2026-07-31`

## Context

UPDATE 438 a adăugat checklistul „Primii pași după instalare” pe Dashboard. Următorul pas logic este ca acesta să nu fie doar informativ, ci să citească starea aplicației și să arate concret ce mai lipsește.

## Ce s-a schimbat

- Checklistul calculează automat progresul configurării.
- Pașii se bifează din date reale:
  - profil organizație și profil regional;
  - module configurabile active;
  - utilizatori activi;
  - SMTP/IMAP sau status Inbox ERP;
  - date operaționale existente;
  - backup sau status update disponibil.
- Dashboardul afișează „Următorul pas recomandat” cu mesaj contextual și link direct.
- Verificările folosesc endpointuri existente și sunt tolerate individual: dacă o verificare eșuează, pagina nu pică.

## Fișiere modificate

- `client/src/pages/DashboardPage.jsx`
- `CHANGELOG.md`
- `version.json`
- `AGENTS.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `package.json`
- `package-lock.json`
- `client/package.json`
- `client/package-lock.json`
- `server/package.json`
- `server/package-lock.json`

## Verificări

- Build frontend: de rulat înainte de ZIP.
- Release check: de rulat după generarea ZIP.

## Impact

Schimbare frontend și documentație. Nu modifică schema DB și nu schimbă comportamentul API-urilor existente.

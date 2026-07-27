# UPDATE 410 — Reguli email vizibile și testabile

Versiune: `2.12.390`  
Data: `2026-07-27`

## Scop

Regulile automate din Inbox ERP devin verificabile și explicabile pentru utilizator. Emailurile nu mai sunt doar sortate automat, ci arată clar ce regulă a fost aplicată.

## Implementat

- Inbox ERP afișează badge pentru regula automată aplicată pe email.
- Fiecare email sortat automat afișează mesaj explicativ: `Sortat automat de regula ...`.
- Inbox ERP are filtru nou `Regulă`:
  - toate;
  - sortate automat;
  - fără regulă;
  - după o regulă configurată.
- API-ul Inbox expune metadatele regulii:
  - `email_rule_id`;
  - `email_rule_name`;
  - `email_rule_applied`.
- API-ul Inbox acceptă filtrarea după:
  - `rule=auto`;
  - `rule=none`;
  - `rule=<id regulă>`.
- Setări include simulator per regulă:
  - expeditor probă;
  - subiect probă;
  - conținut probă;
  - rezultat instant: se potrivește / nu se potrivește și ce acțiuni aplică.

## Fișiere modificate

- `server/modules/messaging/routes.js`
- `client/src/pages/modules/MessagingPage.jsx`
- `client/src/pages/SetariPage.jsx`
- `CHANGELOG.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `AGENTS.md`
- `version.json`
- `package.json`
- `package-lock.json`
- `server/package.json`
- `server/package-lock.json`
- `client/package.json`
- `client/package-lock.json`

## Verificări

- `node --check server/modules/messaging/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- build ZIP update


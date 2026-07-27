# UPDATE 409 — Reguli automate email Inbox

Versiune: `2.12.389`  
Data: `2026-07-27`

## Scop

Inbox ERP poate sorta automat emailurile importate prin IMAP, fără ca utilizatorul să editeze tehnic reguli sau cod.

## Implementat

- `Setări → General` are o secțiune nouă: `Reguli automate email`.
- Regulile pot verifica:
  - expeditorul;
  - subiectul;
  - conținutul;
  - tot emailul.
- Operatorii disponibili sunt intenționat simpli:
  - conține;
  - începe cu;
  - se termină cu;
  - este exact.
- O regulă poate seta automat:
  - categoria emailului;
  - importanța;
  - statusul.
- Regulile se aplică doar emailurilor noi importate după salvarea setărilor.
- Backend-ul normalizează și filtrează regulile incomplete la salvare.
- Importul IMAP păstrează pe mesaj regula care a decis sortarea (`email_rule_id`, `email_rule_name`).

## Fișiere modificate

- `server/modules/system/routes.js`
- `server/modules/messaging/email-sync.js`
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

- `node --check server/modules/system/routes.js`
- `node --check server/modules/messaging/email-sync.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- build ZIP update


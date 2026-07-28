# UPDATE 416 — Import IMAP cu atașamente descărcabile

Versiune: `2.12.396`  
Data: 2026-07-28

## Ce s-a schimbat

- Parserul IMAP extrage atașamentele MIME uzuale din emailurile primite.
- Atașamentele sub limitele de siguranță sunt salvate cu conținut base64 în Inbox ERP.
- Atașamentele importate prin IMAP pot fi descărcate apoi din modalul de detalii email.
- Pentru atașamentele prea mari, aplicația păstrează metadata și marchează lipsa conținutului local.

## Limite de siguranță

- Maximum 5 atașamente stocate per email.
- Maximum 2 MB per atașament.
- Maximum 5 MB total atașamente stocate per email.

## Fișiere modificate

- `server/modules/messaging/imap.js`
- `server/modules/messaging/email-sync.js`
- `package.json`
- `package-lock.json`
- `server/package.json`
- `server/package-lock.json`
- `client/package.json`
- `client/package-lock.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

## Verificări

- `node --check server\modules\messaging\imap.js`
- `node --check server\modules\messaging\email-sync.js`
- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run test:smoke`
- `scripts\windows\build-update-zip.ps1 -SkipClientBuild`
- `npm run release:check`
- `git diff --check`

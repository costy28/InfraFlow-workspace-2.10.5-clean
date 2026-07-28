# UPDATE 417 — Document ERP din atașament email

Versiune: `2.12.397`  
Data: 2026-07-28

## Ce s-a schimbat

- În modalul de detalii email, fiecare atașament are acțiune rapidă `Document`.
- Documentul creat din atașament pornește același flux de document draft existent.
- Titlul documentului se completează automat cu numele atașamentului.
- `date_json` păstrează metadata atașamentului:
  - index atașament;
  - nume fișier;
  - dimensiune;
  - tip MIME;
  - URL descărcare protejat;
  - dacă fișierul este descărcabil sau doar metadata.
- Dosarul documentului afișează atașamentul sursă.

## Fișiere modificate

- `client/src/pages/modules/MessagingPage.jsx`
- `client/src/pages/modules/DocumentePage.jsx`
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

- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run test:smoke`
- `scripts\windows\build-update-zip.ps1 -SkipClientBuild`
- `npm run release:check`
- `git diff --check`

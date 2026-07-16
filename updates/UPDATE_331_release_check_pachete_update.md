# UPDATE 331 — Release check pentru pachete update

Versiune: `2.12.311`  
Data: `2026-07-16`

## Ce s-a schimbat

- A fost adăugat scriptul `scripts/release-check.js`.
- A fost adăugat scriptul npm `npm run release:check`.
- Verificarea controlează sincronizarea versiunilor din:
  - `package.json`;
  - `server/package.json`;
  - `client/package.json`;
  - `version.json`.
- Verifică existența intrării curente în `CHANGELOG.md`, `AGENTS.md` și nota `updates/UPDATE_*.md`.
- Validează ZIP-ul `installer/output/InfraFlow-update-v[versiune].zip`, inclusiv:
  - `version.json`;
  - `CHANGELOG.md`;
  - `server/app.js`;
  - `server/package.json`;
  - `client/dist/index.html`;
  - nota UPDATE curentă.
- Normalizează separatorii din ZIP (`\` și `/`) ca să nu apară alarme false pe Windows.

## Utilizare

Înainte de pachetare:

```powershell
npm run release:check -- --no-zip
```

După generarea ZIP-ului:

```powershell
npm run release:check
```

## Motiv

După seria lungă de update-uri, release-ul avea nevoie de o verificare automată care să prindă rapid:

- versiuni nesincronizate;
- update note lipsă;
- changelog/AGENTS neactualizate;
- ZIP generat incomplet;
- `version.json` greșit în arhivă.

## Validare

- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run audit:local`
- `npm run release:check` după generarea ZIP-ului

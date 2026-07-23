# UPDATE 387 — Deep-link dosar contract din task

Versiune: `2.12.367`  
Data: 2026-07-23

## Ce s-a schimbat

- Pagina `Contracte` citește parametrul intern `?contract=ID`.
- Dacă parametrul există și contractul este în lista curentă, dosarul contractului se deschide automat.
- Linkul `Deschide sursa` din detaliile unui task legat de contract duce direct în dosarul operațional al contractului.
- Integrarea `Contracte → Task-uri → Contracte` este acum completă pentru fluxul simplu:
  1. creezi task ERP din dosar contract;
  2. responsabilul îl vede în Task-uri/Kiosk;
  3. din task poate reveni direct la contract.

## Fișiere modificate

- `client/src/pages/modules/ContractePage.jsx`
- `CHANGELOG.md`
- `version.json`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `package.json`
- `package-lock.json`
- `client/package.json`
- `client/package-lock.json`
- `server/package.json`
- `server/package-lock.json`

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- pachet ZIP update generat cu scriptul Windows de update.

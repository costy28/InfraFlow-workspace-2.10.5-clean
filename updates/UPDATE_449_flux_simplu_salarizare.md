# UPDATE 449 — Flux simplu Salarizare

Versiune: `2.12.429`  
Data: `2026-08-01`

## Obiectiv

Salarizarea nu trebuie doar să pară simplă; operatorul trebuie să poată lucra luna urmând un singur pas recomandat de aplicație.

## Modificări

- Am adăugat un panou „Flux simplu salarizare” în pagina Salarizare.
- Panoul calculează următorul pas real al lunii:
  - generează statul din pontaj;
  - regenerează dacă sursele HR s-au schimbat;
  - deschide primul blocaj/avertisment pe angajat;
  - validează statul;
  - generează nota contabilă;
  - înregistrează plata netă;
  - generează sau plătește obligațiile bugetare;
  - deschide pregătirea D112.
- Am adăugat o linie de progres cu 6 pași: Surse HR, Stat, Notă contabilă, Plată net, Obligații, D112.

## Fișiere modificate

- `client/src/pages/accounting/Salarizare.jsx`
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

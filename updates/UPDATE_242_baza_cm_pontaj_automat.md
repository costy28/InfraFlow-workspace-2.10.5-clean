# UPDATE 242 - Baza CM si pontaj automat

Versiune: 2.12.222

## Baza concediu medical

- Inlocuit promptul browserului cu modal compatibil Electron.
- Camp numeric pentru baza zilnica din media ultimelor sase luni.
- Estimarea indemnizatiei este afisata inaintea trimiterii.

## Pontaj automat

- Concediile aprobate continua sa completeze automat zilele lucratoare.
- Compensarea `timp_liber` din banca de ore scrie `ore_compensate` in pontaj.
- Orele lucrate sunt reduse cu durata compensarii.
- Compensarea unei norme complete marcheaza ziua `liber`.
- Exportul Nexus include totalul orelor compensate.
- Lunile inchise si pontajele validate sunt protejate.

## Baza de date

- Migrare `060_hr_timesheet_compensated_hours.sql`.

## Verificare

- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`

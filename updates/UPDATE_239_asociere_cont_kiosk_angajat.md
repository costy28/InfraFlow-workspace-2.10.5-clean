# UPDATE 239 - Asociere cont Kiosk cu angajat HR

Versiune: 2.12.219

## Problema remediata

- Formularul Superadmin trimitea `employee_id`, dar actualizarea utilizatorului ignora campul.
- Asocierea din HR si cea din Superadmin nu se sincronizau reciproc.
- Kiosk afisa contul drept neasociat si nu incarca datele angajatului.

## Modificari

- Salvarea utilizatorului persista asocierea in cont si in `hr.employees.user_id`.
- Editarea angajatului din HR actualizeaza si `employee_id` din contul aplicatiei.
- Schimbarea sau eliminarea asocierii curata legatura veche.
- Asocierea dubla este blocata explicit.
- Comportamentul este identic pentru MSSQL si `DB_MODE=json`.

## Verificare

- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
- Asociere Nadia din Superadmin, redeschidere utilizator si autentificare in Kiosk.

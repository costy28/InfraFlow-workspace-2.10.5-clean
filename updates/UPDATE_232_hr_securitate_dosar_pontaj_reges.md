# UPDATE 232 - HR securitate, dosar electronic, pontaj si REGES

Versiune: 2.12.212

## Modificari

- Datele personale, medicale, de contact si salariale sunt filtrate separat dupa permisiuni.
- Rolul HR Manager primeste explicit acces la date personale sensibile si medicale.
- Salarizarea incarca angajatii, contractele si pontajele din tabelele relationale MSSQL cand modul relational este activ.
- Fluturasii din state validate sunt disponibili angajatului asociat, in Kiosk, fara acces la fluturasii colegilor.
- Dosar electronic per angajat cu upload PDF/JPG/PNG/DOCX/XLSX, maximum 10 MB, download autentificat si anulare logica.
- Inchidere si deblocare controlata a lunii de pontaj, cu motiv, audit si mesaje explicite la operatii blocate.
- Exportul vechi etichetat gresit ca ReviSal a fost inlocuit cu fisier intern de lucru pentru REGES-ONLINE.
- Registru de lucru REGES-ONLINE in Excel, cu datele angajatilor si contractelor active.
- Schema MSSQL adauga `hr.employee_files` si `hr.timesheet_locks`.
- Logica noua este separata in module mici: politica de date, sursa salarizare, blocari pontaj, fisiere angajat si registru REGES.
- Suita dedicata `npm run test:hr` verifica politica de confidentialitate, blocarea pontajului si marcarea corecta a exportului REGES.

## Limitare REGES-ONLINE

InfraFlow nu declara transmitere automata si nu genereaza un fisier oficial de import. Exporturile sunt fisiere interne de lucru pentru verificare si operare in platforma oficiala REGES-ONLINE.

## Verificare

- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
- `GET /api/system/health`

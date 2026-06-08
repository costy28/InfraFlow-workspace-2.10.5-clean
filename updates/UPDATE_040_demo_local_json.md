# UPDATE 040 - Demo local JSON pentru prezentari

## Scop

Pregateste o instanta demo InfraFlow care ruleaza local, fara SQL Server, pe `DB_MODE=json`, separat de instanta MSSQL de dezvoltare.

## Inclus

- Configuratie `.env.demo` pentru portul `4190` si `DEMO_MODE=true`.
- Seed demo realist pentru companie fictiva, utilizatori, angajati, utilaje, materiale, proiecte si tranzactii.
- Scripturi pentru generare si reset zilnic al datelor demo.
- Task Scheduler XML pentru reset automat la ora 03:00.
- Instructiuni Cloudflare Tunnel pentru expunere temporara sau persistenta.
- Banner frontend vizibil doar in modul demo.
- Endpoint-uri `/api/demo-status` si `/api/demo-health`.

## Note

- Nu modifica installer-ul comercial.
- Nu modifica versiunea din `package.json`.
- Nu ruleaza SQL Server si nu creeaza login-uri MSSQL.
- Aplicatia MSSQL poate ramane pornita pe `4180`; demo-ul ruleaza separat pe `4190`.

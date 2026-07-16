# UPDATE 328 — Setări rapide fără verificare schemă automată

Versiune: `2.12.308`  
Data: `2026-07-16`

## Context

După stabilizarea health-ului rapid MSSQL, pagina Setări încă încărca automat diagnosticul complet al schemei relaționale. Pe instalări cu SQL Server lent sau ocupat, această verificare putea dura câteva secunde și încărca inutil pagina.

## Modificări

- `client/src/pages/SetariPage.jsx`
  - elimină apelul automat `GET /system/database-schema` din încărcarea generală;
  - păstrează butonul manual „Verifică schema” pentru diagnosticul complet;
  - afișează un mesaj clar când schema nu a fost verificată încă.

## Verificări

- build frontend;
- audit local complet.

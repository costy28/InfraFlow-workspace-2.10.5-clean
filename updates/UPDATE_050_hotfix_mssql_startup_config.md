# UPDATE 050 - Hotfix MSSQL startup si configurare DB

Versiune: 2.12.28 -> 2.12.29
Data: 2026-06-12

## Context

Dupa adaugarea ecranului Setari > Baza date, instalarea existenta putea ramane cu un `INFRAFLOW_DB_CONNECTION` vechi in runtime sau in `start-server.bat`. In anumite combinatii, connection string-ul vechi avea prioritate fata de alegerea noua din UI si serverul incerca in continuare autentificarea cu user/parola MSSQL invalide.

## Modificari

- `server/core/db.js`
  - `DB_TRUSTED_CONNECTION=true` este autoritar fata de connection string-uri vechi.
  - `DB_USER` / `DB_PASSWORD` explicite au prioritate fata de `INFRAFLOW_DB_CONNECTION`.
  - `/api/system/health` verifica MSSQL cu timeout scurt, ca serverul sa nu ramana blocat la credentiale gresite.

- `server/modules/system/routes.js`
  - Citirea configuratiei runtime accepta fisiere inaccesibile temporar fara sa blocheze Setari.
  - Ecranul de configurare interpreteaza corect prioritatea dintre `DB_TRUSTED_CONNECTION` si connection string.

- `installer/setup-task.ps1`
  - Pastreaza `DB_DATABASE` din `runtime/mssql.env`, nu forteaza doar `INFRAFLOW`.
  - Genereaza `start-server.bat` cu `DB_TRUSTED_CONNECTION`, `DB_USER`, `DB_PASSWORD` si `INFRAFLOW_DB_CONNECTION` din runtime.
  - `DB_TRUSTED_CONNECTION` din runtime nu mai este suprascris de un connection string vechi.

- `scripts/windows/repair-installed-mssql-050.ps1`
  - Script de reparatie pentru instalarea existenta din `C:\Program Files (x86)\InfraFlow`.
  - Face backup la fisierele inlocuite, copiaza hotfix-ul, regenereaza Task Scheduler si verifica `/api/system/health`.

## Verificare

- `node --check server/core/db.js`
- `node --check server/modules/system/routes.js`
- validare PowerShell pentru `installer/setup-task.ps1`
- build frontend
- build complet installer server/client v2.12.29

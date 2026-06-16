# UPDATE 071 - Modaluri redimensionabile si schema SQL

Versiune: 2.12.50 -> 2.12.51
Data: 2026-06-16

## Schimbari

- Modalurile UI folosesc acum container redimensionabil, cu limite responsive, pentru ecrane unde tabelele sau notele contabile depasesc latimea initiala.
- Setari > Baza date include o sectiune de diagnostic pentru schema SQL relationala.
- Au fost adaugate endpointuri superadmin pentru verificarea si pregatirea tabelelor relationale MSSQL:
  - `GET /api/system/database-schema`
  - `POST /api/system/database-schema/prepare`
- Pregatirea schemei ruleaza migrarile SQL existente si creeaza tabelele in baza configurata, fara sa schimbe automat sursa principala de date.

## Observatii tehnice

- Instalarea standard MSSQL foloseste in continuare `dbo.app_state` ca sursa principala de date, iar `dbo.schema_migrations` pentru evidenta migrarilor.
- Tabelele relationale sunt pregatite pentru migrarea controlata pe module, fara risc asupra datelor curente.
- Interogarea de diagnostic pentru tabele este compatibila cu SQL Server 2008.

## Verificari

- `node --check server/core/db.js`
- `node --check server/modules/system/routes.js`
- `npm run build`

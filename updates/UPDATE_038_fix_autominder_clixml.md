# UPDATE 038 — Fix Autominder CLIXML
Data: 05 Iunie 2026
Versiune: 2.12.18

## Descriere

Testarea conexiunii SQL catre autoMinder5 nu mai depinde de PowerShell/sqlcmd.
Conexiunea este verificata direct prin driverul `mssql` deja folosit de server,
astfel incat raspunsurile PowerShell de tip `#< CLIXML` nu mai ajung in UI.

## Modificari

- Parser connection string dedicat pentru format SQL Server:
  `Server=...;Database=autoMinder5;User Id=...;Password=...`.
- Pool MSSQL separat pentru autoMinder, izolat de pool-ul bazei InfraFlow.
- Endpointul `/api/integration/autominder/test-connection` returneaza raspuns JSON curat:
  `{ ok: true, mesaj, preview }` sau `{ ok: false, eroare }`.
- Importul complet autoMinder foloseste acelasi mecanism direct prin `mssql`.
- Mesajele CLIXML ramase de la versiuni vechi sunt filtrate intr-o eroare lizibila.

## Fisiere modificate

- `server/modules/integration/autominder/full-import.js`
- `package.json`
- `server/package.json`
- `electron/package.json`
- `version.json`

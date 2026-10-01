# UPDATE 627 — Dependențe Linux deterministe

Versiune: `v2.12.607`  
Data: `2026-10-01`

## Corecție

- `https-proxy-agent` este dependență directă de producție, nu doar
  tranzitivă, pentru ca driverul MSSQL să pornească sigur după `npm ci`.
- Previne eroarea `Cannot find module 'https-proxy-agent'` la pornirea
  instalărilor Linux actualizate.

# UPDATE 607 — Demo comercial MSSQL separat

`v2.12.587` — 28 septembrie 2026

## Ce aduce

- seed controlat pentru baza `INFRAFLOW_DEMO...`, separată de baza de lucru;
- organizația fictivă `Construct Demo SRL` cu utilizatori pentru vânzări, aprobare, achiziții și contabilitate;
- cele trei scenarii comerciale: flux simplu, lipsă de stoc și vedere managerială;
- date CRM relaționale reale: lead, oferte, acceptare, comandă, snapshot stoc, necesar și proformă;
- documentație de pornire și resetare sigură.

## Protecții

- scriptul refuză nume de baze care nu încep cu `INFRAFLOW_DEMO`;
- reinițializarea necesită explicit `--reset` sau `-Reset`;
- nu conține credențiale SMTP, parole sau configurări de tunnel/DNS;
- datele seed sunt fictive și nu ating baza existentă a aplicației.
- utilitarele de seed și ghidul demo rămân în workspace-ul de administrare și sunt excluse din update-ul comercial normal.

## Verificări

- `npm run test:commercial-demo`
- `node --check scripts/seed-commercial-demo-mssql.js`
- `npm run build`
- `npm run release:check`

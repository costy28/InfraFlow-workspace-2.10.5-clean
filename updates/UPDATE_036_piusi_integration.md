# UPDATE 036 — Integrare PIUSI Self-Service
Data: 04 Iunie 2026
Versiune: 2.12.16

Descriere:
Import automat al alimentărilor carburant din PIUSI Self-Service (`Self.mdb`, tabela `Erogaz`) în InfraFlow, cu mapare operatori PIUSI la utilaje/autovehicule și transfer controlat în FAZ/alimentările mecanizare.

Funcționalități:
- Tabele MSSQL noi pentru `integration.piusi_sync`, `integration.piusi_mapare`, `integration.piusi_config`.
- Modul backend `server/modules/integration/piusi.js` cu citire MDB prin `node-adodb` pe Windows.
- Sincronizare manuală și scheduler automat la 30 minute.
- Deduplicare după `IdProg` din PIUSI.
- Mapare operator PIUSI (`Operatore`) către `fleet.assets`.
- Tab nou în Setări: `Integrări`, cu configurare cale MDB, status și mapări.
- Tab nou în Mecanizare: `Alimentări PIUSI`, cu filtre, tabel alimentări, import în FAZ și raport comparativ PIUSI vs FAZ.
- Alimentările procesate sunt create ca fuel logs cu sursa `PIUSI` și badge dedicat.

Notă versiune:
Promptul inițial cerea `UPDATE_026` / `2.12.8`, dar acea poziție există deja în istoricul proiectului. Implementarea a fost înregistrată ca următorul update valid: `UPDATE_036` / `2.12.16`.

Fișiere modificate:
- `db/migrations/023_piusi_integration.sql`
- `server/modules/integration/piusi.js`
- `server/app.js`
- `client/src/pages/SetariPage.jsx`
- `client/src/pages/modules/MecanizarePage.jsx`
- `server/package.json`
- `server/package-lock.json`
- `package.json`
- `client/package.json`
- `electron/package.json`
- `version.json`
- `installer/infraflow-server-setup.iss`
- `installer/infraflow-client-setup.iss`
- `AGENTS.md`

Package nou:
- `node-adodb` — Windows only, folosit lazy pentru citirea MDB prin ADODB/COM.

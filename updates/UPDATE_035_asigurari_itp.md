# UPDATE 035 — Asigurări + ITP + ISCIR + Taxe
Data: 04 Iunie 2026
Versiune: 2.12.15

Descriere:
Modul complet pentru administrarea documentelor de flotă pe autovehicule și utilaje: asigurări RCA/CASCO/CMR/Carte Verde, ITP cu costuri și facturi, taxe/rovignete și autorizații ISCIR.

Funcționalități:
- Tabele noi MSSQL pentru `fleet.asigurari`, `fleet.asigurari_plati`, `fleet.itp`, `fleet.taxe`, `fleet.autorizari_iscir`.
- API-uri pentru listare, creare, editare și marcare executare ITP.
- Dashboard centralizat de scadențe cu grupare: expirate, 7 zile, 30 zile, 60 zile.
- Tab nou în Mecanizare: `Scadențe & Asigurări`, cu subtaburi pentru Expirări, RCA/CASCO, ITP, Taxe, ISCIR și Raport.
- Formulare rapide pentru reînnoire poliță, planificare/executare ITP, taxe și autorizații ISCIR.
- Rapoarte Excel anuale: asigurări, ITP și plan reînnoire scadențe.
- Job automat zilnic la ora 08:00 pentru notificarea responsabililor de mecanizare și superadmin.

Notă versiune:
Promptul inițial cerea `UPDATE_025` / `2.12.7`, dar aceste poziții există deja în istoricul proiectului. Implementarea a fost înregistrată ca următorul update valid: `UPDATE_035` / `2.12.15`.

Fișiere modificate:
- `db/migrations/022_asigurari_itp_fleet.sql`
- `server/modules/fleet/routes.js`
- `server/scheduler.js`
- `client/src/pages/modules/MecanizarePage.jsx`
- `package.json`
- `client/package.json`
- `server/package.json`
- `electron/package.json`
- `version.json`
- `installer/infraflow-server-setup.iss`
- `installer/infraflow-client-setup.iss`
- `AGENTS.md`

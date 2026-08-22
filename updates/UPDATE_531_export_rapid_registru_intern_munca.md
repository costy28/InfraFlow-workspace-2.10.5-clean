# UPDATE 531 — Export rapid registru intern muncă din Dashboard HR

Versiune: `2.12.511`  
Data: `2026-08-22`

## Obiectiv

Panoul `Raportări oficiale muncă` din Dashboard HR trebuie să fie acționabil, nu doar informativ.

## Implementare

- Am adăugat acțiune directă `Descarcă registru intern` în cardul de raportări oficiale muncă.
- Butonul este vizibil doar când:
  - utilizatorul are permisiunea `hr:reges_export`;
  - profilul local de țară are registru de salariați activ.
- Descărcarea folosește endpointul existent și auditat `GET /hr/reges/work-register.xlsx`.
- După descărcare, interfața afișează mesaj clar că fișierul este pentru lucru intern.

## Limite explicite

- Nu este transmitere oficială către REGES-Online.
- Integrarea oficială rămâne pas separat, cu autentificare, recipisă, rezultat asincron și audit complet.
- Nu necesită migrare SQL nouă.

## Fișiere modificate

- `client/src/pages/modules/HRPage.jsx`
- `client/src/pages/modules/hr/HRDashboardPanel.jsx`
- `package.json`
- `client/package.json`
- `server/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`

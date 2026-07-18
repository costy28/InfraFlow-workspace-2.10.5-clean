# UPDATE 346 — Raport portofoliu contracte

Versiune: 2.12.326  
Data: 2026-07-18

## Context

După fișa printabilă pe contract individual, următorul nivel util pentru management este raportul de portofoliu: toate contractele, totalurile, alertele și acțiunile deschise într-un singur document.

## Implementare

- `server/modules/contracts/routes.js`
  - adăugat generator HTML pentru raportul de portofoliu contracte;
  - adăugat endpoint `GET /api/contracts/portfolio/print`;
  - raportul folosește dashboard-ul existent și datele decorate ale contractelor;
  - include total contractat, consumat, rămas, alerte, task-uri deschise și portofoliu pe manager/responsabil;
  - contractele sunt ordonate după risc: alerte, procent consum și scadență.

- `client/src/pages/modules/ContractePage.jsx`
  - adăugat buton „Raport portofoliu” în header-ul modulului Contract Management;
  - raportul se deschide în tab nou și poate fi printat sau salvat PDF.

- `scripts/smoke-modules-readonly.js`
  - adăugat smoke check pentru endpointul HTML al raportului de portofoliu.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`

## Rezultat

Contract Management are acum două niveluri de raportare:

1. fișă individuală de contract;
2. raport de portofoliu pentru management, achiziții și contabilitate.

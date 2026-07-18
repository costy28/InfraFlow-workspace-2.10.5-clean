# UPDATE 345 — Fișă printabilă contract

Versiune: 2.12.325  
Data: 2026-07-18

## Context

Contract Management a ajuns să centralizeze contractul, documentele sursă, consumurile, task-urile și tichetele operaționale. Următorul pas natural este ca dosarul să poată fi exportat/printat rapid pentru management, achiziții, contabilitate sau arhivă.

## Implementare

- `server/modules/contracts/routes.js`
  - adăugat endpoint HTML `GET /api/contracts/:id/print`;
  - endpoint protejat cu autentificare și permisiunile existente de vizualizare contracte;
  - fișa folosește datele agregate din cockpit: sumar financiar, progres, alerte, consumuri, documente sursă, task-uri și tichete;
  - datele sunt escapate HTML și formatate pentru print/PDF.

- `client/src/pages/modules/ContractePage.jsx`
  - adăugat buton „Fișă print” în modalul „Dosar contract”;
  - fișa se deschide în tab nou cu tokenul sesiunii, pentru a rămâne protejată fără endpoint public;
  - utilizatorul poate folosi printul browserului sau „Save as PDF”.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`

## Rezultat

Contractul are acum o fișă operațională printabilă, utilă pentru decizii, semnături interne, audit și arhivare.

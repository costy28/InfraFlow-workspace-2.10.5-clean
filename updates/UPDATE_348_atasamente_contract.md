# UPDATE 348 — Atașamente pe contract

Versiune: 2.12.328  
Data: 2026-07-18

## Context

Contract Management avea deja registru, consumuri, documente sursă, cockpit, fișă printabilă și exporturi. Pentru a deveni dosar real, contractul trebuie să poată păstra documentele efective: contract semnat, acte adiționale, garanții și corespondență.

## Implementare

- `server/modules/contracts/routes.js`
  - adăugat suport pentru `contractManagement.attachments`;
  - adăugat stocare fișiere în `storage/contracts`;
  - adăugat upload securizat cu limită 20MB;
  - extensii acceptate: PDF, DOC/DOCX, XLS/XLSX, JPG/JPEG, PNG, WEBP;
  - endpointuri:
    - `POST /api/contracts/:id/attachments`;
    - `GET /api/contracts/:id/attachments/:attachmentId/download`;
    - `DELETE /api/contracts/:id/attachments/:attachmentId`;
  - anularea atașamentelor este soft, cu motiv și audit;
  - `GET /api/contracts/:id` include lista atașamentelor;
  - cockpit-ul include numărul de atașamente;
  - fișa printabilă a contractului include atașamentele.

- `client/src/pages/modules/ContractePage.jsx`
  - adăugat card „Atașamente contract” în modalul „Dosar contract”;
  - formular de upload cu categorie, descriere și fișier;
  - listă atașamente cu descărcare și anulare;
  - KPI „Atașamente” în cockpit.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`

## Rezultat

Contract Management poate funcționa ca dosar contractual electronic: nu doar urmărește contractul, ci păstrează documentele reale asociate.

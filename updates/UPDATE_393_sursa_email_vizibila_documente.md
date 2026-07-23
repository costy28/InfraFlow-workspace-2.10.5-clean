# UPDATE 393 — Sursa email vizibilă în Documente

Versiune: `2.12.373`
Data: `2026-07-23`

## Scop

După conversia unui email în document draft, utilizatorul trebuie să vadă clar în modulul Documente de unde provine documentul.

## Modificări

- `client/src/pages/modules/DocumentePage.jsx`
  - adăugat helper pentru citirea metadatelor `source_type=email` din `date_json`;
  - lista de documente afișează badge `Email ERP` pentru documentele create din Inbox ERP;
  - detaliile documentului afișează card de context email;
  - cardul include expeditor, destinatar, subiect, dată, categorie, importanță, preview și atașamente;
  - cardul permite revenirea rapidă în Inbox ERP.

## Compatibilitate

- Nu s-au adăugat tabele sau coloane noi.
- Funcționează cu documentele create în UPDATE 392.
- Compatibil cu `DB_MODE=json` și MSSQL, deoarece citește doar `date_json`.

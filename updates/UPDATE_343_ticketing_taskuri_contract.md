# UPDATE 343 — Ticketing pentru task-uri contract

Versiune: `2.12.323`  
Data: `2026-07-18`

## Ce s-a schimbat

- Task-urile de contract pot crea ticket operațional în modulul Sesizări.
- Ticketul este deduplicat prin `entitate_tip=contract_task` și `entitate_id`.
- Task-ul păstrează `ticket_uuid` și `ticket_id` pentru trasabilitate.
- Contract Management afișează „Creează ticket” sau „Ticket legat”.
- Sesizări afișează sursa ticketului când provine din Contract Management.
- Ticketul preia prioritatea, termenul limită și responsabilul task-ului.

## Fișiere modificate

- `server/modules/contracts/routes.js`
- `client/src/pages/modules/ContractePage.jsx`
- `client/src/pages/modules/TicketsPage.jsx`
- `package.json`
- `server/package.json`
- `client/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

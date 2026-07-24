# UPDATE 394 — Task din document

Versiune: `2.12.374`
Data: `2026-07-24`

## Scop

Închide bucla operațională dintre Documente și Task Management: orice document poate genera rapid o sarcină responsabilizată.

## Modificări

- `client/src/pages/modules/DocumentePage.jsx`
  - adăugată acțiunea `Creează task` în lista mobilă de documente;
  - adăugată acțiunea `Creează task` în tabelul desktop;
  - adăugată acțiunea `Creează task` în meniul detaliilor documentului;
  - adăugat modal de creare task din document;
  - modalul precompletează titlul, descrierea, prioritatea și responsabilul;
  - task-ul este creat prin endpoint-ul existent `/api/tasks`;
  - task-ul păstrează `source_type=document`, `source_id`, `source_label` și `source_url`;
  - pagina Documente citește parametrul `?document=...` și deschide automat documentul țintă.

## Compatibilitate

- Nu s-au introdus endpoint-uri sau tabele noi.
- Folosește sursa `document` deja existentă în catalogul task-urilor.
- Compatibil cu `DB_MODE=json` și MSSQL.

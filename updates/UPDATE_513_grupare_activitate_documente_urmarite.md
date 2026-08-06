# UPDATE 513 — Grupare activitate documente urmărite

Versiune: `2.12.493`  
Data: `2026-08-06`

## Scop

Radarul de documente urmărite trebuie să arate mai clar unde se blochează fluxul: după termene, după responsabil curent și după tipul documentului.

## Implementare

- Endpoint-ul `GET /api/documents/watched` livrează context suplimentar pentru documentele urmărite:
  - `tip_document`;
  - `tip_document_label`;
  - `current_step_name`;
  - `current_responsible_id`;
  - `current_responsible_label` când există în datele locale.
- În modul JSON local, responsabilul curent este extras din primul pas de circuit cu status `asteptare`.
- În modul MSSQL, interogarea documentelor urmărite aduce primul pas `asteptare` prin `OUTER APPLY`.
- Dashboard-ul afișează trei grupări compacte:
  - după termen;
  - după responsabil;
  - după tip document.

## Impact UX

Utilizatorul nu mai vede doar lista documentelor urmărite, ci primește o citire rapidă a riscului operațional: ce este întârziat, cine are documente în lucru și ce tipuri de documente se adună.

## Migrare date

Nu necesită migrare SQL nouă.

## Testare recomandată

1. Marchează mai multe documente ca urmărite.
2. Asigură-te că unele au termen limită și/sau sunt în circuit.
3. Intră în Dashboard.
4. Verifică apariția grupurilor `După termen`, `După responsabil`, `După tip document`.
5. Deschide un document din radar și verifică păstrarea comportamentului existent.

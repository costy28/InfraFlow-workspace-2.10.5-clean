# UPDATE 260 — Testare șabloane Word HR

Versiune: 2.12.240  
Data: 2026-07-11

## Schimbări

- A fost adăugat endpoint-ul `GET /api/hr/document-templates/:id/validate-word`.
- Endpoint-ul analizează șablonul Word `.docx` fără să genereze sau să arhiveze documente.
- Validarea folosește același context de date ca generarea Word:
  - angajat;
  - contract;
  - act adițional, opțional.
- Lista de șabloane HR afișează butonul `Testează Word` pentru șabloanele care au fișier `.docx` atașat.
- Modalul de test permite alegerea:
  - angajatului;
  - contractului;
  - actului adițional pentru șablonul `act_aditional`.
- Rezultatul testului afișează:
  - status OK / atenție;
  - numărul variabilelor detectate;
  - variabile recunoscute;
  - variabile necunoscute;
  - variabile fără valoare în exemplul ales;
  - avertizări despre variabile rupte în Word.

## Beneficiu

HR poate verifica un șablon Word înainte să îl folosească în contracte reale sau înainte să arhiveze documente în dosarul angajatului.

## Compatibilitate

- Compatibil DB_MODE=json.
- Compatibil MSSQL.
- Nu introduce dependențe noi.

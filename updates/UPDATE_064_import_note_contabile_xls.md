# UPDATE 064 - Import note contabile XLS

Versiune: 2.12.43 -> 2.12.44
Data: 2026-06-14

## Backend

- Adaugat preview import:
  - `POST /api/accounting/journals/import-xls/preview`
- Adaugat import efectiv:
  - `POST /api/accounting/journals/import-xls`
- Importul citeste fisiere `.xls` si `.xlsx`.
- Coloane asteptate:
  - `data`
  - `ndp` / document
  - `cont_d`
  - `cont_c`
  - `suma`
  - `explicatie`
  - `id_nota`
- Liniile sunt grupate dupa `id_nota`.
- Fiecare rand produce o linie debit si o linie credit in nota contabila.
- Importul blocheaza:
  - note dezechilibrate;
  - conturi lipsa in planul de conturi;
  - randuri fara data/conturi/suma.
- Notele deja importate sunt detectate dupa `import_source=external_xls` si `import_key`.

## Frontend

- In Registru jurnal a fost adaugat butonul `Import note XLS`.
- Modalul afiseaza:
  - fisierul selectat;
  - numar note;
  - numar linii;
  - total debit;
  - total credit;
  - duplicate;
  - conturi lipsa;
  - primele note din preview.
- Importul poate fi pornit doar daca preview-ul este echilibrat si fara conturi lipsa.

## Verificari

- Sintaxa backend contabilitate verificata cu `node --check`.
- Build frontend verificat cu `npm run build`.
- Arhiva ZIP de update generata pentru test rapid.

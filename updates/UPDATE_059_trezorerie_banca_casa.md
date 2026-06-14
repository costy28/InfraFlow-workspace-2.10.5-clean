# UPDATE 059 - Trezorerie banca/casa utilizabila

Versiune: 2.12.38 -> 2.12.39
Data: 2026-06-14

## Backend

- Adaugat editare operatii trezorerie draft: `PATCH /api/accounting/treasury/:uuid`.
- Adaugat devalidare operatii validate: `POST /api/accounting/treasury/:uuid/devalidate`.
- Adaugat anulare soft pentru operatii draft: `DELETE /api/accounting/treasury/:uuid`.
- Validarea trezoreriei verifica explicit ca perioada este deschisa.
- Operatiile anulate raman in istoric si nu apar implicit in liste.
- Devalidarea marcheaza nota contabila aferenta ca `devalidat`, fara stergere fizica.

## Frontend

- Pagina Contabilitate -> Trezorerie este acum operationala:
  - adaugare operatii banca/casa/decont;
  - editare draft;
  - validare;
  - devalidare;
  - anulare draft;
  - selectare tert optional;
  - preview nota debit/credit pentru incasare/plata.

## Verificari

- Sintaxa backend verificata cu `node --check`.
- Build frontend verificat cu `npm run build`.
- Arhiva ZIP de update generata pentru test rapid.

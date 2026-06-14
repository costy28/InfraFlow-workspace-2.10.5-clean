# UPDATE 061 - Balanta contabila verificabila

Versiune: 2.12.40 -> 2.12.41
Data: 2026-06-14

## Backend

- Adaugat export Excel pentru balanta:
  - `GET /api/accounting/balance-sheet/export`
  - parametri: `an`, `luna`, `tip=sintetica|analitica`
- Exportul include randuri de balanta si totaluri debit/credit/sold.

## Frontend

- Pagina Contabilitate -> Balanta are:
  - selectie luna;
  - selectie balanta sintetica/analitica;
  - filtru pe clasa de cont;
  - optiune doar conturi cu rulaj sau sold;
  - carduri cu totaluri;
  - footer de totaluri in tabel;
  - link direct catre fisa contului;
  - buton Export Excel.

## Verificari

- Sintaxa backend contabilitate verificata cu `node --check`.
- Build frontend verificat cu `npm run build`.
- Arhiva ZIP de update generata pentru test rapid.

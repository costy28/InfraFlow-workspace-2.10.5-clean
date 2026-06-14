# UPDATE 060 - Registru jurnal detaliat

Versiune: 2.12.39 -> 2.12.40
Data: 2026-06-14

## Frontend

- Pagina Contabilitate -> Registru jurnal are filtre pentru luna si status.
- Lista de note contabile permite selectarea unei note.
- Panoul lateral afiseaza:
  - documentul;
  - tipul documentului;
  - explicatia;
  - total debit;
  - total credit;
  - diferenta;
  - liniile contabile debit/credit.
- Conturile din liniile notei duc direct catre fisa contului.
- Notele active pot fi stornate direct din detaliu.

## Verificari

- Sintaxa backend contabilitate verificata cu `node --check`.
- Build frontend verificat cu `npm run build`.
- Arhiva ZIP de update generata pentru test rapid.

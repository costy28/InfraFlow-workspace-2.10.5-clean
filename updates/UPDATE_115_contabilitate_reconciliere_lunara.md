# UPDATE 115 - Contabilitate: reconciliere lunara

Versiune: 2.12.95
Data: 2026-06-23

## Schimbari

- Adauga endpoint de reconciliere lunara: `GET /api/accounting/reconciliation?luna=YYYY-MM`.
- Dashboard-ul contabil afiseaza verificari concrete pentru perioada selectata:
  - documente draft;
  - facturi furnizor ramase de plata;
  - facturi client ramase de incasat;
  - operatii de trezorerie pe terti fara factura legata;
  - facturi validate fara nota contabila;
  - note contabile dezechilibrate;
  - diferenta balantei.
- Problemele sunt listate cu mesaj de actiune si link catre zona unde se corecteaza.

## Scop

Inainte de inchiderea lunii, contabilul vede rapid ce mai trebuie reparat si nu mai cauta manual prin facturi, trezorerie, registru jurnal si balanta.

## Verificari recomandate

- Intra in `Contabilitate -> Dashboard`.
- Schimba luna si verifica daca se actualizeaza cardurile de reconciliere.
- Creeaza o factura draft sau o operatie de trezorerie draft si verifica daca apare in lista `De lucrat acum`.

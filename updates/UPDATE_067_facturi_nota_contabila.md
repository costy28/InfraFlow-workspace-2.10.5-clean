# UPDATE 067 - Facturi cu nota contabila vizibila

Versiune: 2.12.46 -> 2.12.47
Data: 2026-06-15

## Ce s-a schimbat

- Am adaugat endpoint pentru detaliul unei note contabile dupa id sau uuid.
- Facturile validate afiseaza buton `Nota`, cu modal pentru liniile debit/credit generate automat.
- Devalidarea facturii cere motiv obligatoriu si ramane blocata daca luna este inchisa.
- Selectorul de conturi din formularul de factura afiseaza toate conturile, ordonate cu clasele recomandate primele:
  - intrari: clasele 6, 3, 2;
  - iesiri: clasa 7.

## Verificari recomandate

- Valideaza o factura draft.
- Apasa `Nota` si verifica liniile debit/credit.
- Incearca `Devalideaza` fara motiv si confirma ca nu permite.
- Cauta conturi din clase diferite in formularul de factura.

# UPDATE 063 - Hotfix linii factura

Versiune: 2.12.42 -> 2.12.43
Data: 2026-06-14

## Frontend

- Reparat layout-ul din modalul Facturi intrare/iesire.
- Campul `Denumire` este pe rand separat pentru fiecare linie.
- Campurile `Cont`, `Valoare`, `TVA` si actiunea de stergere sunt pe un rand dedicat.
- Formularul nu mai suprapune etichetele peste inputuri in modal.

## Verificari

- Build frontend verificat cu `npm run build`.
- Sintaxa backend contabilitate verificata cu `node --check`.
- Arhiva ZIP de update generata pentru test rapid.

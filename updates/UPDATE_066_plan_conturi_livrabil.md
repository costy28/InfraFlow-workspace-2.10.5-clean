# UPDATE 066 - Plan conturi in livrabil curat

Versiune: 2.12.45 -> 2.12.46
Data: 2026-06-15

## Ce s-a schimbat

- Am mutat seed-ul complet al planului de conturi in `db/seeds/accounting-chart-ro.json`, ca sa fie inclus in arhivele de update si in instalari curate.
- Motorul contabil pastreaza fallback pentru seed-ul vechi si adauga automat conturile critice: `401`, `4111`, `4426`, `4427`, `5211`, `5311`, `628`, `704`.
- Formularul de facturi are sugestii din planul de conturi pentru contul principal si pentru fiecare linie de factura.
- Denumirea sursei seed-ului contabil este neutra: `Plan contabil RO`.

## Verificari recomandate

- Deschide `Contabilitate -> Plan de conturi` si verifica aparitia conturilor complete.
- Deschide o factura draft si cauta conturi precum `5211`, `4426`, `628`.
- Valideaza factura dupa alegerea conturilor din sugestii.

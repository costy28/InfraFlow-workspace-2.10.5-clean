# UPDATE 084 - Selector conturi si mesaje de validare

Versiune: 2.12.63 -> 2.12.64
Data: 2026-06-19

## Schimbari

- Am transformat selectorul de conturi din contabilitate intr-un control cautabil dupa simbol, denumire si tip cont.
- Am inlocuit campurile text pentru conturile din Trezorerie cu selectorul din planul de conturi.
- Am adaugat validari inainte de salvare/validare pentru facturi si trezorerie:
  - tert lipsa;
  - document sau data lipsa;
  - linii fara valoare pozitiva;
  - conturi lipsa sau inexistente in planul de conturi.
- Am latit zona de selectie cont din liniile de factura pentru a evita suprapunerea campurilor.

## Verificare recomandata

1. Deschide `Contabilitate -> Plan de conturi` si confirma ca planul este incarcat.
2. Creeaza o factura intrare/iesire si cauta contul dupa cod sau denumire.
3. Incearca sa validezi o factura cu un cont inexistent si verifica mesajul ajutator.
4. Creeaza o operatie in `Trezorerie` si valideaz-o dupa selectarea conturilor.

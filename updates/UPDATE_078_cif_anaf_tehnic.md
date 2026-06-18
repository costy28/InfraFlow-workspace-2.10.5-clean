# UPDATE 078 - CIF/ANAF reutilizat in Tehnic

Versiune: 2.12.57 -> 2.12.58  
Data: 2026-06-18

## Context

ANAF / e-Factura ramane integrat in modulul Contabilitate, dar cautarea dupa CIF trebuie sa poata fi folosita si in zona Tehnic, pentru oferte, devize si vanzari asfalt.

## Modificari

- In modulul Tehnic, modalul Client nou foloseste cautarea CIF existenta si completeaza automat denumirea si adresa.
- Rezultatul cautarii afiseaza CIF-ul gasit si statusul TVA, ca feedback vizibil pentru operator.
- In Vanzari asfalt, clientul liber poate fi cautat dupa CIF direct din formularul de vanzare.
- Din formularul de vanzare asfalt se poate deschide rapid modalul de salvare client tehnic, cu datele deja completate.
- Nu s-au adaugat tabele noi si nu s-a duplicat logica ANAF.

## Verificari

- `npm run build`
- `git diff --check`


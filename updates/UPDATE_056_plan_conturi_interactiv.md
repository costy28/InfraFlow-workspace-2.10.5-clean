# UPDATE 056 - Plan de conturi interactiv

Versiune: 2.12.35 -> 2.12.36
Data: 2026-06-14

## Context

In `C:\TEMP` exista exporturi Saga utile pentru modulul Contabilitate:

- `C:\TEMP\SAGA C\conturi__ex.dbf` - configuratia coloanelor pentru lista de conturi;
- `C:\TEMP\SAGA C\fisa_ex.dbf` - configuratia pentru fisa de cont;
- `C:\TEMP\SAGA C\REGISTRU_AC_ex.dbf` - configuratia pentru registru;
- `C:\TEMP\conturi.pdf` si exporturi XLS pentru verificari vizuale.

Lista Saga pentru conturi foloseste coloane clare: Cont, Denumire, Tip, Cont inchidere, Blocat, cu alte campuri ascunse pentru solduri.

## Modificari

- Planul de conturi din InfraFlow a fost transformat din tabel plat intr-un explorator interactiv.
- Adaugate clase contabile expandabile: 1-9, cu denumiri explicite.
- Adaugat filtru pe nivel: sintetice, subconturi, analitice.
- Selectia unui cont afiseaza panou de detalii: tip, nivel, clasa, parinte, categorie si stare.
- Dublu-click pe cont sau butonul `Fisa cont` deschide fisa contului.
- Butonul `Vezi familia` filtreaza rapid conturile inrudite.

## Verificari

- `npm run build` in `client` trece cu succes.
- `node --check` pentru rutele si engine-ul de contabilitate trece fara erori.


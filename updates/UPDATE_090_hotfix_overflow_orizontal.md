# UPDATE 090 - Hotfix overflow orizontal

Versiune: 2.12.70
Data: 2026-06-20

## Problema
- Dupa reglajele de aspect, unele pagini puteau depasi latimea ecranului si apareau cu bara orizontala jos.
- Utilizatorul putea ajunge cu pagina scrollata lateral, cu sidebar-ul si inceputul continutului iesite din ecran.

## Rezolvare
- Am blocat overflow-ul orizontal global pe `html`, `body` si `#root`.
- Layout-ul principal are acum `min-width: 0` si `overflow-x-hidden` pe containerul de continut.
- Tabelele si modalele isi pastreaza propriul scroll intern unde este necesar.

## Verificare
- Build frontend rulat cu succes.
- Verificare sintaxa server rulata cu succes.

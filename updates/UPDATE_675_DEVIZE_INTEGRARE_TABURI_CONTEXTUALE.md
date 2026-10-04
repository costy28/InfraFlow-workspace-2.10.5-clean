# UPDATE 675 — Devize — integrare și taburi contextuale (v2.12.655)

## Scop

Interfața nu mai expune numele furnizorului istoric al integrării de devize. Integrarea existentă devine un adaptor generic, iar un modul profesional de devize poate fi dezvoltat ulterior separat.

## Ce se schimbă

- În paginile, departamentele, permisiunile și notificările vizibile, denumirea este `Devize — integrare`.
- Importul, exportul cantităților și situațiile de plată sunt descrise ca fișiere pentru aplicații externe de devize.
- Taburile de lucru folosesc titluri specifice rutei, inclusiv `Oferte CRM`, `Facturi ieșire` și `Devize — integrare`.

## Compatibilitate

- Rutele `/intersoft`, cheile de permisiuni `integration:intersoft_*`, schemele SQL și câmpurile istorice nu se modifică.
- Proiectele, fișierele și permisiunile deja configurate rămân funcționale.
- Acest update nu implementează modulul profesional de devize și nu modifică date financiare sau documente.

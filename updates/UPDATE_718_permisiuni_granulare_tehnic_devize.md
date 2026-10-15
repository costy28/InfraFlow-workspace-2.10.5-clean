# UPDATE 718 — Permisiuni granulare în Tehnic și Devize

Versiune: **2.12.698**  
Data: **15 octombrie 2026**

## Modificări

- Pagina Tehnic afișează separat lucrările, outputul comercial, rapoartele și exporturile după drepturile rolului.
- Crearea și finalizarea comenzilor de lucru necesită dreptul operațional, nu simpla vizualizare.
- Clienții și outputul comercial pot fi administrate numai cu dreptul dedicat de vânzări.
- Devize separă vizualizarea, importul și exportul în file și acțiuni distincte.
- Utilizatorii cu drept de import sau export pot citi numai contextul de proiect necesar operației acordate.

## Compatibilitate

- Nu se schimbă schema bazei de date.
- Nu se modifică datele sau fluxurile existente.
- Drepturile administrative și aliasurile existente rămân compatibile.

## Verificări

- teste dedicate Tehnic/Devize și regresii de permisiuni;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.

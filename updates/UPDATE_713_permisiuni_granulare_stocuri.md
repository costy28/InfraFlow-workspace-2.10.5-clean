# UPDATE 713 — Permisiuni granulare în Stocuri

Versiune: **2.12.693**  
Data: **14 octombrie 2026**

## Modificări

- Filele din Stocuri sunt afișate numai când utilizatorul are dreptul punctual corespunzător.
- Citirile pentru materiale, mișcări, livrări, stoc propriu și transferuri nu mai pornesc pentru secțiuni nepermise.
- Crearea livrărilor, transferurilor și consumurilor nu mai este decisă după numele rolului.
- Endpoint-ul de opțiuni materiale oferă nomenclatorul minimal și utilizatorilor autorizați punctual să facă operațiuni, fără a le acorda acces la stocul complet.

## Compatibilitate

- Nu se schimbă schema bazei de date.
- Permisiunile și rolurile existente rămân nemodificate.
- Protecțiile server-side existente rămân sursa de adevăr; filtrarea din interfață evită doar afișarea și apelurile nepermise.

## Verificări

- teste dedicate pentru taburi, formulare, apeluri API și nomenclatorul minimal;
- regresii pentru filtrul comun de acces și permisiunile rolurilor;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.

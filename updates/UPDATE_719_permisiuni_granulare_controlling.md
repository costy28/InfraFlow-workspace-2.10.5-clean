# UPDATE 719 — Permisiuni granulare în Controlling

Versiune: **2.12.699**  
Data: **15 octombrie 2026**

## Modificări

- Filele pentru centre, cheltuieli, buget, cost automat și rapoarte sunt filtrate după drepturile rolului.
- Adăugarea cheltuielilor, administrarea centrelor și raportarea sunt acțiuni independente.
- Pagina nu mai încarcă datele secțiunilor inaccesibile.
- API-ul oferă contextul minimal de centre și cheltuieli necesar operației acordate, fără extinderea drepturilor de scriere.

## Compatibilitate

- Nu se schimbă schema bazei de date sau datele existente.
- Fluxul complet rămâne neschimbat pentru rolurile cu toate drepturile Controlling.

## Verificări

- teste dedicate Controlling și regresii de permisiuni;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.

# UPDATE 715 — Permisiuni granulare în Aprovizionare & Achiziții

Versiune: **2.12.695**  
Data: **14 octombrie 2026**

## Modificări

- Filele Comenzi, Recepții, Cerințe, Cântar și Plan anual sunt afișate numai drepturilor relevante.
- Crearea comenzilor, recepția/returul și administrarea PAAP sunt controlate independent în interfață și în API.
- Permisiunile moderne `procurement:view` și `procurement:receive` sunt compatibile cu drepturile istorice `procurement_orders:*`.
- Utilizatorii care creează sau recepționează comenzi primesc numai nomenclatorul minimal de materiale necesar selecției.
- Formularele de creare, recepție, retur, material și PAAP nu se pot deschide fără dreptul punctual.

## Compatibilitate

- Nu se schimbă schema bazei de date.
- Rolurile existente continuă să funcționeze prin permisiunile istorice.
- Protecțiile server-side rămân sursa de adevăr pentru operațiunile de scriere.

## Verificări

- teste dedicate Achiziții și regresii de permisiuni;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.

# UPDATE 714 — Permisiuni granulare în Gestiune / Depozit

Versiune: **2.12.694**  
Data: **14 octombrie 2026**

## Modificări

- `gestiune:nir`, `gestiune:bon_consum`, `gestiune:inventar`, `gestiune:manage` și `gestiune:reports` sunt recunoscute de interfață și de rutele serverului.
- Permisiunile vechi pentru materiale, mișcări de stoc și achiziții sunt păstrate ca aliasuri compatibile.
- Formularele, exporturile și ștergerile sunt filtrate după dreptul punctual.
- Cardurile ghidate din asistent nu mai deschid modaluri de creare dacă utilizatorul are numai citire.

## Compatibilitate

- Nu se schimbă schema bazei de date.
- Rolurile existente continuă să funcționeze prin aliasurile anterioare.
- Protecțiile server-side rămân sursa de adevăr pentru fiecare operațiune.

## Verificări

- teste dedicate Gestiune și regresii pentru Stocuri și accesul comun;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.

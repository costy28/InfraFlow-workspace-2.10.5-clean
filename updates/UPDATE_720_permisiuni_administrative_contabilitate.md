# UPDATE 720 — Permisiuni administrative în Contabilitate

Versiune: **2.12.700**  
Data: **15 octombrie 2026**

## Modificări

- Alertele legislative folosesc dreptul dedicat `accounting:alerts` în rută, navigare și API.
- Marcarea unei alerte ca citită necesită dreptul de alerte sau administrare contabilă.
- Finalizarea unei alerte rămâne rezervată administrării contabile.
- Șabloanele de note contabile nu mai sunt accesibile prin simpla vizualizare; necesită `accounting:manage`.

## Compatibilitate

- Nu se schimbă schema bazei de date sau documentele contabile.
- Rolurile cu grupul contabil complet continuă să aibă acces integral.

## Verificări

- teste dedicate accesului contabil și regresii de permisiuni;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.

# UPDATE 570 — Separare Cântar de Conectări externe

Versiune: 2.12.550  
Data: 2026-09-12

## Scop

Elimină dublura vizibilă din Setări: cântarul nu mai apare și ca mapare dedicată, și ca sursă externă.

## Modificări

- meniul Setări are acum o zonă separată `Cântar` pentru mapări și configurarea sursei de date;
- `Conectări externe` rămâne pentru adaptoare precum PIUSI, autoMinder și alte surse externe viitoare;
- secțiunea `Cântar poartă · sursă date` a fost scoasă din `Surse externe`;
- textul panoului de conectări externe explică faptul că Cântarul este administrat separat.

## Compatibilitate

Nu s-au schimbat cheile de setări existente pentru cântar. Datele salvate rămân compatibile.

## Verificare

- build frontend;
- release check;
- audit expuneri fișiere;
- ZIP update validat.

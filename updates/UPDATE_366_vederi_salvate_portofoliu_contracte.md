# UPDATE 366 — Vederi salvate portofoliu contracte

Versiune: `2.12.346`  
Data: `2026-07-21`

## Scop

Utilizatorii trebuie să ajungă rapid la verificările recurente din Contract Management, fără să refacă manual combinații de filtre.

## Frontend

- Pagina `Contracte` include panou `Vederi salvate`.
- Vederi predefinite:
  - `Critice`;
  - `Scad în 30 zile`;
  - `Fără manager`;
  - `Fără document semnat`;
  - `Depășite`;
  - `Reactivate`.
- Fiecare vedere afișează numărul de contracte potrivite.
- Click pe o vedere aplică instant filtrele aferente.
- Logica de filtrare este reutilizată între lista principală și contoarele vederilor.

## Compatibilitate

- Nu necesită migrări DB.
- Compatibil cu `DB_MODE=json` și MSSQL.

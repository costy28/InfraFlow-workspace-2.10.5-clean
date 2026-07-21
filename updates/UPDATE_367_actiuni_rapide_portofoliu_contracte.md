# UPDATE 367 — Acțiuni rapide portofoliu contracte

Versiune: `2.12.347`  
Data: `2026-07-21`

## Scop

Vederile salvate trebuie să ducă utilizatorul direct spre rezolvare, nu doar spre constatare.

## Frontend

- Lista `Contracte` afișează acțiuni contextuale pe fiecare rând.
- Pentru contractele fără manager apare `Setează manager`.
- Pentru contractele fără document semnat apare `Încarcă semnat`.
- `Setează manager` actualizează contractul prin endpoint-ul existent `PATCH /api/contracts/:id`.
- `Încarcă semnat` deschide dosarul contractului și pregătește categoria `Contract semnat`.
- După salvare, lista, dashboard-ul și contoarele vederilor se reîncarcă automat.

## Compatibilitate

- Nu necesită endpoint nou.
- Nu necesită migrări DB.
- Compatibil cu `DB_MODE=json` și MSSQL.

# UPDATE 365 — Rapoarte portofoliu contracte filtrate

Versiune: `2.12.345`  
Data: `2026-07-21`

## Scop

Rapoartele de portofoliu Contract Management trebuie să reflecte aceeași realitate ca lista din ecran, nu întotdeauna portofoliul complet.

## Backend

- Am adăugat helper comun `contractsPortfolioData`.
- `GET /api/contracts/portfolio/print` folosește filtrele din query string.
- `GET /api/contracts/portfolio/export.xlsx` folosește aceleași filtre.
- Sumarul financiar, managerii, alertele și task-urile sunt calculate pe contractele filtrate.
- Raportul include etichetă cu filtrele aplicate.

## Frontend

- `Print portofoliu` transmite filtrele active din pagina `Contracte`.
- `Export Excel` transmite aceleași filtre active.
- Căutarea liberă, statusul, riscul, consumul, termenul și ciclul de viață sunt mapate în query string.

## Compatibilitate

- Nu necesită migrări DB.
- Compatibil cu `DB_MODE=json` și MSSQL.

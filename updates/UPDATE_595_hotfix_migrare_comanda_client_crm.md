# UPDATE 595 — Hotfix migrare comandă client CRM (v2.12.575)

## Problemă rezolvată

Unele instalări puteau primi codul pentru comenzi clienți fără ca bootstrap-ul CRM
să aplice migrarea `074`. În acel caz conversia ofertei acceptate era blocată de
coloane SQL lipsă.

## Remediere

- Bootstrap-ul CRM include explicit migrarea Sprintului 5 la fiecare pornire.
- Migrarea este idempotentă și este marcată în `dbo.schema_migrations` după aplicare.
- După restart, aceeași ofertă acceptată poate fi convertită în comandă fără recreare.

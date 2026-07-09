# UPDATE 250 — Șabloane HR editabile

Versiune: 2.12.230  
Data: 2026-07-09

## Schimbări

- A fost adăugat registrul de șabloane HR editabile pentru documentele generate.
- Tabul **Documente HR** afișează șabloanele disponibile și permite editarea lor de către HR.
- CIM-ul și actul adițional pot folosi conținut HTML configurabil, cu variabile inserabile.
- Variabile suportate: angajat, companie, contract, act adițional, număr document și data generării.
- Generarea documentelor folosește șablonul salvat; dacă șablonul lipsește, rămâne fallback-ul intern existent.

## Bază de date

- Migrare nouă: `db/migrations/062_hr_document_templates.sql`
- Tabel MSSQL nou: `hr.document_templates`
- Seed inițial pentru:
  - `cim`
  - `act_aditional`

## Compatibilitate

- Compatibil DB_MODE=json.
- Compatibil MSSQL cu HTML lung (`nvarchar(max)`).
- Nu introduce dependențe noi.

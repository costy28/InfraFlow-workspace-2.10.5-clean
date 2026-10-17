# UPDATE 736 — Protecție editare pontaj validat

Versiune: **2.12.716**  
Data: **17 octombrie 2026**

Salvarea directă a unei zile validate este refuzată înainte de modificare, cu status 409 și codul `HR_TIMESHEET_VALIDATED`. Se păstrează verificările existente pentru angajat și luna închisă. Interfața dezactivează celula validată și indică necesitatea devalidării.

După devalidarea autorizată, ziua se poate salva normal. Schema SQL nu necesită migrare.

Testele verifică păstrarea integrală a pontajului la refuz, corectarea după devalidare și verificarea înainte de upsert în ramura MSSQL cu executor controlat. Testarea pe SQL Server real rămâne distinctă.

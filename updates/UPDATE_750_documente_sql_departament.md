# UPDATE 750 — Documente SQL și departament nullable

Versiune: **2.12.730** — 2026-10-18.

Verificarea pe SQL Server real a identificat conversia implicită a departamentului gol în UUID în listele Documente. Cele trei interogări folosesc acum `TRY_CONVERT(uniqueidentifier, ...)` și verificare NULL. Fără schimbare de schemă, fără ștergere de date, fără schimbarea regulilor de acces.

Verificări: 48 teste unitare/policy, 24 scenarii HTTP/recitire JSON, 19 cereri HTTP și 35 interogări SQL reale într-o bază sintetică izolată. Auth și app-state sunt simulate în testul SQL; nu reprezintă validare completă a instalării. Matricea și limitele sunt în `docs/MATRICE_ROLURI_DOCUMENTE_MESAJE_2026-10-18.md`.

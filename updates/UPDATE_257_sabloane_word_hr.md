# UPDATE 257 — Șabloane Word HR

Versiune: 2.12.237  
Data: 2026-07-10

## Schimbări

- Șabloanele HR pot avea atașat fișier Word `.docx` original.
- HR poate încărca sau înlocui șablonul Word direct din lista de șabloane.
- Șablonul Word poate fi descărcat ulterior din listă sau din modalul de editare.
- UI-ul afișează clar dacă șablonul are:
  - fișier Word atașat;
  - doar conținut vizual intern.
- Fișierele Word sunt salvate în `storage/hr-templates`.
- Pentru MSSQL a fost adăugată migrarea `064_hr_document_template_word_files.sql`.
- Editorul vizual rămâne fallback pentru generarea internă HTML.

## Notă tehnică

Acest update introduce gestiunea sigură a fișierelor Word. Generarea automată `.docx` cu înlocuirea variabilelor va fi tratată separat, ca pas controlat, pentru a evita documente Word corupte de variabile fragmentate în XML.

## Compatibilitate

- Compatibil DB_MODE=json.
- Compatibil MSSQL prin migrare versionată.
- Nu introduce dependențe noi.

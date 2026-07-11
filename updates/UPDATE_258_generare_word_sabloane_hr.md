# UPDATE 258 — Generare Word din șabloane HR

Versiune: 2.12.238  
Data: 2026-07-11

## Schimbări

- A fost adăugat endpoint-ul `GET /api/hr/document-templates/:id/render-word`.
- Endpoint-ul generează un document `.docx` completat din șablonul Word atașat.
- Sunt înlocuite variabilele de forma:
  - `{{company.denumire}}`;
  - `{{angajat.nume}}`;
  - `{{angajat.prenume}}`;
  - `{{contract.numar_contract}}`;
  - `{{contract.salariu_baza}}`;
  - `{{amendment.numar_act}}`;
  - și restul variabilelor deja folosite de șabloanele HR.
- Panoul de contracte salarizare afișează buton `Word` pentru CIM când șablonul `cim` are fișier `.docx` atașat.
- Istoricul actelor adiționale afișează buton `Word` când șablonul `act_aditional` are fișier `.docx` atașat.
- Generatorul validează că documentul Word conține variabile detectabile.
- Dacă variabilele au fost rupte de Word în bucăți XML, utilizatorul primește mesaj explicit să le rescrie continuu.
- Generarea HTML și arhivarea internă existente rămân fallback.

## Limitări controlate

- Acest update descarcă documentul `.docx` completat.
- Arhivarea automată a `.docx` rezultat în dosarul electronic va fi făcută separat, după validarea fluxului de generare.

## Compatibilitate

- Compatibil DB_MODE=json.
- Compatibil MSSQL.
- Nu introduce dependențe noi; folosește `adm-zip`, deja existent în proiect.

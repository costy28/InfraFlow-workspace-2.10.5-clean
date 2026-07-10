# UPDATE 252 — Checklist dosar personal HR

Versiune: 2.12.232  
Data: 2026-07-10

## Schimbări

- A fost adăugat endpoint-ul `GET /api/hr/dossier-checklist`.
- HR vede în tabul **Documente HR** un checklist centralizat pentru dosarul personal al fiecărui angajat.
- Checklistul calculează procentul de completare pe documentele obligatorii:
  - CIM / contract;
  - act identitate;
  - fișa postului;
  - apt medical;
  - SSM / PSI.
- Sunt afișate și documentele opționale:
  - GDPR;
  - diplome / calificări;
  - acte adiționale.
- Fiecare angajat are buton rapid către dosarul electronic.
- Dosarul electronic acceptă tipuri noi de fișier:
  - `fisa_post`;
  - `ssm`;
  - `gdpr`.

## Compatibilitate

- Nu modifică schema MSSQL.
- Compatibil DB_MODE=json.
- Nu introduce dependențe noi.

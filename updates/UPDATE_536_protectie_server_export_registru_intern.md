# UPDATE 536 — Protecție server-side export registru intern

Versiune: 2.12.516  
Data: 2026-08-24

## Obiectiv

Exportul registrului intern de lucru trebuie să fie blocat nu doar în interfață, ci și în endpoint-ul real XLSX, dacă diagnosticul are lipsuri obligatorii.

## Implementare

- Am adăugat `assertRegesWorkRegisterExportable()` în modulul HR pentru validarea reutilizabilă a diagnosticului.
- Endpoint-ul `/hr/reges/work-register.xlsx` rulează diagnosticul înainte de generarea workbook-ului.
- Dacă există blocaje, endpoint-ul returnează eroare 422 cu codul `HR_REGES_WORK_REGISTER_BLOCKED` și diagnosticul complet.
- Cardul HR afișează status rapid pentru pregătirea exportului:
  - `neverificat`;
  - `blocat`;
  - `exportabil cu atenționări`;
  - `gata de export`.
- Atenționările rămân informative și nu blochează exportul.

## Verificări

- Test dedicat pentru blocarea exportului când există lipsuri obligatorii.
- Test dedicat pentru permiterea exportului când există doar atenționări.

## Migrare SQL

Nu necesită migrare SQL.

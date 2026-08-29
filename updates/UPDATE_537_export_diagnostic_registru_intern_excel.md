# UPDATE 537 — Export diagnostic registru intern Excel

Versiune: 2.12.517  
Data: 2026-08-24

## Obiectiv

Când registrul intern HR este blocat de lipsuri obligatorii, operatorul trebuie să poată descărca o listă clară de corecturi, fără să copieze manual informațiile din ecran.

## Implementare

- Am adăugat export XLSX pentru diagnosticul registrului intern.
- Workbook-ul conține:
  - sheet `Sumar`, cu total angajați, pregătiți, atenționări și blocaje;
  - sheet `Diagnostic`, cu status, angajat, marcă, contract, lipsuri obligatorii, atenționări și acțiunea recomandată.
- Dashboard HR are buton nou `Descarcă diagnostic`.
- Exportul diagnosticului este permis inclusiv când exportul registrului intern este blocat.
- Descărcarea diagnosticului este auditată separat prin `hr_reges_work_register_diagnostic_export`.

## Verificări

- Test dedicat pentru generarea workbook-ului de diagnostic.
- Testele HR existente validează în continuare blocarea exportului real când există lipsuri obligatorii.

## Migrare SQL

Nu necesită migrare SQL.

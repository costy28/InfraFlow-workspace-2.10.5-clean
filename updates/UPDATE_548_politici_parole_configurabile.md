# UPDATE 548 — Politici de parole configurabile

Versiune: 2.12.528  
Data: 2026-09-05

## Ce se schimbă

- Setări → Sistem → Securitate primește un panou dedicat pentru politica de parole.
- Administratorul poate configura lungimea minimă și cerințele de complexitate: literă mare, literă mică, cifră, simbol și interdicția de a include username-ul.
- Politica este aplicată server-side la:
  - creare utilizator;
  - editare utilizator când se setează o parolă nouă;
  - resetare parolă de către administrator;
  - resetare parolă cu cod;
  - aprobare stație nouă cu utilizator creat automat.
- Wizard-ul de instalare inițială folosește implicit politica sigură pentru Superadmin.
- Diagnosticul de securitate afișează politica activă și avertizează când regula este permisivă.

## Compatibilitate

- Parolele existente nu sunt modificate și nu sunt invalidate automat.
- Nu schimbă schema bazei de date.
- Nu necesită migrare SQL nouă.

## Verificări recomandate

- `node --check server/core/auth.js`
- `node --check server/core/setup.js`
- `node --check server/modules/system/routes.js`
- `node --check server/modules/system/service.js`
- `npm run build`
- `npm run release:check -- --no-zip`

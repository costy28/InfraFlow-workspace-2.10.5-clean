# UPDATE 255 — Istoric notificări HR și acțiuni directe

Versiune: 2.12.235  
Data: 2026-07-10

## Schimbări

- A fost adăugat endpoint-ul `GET /api/hr/advanced-expirations/notifications`.
- A fost adăugat endpoint-ul `POST /api/hr/advanced-expirations/notifications/:id/resolve`.
- Dashboard HR afișează istoricul notificărilor generate pentru scadențele HR.
- Notificările pot fi marcate ca rezolvate, cu salvarea:
  - datei rezolvării;
  - utilizatorului care a rezolvat;
  - statusului citit/rezolvat.
- Rezolvarea notificării este auditată prin `hr_scadenta_notificare_rezolvata`.
- Cardul de scadențe are acțiune directă `Deschide fișa` pentru angajat.
- Istoricul notificărilor are acțiuni rapide pentru deschiderea fișei și marcarea ca rezolvată.

## Compatibilitate

- Nu modifică schema MSSQL.
- Compatibil DB_MODE=json.
- Nu introduce dependențe noi.

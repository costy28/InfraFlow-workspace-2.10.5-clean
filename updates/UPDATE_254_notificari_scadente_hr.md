# UPDATE 254 — Notificări HR pentru scadențe critice

Versiune: 2.12.234  
Data: 2026-07-10

## Schimbări

- A fost adăugat endpoint-ul `POST /api/hr/advanced-expirations/notify`.
- Dashboard HR are buton dedicat pentru generarea notificărilor către utilizatorii HR.
- Se notifică doar scadențele:
  - deja expirate;
  - critice, cu termen în maximum 30 de zile.
- Notificările sunt deduplicate după utilizator și scadență, ca să nu se dubleze la apăsări repetate.
- Generarea notificărilor este auditată prin `hr_scadente_notificari_generate`.
- Endpoint-ul general `GET /api/notifications` include acum și notificările persistente salvate în DB.

## Compatibilitate

- Nu modifică schema MSSQL.
- Compatibil DB_MODE=json.
- Nu introduce dependențe noi.

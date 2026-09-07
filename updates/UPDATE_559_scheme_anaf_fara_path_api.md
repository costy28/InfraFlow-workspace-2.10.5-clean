# UPDATE 559 — Scheme ANAF fără path intern în API

Versiune: `2.12.539`  
Data: `2026-09-07`

## Ce schimbă

- Lista schemelor ANAF din Contabilitate nu mai returnează obiectele brute din baza aplicației.
- Endpoint-ul de rezolvare a schemei active returnează profil public, fără `file_path`, `local_path`, `diskPath` sau `absolutePath`.
- Schemele încărcate manual primesc `download_url` controlat, nu cale internă de storage.
- Download-ul verifică sesiunea, permisiunea contabilă și limitează fișierul la `storage/anaf-schemas`.
- Path-ul intern rămâne disponibil doar server-side pentru validatorul XSD.

## De ce contează

Este încă un pas de securizare comercială: utilizatorul vede documentul/fișierul printr-o acțiune controlată, nu prin structura internă a serverului.

## Verificări

- `node --check server/modules/accounting/accounting-control-routes.js`
- `node --check scripts/audit-file-exposure.js`
- `npm run audit:file-exposure`
- `npm run build`
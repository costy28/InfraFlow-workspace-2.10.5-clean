# UPDATE 560 — Jurnal autentificări în securitate

Versiune: `2.12.540`  
Data: `2026-09-07`

## Ce schimbă

- Login-ul reușit este salvat în audit cu utilizator, rezultat, IP și stație.
- Login-ul eșuat este salvat în audit fără parolă/token și cu motiv generic sigur.
- Logout-ul este salvat în audit când există sesiune validă.
- Login-ul normal înregistrează/actualizează stația curentă, nu doar wizard-ul de instalare.
- Setări → Securitate primește card „Jurnal autentificări” cu eșuate/reușite/ieșiri pe ultimele 24h.
- Diagnosticul maschează IP-ul și adaugă avertizare când există autentificări eșuate recente.

## De ce contează

Administratorul vede rapid încercările suspecte și istoricul minim de acces, fără expunere de parole, token-uri sau detalii sensibile inutile.

## Verificări

- `node --check server/core/auth-routes.js`
- `node --check server/modules/system/service.js`
- verificare helper diagnostic cu evenimente artificiale
- `npm run build`
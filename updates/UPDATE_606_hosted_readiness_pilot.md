# UPDATE 606 — Hosted Readiness pentru pilot controlat

## Versiune

`v2.12.586` — 28 septembrie 2026

## Ce aduce

- Setări → Securitate include panoul compact **Pregătire pilot hosted**.
- Panoul verifică: adresă publică HTTPS, expunere aplicație, SQL Server, `APP_KEY`, backup, SMTP și integritatea pachetului.
- Adresa publică este configurabilă în profilul organizației și este reutilizată de linkurile comerciale securizate.
- Verificările imposibil de confirmat automat (serviciu Windows, DNS/tunnel, test browser + Electron și restore de probă) sunt afișate separat, clar și fără a pretinde că au fost validate.
- Endpoint nou protejat: `GET /api/system/hosted-readiness`, permis numai administratorilor de setări.
- Corectare: verificarea manifestului de integritate folosește rădăcina reală a aplicației.

## Nu schimbă

- Nu pornește tunnel-uri, nu modifică DNS, firewall sau servere.
- Nu expune SQL Server și nu migrează date în cloud.
- Nu introduce multi-tenant sau SaaS automat.

## Verificare recomandată

1. Deschide Setări → Securitate → Pregătire pilot hosted.
2. Salvează doar adresa HTTPS finală atunci când există pilotul tehnic.
3. Rezolvă toate elementele marcate `bad`.
4. Urmează `docs/PILOT_HOSTED_READINESS.md` înainte de primul test din exterior.

# UPDATE 634 — Catalog central de actualizări

**Versiune:** `2.12.614`  
**Data:** `2026-10-01`

## Ce aduce

- Definește catalogul central semnat pentru release-uri InfraFlow, independent de platforma pe care rulează fiecare client.
- Separă clar componentele `core` de componentele de modul și filtrează eligibilitatea după licența locală și platforma serverului (`server-linux` / `server-windows`).
- Adaugă endpoint read-only de diagnostic: `GET /api/system/update/catalog-status`.
- Adaugă scriptul intern de semnare a catalogului, fără a păstra cheia privată în aplicația clientului.
- Păstrează actualizarea manuală existentă ca fallback până la activarea depozitului HTTPS central și a descărcării autentificate.

## Siguranță

- Un catalog fără semnătură validă nu este acceptat.
- Catalogul nu transmite `licenseId` în URL și nu conține secrete sau date ale clientului.
- Codul pentru module poate exista într-un pachet Core, dar accesul real rămâne verificat server-side prin licență și permisiuni.

## Activare ulterioară

Catalogul devine activ pe o instanță numai după configurarea explicită a `INFRAFLOW_UPDATE_CATALOG_URL` și a `INFRAFLOW_UPDATE_CATALOG_PUBLIC_KEY`. Până atunci, nu se schimbă comportamentul update-ului manual.

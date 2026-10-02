# UPDATE 639 — Validare distribuție centrală

**Versiune:** 2.12.619  
**Data:** 2 octombrie 2026

## Scop

Acest pachet validează end-to-end distribuția centrală pe demo:

- catalog semnat Ed25519;
- filtrare licență;
- ticket temporar per arhivă;
- verificare SHA-256;
- predare atomică către worker-ul Linux;
- rollback automat al worker-ului dacă health check-ul eșuează.

Nu modifică funcționalități operaționale, date sau setări comerciale.

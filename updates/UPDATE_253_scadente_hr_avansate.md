# UPDATE 253 — Scadențe HR avansate

Versiune: 2.12.233  
Data: 2026-07-10

## Schimbări

- A fost adăugat endpoint-ul `GET /api/hr/advanced-expirations`.
- Dashboard HR afișează scadențe centralizate pentru următoarele 90 de zile.
- Sunt urmărite:
  - act identitate;
  - apt medical;
  - permis conducere;
  - ISCIR;
  - contracte determinate / data sfârșit;
  - suspendări;
  - autorizații;
  - documente din dosarul electronic cu dată de expirare.
- Scadențele sunt grupate pe:
  - expirate;
  - ≤ 30 zile;
  - 31–60 zile;
  - 61–90 zile.
- Cardul vechi de alertare din Dashboard HR a fost extins cu scadențar avansat și fallback pe alertele existente.

## Compatibilitate

- Nu modifică schema MSSQL.
- Compatibil DB_MODE=json.
- Nu introduce dependențe noi.

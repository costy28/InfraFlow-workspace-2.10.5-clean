# UPDATE 469 — Flux simplu ANAF / e-Factura

Versiune: `2.12.449`  
Data: `2026-08-01`

## Scop

Modulul ANAF / e-Factura a primit un panou ghidat care explică operatorului ordinea firească de lucru: partener → factură → XML/SPV → recipisă → conectare SPV.

## Modificări

- `client/src/pages/modules/AnafPage.jsx`
  - adăugat panou „Flux e-Factura simplificat”;
  - adăugați pașii de lucru: verifică partenerul, pregătește factura, descarcă XML/trimite, arhivează recipisa, conectare SPV;
  - afișați indicatori rapizi pentru parteneri, facturi, drafturi/validate, trimise SPV și stare SPV;
  - panoul recomandă automat următoarea acțiune în funcție de datele încărcate;
  - încărcare inițială pentru facturi și parteneri, ca panoul să aibă context imediat;
  - păstrat fluxul manual XML/SPV existent.

## Impact

- Nu modifică schema DB.
- Nu modifică endpointurile existente.
- Nu schimbă comportamentul de creare, validare, descărcare XML sau arhivare recipisă.
- Îmbunătățește doar orientarea operatorului și vizibilitatea pașilor.

## Verificări

- `npm run build` — ✅ trecut.


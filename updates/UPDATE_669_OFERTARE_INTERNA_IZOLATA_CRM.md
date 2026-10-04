# UPDATE 669 — Ofertare internă izolată și predare CRM (v2.12.649)

## Separare de produs

- Ofertarea internă nu este activă implicit și nu se afișează în meniul aplicațiilor client.
- În mediul Demo rămâne indisponibilă chiar dacă este activată eronat o variabilă de runtime.
- Pentru laptopul intern InfraFlow se activează explicit doar prin `INFRAFLOW_INTERNAL_OFFERING=1`, apoi prin repornirea serviciului.

## Flux către CRM

- După alegerea unui prospect/client CRM existent, simularea poate crea la cerere un draft editabil în CRM.
- Pozițiile păstrează pachetul, extensiile, utilizatorii suplimentari, implementarea, moneda, discountul, TVA-ul și, pentru RON, cursul BNR ca notă internă.
- Nicio ofertă nu este trimisă, acceptată sau facturată automat.

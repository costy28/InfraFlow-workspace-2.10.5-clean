# UPDATE 608 — Hotfix ofertă CRM și demo izolat

`v2.12.588` — 28 septembrie 2026

## Ce corectează

- Fișa unei oferte CRM citește corect comanda client asociată; crearea și redeschiderea unei oferte nu mai eșuează din cauza unei referințe SQL lipsă.
- Demo-ul comercial MSSQL are un script de pornire separat, implicit pe `localhost:4191`, cu scheduler-ul oprit.

## Protecții

- Demo-ul acceptă numai baze cu prefixul `INFRAFLOW_DEMO`.
- Instanța curentă de la `localhost:4180` nu este modificată.
- Scripturile și datele demo rămân excluse din pachetul comercial normal.

## Verificări

- `npm run test:commercial-demo`
- verificare reală MSSQL: Construct Demo SRL, 3 conturi, 1 lead, 3 oferte, 1 comandă, verificare de stoc cu deficit, 2 necesare și 1 proformă.

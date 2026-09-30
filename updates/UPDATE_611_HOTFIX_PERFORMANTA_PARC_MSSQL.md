# Update 611 — Hotfix performanță Parc & Resurse (v2.12.591)

## Ce se schimbă

- Pagina Parc & Resurse încarcă datele comune prin endpoint-ul agregat `GET /api/fleet/overview`.
- Sunt eliminate trei citiri redundante ale aceleiași stări MSSQL la deschiderea paginii.
- Pool-ul MSSQL este inițializat non-blocant la pornirea serverului; fallback-ul compatibil PowerShell rămâne disponibil pentru rutele legacy sincrone.
- Jurnalul serverului reține doar erorile HTTP și cererile care depășesc pragul configurabil `INFRAFLOW_SLOW_REQUEST_MS` (implicit 500 ms).

## Efect

- Încărcare mai rapidă și mai constantă pentru Parc & Resurse și foi de parcurs.
- Mai puțin I/O de jurnal în utilizarea normală.

## Limită cunoscută

Acest hotfix nu mută încă starea globală `app_state`, CPV și auditul în tabele relaționale. Acea optimizare structurală va fi făcută separat, cu migrare și testare dedicate.

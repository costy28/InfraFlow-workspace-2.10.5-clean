# UPDATE 279 — Split navigatie HR frontend

Versiune: `2.12.259`
Data: 2026-07-12

## Ce s-a schimbat

- Navigația taburilor HR a fost extrasă din `client/src/pages/modules/HRPage.jsx` în `client/src/pages/modules/hr/HRNavigationTabs.jsx`.
- Lista taburilor HR și permisiunile aferente au fost mutate lângă componenta de navigație.
- `HRPage.jsx` folosește acum `getVisibleHrTabs(...)` și `HRNavigationTabs` pentru zona de taburi.

## Comportament păstrat

- Aceleași taburi HR, în aceeași ordine.
- Aceleași reguli de permisiuni pentru taburi.
- Aceleași badge-uri vizuale pentru alerte Dashboard HR și Inbox HR.
- Nicio schimbare de API sau flux funcțional.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`

## Observație tehnică

Acesta este primul pas din split-ul frontend HR. Am ales navigația deoarece este o componentă pur vizuală și reduce riscul înainte de a separa filtrele, tabelele și formularele mari.

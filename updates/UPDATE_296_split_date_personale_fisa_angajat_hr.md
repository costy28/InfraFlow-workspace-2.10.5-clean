# UPDATE 296 — Split date personale fișă angajat HR

Versiune: `2.12.276`  
Data: `2026-07-13`

## Scop

Reducerea în continuare a monolitului `HRPage.jsx` prin extragerea tabului `Date personale` din fișa angajatului într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HREmployeePersonalTab.jsx`.
- Mutat formularul de editare pentru:
  - date personale;
  - act identitate;
  - date angajare;
  - asociere cont aplicație/Kiosk;
  - date financiare;
  - documente și expirări;
  - GDPR.
- Mutat sumarul read-only pentru:
  - date personale;
  - contract și concediu de odihnă;
  - adeverințe;
  - documente obligatorii;
  - statistici pontaj.
- `HRPage.jsx` rămâne responsabil de state, handler-ele de salvare, adeverințe și calculele existente.

## Compatibilitate

- Endpointurile existente rămân neschimbate.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul și câmpurile afișate rămân aceleași.

## Verificări

- `npm --prefix client run build` — OK.

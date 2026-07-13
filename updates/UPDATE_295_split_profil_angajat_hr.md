# UPDATE 295 — Split profil angajat HR

Versiune: `2.12.275`  
Data: `2026-07-13`

## Scop

Reducerea blocului mare din `HRPage.jsx` prin extragerea carcasei fișei angajatului în componente dedicate, fără schimbări de API, DB sau UX.

## Modificări

- Adăugat `client/src/pages/modules/hr/HREmployeeProfileChrome.jsx`.
- Extras antetul profilului angajatului:
  - fotografie;
  - nume, funcție, departament;
  - butoane pentru print, editare, salvare și renunțare.
- Extrase cardurile de sumar ale profilului:
  - status contract;
  - progres dosar HR;
  - confirmări Kiosk;
  - următoarea scadență;
  - progres flux HR.
- Extras jurnalul de activitate HR recentă pentru angajat.
- Extrasă navigația taburilor profilului:
  - Date personale;
  - Contracte;
  - Pontaj & concedii;
  - Dosar documente;
  - Scadențe & Kiosk;
  - Onboarding / Offboarding;
  - Echipamente.

## Compatibilitate

- State-ul și handler-ele rămân în `HRPage.jsx`.
- Endpointurile existente rămân neschimbate.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.

## Verificări

- `npm --prefix client run build` — OK.

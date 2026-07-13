# UPDATE 298 — Split scadențe și Kiosk fișă angajat HR

Versiune: `2.12.278`  
Data: `2026-07-13`

## Scop

Continuarea separării fișei angajatului prin extragerea tabului `Scadențe & Kiosk` din `HRPage.jsx`.

## Modificări

- Adăugat `client/src/pages/modules/hr/HREmployeeKioskTab.jsx`.
- Mutate în componentă dedicată:
  - sumar documente Kiosk;
  - confirmări nefinalizate;
  - scadențe în următoarele 90 de zile;
  - buton reminder Kiosk;
  - lipsuri obligatorii;
  - lista scadențelor cu severitate vizuală.
- `HRPage.jsx` rămâne responsabil de datele calculate și handler-ul `sendDossierReminder`.

## Compatibilitate

- Endpointurile existente rămân neschimbate.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul și datele afișate rămân aceleași.

## Verificări

- `npm --prefix client run build` — OK.

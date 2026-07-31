# UPDATE 445 — Asistent discret HR

Versiune: `2.12.425`  
Data: 2026-07-31

## Scop

Transformă ghidul HR existent într-un asistent operațional compact, potrivit pentru direcția comercială InfraFlow: aplicația trebuie să arate următorul pas, nu să oblige utilizatorul să caute manual prin toate taburile HR.

## Modificări

- `client/src/pages/modules/HRPage.jsx`
  - eliminat cardul generic `ContextHelp` din HR;
  - adăugat `Asistent HR` compact, pe același model cu asistenții discreți din Contracte, Achiziții și Gestiune;
  - calcul automat pentru:
    - Inbox HR;
    - cereri de concediu în așteptare;
    - certificate medicale de verificat;
    - scadențe HR;
    - dosare cu lipsuri sau confirmări;
    - angajați fără cont ERP/Kiosk asociat;
    - pontaje cu status de verificat;
  - indicatorii rapizi deschid direct tabul relevant;
  - detaliile operaționale sunt pliabile.

## Compatibilitate

- Nu modifică API-uri.
- Nu modifică schema DB.
- Nu schimbă fluxurile HR existente.
- Funcționează cu datele deja încărcate în `HRPage.jsx`.

## Verificări

- `npm run build` ✅
- `npm run release:check` ✅
- ZIP update generat: `installer/output/InfraFlow-update-v2.12.425.zip` ✅

# UPDATE 436 — Curățare onboarding și demo comercial

Versiune: `2.12.416`
Data: `2026-07-31`

## Scop

Continuă transformarea InfraFlow într-un ERP comercial generic prin eliminarea textelor vizibile rămase din wizard, help, Tehnic, Gestiune și seed-ul demo.

## Modificări

- Wizardul inițial descrie profilurile cu termeni generali:
  - `Parc & Resurse`
  - `Producție / Operațiuni`
  - `Execuție`
  - operatori în loc de șoferi ca profil exclusiv.
- Ghidul de ajutor folosește:
  - `PRODUCȚIE / OPERAȚIUNI`
  - `PARC & RESURSE`
  - consum operațional, resurse și puncte de lucru.
- Modulul Tehnic folosește tabul `Vânzări / Output`.
- Gestiune păstrează valoarea tehnică istorică `asfalt`, dar o afișează ca `Material de producție`.
- Demo seed-ul a primit exemple mai neutre pentru:
  - foi parcurs;
  - referate;
  - PAAP;
  - costuri;
  - planificări Parc & Resurse;
  - notificări.

## Compatibilitate

Nu au fost schimbate chei istorice, rute API sau valori tehnice folosite la compatibilitate. Schimbările sunt de limbaj vizibil și date demo.

## Verificări

- Scan focalizat pentru stringuri vechi în fișierele modificate.
- `npm run build`
- `scripts/windows/build-update-zip.ps1`

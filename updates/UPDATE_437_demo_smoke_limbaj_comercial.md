# UPDATE 437 — Demo și smoke test cu limbaj comercial

Versiune: `2.12.417`
Data: `2026-07-31`

## Scop

Finalizează curățarea stratului demo/teste, astfel încât prezentarea și smoke test-ul să susțină direcția de ERP comercial generic.

## Modificări

- `StartDemoPage` descrie directorul ca utilizator de operațiuni generale, HR și costuri.
- Smoke test-ul demo folosește texte de verificare cu:
  - `coordonator resurse`;
  - `operator Kiosk`;
  - `material procesat demo`;
  - `punct lucru demo`.
- Seed-ul demo a fost neutralizat în zonele afișabile:
  - canale de mesaje;
  - hint director;
  - notificări de stoc;
  - rețete demo;
  - puncte de lucru;
  - work orders;
  - fleet requests;
  - consumuri operaționale.

## Compatibilitate

Conturile istorice demo, rutele și câmpurile tehnice au fost păstrate pentru compatibilitatea smoke test-ului:

- `sef.mecanizare`
- `sofer1`
- ruta `/mecanizare`
- câmpuri interne precum `sofer_id` și `asphalt`

## Verificări

- Scan focalizat pe texte vechi în demo/smoke.
- `npm run build`
- `scripts/windows/build-update-zip.ps1`

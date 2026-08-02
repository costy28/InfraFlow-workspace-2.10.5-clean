# UPDATE 479 — Workflow configurabil vizibil în Setări

Versiune: 2.12.459

## Context

Nu toate organizațiile aprobă documentele prin aceleași departamente și în aceeași ordine. Pentru InfraFlow comercial, fluxurile implicite trebuie să fie șabloane editabile, nu trasee hardcodate.

## Modificări

- `client/src/pages/SetariPage.jsx`
  - Adăugat panou `Fluxuri documente configurabile` în `Setări > Module`.
  - Panoul explică principiul comercial: fiecare organizație își setează propriul circuit.
  - Sunt vizibile direcțiile viitoare: șabloane de flux, editor vizual simplu și versionare sigură.

- `AGENTS.md`
  - Roadmap nou pentru `Workflow configurabil pe organizație și tip document`.
  - Pașii pot fi departamente, roluri, utilizatori nominali sau managerul direct.
  - Condiții pe valoare, departament, centru de cost, țară, prioritate sau sursă document.

- `docs/PRODUCTIZARE_COMERCIALA.md`
  - Secțiune nouă `Workflow configurabil pe organizație`.
  - Regulă de implementare: fluxurile implicite pot exista ca șabloane, dar clientul trebuie să poată modifica traseul fără cod.

## Verificări

- `npm run build`
- `npm run release:check -- --no-zip`
- `powershell -ExecutionPolicy Bypass -File scripts\windows\build-update-zip.ps1`

## Rezultat

Direcția de workflow configurabil este vizibilă și documentată, fără să schimbe încă schema DB sau comportamentul circuitelor existente.

# UPDATE 041 - Kiosk demo sofer

## Scop

Face Kiosk-ul folosibil in demo pe telefon, cu un angajat sofer care poate intra fara sesiune ERP principala si poate lucra cu foaia de parcurs primita.

## Inclus

- User demo Kiosk: `sofer1` / `demo123`, legat de angajatul Ion Popescu.
- Profil Kiosk agregat pentru angajat: pontaj luna curenta, cereri concediu, autorizatii, echipamente si notificari personale.
- Foaie de parcurs activa dedicata pentru sofer: `FP-2026-KIOSK-001`, vehicul `NT-01-ABC`.
- Editare verso foaie de parcurs din Kiosk: activitati, kilometri la sosire, kilometri pe categorii si observatii.
- Cereri de concediu trimise din Kiosk cu token dedicat, fara redirect catre login-ul principal.
- Smoke test extins pentru login sofer, profil Kiosk, cerere CO si completare verso.

## Note

- Instanta MSSQL de dezvoltare ramane separata.
- Demo-ul JSON ramane pe portul `4190`.
- Datele demo se pot reseta prin `scripts/seed-demo.js` sau scripturile Windows dedicate.

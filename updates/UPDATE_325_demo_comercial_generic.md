# UPDATE 325 — Demo comercial generic

Versiune: `2.12.305`  
Data: `2026-07-15`

## Context

După decuplarea Controlling de seed-ul vechi, demo-ul livrat încă păstra identitatea istorică a clientului pilot și domenii de email specifice acestuia.

## Modificări

- `data/demo-seed.json`
  - companie demo: `Construct Demo SRL`;
  - adresă generică;
  - emailuri pe domeniul `infraflow-demo.ro`;
  - utilizatorul demo afișează `Admin Demo InfraFlow`.
- `scripts/seed-demo.js`
  - angajații demo generați primesc emailuri `@infraflow-demo.ro`.
- `data/app-db.demo.json`
  - regenerat din seed-ul demo actualizat.
- `scripts/smoke-demo.js`
  - verifică identitatea generică `Construct Demo`, nu identitatea veche a clientului pilot.
- `db/migrations/015_mediu.sql`
  - textul autorizației demo nu mai conține referință la client pilot.

## Verificări

- Scanare surse demo active pentru brandingul demo vechi și textul autorizației vechi.
- Audit local complet după finalizare.

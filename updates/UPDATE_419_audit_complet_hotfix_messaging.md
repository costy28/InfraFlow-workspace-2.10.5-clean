# UPDATE 419 — Audit complet aplicație și hotfix Inbox ERP

Versiune: `2.12.399`  
Data: `2026-07-28`

## Scop

Audit tehnic și funcțional la nivel de aplicație, cu remedieri sigure pe bug-uri concrete descoperite în timpul verificării.

## Verificări rulate

- `npm run release:check`
- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
- `npm run test:smoke`
- `npm run test:release`
- `npm run test:backup`
- `npm run audit:local -- --skip-build`
- `npm run audit:advisory -- --skip-build`
- `npx eslint src/pages/modules/MessagingPage.jsx --quiet`

## Remedieri incluse

- `client/src/pages/modules/MessagingPage.jsx`
  - adăugată stare dedicată `emailError` pentru modalul de detalii email;
  - reparată calea de eroare la descărcarea atașamentelor email, unde se apela `setEmailError` fără stare definită;
  - mesajele de eroare la descărcare apar acum în modal, nu pierdute în consolă;
  - deep-linkul email și încărcarea membrilor canalului au fost mutate pe microtask pentru compatibilitate cu regula React `set-state-in-effect`.

- `client/src/pages/SetariPage.jsx`
  - răspunsul brut GPS nu mai este logat în consola browserului în producție;
  - raw body rămâne disponibil doar în development, prin `console.debug`.

- `client/src/pages/FisaVehicul.jsx`
  - indisponibilitatea GPS live este tratată explicit;
  - ultima poziție cunoscută rămâne afișată dacă furnizorul GPS nu răspunde.

## Registru audit

- Creat `docs/AUDIT_COMPLET_2026-07-28.md`.
- Documentul conține baseline-ul testelor, zonele mari de cod, riscurile tehnice și lista de îmbunătățiri pe module.

## Observații importante

- Aplicația trece toate testele funcționale existente.
- Datoria tehnică majoră nu este instabilitate runtime, ci mentenabilitate: fișiere mari, module istorice replicate și UX încă prea tehnic în zonele de administrare.
- `npm audit` semnalează vulnerabilități în dependențe existente; unele au fix disponibil, `xlsx` nu are fix direct prin npm.

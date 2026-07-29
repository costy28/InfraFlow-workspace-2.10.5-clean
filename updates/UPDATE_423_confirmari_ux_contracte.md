# UPDATE 423 — Confirmări UX contracte cu motiv auditat

Versiune: `2.12.403`  
Data: `2026-07-29`

## Scop

Continuăm curățarea UX începută în UPDATE 422. Modulul Contracte are acțiuni sensibile, cu motiv auditat, iar dialogurile native de browser erau prea seci pentru un produs comercial.

## Modificări

- `ConfirmDialog` acceptă acum motiv auditat opțional:
  - etichetă configurabilă;
  - valoare implicită;
  - placeholder;
  - obligativitate și lungime minimă.
- În Contracte, acțiunile de lifecycle au fost mutate pe dialoguri ERP:
  - închidere contract;
  - închidere forțată;
  - redeschidere;
  - anulare;
  - reactivare.
- Dacă închiderea contractului are blocaje, utilizatorul primește un pas separat de confirmare forțată cu lista blocajelor.
- Anularea actelor adiționale și anularea atașamentelor cer motiv în modal, nu prin prompt nativ.

## Verificări

- `rg "window\.confirm|window\.prompt|window\.alert" client/src/pages/modules/ContractePage.jsx client/src/components/ui/ConfirmDialog.jsx`
- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run test:smoke`
- `scripts\windows\build-update-zip.ps1 -SkipClientBuild`

## Impact

Nu schimbă endpointuri sau schema DB. Acțiunile trimit aceleași payload-uri serverului, dar interfața este mai clară și mai sigură pentru operator.

# UPDATE 571 — Setări generale pe carduri și TVA extensibil

Versiune: 2.12.551  
Data: 12 Septembrie 2026

## Ce s-a schimbat

- Setări → General este organizat în carduri mai ușor de urmărit: identitate organizație, profil internațional, server/locație și fiscal/TVA.
- Configurarea TVA nu mai este o listă fixă de câmpuri standard/redus/super-redus.
- România pornește implicit cu 21% și 11%; câmpul „TVA super-redus” a fost eliminat din profilul RO.
- Cotele TVA se salvează într-o listă extensibilă (vat_rates), cu opțiuni pentru activ/inactiv și cotă implicită.
- Compatibilitatea cu setările vechi (tva_implicit, cota_tva_standard, cota_tva_redusa) rămâne activă pentru facturi și e-Factură.

## De ce

Setările generale deveniseră o înșiruire lungă de câmpuri. Noua structură reduce scroll-ul mental și pregătește aplicația pentru profiluri fiscale pe țară, fără câmpuri hardcodate pentru fiecare cotă.

## Verificări

- npm run build
- npm run release:check -- --no-zip
- npm run audit:file-exposure
- git diff --check

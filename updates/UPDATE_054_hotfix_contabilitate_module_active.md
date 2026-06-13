# UPDATE 054 - Hotfix Contabilitate in module active

Versiune: 2.12.33 -> 2.12.34
Data: 2026-06-13

## Problema

Modulul Contabilitate aparea pentru scurt timp in sidebar, apoi disparea dupa incarcarea setarilor.
Cauza era lista de module configurabile: `accounting` nu era inclus in catalogul UI si in whitelist-ul backend pentru `modules_enabled`.

## Modificari

- Adaugat `accounting` in lista de module din Setari.
- Adaugat cardul Contabilitate in sectiunea Operational.
- Adaugat configurarea subfunctiilor contabile: plan conturi, terti, facturi, trezorerie, registru jurnal, rapoarte si inchidere luna.
- Adaugat `accounting` in whitelist-ul backend pentru module configurabile.
- Adaugat alias `contabilitate -> accounting` pentru licente si compatibilitate.

## Rezultat

Cand Contabilitatea este activata, ramane vizibila stabil in sidebar si ruta `/contabilitate` ramane accesibila.

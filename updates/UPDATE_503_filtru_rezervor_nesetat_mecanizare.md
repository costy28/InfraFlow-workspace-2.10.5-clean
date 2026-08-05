# UPDATE 503 — Filtru rezervor nesetat în Mecanizare

Versiune: `2.12.483`  
Data: `2026-08-04`

## Scop

După introducerea controlului de capacitate rezervor, interfața trebuie să arate clar unde lipsesc datele necesare. Altfel controlul rămâne parțial și operatorul nu știe ce să completeze.

## Implementat

- Panoul carburant pe resursă calculează câte utilaje/vehicule nu au capacitatea rezervorului completată.
- A fost adăugat filtrul rapid `Rezervor nesetat`.
- Avertizarea de deasupra tabelului explică faptul că procentul de ocupare funcționează complet doar după completarea capacității.
- Rândurile fără capacitate au buton `Fișă`, cu deep-link către dosarul complet al resursei.

## Beneficiu

Responsabilul de parc vede imediat ce date tehnice lipsesc și poate completa fișele resurselor înainte de a interpreta soldul estimat de carburant.

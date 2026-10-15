# UPDATE 724 — Permisiuni granulare pentru Trezorerie

Versiune: **2.12.704**  
Data: **15 octombrie 2026**

## Modificări

- Consultarea operațiilor, soldurilor, facturilor deschise și notelor contabile rămâne disponibilă cu `accounting:view`.
- Introducerea, editarea, validarea, devalidarea, anularea și clasificarea operațiilor cer `accounting:post`.
- Legarea facturilor, stingerea avansurilor, alocarea pe mai multe facturi și anularea alocărilor cer drept de postare.
- Exportul registrului de trezorerie cere `accounting:reports`.
- Linkurile venite din facturi nu mai deschid formularul de plată sau încasare fără dreptul necesar.

## Compatibilitate

- Nu se schimbă schema, operațiile, stingerile sau notele contabile existente.
- Rolurile contabile complete își păstrează fluxul actual.

## Verificări

- teste dedicate și regresii de permisiuni;
- regresie contabilă completă;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.

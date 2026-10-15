# UPDATE 723 — Permisiuni granulare pentru Facturi contabile

Versiune: **2.12.703**  
Data: **15 octombrie 2026**

## Modificări

- Consultarea facturilor de intrare și ieșire rămâne disponibilă cu `accounting:view`.
- Crearea, editarea, validarea, devalidarea, storno și anularea draftului cer `accounting:post`.
- Plata, încasarea și pregătirea e-Factura cer drept de postare contabilă.
- Utilizatorii cu acces exclusiv de citire păstrează lista, soldurile, notele contabile și navigarea contextuală.
- Interfața nu mai oferă comenzi pe care serverul le-ar refuza.

## Compatibilitate

- Nu se schimbă schema, facturile, notele contabile sau soldurile existente.
- Rolurile contabile complete își păstrează fluxul actual.

## Verificări

- teste dedicate și regresii de permisiuni;
- regresie contabilă completă;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.

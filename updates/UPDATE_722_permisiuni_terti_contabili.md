# UPDATE 722 — Permisiuni granulare pentru Terți contabili

Versiune: **2.12.702**  
Data: **15 octombrie 2026**

## Modificări

- Consultarea furnizorilor, clienților, scadențarului și istoricului rămâne disponibilă cu `accounting:view`.
- Crearea, editarea, activarea și dezactivarea terților cer `accounting:manage`.
- Marcarea confirmărilor de sold și acțiunile asupra notelor de credit cer `accounting:post`.
- Exporturile, fișele de terț și documentele tipăribile cer `accounting:reports`.
- Utilizatorii nu mai văd acțiuni pe care serverul le-ar refuza ulterior.

## Compatibilitate

- Nu se schimbă schema, terții, facturile sau soldurile existente.
- Rolurile contabile complete își păstrează fluxul actual.

## Verificări

- teste dedicate și regresii de permisiuni;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.

# UPDATE 692 — Date Demo persistente și ștergere controlată

**Versiune:** v2.12.672  
**Data:** 6 octombrie 2026

## Schimbări

- Bara galbenă specifică Demo este eliminată din interfață.
- Șablonul de task Windows pentru reset Demo este livrat dezactivat; scriptul de reset rămâne o acțiune manuală, explicită.
- Conturile create din solicitări Demo păstrează accesul configurat, inclusiv termenul standard de 15 zile, fără o resetare automată a datelor la ora 03:00.
- Superadminul poate șterge controlat un cont Demo din **Setări → Utilizatori**; confirmarea cere textul exact `STERGE`.
- La ștergere sunt eliminate sesiunile contului și înregistrările create de acel cont, marcate după instalarea acestei versiuni. Datele istorice sau comune nu sunt șterse automat.

## Notă operațională

Un job de reset instalat deja pe un server nu poate fi eliminat automat de pachet. Procedura sigură de identificare și oprire este în `docs/DEMO_DATE_PERSISTENTE.md`.

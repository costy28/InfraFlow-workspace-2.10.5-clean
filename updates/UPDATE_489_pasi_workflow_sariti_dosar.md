# UPDATE 489 — Pași workflow săriți vizibili în dosarul documentului

Versiune: `2.12.469`
Data: `2026-08-04`

## Context

Engine-ul workflow aplică deja `condition_rule` și păstrează în snapshot pașii săriți. Lipsea partea de transparență pentru utilizator: dosarul documentului trebuia să explice de ce circuitul a inclus sau a sărit anumiți pași.

## Implementare

- `Documente > Detalii document` afișează scenariul evaluat la lansarea în circuit:
  - tip document;
  - valoare;
  - departament;
  - prioritate;
  - țară;
  - centru de cost;
  - sursă.
- Cardul `Flux aplicat documentului` afișează:
  - versiunea fluxului;
  - pașii aplicați;
  - numărul pașilor săriți.
- Pentru pașii aplicați se vede evaluarea condiției și regula folosită.
- Pentru pașii săriți se vede:
  - pasul inițial;
  - regula;
  - valoarea actuală;
  - valoarea așteptată.

## Siguranță

- Nu există endpoint nou.
- Nu există migrare DB.
- Se folosește exclusiv `workflow_snapshot` deja salvat la lansarea documentului.

## Verificare

- Build frontend.
- Release check.
- ZIP update validat.

# UPDATE 487 — Aplicare controlată a `condition_rule` în engine

Versiune: `2.12.467`
Data: `2026-08-03`

## Ce s-a schimbat

- Engine-ul real de documente evaluează regulile structurate `condition_rule` la lansarea documentului în circuit.
- Pașii sunt săriți doar când regula structurată poate fi evaluată clar ca falsă.
- Pașii cu reguli text libere, reguli lipsă sau date insuficiente rămân incluși, pentru a evita pierderea unei aprobări.
- Snapshot-ul workflow păstrează:
  - scenariul evaluat;
  - motorul `safe_v1`;
  - pașii incluși;
  - pașii săriți în `skipped_steps`.
- Dacă toate condițiile ar elimina toți pașii, engine-ul revine la fallback-ul existent.

## De ce contează

Fluxurile configurabile nu mai sunt doar simulate. Ele încep să influențeze circuitul real, dar într-un mod prudent: doar regulile structurate și clare pot sări pași.

## Compatibilitate

- Nu schimbă schema bazei de date.
- Nu execută expresii dinamice și nu folosește `eval`.
- Păstrează compatibilitatea cu condițiile text vechi.
- Funcționează și în DB_MODE json și în MSSQL relational.

## Verificare recomandată

1. Configurează un flux cu un pas condiționat pe valoare sau prioritate.
2. Lansează un document care îndeplinește condiția și verifică pasul în circuit.
3. Lansează un document care nu îndeplinește condiția și verifică faptul că pasul este sărit.
4. Verifică în dosarul documentului că snapshot-ul păstrează fluxul și versiunea folosită.

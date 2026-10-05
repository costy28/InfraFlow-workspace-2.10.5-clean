# UPDATE 684 — Planificare și cost Logistică (v2.12.664)

## Scop

Ajută operatorul să observe suprapunerile de alocare înainte de salvarea unei
curse și să compare manual costul estimat cu cel realizat.

## Ce este nou

- Verificare la cerere a intervalului planificat pentru vehiculul și șoferul
  selectați.
- Avertizare pentru curse InfraFlow neanulate care se suprapun în timp pe
  aceeași resursă; avertizarea nu blochează salvarea.
- Cost estimat, cost realizat, moneda RON/EUR și observații, introduse manual
  pentru fiecare cursă.

## Limite explicite

- Nu se folosesc implicit date GPS, foi de parcurs sau programări externe.
- Nu sunt calculate automat tarife, kilometri, consum, diurne ori costuri.
- Nu transmite date către RO e-Transport, ANAF, transportatori ori alt sistem
  extern.

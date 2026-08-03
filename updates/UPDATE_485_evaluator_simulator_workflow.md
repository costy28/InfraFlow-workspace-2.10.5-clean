# UPDATE 485 — Evaluator safe pentru simulatorul workflow

Versiune: `2.12.465`
Data: `2026-08-03`

## Ce s-a schimbat

- Simulatorul de fluxuri documente din `Setări > Module` evaluează regulile structurate `condition_rule` direct în preview.
- Evaluarea este safe: nu folosește `eval`, nu execută expresii și nu modifică documente reale.
- Scenariul de test include câmpuri suplimentare utile pentru reguli comerciale:
  - țară / jurisdicție;
  - centru de cost;
  - sursă document.
- Fiecare pas din preview afișează dacă:
  - se aplică în scenariul testat;
  - ar fi sărit în scenariul testat;
  - nu are suficiente date pentru test;
  - este condiție text liberă compatibilă, dar neevaluabilă automat.

## De ce contează

Fluxurile configurabile devin mai ușor de verificat de administrator înainte să fie folosite pe documente reale. Utilizatorul nu trebuie să înțeleagă reguli tehnice; vede direct traseul rezultat.

## Compatibilitate

- Nu schimbă engine-ul real de lansare workflow.
- Nu schimbă schema bazei de date.
- Condițiile text existente rămân compatibile.
- Regula structurată introdusă în `v2.12.464` este folosită doar pentru preview.

## Verificare recomandată

1. Intră în `Setări > Module`.
2. Deschide zona de workflow configurabil.
3. Testează un flux cu reguli pe valoare, prioritate, țară, centru de cost sau sursă document.
4. Confirmă că preview-ul arată corect pașii care se aplică și pașii care ar fi săriți.

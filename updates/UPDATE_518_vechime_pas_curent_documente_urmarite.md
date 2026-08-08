# UPDATE 518 — Vechime pas curent documente urmărite

Versiune: `2.12.498`
Data: `2026-08-08`

## Ce s-a schimbat

- Documentele urmărite includ acum `current_step_created_at`, data intrării în pasul curent.
- Dashboard-ul afișează un nou grup: `După vechime pas`.
- Grupurile disponibile:
  - `3+ zile în pas`;
  - `2 zile în pas`;
  - `0–1 zile în pas`;
  - `Pas fără dată`;
  - `Fără pas curent`.
- Grupul este clickabil și deschide Documente cu subfiltrul `watch_age`.
- DocumentePage afișează grupul activ ca `vechime pas: ...`.

## Impact

- Managerul vede nu doar cine are documente, ci și cât timp stau blocate în același pas.
- Este fundația pentru escaladări automate după X zile.
- Nu necesită migrare SQL.

## Verificare recomandată

1. Intră în Dashboard.
2. Verifică panoul `Documente urmărite`.
3. Confirmă apariția cardului `După vechime pas`.
4. Apasă pe `3+ zile în pas` sau alt grup disponibil.
5. Confirmă că Documente se deschide cu filtrul `Urmărite` și grupul `vechime pas`.

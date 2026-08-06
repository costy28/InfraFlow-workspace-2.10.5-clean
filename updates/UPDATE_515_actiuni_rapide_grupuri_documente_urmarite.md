# UPDATE 515 — Acțiuni rapide pe grupuri documente urmărite

Versiune: `2.12.495`
Data: `2026-08-06`

## Ce s-a schimbat

- În Documente, când lista este deschisă dintr-un grup urmărit din Dashboard, acțiunile sunt contextualizate pentru grup.
- Butonul de selecție devine explicit:
  - `Selectează tot grupul`
  - `Deselectează grupul`
- Bara filtrului activ permite curățarea doar a grupului urmărit, fără resetarea completă a filtrului `Urmărite`.
- Exportul CSV și crearea task-urilor în masă pot fi folosite imediat pe grupul afișat.

## Impact

- Utilizatorul nu mai trebuie să înțeleagă manual că lista afișată este deja un grup filtrat.
- Fluxul Dashboard → Documente → selectare grup → task/export devine mai direct.
- Nu necesită migrare SQL.

## Verificare recomandată

1. Dashboard → Documente urmărite.
2. Click pe un grup din `După termen`, `După responsabil` sau `După tip document`.
3. În Documente, verifică apariția grupului în bara filtrului activ.
4. Apasă `Selectează tot grupul`.
5. Verifică exportul CSV sau crearea task-urilor pentru selecția grupului.
6. Apasă `Curăță doar grupul` și confirmă că filtrul `Urmărite` rămâne activ.

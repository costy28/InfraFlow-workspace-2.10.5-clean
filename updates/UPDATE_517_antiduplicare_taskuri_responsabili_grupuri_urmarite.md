# UPDATE 517 — Anti-duplicare task-uri responsabili grupuri urmărite

Versiune: `2.12.497`
Data: `2026-08-08`

## Ce s-a schimbat

- Acțiunea `Task-uri către responsabili` din Documente verifică task-urile deschise existente înainte să creeze altele noi.
- Dacă un document are deja un task deschis către același responsabil curent, documentul este sărit.
- Mesajul de confirmare arată:
  - câte task-uri noi au fost create;
  - câte documente au fost omise pentru că aveau deja task deschis.
- Dacă toate documentele din grup au deja task-uri deschise, nu se creează duplicate.

## Impact

- Managerul poate apăsa acțiunea fără teama că dublează sarcinile.
- Lista de task-uri rămâne curată și mai ușor de urmărit.
- Nu necesită migrare SQL.

## Verificare recomandată

1. Deschide Dashboard → grup documente urmărite.
2. În Documente apasă `Task-uri către responsabili`.
3. Apasă încă o dată aceeași acțiune.
4. Confirmă că a doua rulare nu creează duplicate și afișează mesajul de omitere.

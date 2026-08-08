# UPDATE 519 — Escaladare asistată documente urmărite

Versiune: `2.12.499`
Data: 2026-08-08

## Scop

Transformă gruparea documentelor urmărite după vechimea pasului curent într-o acțiune ușor de înțeles și folosit.

## Modificări

- Documente afișează un panou de escaladare asistată când lista vine dintr-un grup urmărit.
- Panoul arată:
  - numărul de documente din grup;
  - câte documente au responsabil curent;
  - câte documente merită prioritate urgentă sau importantă;
  - cea mai mare vechime în pasul curent.
- Task-urile create către responsabilii curenți includ:
  - grupul urmărit;
  - pasul curent;
  - vechimea în pas;
  - recomandarea de acțiune;
  - termen și prioritate recomandate.
- Dashboard-ul afișează vechimea în pas și în lista scurtă de documente urmărite.

## Migrare SQL

Nu necesită migrare SQL nouă.

## Testare recomandată

1. Dashboard → Documente urmărite → `După vechime pas`.
2. Deschide un grup, de exemplu `3+ zile în pas`.
3. În Documente verifică panoul `Escaladare asistată pentru grup`.
4. Apasă `Task-uri către responsabili`.
5. Verifică task-urile create: descrierea trebuie să includă vechimea pasului și recomandarea.

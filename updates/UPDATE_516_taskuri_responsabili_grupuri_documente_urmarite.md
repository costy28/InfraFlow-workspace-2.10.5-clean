# UPDATE 516 — Task-uri responsabili grupuri documente urmărite

Versiune: `2.12.496`
Data: `2026-08-06`

## Ce s-a schimbat

- În Documente, când utilizatorul vine dintr-un grup urmărit din Dashboard, apare acțiunea rapidă `Task-uri către responsabili`.
- Acțiunea creează câte un task pentru fiecare document din grup care are responsabil curent.
- Fiecare task este asignat responsabilului pasului curent, nu unui utilizator generic.
- Task-ul păstrează legătura directă către dosarul documentului.
- Prioritatea task-ului se ridică automat:
  - `urgent` pentru documente blocate sau urgente;
  - `high` pentru documente aproape de termen;
  - `normal` pentru restul.
- După creare, documentele pentru care s-au generat task-uri rămân selectate în listă.

## Impact

- Managerul poate transforma rapid un grup de blocaje în sarcini urmărite.
- Fluxul devine mai simplu: Dashboard → grup urmărit → Documente → task-uri către responsabili.
- Nu necesită migrare SQL.

## Verificare recomandată

1. Intră în Dashboard și apasă pe un grup din radarul de documente urmărite.
2. În Documente, verifică filtrul `Urmărite` + grupul activ.
3. Apasă `Task-uri către responsabili`.
4. Confirmă mesajul de succes.
5. Verifică în Task-uri că au apărut task-uri legate de documente și asignate responsabililor curenți.

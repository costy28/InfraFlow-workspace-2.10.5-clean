# UPDATE 631 — v2.12.611 — Rollback Linux doar la eșec

## Corecție critică

Workerul Linux utiliza un `trap EXIT` pentru curățare și rollback, dar condiția
de rollback nu verifica rezultatul final. Prin urmare, după un update valid,
workerul restaura din greșeală backupul și oprea serviciul.

## Rezultat

- rollbackul rulează numai dacă procesul se termină cu eroare;
- un update care trece health check-ul păstrează versiunea nouă și serviciul
  InfraFlow pornit;
- testul static verifică explicit condiția de rollback pentru a preveni
  reintroducerea problemei.

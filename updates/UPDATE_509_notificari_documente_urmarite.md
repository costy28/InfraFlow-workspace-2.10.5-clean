# UPDATE 509 — Notificări documente urmărite

Versiune: `2.12.489`
Data: `2026-08-05`

## Ce s-a schimbat

- Documentele marcate ca urmărite trimit notificări persistente către urmăritori când apar acțiuni importante în circuit:
  - lansare în circuit;
  - aprobare;
  - respingere;
  - retragere;
  - partajare.
- Actorul acțiunii este exclus din notificare, pentru a evita notificările proprii inutile.
- Notificările includ link direct către dosarul documentului.
- Evenimentele identice sunt deduplicate pe minut pentru același document, utilizator și tip de acțiune.

## Tehnic

- Notificările folosesc infrastructura existentă `db.notifications`.
- Nu necesită migrare SQL nouă.
- Compatibil cu documente stocate în app_state și cu documente citite din modul relațional MSSQL.

## Testare recomandată

1. Marchează un document ca urmărit cu un utilizator.
2. Cu alt utilizator, lansează/aprobă/respinge/retrage/partajează documentul.
3. Verifică în clopoțel că utilizatorul urmăritor primește notificarea.
4. Deschide notificarea și verifică deep-link-ul către document.

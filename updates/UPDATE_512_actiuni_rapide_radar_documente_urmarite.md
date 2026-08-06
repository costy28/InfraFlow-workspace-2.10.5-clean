# UPDATE 512 — Acțiuni rapide radar documente urmărite

Versiune: `2.12.492`  
Data: `2026-08-06`

## Scop

Radarul de documente urmărite de pe Dashboard trebuie să fie lucrabil, nu doar informativ. Utilizatorul poate transforma imediat un semnal într-un task sau poate curăța lista de urmărite fără să intre în dosarul fiecărui document.

## Implementare

- Panoul `Documente urmărite` are acțiune rapidă `Task` pe fiecare document afișat.
- Task-ul creat este asignat implicit utilizatorului curent.
- Task-ul păstrează legătura ERP:
  - `source_type=document`;
  - `source_id` din uuid/id document;
  - `source_label` cu număr și titlu document;
  - `source_url` către dosarul documentului.
- Panoul are acțiune rapidă `Nu mai urmări`, care folosește endpoint-ul existent `POST /api/documents/:uuid/watch`.
- După acțiune se reîncarcă sumarul documentelor urmărite și se afișează mesaj de confirmare pe Dashboard.

## Fișiere modificate

- `client/src/pages/DashboardPage.jsx`
- `CHANGELOG.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `AGENTS.md`
- `version.json`
- fișiere de versiune pachet / installer

## Migrare date

Nu necesită migrare SQL nouă.

## Testare recomandată

1. Deschide Dashboard cu cel puțin un document urmărit.
2. Apasă `Task` pe documentul urmărit.
3. Verifică în `Task-uri` că task-ul nou are sursa documentului.
4. Revino în Dashboard și apasă `Nu mai urmări`.
5. Verifică faptul că documentul dispare din radarul urmăritelor.

# UPDATE 534 — Acțiuni rapide pentru diagnosticul registrului intern muncă

Versiune: `2.12.514`  
Data: `2026-08-24`

## Obiectiv

Diagnosticul registrului intern de muncă trebuie să fie acționabil: operatorul HR vede lipsa și poate deschide direct zona unde o corectează.

## Implementare

- Am adăugat buton `Rezolvă` pentru fiecare angajat cu lipsuri sau atenționări în cardul `Raportări oficiale muncă`.
- Butonul deschide fișa angajatului și alege automat tabul potrivit:
  - `Contracte` pentru lipsuri sau atenționări legate de contract, dată începere, funcție, normă, salariu;
  - `Date` pentru lipsuri de CNP, nume sau alte date personale.
- Pentru date personale, fișa intră direct în mod editare.

## Efect utilizator

HR nu mai trebuie să caute manual angajatul în listă și să ghicească unde se repară problema. Diagnosticul devine un mini-flux de lucru.

## Migrare SQL

Nu necesită migrare SQL nouă.

## Fișiere modificate

- `client/src/pages/modules/HRPage.jsx`
- `client/src/pages/modules/hr/HRDashboardPanel.jsx`
- `package.json`
- `client/package.json`
- `server/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`

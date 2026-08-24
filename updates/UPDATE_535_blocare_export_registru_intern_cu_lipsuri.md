# UPDATE 535 — Blocare export registru intern cu lipsuri obligatorii

Versiune: `2.12.515`  
Data: `2026-08-24`

## Obiectiv

Exportul registrului intern de muncă nu trebuie generat accidental când diagnosticul arată lipsuri obligatorii.

## Implementare

- Butonul `Descarcă registru intern` este dezactivat când diagnosticul are blocaje.
- Textul butonului devine `Rezolvă blocajele pentru export`.
- Cardul explică explicit că exportul intern este blocat până se completează datele obligatorii.
- Atenționările rămân informative și nu blochează descărcarea.
- Funcția de descărcare are gard suplimentar în cod, în caz că este apelată din altă parte.

## Efect utilizator

HR este ghidat să rezolve lipsurile înainte de export, reducând riscul de fișiere incomplete sau confuze.

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

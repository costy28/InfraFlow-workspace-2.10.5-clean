# UPDATE 699 — Tema vizuală HR: angajați și pontaj

Versiune: 2.12.679 | Data: 2026-10-06

## Modificări

1. Antet comun Resurse Umane, aceleași acțiuni Import și Angajat nou.
2. Controale tematizate în spațiul HR și formularele existente.
3. Tabele comune pentru angajați și pontaj lunar, cu derulare locală pe mobil.
4. Coloana angajatului fixă în pontaj și contrast dark pentru concedii/absențe.

Nu modifică API, DB, permisiuni, calcule, exporturi sau documente printabile.
Nu reprezintă conversia integrală a tuturor panourilor HR avansate.

## Verificare

- Build frontend, test browser izolat cu API interceptat, audit expunere fișiere și release check.
- Testele vizuale nu creează angajați, nu modifică pontaj și nu validează luna.
- Acceptanță pe PC: deschide HR, Angajați, Angajat nou și Pontaj; verifică light/dark și derularea locală pe ecran îngust.
- Testele locale nu înlocuiesc verificarea fluxurilor reale HR în instalarea proprie.

Pachete Windows ZIP și Linux TAR.GZ. Instalarea și restartul rămân manuale.

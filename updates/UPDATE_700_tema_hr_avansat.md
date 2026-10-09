# UPDATE 700 — Tema vizuală HR avansat

Versiune: 2.12.680 | Data: 2026-10-06

## Modificări

1. Fișa angajatului: taburi comune și butoane rearanjate pe mobil.
2. Ture și program: tabel tematizat, derulare locală și coloană angajat fixă.
3. Tabele comune pentru dosare, echipamente, pontaj avansat, tichete masă, evaluări și autorizații.
4. Acțiuni concedii și echipamente rearanjate pe ecrane înguste.

Fără schimbări DB/API, calcule, validări, permisiuni, salvare, exporturi sau documente printabile.

## Verificare

- Build frontend, 19 teste HR, test browser izolat cu API interceptat, audit expunere fișiere și release check.
- Testele vizuale nu salvează angajați, concedii, ture, dotări și nu validează luna.
- Acceptanță pe PC: HR → fișă angajat, Concedii, Ture & Program, Echipamente, Documente HR și Pontaj Avansat; verifică light/dark și ecran îngust.
- Verificările locale nu înlocuiesc acceptanța fluxurilor reale HR.

Pachete Windows ZIP și Linux TAR.GZ; fără instalare sau restart pe serverele active.

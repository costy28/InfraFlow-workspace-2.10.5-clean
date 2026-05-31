# UPDATE 014 - Hotfix wizard initial

Versiune: `2.11.4`

## Probleme rezolvate

- Butonul `Verifica ANAF` ajungea la un modul protejat si primea `401`.
- Mesajul ANAF disparea imediat din cauza redirectului global pentru `401`.
- Finalizarea configurarii putea reveni la pasul 1 in loc sa pastreze eroarea.

## Modificari

- Adaugat `GET /api/setup/anaf/:cif` in routerul public modern.
- Cererile `/setup/*` nu mai declanseaza redirect automat la login pentru `401`.
- Ruta publica `POST /api/setup/complete` ramane punctul unic pentru finalizarea wizard-ului.

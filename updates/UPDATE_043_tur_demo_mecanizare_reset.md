# UPDATE 043 - Tur demo mecanizare si reset UI

## Scop

Leaga fluxul demo director -> mecanizare -> sofer -> mecanizare si adauga reset manual din interfata, pentru prezentari repetabile fara PowerShell.

## Inclus

- Checklist ghidat in Dashboard pentru scenariul demo complet.
- Buton `Reseteaza demo` disponibil pentru adminul demo/superadmin in modul demo.
- Endpoint securizat `POST /api/demo-reset`, disponibil doar in `DEMO_MODE`.
- Card `Demo mecanizare -> sofer` in Dashboard Mecanizare.
- Flux verificat automat: sef mecanizare trimite foaia, soferul o completeaza din Kiosk, mecanizarea o inchide.
- Kiosk poate completa verso si pentru foi cu status `trimisa` sau `in_lucru`.
- Smoke test extins pentru reset UI si revenirea datelor de prezentare.

## Conturi demo

- Director: `director` / `demo123`
- Sef mecanizare: `sef.mecanizare` / `demo123`
- Kiosk sofer: `sofer1` / `demo123`
- Admin demo: `demo` / `demo123`

## Note

- Demo-ul ramane pe `DB_MODE=json` si portul `4190`.
- Instanta MSSQL de dezvoltare nu este modificata.
- Resetul manual regenereaza datele demo si pastreaza configuratia de baza.

# UPDATE 261 — Raport dosar HR si confirmari Kiosk

Versiune: 2.12.241  
Data: 2026-07-11

## Scop

HR are nevoie de o vedere exportabila peste dosarele de personal, nu doar verificari in ecran. Update-ul adauga un raport Excel centralizat pentru audit intern, verificari rapide si pregatirea documentelor lipsa.

## Functionalitati

- Endpoint nou `GET /api/hr/dossier-report.xlsx`.
- Export Excel cu trei foi:
  - `Checklist dosar` — status documente obligatorii si lipsuri per angajat.
  - `Scadente` — alerte HR din motorul avansat de expirari.
  - `Confirmari Kiosk` — documente generate/vizibile in Kiosk si status confirmare angajat.
- Buton nou in `HR -> Documente HR`: `Export raport dosar HR`.
- Raportul foloseste aceleasi surse ca dosarul electronic si checklist-ul HR, fara duplicare de logica functionala.

## Verificari

- `node --check server\modules\hr\employee-file-routes.js`
- `npm run build`

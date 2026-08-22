# UPDATE 530 — Panou HR pentru raportări oficiale muncă

Versiune: `2.12.510`  
Data: `2026-08-22`

## Obiectiv

Mută informația despre raportările oficiale de muncă din zona tehnică de Setări și o face vizibilă direct în Dashboard HR, unde operatorul are nevoie de context.

## Implementare

- Am adăugat endpoint read-only `GET /hr/country-rules`, protejat cu permisiune `hr:view`.
- Dashboard HR încarcă profilul de țară prin endpointul HR, fără să depindă de drepturile de administrare Setări.
- Dashboard HR afișează un card compact `Raportări oficiale muncă` cu:
  - țara / jurisdicția activă;
  - registrul oficial al salariaților aplicabil;
  - statusul transmiterii;
  - mesaj de atenționare când exportul este doar fișier intern de lucru.
- Pentru România apare `REGES-Online` ca adaptor local.
- Pentru celelalte țări rămâne profil generic, pregătit pentru adaptoare locale viitoare.

## Observații produs

- REGES nu devine regulă globală a aplicației.
- Transmiterea oficială REGES-Online rămâne un pas separat, cu autentificare, recipisă și audit.
- Nu necesită migrare SQL nouă.

## Fișiere modificate

- `server/modules/hr/routes.js`
- `client/src/pages/modules/HRPage.jsx`
- `client/src/pages/modules/hr/HRDashboardPanel.jsx`
- `package.json`
- `client/package.json`
- `server/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`

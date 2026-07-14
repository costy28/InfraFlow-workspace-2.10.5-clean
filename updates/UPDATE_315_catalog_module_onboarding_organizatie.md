# UPDATE 315 — Catalog module active și onboarding organizație

Versiune: `2.12.295`  
Data: `2026-07-14`

## Scop

Primul pas practic după productizarea comercială: transformarea tabului `Setări > Module` într-un centru de configurare intuitiv pentru organizație, cu pachete comerciale și checklist de pornire.

## Modificări

- Adăugat endpoint read-only:
  - `GET /settings/modules/catalog`
  - returnează grupuri de module, pachete comerciale, module permise de licență și module active.
- Extins `Setări > Module`:
  - progres onboarding organizație;
  - checklist: date organizație, module, licență/trial, utilizatori, departamente, HR, SMTP, AI;
  - următorul pas recomandat cu buton direct spre tabul relevant;
  - pachete comerciale aplicabile local;
  - sumar module active, module de bază, pachete definite și ultima salvare.
- Adăugat check în `scripts/smoke-modules-readonly.js` pentru endpointul nou.

## Compatibilitate

- Nu au fost schimbate endpointuri existente.
- Nu au fost schimbate tabele sau migrări DB.
- Nu au fost adăugate dependențe.
- Dezactivarea modulelor rămâne comportamentul existent: ascundere în UI/sidebar, fără blocare agresivă de rută.

## Verificare

- `node --check server/modules/system/settings-routes.js` — OK.
- `npm --prefix client run build` — OK.
- `npm run audit:local` — OK.

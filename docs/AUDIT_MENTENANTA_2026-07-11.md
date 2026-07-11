# Audit mentenanță InfraFlow — 2026-07-11

Versiune analizată: `2.12.250`  
Următorul pas de stabilizare: `2.12.251`

## Rezultat verificări

- Backend JS syntax check: OK.
- Teste HR: OK.
- Teste Contabilitate: OK.
- Release acceptance în `DB_MODE=json`: OK.
- Backup roundtrip: OK.
- Build frontend: OK.
- Smoke API local cu superadmin, doar citire: OK pentru HR, dosar HR, salarizare, contabilitate, CPV, PAAP, referate și GPS live.

## Observații importante

1. Aplicația este funcțională și buildabilă.
2. Datoria tehnică principală este concentrarea logicii în fișiere foarte mari.
3. Lint-ul frontend nu este încă poartă de release; există erori istorice de hooks, variabile nefolosite și reguli de mediu.
4. `npm audit` semnalează dependențe cu risc:
   - `xlsx` fără fix disponibil în audit;
   - `nodemailer` și `form-data` cu fix disponibil prin actualizare controlată.
5. Pentru producție, `APP_KEY` trebuie setat explicit în mediu; cheia implicită trebuie tratată doar ca fallback de dezvoltare.

## Fișiere candidate pentru split

| Zonă | Fișier | Prioritate |
| --- | --- | --- |
| Sistem | `server/modules/system/routes.js` | P0 |
| Fleet | `server/modules/fleet/routes.js` | P0 |
| Achiziții | `server/modules/procurement/routes.js` | P0 |
| Gestiune | `server/modules/inventory/routes.js` | P1 |
| Tehnic | `server/modules/technical/routes.js` | P1 |
| Producție | `server/modules/production/routes.js` | P1 |
| Workflow | `server/modules/workflow/routes.js` | P1 |
| HR frontend | `client/src/pages/modules/HRPage.jsx` | P0 |

## Plan recomandat

### UPDATE 271 — Adevăr proiect + audit local

- sincronizare versiuni și documentație;
- script unic `npm run audit:local`;
- mod advisory pentru lint și audit securitate;
- documentarea datoriei tehnice.

### UPDATE 272 — Split backend sistem

- `system/users-routes.js`;
- `system/settings-routes.js`;
- `system/backup-routes.js`;
- `system/update-routes.js`;
- `system/license-routes.js`;
- comportament HTTP identic.

### UPDATE 273 — Split HR frontend

- extragere taburi HR în componente mici;
- hooks pentru date HR;
- păstrare UX identic.

### UPDATE 274 — Documente Word-first

- Word template ca format principal;
- HTML doar compatibilitate/preview;
- preview controlat și validare variabile.

### UPDATE 275 — Smoke suite module

- login local read-only;
- verificare endpointuri critice pe module;
- raport clar pentru release.

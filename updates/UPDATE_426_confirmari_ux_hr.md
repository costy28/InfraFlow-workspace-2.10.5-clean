# UPDATE 426 — Confirmări UX HR

Versiune: `2.12.406`  
Data: 29 Iulie 2026

## Scop

Continuă curățarea P0 UX din auditul complet: acțiunile critice din HR nu mai folosesc dialoguri native de browser (`window.prompt`, `window.confirm`, `window.alert`) în zonele principale de pontaj, concedii, evaluări și dosar angajat.

## Modificări

- HR folosește `ConfirmDialog` pentru:
  - anularea fluxului HR al angajatului;
  - respingerea cererilor de ore suplimentare;
  - dezactivarea turelor;
  - ștergerea evaluărilor;
  - devalidarea pontajului lunar;
  - completarea automată a tuturor departamentelor;
  - blocarea/deblocarea pontajului lunar;
  - respingerea certificatelor medicale.
- Mesajele de succes care erau afișate prin `window.alert` sunt afișate acum ca notificări verzi în pagina HR.
- Dosarul electronic al angajatului folosește `ConfirmDialog` pentru anularea documentelor, cu motiv obligatoriu.

## Compatibilitate

- Nu s-au schimbat rutele API sau payload-urile existente.
- Motivele auditate rămân trimise către aceleași endpoint-uri.
- Comportamentul operațional este păstrat; schimbarea este de UX și claritate.

## Verificări

- `rg "window\\.(prompt|confirm|alert)" client/src/pages/modules/HRPage.jsx client/src/pages/modules/hr/HREmployeeFilesTab.jsx` — fără rezultate.
- `npm run build`
- `npm run release:check`

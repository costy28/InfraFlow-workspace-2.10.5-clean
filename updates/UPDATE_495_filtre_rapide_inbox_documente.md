# UPDATE 495 — Filtre rapide în Inbox Documente

Versiune: `2.12.475`  
Data: `2026-08-04`

## Scop

După radarul compact din Dashboard, aceeași logică trebuie să fie disponibilă și în pagina Documente, ca utilizatorul să poată vedea imediat documentele care cer lucru.

## Implementare

- Am adăugat filtre rapide peste tab-urile existente:
  - Toate
  - Cer acțiune
  - Blocate
  - Scadente
  - Urgente
  - Drafturi
  - Din email
- Filtrele folosesc lista deja încărcată în pagină și nu schimbă API-ul.
- Documentele blocate sunt detectate local ca documente în circuit fără actualizare de peste 48h.
- Lista desktop afișează status, termen și prioritate.
- Lista mobilă afișează status, termen și badge de blocaj.
- Deep-link-ul `?document=...` resetează filtrul rapid înainte de deschiderea dosarului, ca documentul cerut să nu rămână ascuns.

## Fișiere principale

- `client/src/pages/modules/DocumentePage.jsx`
- `CHANGELOG.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `AGENTS.md`
- `version.json`

## Verificare

- `npm run build`
- `npm run release:check`
- ZIP update generat cu versiunea `2.12.475`

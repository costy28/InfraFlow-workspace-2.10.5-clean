# UPDATE 557 — Download controlat atașamente Tichete (v2.12.537)

Data: 2026-09-07

## Scop

Închide încă un rest din auditul de securitate fișiere: atașamentele din Tichete nu mai expun către client calea internă din `storage/tickets`.

## Modificări

- Detaliile ticketului serializează atașamentele cu metadate sigure: nume, mărime, id, indicator `has_attachment` și `download_url`.
- `fisier_path` nu mai este trimis ca valoare reală către frontend.
- Download-ul principal se face prin `GET /api/tickets/:uuid/attachments/:attachmentId/download`.
- Endpoint-ul legacy pe nume fișier rămâne compatibil, dar folosește aceeași verificare de root storage.
- Endpoint-ul legacy `/tickets/:uuid/attach` respinge atașarea prin cale locală transmisă în payload.
- Frontend-ul Tichete folosește `download_url`/id atașament și tratează erorile de descărcare prietenos.

## Verificări

- `node --check server/modules/tickets/routes.js`
- `npm run audit:file-exposure`

## Rezultat audit fișiere

Auditul advisory scade de la 4 la 3 finding-uri medium. Tichete nu mai apare în listă.

## Migrare DB

Nu necesită migrare SQL.

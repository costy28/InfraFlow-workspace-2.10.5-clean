# UPDATE 352 — Timeline dosar contract

Versiune: `2.12.332`  
Data: `2026-07-19`

## Ce s-a schimbat

- Dosarul contractului primește un timeline cronologic unic în cockpit.
- Timeline-ul agregă evenimente din contract, alerte, documente sursă, consumuri, acte adiționale, atașamente, task-uri și tichete.
- Evenimentele includ tip, status, dată, actor, sumă și fișier descărcabil unde există atașament.
- UI-ul afișează cardul „Timeline dosar contract” imediat după cockpit.

## Compatibilitate

- Nu necesită migrare DB; timeline-ul este calculat din datele existente.
- Nu modifică fluxurile de creare/validare pentru contracte, consumuri, acte adiționale sau atașamente.
- Endpointul existent `GET /api/contracts/:id` păstrează structura anterioară și adaugă `cockpit.timeline`.

## Verificări

- `node --check server/modules/contracts/routes.js`
- `npm --prefix client run build`

# UPDATE 585 — Hotfix rute wildcard CRM

Versiune: `v2.12.565`  
Data: `2026-09-27`

## Problemă rezolvată

Pagina CRM este montată prin rute wildcard (`/crm/*` și `/crm/oferte/*`).
React Router păstrează segmentul rămas în parametrul `*`, nu într-un parametru
numit automat `id`. Fișa unui lead ajungea astfel să solicite
`/api/crm/leads/undefined`, deși lead-ul exista în listă.

## Ce se schimbă

- Lead-ul preia corect identificatorul din `/crm/leads/:id` și se deschide din listă.
- Oferta existentă preia corect ID-ul din `/crm/oferte/:id`.
- Opțiunea `/crm/oferte/noua` este tratată ca ofertă nouă, nu ca ID de ofertă.
- Test automat de regresie pentru extragerea parametrilor din rutele wildcard.

## Fără schimbări de scope

Nu modifică modelul comercial CRM și nu începe Sprintul 4.

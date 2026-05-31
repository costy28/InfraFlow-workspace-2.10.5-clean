# UPDATE 006 - Modul Referate

Versiune: `2.10.6`

## Functionalitati

- Referate de aprovizionare si servicii cu numar automat separat pe an.
- Flux de avizare: draft, inregistrare, Achizitii, Gestionar, CFP, Contabil Sef,
  Director Adjunct, Secretariat II, Director General, Secretariat final,
  Achizitii final si aprobare.
- Comanda de aprovizionare generata automat dupa aprobarea Directorului General.
- Receptie factura cu alerta urgenta si pas suplimentar de reaprobare daca diferenta
  fata de valoarea referatului depaseste 5%.
- Stoc magazie preluat automat din miscari, cu fallback compatibil pentru datele
  istorice JSON.
- Formular HTML tiparibil pentru dosarul fizic, cu cele 7 coloane de semnatura.

## API

- `GET /api/referate`
- `POST /api/referate`
- `GET /api/referate/stats`
- `GET /api/referate/:id`
- `POST /api/referate/:id/inainteaza`
- `POST /api/referate/:id/receptie`
- `GET /api/referate/:id/pdf`

## Baza de date

- Migrare noua: `db/migrations/012_referate.sql`
- Tabele: `procurement.suppliers`, `procurement.referate`,
  `procurement.referate_items`, `procurement.referate_flux`,
  `procurement.referate_counter`.

## Frontend

- Pagina noua `/referate` cu filtre, statistici, modal de creare, autocomplete
  materiale, timeline vertical, receptie si tiparire.

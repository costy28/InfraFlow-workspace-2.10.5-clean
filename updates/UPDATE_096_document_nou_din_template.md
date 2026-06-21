# UPDATE 096 - Document nou din template

Versiune: 2.12.76
Data: 2026-06-21

## Ce s-a schimbat

- Pagina Documente are flux de creare document din template activ.
- Utilizatorul poate completa date/variabile in format JSON si poate genera preview inainte de salvare.
- Documentul poate ramane draft sau poate fi lansat direct in circuit.
- A fost adaugat endpoint-ul `GET /api/documents/template-catalog`, vizibil pentru utilizatorii cu `documents:create`.
- Preview-ul template-urilor poate fi folosit si de creatorii de documente, nu doar de administratorii de template-uri.

## Verificare

- `node --check server/modules/documents/routes.js`
- `npm run build` in client.
- `npm run check` in server.

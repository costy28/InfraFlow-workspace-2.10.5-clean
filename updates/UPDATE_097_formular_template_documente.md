# UPDATE 097 - Formular automat din template

Versiune: 2.12.77
Data: 2026-06-21

## Ce s-a schimbat

- Catalogul de template-uri returneaza variabilele identificate in continutul HTML al modelului.
- Modalul `Document nou` genereaza automat campuri de formular pentru variabilele template-ului.
- Datele introduse in campurile rapide sunt folosite la preview si la salvarea documentului.
- Zona JSON ramane disponibila ca mod avansat, pentru date speciale sau structuri complexe.

## Verificare

- `node --check server/modules/documents/routes.js`
- `npm run build` in client.
- `npm run check` in server.

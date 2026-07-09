# UPDATE 248 — Arhivare automata documente HR generate

Versiune: **2.12.228**  
Data: **2026-07-09**

## Functionalitati

- Contractele generate din fișa angajatului se salvează automat în dosarul electronic.
- Actele adiționale generate din istoricul contractului se salvează automat în dosarul electronic.
- Documentele sunt păstrate ca HTML printabil, fără dependențe noi.
- În dosar, documentele generate sunt marcate cu `generat electronic`.
- Endpoint nou:
  - `POST /api/hr/employees/:id/files/generated`

## Operare

La apăsarea butonului **Generează** sau **Generează act**, documentul se deschide pentru print/PDF și este arhivat automat în dosarul angajatului.

## Verificare

- `node --check server/modules/hr/employee-file-routes.js`
- `npm --prefix client run build -- --mode development`

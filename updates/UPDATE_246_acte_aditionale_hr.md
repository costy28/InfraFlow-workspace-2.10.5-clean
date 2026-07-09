# UPDATE 246 — Acte aditionale HR

Versiune: **2.12.226**  
Data: **2026-07-09**

## Functionalitati

- Actele aditionale sunt legate de contractul salarial operational.
- Tipuri suportate:
  - modificare salariu;
  - modificare functie;
  - modificare norma;
  - schimbare departament;
  - suspendare;
  - incetare;
  - alt act.
- La salvare, actul se adauga in istoric si se aplica automat:
  - salariul si norma modifica `hr.contracts`;
  - functia/COR/departamentul modifica fisa angajatului;
  - suspendarea marcheaza contractul `suspendat`;
  - incetarea marcheaza contractul `incetat` si angajatul inactiv.
- Fișa angajatului afiseaza istoricul actelor sub contractul aferent.

## Schema

- Migrare noua: `db/migrations/061_hr_contract_amendments.sql`
- Tabel nou: `hr.contract_amendments`

## Operare

După aplicarea unui act care influențează salariul/norma/statusul, statul salarial se regenerează pentru luna afectată.

## Verificare

- `node --check server/modules/hr/routes.js`
- `npm --prefix client run build -- --mode development`

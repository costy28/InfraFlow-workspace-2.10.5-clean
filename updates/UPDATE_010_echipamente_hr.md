# UPDATE 010 - Echipamente protectie HR

Versiune: `2.10.10`

## Modul HR Echipamente

- Evidenta marimilor per angajat pentru salopeta, bocanci, cizme cauciuc,
  jacheta, pantalon si vesta reflectorizanta.
- Istoric dotari cu data predarii, cantitate, stare si expirare calculata
  automat dupa durata tipului de echipament.
- Raport de necesar agregat pe departament, echipament si marime.
- Lista expirari pentru intervalele de 30, 60 si 90 zile.
- Comanda furnizor grupata pe cod articol, culoare, marime si CPV.
- Creare automata Referat Aprovizionare draft din necesarul HR.

## Frontend

- Tab nou `Echipamente` in HR cu vederile `Necesar per Departament`,
  `Expirari` si `Comanda Furnizor`.
- Sectiune `Echipamente protectie` in fisa angajatului.
- Dropdown-uri de marimi si modal pentru inregistrarea unei dotari noi.

## API

- `GET /api/hr/echipamente/angajat/:id`
- `PUT /api/hr/echipamente/angajat/:id/marimi`
- `GET /api/hr/echipamente/raport-necesar`
- `GET /api/hr/echipamente/expirari`
- `POST /api/hr/echipamente/dotare`
- `GET /api/hr/echipamente/comanda-excel`
- `POST /api/hr/echipamente/creeaza-referat`

## Baza de date

- Migrare noua: `db/migrations/014_echipamente.sql`.
- Tabele: `hr.echipamente_tipuri`, `hr.echipamente_marimi`,
  `hr.echipamente_departament`, `hr.angajat_echipamente`,
  `hr.echipamente_dotari`.


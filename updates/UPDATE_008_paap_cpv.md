# UPDATE 008 - PAAP complet + CPV

Versiune: `2.10.8`

## Catalog CPV

- Seed cu `9.454` coduri CPV in romana si engleza, extras din lista oficiala.
- Import idempotent pentru JSON si MSSQL: `node scripts/import-cpv.js`.
- Cautare live dupa cod sau denumire, maximum 20 rezultate.
- Adaugare manuala si editare denumiri cu validare format si unicitate.
- Componenta frontend reutilizabila `CPVSelector` integrata in Referate,
  Comenzi si Materiale.

## PAAP

- CRUD complet pentru pozitiile Planului Anual al Achizitiilor Publice.
- Anulare logica permisa numai pentru pozitii fara executie.
- Generare automata din comenzile anului anterior cu inflatie `+5%`.
- Procedura sugerata automat dupa pragurile valorice.
- Valoare ramasa, procent executat, totaluri si bara de progres colorata.
- Notificari la executie peste `90%` si alerte urgente peste `100%`.
- Export Excel populat peste sablonul Publiserv cu 14 coloane.

## API

- `GET /api/cpv/search?q=TERMEN&lang=ro`
- `GET /api/cpv/:cod`
- `POST /api/cpv`
- `PUT /api/cpv/:cod`
- `GET /api/paap?an=2026`
- `POST /api/paap`
- `POST /api/paap/genereaza-din-istoric`
- `PUT /api/paap/:id`
- `DELETE /api/paap/:id`
- `GET /api/paap/raport?an=2026`

## Baza de date

- Migrare noua: `db/migrations/013_cpv.sql`
- Tabele: `nomenclator.cpv_codes`, `procurement.paap`,
  `procurement.paap_executie`.
- Coloana `cpv_cod` adaugata conditionat pe materiale, comenzi si linii de
  referat.

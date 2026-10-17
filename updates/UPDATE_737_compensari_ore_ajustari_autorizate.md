# UPDATE 737 — Compensări ore și ajustări autorizate

Versiune: **2.12.717**  
Data: **17 octombrie 2026**

Ruta `/hr/overtime-bank/compensate` acceptă exclusiv `timp_liber` și `plata`, cu ore finite și strict pozitive. Soldul inițial și avansul necesită ruta de ajustare existentă, care verifică dreptul de aprobare și accesul la angajat.

Valorile invalide returnează 422 înainte de scriere, cu `HR_COMPENSATION_TYPE_INVALID` sau `HR_COMPENSATION_HOURS_INVALID`. Compensările valide și istoricul existent sunt păstrate. Nu este necesară migrare SQL.

Testele acoperă încercarea de ajustare prin compensare, ore negative/nule/nefinite fără acces SQL și succesul pentru timp liber/plată.

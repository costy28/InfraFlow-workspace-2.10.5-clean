# UPDATE 187 - Salarizare rectificativa si cazuri speciale

Versiune: 2.12.166 -> 2.12.167

- Stat rectificativ separat, legat de statul validat original.
- Blocaje explicite daca plata sau nota contabila nu au fost stornate.
- Evidenta concediului fara plata si detalii suplimentare pentru certificate medicale.
- Sumele medicale raman confirmate de operator; aplicatia nu inventeaza reguli fiscale.
- Migrare: `db/migrations/044_hr_payroll_corrective.sql`.

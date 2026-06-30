# UPDATE 188 - Dosar complet de inchidere lunara

Versiune: 2.12.167 -> 2.12.168

- Arhiva ZIP lunara cu manifest, snapshot, istoric si fisiere fiscale disponibile.
- Coperta A4 tiparibila sau salvabila PDF din browser.
- Generarea dosarului final este permisa numai dupa inchiderea lunii.
- Fiecare dosar primeste SHA-256 si eveniment distinct in audit.
- Redeschiderea ramane controlata prin rol, motiv si istoricul snapshot-ului.
- Migrare: `db/migrations/045_accounting_period_dossiers.sql`.

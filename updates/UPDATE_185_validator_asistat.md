# UPDATE 185 - Configurare asistata validatoare ANAF

Versiune: 2.12.164 -> 2.12.165

- Detectie controlata pentru Java si validatoare locale candidate.
- Test separat al comenzii configurate, fara procesarea unei declaratii.
- Configuratia ramane independenta pentru D112, D300 si D394.
- Detectia nu declara automat un validator sau o schema drept oficiala.
- Migrare: `db/migrations/042_accounting_validator_discovery.sql`.

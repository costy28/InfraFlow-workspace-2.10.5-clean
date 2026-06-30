# UPDATE 183 - D112 validator si mapare

Versiune: 2.12.162 -> 2.12.163

- Configurator separat pentru calea, comanda, argumentele si versiunea validatorului D112.
- Raport de mapare pe angajat: CNP, nume, data angajarii, venituri, contributii si concedii medicale.
- Erorile sunt afisate per angajat si pot fi exportate in Excel.
- XML-ul verificat este arhivat cu SHA-256; acceptarea este preluata numai din rezultatul validatorului configurat.
- Referinta oficiala: formular D112 valabil din 01/2026, Ordin comun 2066/248/1377/3103, pagina ANAF actualizata la 25.05.2026.
- Migrare: `db/migrations/040_accounting_official_validators.sql`.

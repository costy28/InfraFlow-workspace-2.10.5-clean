# UPDATE 218 - Persistenta fiscala MSSQL

- Migrarea 054 creeaza tabelele `dbo.accounting_withholding_tax_entries` si `dbo.accounting_intrastat_entries`.
- Sincronizarea relationala copiaza explicit cele doua registre din app_state in tabelele MSSQL.
- DB_MODE=json ramane functional prin colectiile din app_state.
- Schema foloseste SQL Server 2008 compatibil si anulare logica.

# UPDATE 083 - Stabilizare migrari SQL relationale

Versiune: 2.12.62 -> 2.12.63
Data: 2026-06-18

## Schimbari
- Aliniere migrari istorice la schema `core.*` reala, unde `core.users.id`, `core.departments.id` si `work.projects.id` sunt `uniqueidentifier`.
- Creare defensiva `fleet.assets` in fluxul relational curat, inainte de modulele care au chei externe spre flota.
- Corectii pentru batch-uri SQL care adauga coloane si apoi le folosesc in acelasi fisier (`GO`/guard-uri idempotente).
- Adaptare migrari vechi care foloseau `dbo.fleet_assets` sau coloane legacy precum `assetCode`.

## Verificare
- `applyMssqlMigrations()` ruleaza fara erori pe SQL Server Express local.
- `prepareMssqlRelationalSchema()` raporteaza `migrationWarning` gol.
- Schema SQL relationala raporteaza 169 tabele si fara tabele core lipsa.
- Tabelele de sync contabil sunt disponibile si fara lipsuri.

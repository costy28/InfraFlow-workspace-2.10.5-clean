const fs = require("fs");
const path = require("path");

function splitSqlBatches(sql) {
  return String(sql || "")
    .split(/^\s*GO\s*$/gim)
    .map((batch) => batch.trim())
    .filter(Boolean);
}

function runTrackedMigrations({ migrationsDir, runScalar }) {
  if (!fs.existsSync(migrationsDir)) return [];
  ensureMigrationTable(runScalar);

  const applied = [];
  fs.readdirSync(migrationsDir)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right))
    .forEach((name) => {
      const escapedName = name.replace(/'/g, "''");
      const exists = Number(runScalar(`
        if exists (select 1 from dbo.schema_migrations where filename = N'${escapedName}')
          select 1;
        else
          select 0;
      `));
      if (exists) return;

      const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
      splitSqlBatches(sql).forEach((batch) => runScalar(`${batch}\nselect 1;`, { timeoutMs: 300000 }));
      runScalar(`
        insert into dbo.schema_migrations (filename) values (N'${escapedName}');
        select 1;
      `);
      applied.push(name);
    });
  return applied;
}

function ensureMigrationTable(runScalar) {
  runScalar(`
    if object_id(N'dbo.schema_migrations', N'U') is null
    begin
      create table dbo.schema_migrations (
        id int identity(1,1) not null constraint pk_schema_migrations primary key,
        filename nvarchar(255) not null constraint uq_schema_migrations_filename unique,
        applied_at datetime2 not null constraint df_schema_migrations_applied_at default sysdatetime()
      );
    end;
    select 1;
  `);
}

/*
  Migrarile relationale istorice raman disponibile pentru instalari care le-au
  folosit deja. Instalarea MSSQL standard foloseste dbo.app_state pana cand
  generatiile vechi INT/text/UUID sunt uniformizate.
*/

module.exports = { splitSqlBatches, ensureMigrationTable, runTrackedMigrations };

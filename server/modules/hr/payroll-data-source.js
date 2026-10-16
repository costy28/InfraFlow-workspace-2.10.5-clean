const { DB_MODE, MSSQL_RELATIONAL_MODE, runMssqlScalar } = require("../../core/db");

function hydratePayrollInputs(hr) {
  if (!MSSQL_RELATIONAL_MODE || !["mssql", "sqlserver"].includes(DB_MODE)) return hr;
  hr.employees = readRows(`
    DECLARE @departmentColumn sysname = CASE
      WHEN COL_LENGTH(N'core.departments', N'name') IS NOT NULL THEN N'name'
      WHEN COL_LENGTH(N'core.departments', N'denumire') IS NOT NULL THEN N'denumire'
      ELSE NULL
    END;
    DECLARE @sql nvarchar(max) = CASE WHEN @departmentColumn IS NULL
      THEN N'SELECT e.*, CAST(NULL AS nvarchar(180)) AS department_name FROM hr.employees e WHERE e.activ=1 FOR JSON PATH;'
      ELSE N'SELECT e.*, d.' + QUOTENAME(@departmentColumn) + N' AS department_name FROM hr.employees e LEFT JOIN core.departments d ON d.id=e.department_id WHERE e.activ=1 FOR JSON PATH;'
    END;
    EXEC sp_executesql @sql;
  `);
  hr.contracts = readRows(`SELECT * FROM hr.contracts WHERE ISNULL(status,N'activ')<>N'incetat' FOR JSON PATH;`);
  hr.timeSheets = readRows(`SELECT * FROM hr.time_sheets FOR JSON PATH;`);
  return hr;
}

function readRows(sql) {
  const value = String(runMssqlScalar(sql, { timeoutMs: 30000 }) || "").trim();
  return value ? JSON.parse(value) : [];
}

module.exports = { hydratePayrollInputs };

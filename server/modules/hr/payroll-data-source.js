const { DB_MODE, MSSQL_RELATIONAL_MODE, runMssqlScalar } = require("../../core/db");

function hydratePayrollInputs(hr) {
  if (!MSSQL_RELATIONAL_MODE || !["mssql", "sqlserver"].includes(DB_MODE) || hr.__relationalPayrollInputs) return hr;
  hr.employees = readRows(`SELECT e.*, d.denumire AS department_name FROM hr.employees e LEFT JOIN core.departments d ON d.id=e.department_id WHERE e.activ=1 FOR JSON PATH;`);
  hr.contracts = readRows(`SELECT * FROM hr.contracts WHERE status<>N'incetat' FOR JSON PATH;`);
  hr.timeSheets = readRows(`SELECT * FROM hr.time_sheets FOR JSON PATH;`);
  Object.defineProperty(hr, "__relationalPayrollInputs", { value: true, enumerable: false, configurable: true });
  return hr;
}

function readRows(sql) {
  const value = String(runMssqlScalar(sql, { timeoutMs: 30000 }) || "").trim();
  return value ? JSON.parse(value) : [];
}

module.exports = { hydratePayrollInputs };

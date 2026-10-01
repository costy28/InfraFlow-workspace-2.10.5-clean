#!/usr/bin/env node
/*
 * Executor MSSQL portabil pentru rutele istorice sincrone InfraFlow.
 * Este lansat numai ca proces copil de server/core/db.js pe Linux. Nu accepta
 * argumente din linia de comandă; interogarea și conexiunea vin codate din
 * mediul procesului părinte, ca în executorul PowerShell existent.
 */
const fs = require("fs");
const sql = require("mssql");

function decode(name) {
  const value = String(process.env[name] || "");
  if (!value) throw new Error(`Lipsește configurația ${name}.`);
  return Buffer.from(value, "base64").toString("utf8");
}

async function main() {
  const connectionString = decode("ASFALT_MSSQL_CONNECTION_B64");
  const statement = decode("ASFALT_MSSQL_SQL_B64");
  const jsonFile = String(process.env.ASFALT_MSSQL_JSON_FILE || "");
  const timeoutSeconds = Math.max(1, Number(process.env.ASFALT_MSSQL_COMMAND_TIMEOUT_SECONDS || 60));
  const jsonInput = jsonFile ? fs.readFileSync(jsonFile, "utf8") : null;
  const pool = new sql.ConnectionPool(connectionString);

  try {
    await pool.connect();
    const request = pool.request();
    request.timeout = timeoutSeconds * 1000;
    if (jsonInput !== null) request.input("json", sql.NVarChar(sql.MAX), jsonInput);
    const result = await request.query(`
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
${statement}
`);
    const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [result.recordset || []];
    const rows = recordsets.find((recordset) => Array.isArray(recordset) && recordset.some((row) => row && Object.values(row).some((value) => value !== null && value !== undefined)));
    if (!rows) return;
    const output = rows.map((row) => {
      const value = Object.values(row).find((candidate) => candidate !== null && candidate !== undefined);
      return value === undefined ? "" : String(value);
    }).join("");
    process.stdout.write(output);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});

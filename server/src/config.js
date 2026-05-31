const path = require("node:path");
const pkg = require("../package.json");

const rootDir = path.resolve(__dirname, "..", "..");

const config = {
  appName: "InfraFlow",
  version: pkg.version,
  port: Number(process.env.INFRAFLOW_PORT || process.env.PORT || 4180),
  rootDir,
  db: {
    provider: process.env.INFRAFLOW_DB_PROVIDER || "mssql",
    connectionString: process.env.INFRAFLOW_DB_CONNECTION || ""
  }
};

module.exports = { config };

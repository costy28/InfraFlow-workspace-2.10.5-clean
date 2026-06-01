const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "app-db.json");

process.env.DB_MODE = "mssql";
process.env.INFRAFLOW_DB_PROVIDER = "mssql";
process.env.DB_SERVER ||= ".\\SQLEXPRESS";
process.env.DB_DATABASE ||= "INFRAFLOW";

const { ensureDatabase, readDb, writeDb } = require("../server/core/db");

function backupTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function importJsonToMssql() {
  if (!fs.existsSync(DB_FILE)) throw new Error(`Fisier JSON lipsa: ${DB_FILE}`);
  const source = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  ensureDatabase();
  const existing = readDb();
  const emptyInstall = !existing.users?.length && !existing.departments?.length && !existing.materials?.length;
  if (!emptyInstall) {
    console.log("Migrare sarita: INFRAFLOW contine deja date.");
    return;
  }

  writeDb(source);
  const backupDir = path.join(ROOT, `data_backup_${backupTimestamp()}`);
  fs.renameSync(DATA_DIR, backupDir);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "MIGRAT_IN_MSSQL.txt"), `Migrare finalizata: ${new Date().toISOString()}\nBackup JSON: ${backupDir}\n`, "utf8");
  console.log(`Migrare finalizata. Backup JSON: ${backupDir}`);
}

try {
  importJsonToMssql();
} catch (error) {
  console.error(`Migrare esuata: ${error.message}`);
  process.exitCode = 1;
}

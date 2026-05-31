const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");
const os = require("os");
const sql = require("mssql");

const ROOT = path.resolve(__dirname, "..", "..");
loadPreferredDatabaseEnv(ROOT);
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "app-db.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");
const DB_MODE = String(process.env.INFRAFLOW_DB_PROVIDER || process.env.DB_MODE || "json").trim().toLowerCase();

// Structura minimală folosită la prima instalare când seed.json nu există
const DEFAULT_DB = {
  users: [],
  devices: [],
  workstationRequests: [],
  // Module nested (folosite de noile rute)
  core: {
    users: [],
    departments: [],
    settings: { company_name: "", modules_enabled: [], customRoles: [] }
  },
  hr: {
    employees: [], timesheets: [], leaveRequests: [],
    authorizations: [], tures: [], schedules: []
  },
  fleet: { assets: [], tripLogs: [], fcEntries: [] },
  mechanization: { workOrders: [], fuelings: [], repairs: [], revisions: [] },
  gestiune: { materials: [], suppliers: [], nir: [], bonConsum: [], stockMovements: [] },
  inventory: {
    materials: [], movements: [], stockOperations: [],
    departmentStocks: [], departmentConsumptions: [],
    department_stocks: [], stock_transfers: [], department_consumptions: []
  },
  production: { recipes: [], batches: [] },
  controlling: { costCenters: [] },
  messaging: { channels: [], messages: [] },
  // Câmpuri flat necesare pentru normalizeDb() și compatibilitate backwards
  materials: [],
  departments: [],
  departmentRequests: [],
  departmentStocks: [],
  departmentConsumptions: [],
  procurementOrders: [],
  procurementReceipts: [],
  referate: [],
  referateFlux: [],
  referateCounters: [],
  cpvCodes: [],
  paap: [],
  paapExecutie: [],
  fleetAssets: [],
  fleetRequests: [],
  fleetMeterReadings: [],
  costCenters: [],
  technicalWorkLogs: [],
  technicalClients: [],
  asphaltSales: [],
  nexusExpenses: [],
  projects: [],
  departmentConnections: [],
  workflowTemplates: [],
  workflowRequests: [],
  workflowAudit: [],
  audit: [],
  stockMovements: [],
  consumptions: [],
  deliveries: [],
  recipes: [],
  settings: {
    company_name: "",
    setupCompleted: false,
    initialStockCompleted: false,
    modules_enabled: [],
    customRoles: [],
    ai_enabled: 0
  }
};
const POSTGRES_APP_STATE_TABLE = "app_state";
const MSSQL_APP_STATE_TABLE = "app_state";
const DEFAULT_MSSQL_CONNECTION_STRING = "Server=.\\SQLEXPRESS;Database=InfraFlow;Integrated Security=True;TrustServerCertificate=True;Connection Timeout=15";
const MSSQL_RELATIONAL_MODE = ["1", "true", "yes", "da"].includes(String(process.env.INFRAFLOW_SQL_RELATIONAL || process.env.MSSQL_RELATIONAL || "1").trim().toLowerCase());
const defaultWorkflowTemplates = [
  { id: "wft-material", type: "material", name: "Solicitare materiale", moduleKey: "gestiune" },
  { id: "wft-asphalt", type: "asphalt", name: "Solicitare asfalt", moduleKey: "production" },
  { id: "wft-fleet", type: "fleet", name: "Solicitare utilaj/autovehicul", moduleKey: "mecanizare" },
  { id: "wft-procurement", type: "procurement", name: "Aprovizionare", moduleKey: "achizitii" },
  { id: "wft-work-situation", type: "work_situation", name: "Situatie de lucrari", moduleKey: "tehnic" },
  { id: "wft-personnel", type: "personnel", name: "Solicitare personal", moduleKey: "ru" },
  { id: "wft-nonconformity", type: "nonconformity", name: "Raport neconformitate", moduleKey: "tehnic" }
];
const defaultDepartmentConnections = [
  ["tehnic", "production", "Situatii lucrari si productie asfalt"], 
  ["tehnic", "asternere", "Lucrari, ore utilaje si productie pusa in opera"],
  ["tehnic", "canalizare", "Lucrari canalizare si materiale"],      
  ["tehnic", "betoane", "Lucrari betoane si productie"],
  ["tehnic", "contabilitate", "Centre de cost si rapoarte lucrari"],
  ["mecanizare", "production", "Alocari utilaje pentru productie"], 
  ["mecanizare", "asternere", "Alocari utilaje catre asternere"],   
  ["mecanizare", "betoane", "Alocari utilaje catre betoane"],       
  ["gestiune", "production", "Materiale si transferuri catre productie"],
  ["gestiune", "betoane", "Materiale si transferuri catre betoane"],
  ["gestiune", "mecanizare", "Piese, consumabile si materiale parc auto"],
  ["gestiune", "contabilitate", "Stocuri si documente pentru contabilitate"],
  ["production", "asternere", "Asfalt livrat spre asternere"],      
  ["betoane", "canalizare", "Beton si materiale pentru canalizare"],
  ["contabilitate", "gestiune", "Verificari contabile pe stocuri"]  
];
const permissionGroups = {
  dashboard: ["dashboard:view"],
  dailyReport: ["daily_report:view", "daily_report:print", "daily_report:export", "period_report:view", "period_report:print", "period_report:export"],
  accountingReport: ["accounting_report:view", "accounting_report:print", "accounting_report:export"],
  consumptions: ["consumptions:view", "consumptions:create", "consumptions:cancel", "consumptions:export"],
  recipes: ["recipes:view", "recipes:manage"],
  materials: ["materials:view", "materials:edit"],
  departmentRequests: ["department_requests:view", "department_requests:create", "department_requests:manage", "department_requests:plan"],
  stockOperations: ["stock_operations:view", "stock_operations:create", "stock_operations:cancel", "stock_operations:export"],
  deliveries: ["deliveries:view", "deliveries:create", "deliveries:cancel"],
  procurementOrders: ["procurement_orders:view", "procurement_orders:create", "procurement_orders:receive", "procurement_orders:close"],
  referate: ["referate:view", "referate:create", "referate:achizitii", "referate:gestionar", "referate:secretariat", "referate:cfp", "referate:contabil_sef", "referate:dir_adjunct", "referate:dir_general", "referate:receptie"],
  mechanization: ["mechanization:view", "mechanization:manage", "mechanization:request", "mechanization:approve"],
  technical: ["technical:view", "technical:worklog", "technical:sales", "technical:export"],
  costAccounting: ["cost_accounting:view", "cost_accounting:manage", "cost_accounting:import", "cost_accounting:export"],
  ledger: ["ledger:view", "ledger:export"],
  planning: ["planning:view", "planning:manage"],
  users: ["users:manage"],
  settings: ["settings:manage"],
  audit: ["audit:view", "audit:manage"],
  system: ["system:view"]
};
const allPermissions = Object.values(permissionGroups).flat();
const rolePermissions = {
  superadmin: allPermissions,
  admin: allPermissions.filter((permission) => !["settings:manage", "audit:manage", "system:view"].includes(permission)),
  manager: [
    ...permissionGroups.dashboard,
    ...permissionGroups.dailyReport,
    ...permissionGroups.accountingReport,
    ...permissionGroups.consumptions,
    "recipes:view",
    ...permissionGroups.planning,
    ...permissionGroups.departmentRequests,
    "materials:view",
    "stock_operations:view",
    "stock_operations:export",
    "deliveries:view",
    "procurement_orders:view",
    "mechanization:view",
    "mechanization:approve",
    ...permissionGroups.technical,
    "cost_accounting:view",
    "cost_accounting:export",
    ...permissionGroups.ledger,
    "audit:view"
  ],
  inventory: [
    ...permissionGroups.dashboard,
    ...permissionGroups.dailyReport,
    ...permissionGroups.accountingReport,
    "recipes:view",
    "department_requests:view",
    ...permissionGroups.materials,
    ...permissionGroups.stockOperations,
    ...permissionGroups.deliveries,
    ...permissionGroups.procurementOrders,
    "mechanization:view",
    ...permissionGroups.ledger,
    "consumptions:view",
    "consumptions:export",
    "audit:view"
  ],
  procurement: [
    ...permissionGroups.dashboard,
    "daily_report:view",
    "period_report:view",
    "accounting_report:view",
    "accounting_report:export",
    "recipes:view",
    "materials:view",
    "department_requests:view",
    "stock_operations:view",
    "stock_operations:export",
    ...permissionGroups.deliveries,
    ...permissionGroups.procurementOrders,
    ...permissionGroups.ledger,
    "planning:view"
  ],
  mechanization: [
    ...permissionGroups.dashboard,
    "department_requests:view",
    ...permissionGroups.mechanization,
    "technical:worklog",
    "planning:view",
    "audit:view"
  ],
  technical: [
    ...permissionGroups.dashboard,
    "department_requests:view",
    "mechanization:view",
    ...permissionGroups.technical,
    "planning:view",
    "consumptions:view",
    "consumptions:export",
    "recipes:view",
    "materials:view"
  ],
  accounting: [
    ...permissionGroups.dashboard,
    ...permissionGroups.dailyReport,
    ...permissionGroups.accountingReport,
    ...permissionGroups.costAccounting,
    "technical:view",
    "technical:export",
    "mechanization:view",
    "recipes:view",
    "materials:view",
    "consumptions:view",
    "consumptions:export",
    "stock_operations:view",
    "stock_operations:export",
    "deliveries:view",
    ...permissionGroups.ledger,
    "planning:view",
    "department_requests:view"
  ],
  operator: [
    ...permissionGroups.dashboard,
    "consumptions:view",
    "consumptions:create",
    "department_requests:view",
    "department_requests:create",
    "recipes:view",
    "materials:view"
  ],
  department: [
    ...permissionGroups.dashboard,
    "department_requests:view",
    "department_requests:create",
    "mechanization:view",
    "mechanization:request",
    "technical:view",
    "technical:worklog",
    "recipes:view",
    "materials:view",
    "planning:view"
  ],
  viewer: [
    ...permissionGroups.dashboard,
    "accounting_report:view",
    "department_requests:view",
    "consumptions:view",
    "recipes:view",
    "materials:view",
    "stock_operations:view",
    "deliveries:view",
    "procurement_orders:view",
    "mechanization:view",
    "technical:view",
    "cost_accounting:view",
    "ledger:view",
    "planning:view"
  ]
};
let mssqlDbCache = null;
let mssqlPool = null;

// Incarca automat configuratia bazei preferate din runtime, daca exista.
function loadPreferredDatabaseEnv(root) {
  if (process.env.DB_MODE) return;
  const envCandidates = [
    { mode: "mssql", file: path.join(root, "runtime", "mssql.env") },
    { mode: "postgres", file: path.join(root, "runtime", "postgres.env") }
  ];
  const match = envCandidates.find((item) => fs.existsSync(item.file));
  if (!match) return;
  fs.readFileSync(match.file, "utf8").split(/\r?\n/).forEach((line) => {
    const clean = String(line || "").trim();
    if (!clean || clean.startsWith("#") || !clean.includes("=")) return;
    const separatorIndex = clean.indexOf("=");
    const key = clean.slice(0, separatorIndex).trim();
    const value = clean.slice(separatorIndex + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  });
  process.env.DB_MODE = process.env.DB_MODE || match.mode;
}

// Pregateste baza de date in modul configurat.
function ensureDatabase() {
  if (DB_MODE === "postgres") {
    ensurePostgresDatabase();
    return;
  }
  if (DB_MODE === "mssql" || DB_MODE === "sqlserver") {
    ensureMssqlDatabase();
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    if (fs.existsSync(SEED_FILE)) {
      fs.copyFileSync(SEED_FILE, DB_FILE);
    } else {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
      console.log("✅ app-db.json creat cu structura implicită (seed.json lipsă)");
    }
  }
}

// Citeste starea aplicatiei din backend-ul de baza de date activ.
function readDb() {
  if (DB_MODE === "postgres") {
    return readPostgresDb();
  }
  if (DB_MODE === "mssql" || DB_MODE === "sqlserver") {
    return readMssqlDb();
  }
  return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
}

// Scrie starea aplicatiei in backend-ul de baza de date activ.
function writeDb(db) {
  if (DB_MODE === "postgres") {
    writePostgresDb(db);
    return;
  }
  if (DB_MODE === "mssql" || DB_MODE === "sqlserver") {
    writeMssqlDb(db);
    return;
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function ensurePostgresDatabase() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  runPsql(`
    create table if not exists ${POSTGRES_APP_STATE_TABLE} (
      id integer primary key,
      data jsonb not null,
      updated_at timestamptz not null default now(),
      constraint one_app_state_row check (id = 1)
    );
    insert into ${POSTGRES_APP_STATE_TABLE} (id, data)
    values (1, ${sqlJson(seed)}::jsonb)
    on conflict (id) do nothing;
  `);
}

function readPostgresDb() {
  const result = runPsql(`select data::text from ${POSTGRES_APP_STATE_TABLE} where id = 1;`, { tuplesOnly: true });
  const text = result.trim();
  if (!text) throw new Error("PostgreSQL nu contine starea aplicatiei in app_state.");
  return normalizeDb(JSON.parse(text));
}

function writePostgresDb(db) {
  runPsql(`
    update ${POSTGRES_APP_STATE_TABLE}
    set data = ${sqlJson(normalizeDb(db))}::jsonb,
        updated_at = now()
    where id = 1;
  `);
}

function runPsql(sql, options = {}) {
  const args = [];
  if (process.env.DATABASE_URL) args.push(process.env.DATABASE_URL);
  args.push("--no-psqlrc", "-v", "ON_ERROR_STOP=1");
  if (options.tuplesOnly) args.push("--tuples-only", "--no-align");
  args.push("-c", sql);
  try {
    return childProcess.execFileSync("psql", args, {
      cwd: ROOT,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const details = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`Eroare PostgreSQL/psql: ${details}`);
  }
}

function sqlJson(value) {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

// Creeaza baza SQL Server si tabela app_state daca lipsesc.
function ensureMssqlDatabase() {
  const sourceFile = fs.existsSync(DB_FILE) ? DB_FILE : SEED_FILE;
  const seed = normalizeDb(JSON.parse(fs.readFileSync(sourceFile, "utf8")));
  const databaseName = mssqlDatabaseName();
  const quotedDatabase = quoteMssqlIdentifier(databaseName);
  runMssqlScalar(`
    if db_id(N'${escapeSqlString(databaseName)}') is null
    begin
      declare @createDatabaseSql nvarchar(max) = N'create database ${quotedDatabase}';
      exec (@createDatabaseSql);
    end;
    select 1;
  `, { connectionString: mssqlConnectionString("master") });
  runMssqlScalar(`
    if object_id(N'dbo.${MSSQL_APP_STATE_TABLE}', N'U') is null
    begin
      create table dbo.${MSSQL_APP_STATE_TABLE} (
        id int not null constraint pk_${MSSQL_APP_STATE_TABLE} primary key,
        data nvarchar(max) not null,
        updated_at datetime2 not null constraint df_${MSSQL_APP_STATE_TABLE}_updated_at default sysdatetime(),
        constraint ck_${MSSQL_APP_STATE_TABLE}_one_row check (id = 1),
        constraint ck_${MSSQL_APP_STATE_TABLE}_json check (isjson(data) = 1)
      );
    end;

    if not exists (select 1 from dbo.${MSSQL_APP_STATE_TABLE} where id = 1)
    begin
      insert into dbo.${MSSQL_APP_STATE_TABLE} (id, data) values (1, @json);
    end;
    select 1;
  `, { jsonInput: JSON.stringify(seed) });
  ensureMssqlRelationalSchema();
}

// Citeste starea aplicatiei din SQL Server.
function readMssqlDb() {
  if (mssqlDbCache) return cloneDb(mssqlDbCache);
  const text = runMssqlScalar(`select data from dbo.${MSSQL_APP_STATE_TABLE} where id = 1;`).trim();
  if (!text) throw new Error("SQL Server nu contine starea aplicatiei in dbo.app_state.");
  mssqlDbCache = normalizeDb(JSON.parse(text));
  return cloneDb(mssqlDbCache);
}

// Scrie starea aplicatiei in SQL Server si sincronizeaza schema relationala.
function writeMssqlDb(db) {
  const normalized = normalizeDb(db);
  runMssqlScalar(`
    if exists (select 1 from dbo.${MSSQL_APP_STATE_TABLE} where id = 1)
    begin
      update dbo.${MSSQL_APP_STATE_TABLE}
      set data = @json,
          updated_at = sysdatetime()
      where id = 1;
    end
    else
    begin
      insert into dbo.${MSSQL_APP_STATE_TABLE} (id, data) values (1, @json);
    end;
    select 1;
  `, { jsonInput: JSON.stringify(normalized) });
  syncMssqlRelationalFromAppState();
  mssqlDbCache = cloneDb(normalized);
}

function ensureMssqlRelationalSchema() {
  if (!MSSQL_RELATIONAL_MODE) return;
  applyMssqlBaseSchema();
  applyMssqlMigrations();
  syncMssqlRelationalFromAppState();
}

function syncMssqlRelationalFromAppState() {
  if (!MSSQL_RELATIONAL_MODE) return;
  const importFile = path.join(ROOT, "db", "mssql-import-app-state.sql");
  if (fs.existsSync(importFile)) runMssqlScriptFile(importFile);
}

function applyMssqlMigrations() {
  if (!["mssql", "sqlserver"].includes(DB_MODE)) return [];
  const migrationsDir = path.join(ROOT, "db", "migrations");
  if (!fs.existsSync(migrationsDir)) return [];
  const applied = [];
  fs.readdirSync(migrationsDir)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right))
    .forEach((name) => {
      runMssqlScriptFile(path.join(migrationsDir, name));
      applied.push(name);
    });
  return applied;
}

function applyMssqlBaseSchema() {
  if (!["mssql", "sqlserver"].includes(DB_MODE)) return [];
  const schemaDir = path.join(ROOT, "db", "sqlserver");
  if (!fs.existsSync(schemaDir)) return [];
  const applied = [];
  fs.readdirSync(schemaDir)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right))
    .forEach((name) => {
      runMssqlScriptFile(path.join(schemaDir, name));
      applied.push(name);
    });
  return applied;
}

function syncMssqlCpvCodes(codes) {
  if (!["mssql", "sqlserver"].includes(DB_MODE)) return 0;
  const result = runMssqlScalar(`
    if object_id(N'nomenclator.cpv_codes', N'U') is null
    begin
      select 0;
      return;
    end;
    insert into nomenclator.cpv_codes (cod, denumire_ro, denumire_en, activ, created_by)
    select source.cod, source.denumire_ro, source.denumire_en, 1, null
    from openjson(@json)
    with (
      cod nvarchar(20) '$.cod',
      denumire_ro nvarchar(500) '$.denumire_ro',
      denumire_en nvarchar(500) '$.denumire_en'
    ) source
    where not exists (select 1 from nomenclator.cpv_codes existing where existing.cod = source.cod);
    select @@rowcount;
  `, { jsonInput: JSON.stringify(codes || []), timeoutMs: 300000 });
  return Number(result || 0);
}

function runMssqlScriptFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Script SQL lipsa: ${filePath}`);
  const sql = fs.readFileSync(filePath, "utf8");
  runMssqlScalar(`${sql}\nselect 1;`, { timeoutMs: 300000 });
}

async function getMssqlPool() {
  if (!["mssql", "sqlserver"].includes(DB_MODE)) return null;
  if (mssqlPool?.connected) return mssqlPool;
  if (mssqlPool) {
    try { await mssqlPool.close(); } catch {}
  }
  mssqlPool = new sql.ConnectionPool(mssqlConnectionString());
  mssqlPool.on("error", (error) => {
    console.error("[DB] Pool error:", error);
    mssqlPool = null;
  });
  await mssqlPool.connect();
  return mssqlPool;
}

async function closeMssqlPool() {
  const activePool = mssqlPool;
  mssqlPool = null;
  if (activePool) {
    try { await activePool.close(); } catch {}
  }
}

async function runMssqlScalarPooled(query, inputs = {}) {
  const pool = await getMssqlPool();
  if (!pool) return "";
  const request = pool.request();
  Object.entries(inputs).forEach(([name, value]) => request.input(name, value));
  const result = await request.query(query);
  const firstRow = result.recordset?.[0];
  return firstRow ? firstRow[Object.keys(firstRow)[0]] : "";
}

// Cloneaza profund obiectul bazei pentru a evita mutatii partajate.
function cloneDb(db) {
  return JSON.parse(JSON.stringify(db));
}

// Ruleaza un script SQL Server prin PowerShell si intoarce prima valoare scalara.
function runMssqlScalar(sql, options = {}) {
  const script = `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Data
$connectionString = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:ASFALT_MSSQL_CONNECTION_B64))
$sql = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:ASFALT_MSSQL_SQL_B64))
$jsonPath = [string]$env:ASFALT_MSSQL_JSON_FILE
$json = if ($jsonPath) { [System.IO.File]::ReadAllText($jsonPath, [System.Text.UTF8Encoding]::new($false)) } else { "" }
$connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandTimeout = 60
  $command.CommandText = $sql
  if ($json.Length -gt 0) {
    $parameter = $command.Parameters.Add("@json", [System.Data.SqlDbType]::NVarChar, -1)
    $parameter.Value = $json
  }
  $result = $command.ExecuteScalar()
  if ($null -ne $result -and $result -ne [DBNull]::Value) {
    [Console]::Write([string]$result)
  }
} finally {
  if ($connection.State -ne [System.Data.ConnectionState]::Closed) {
    $connection.Close()
  }
}
`;
  const encodedCommand = Buffer.from(script, "utf16le").toString("base64");
  const hasJsonInput = Object.prototype.hasOwnProperty.call(options, "jsonInput");
  const jsonFile = hasJsonInput
    ? path.join(os.tmpdir(), `infraflow-mssql-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.json`)
    : "";
  if (jsonFile) fs.writeFileSync(jsonFile, options.jsonInput || "", "utf8");
  const env = {
    ...process.env,
    ASFALT_MSSQL_CONNECTION_B64: Buffer.from(options.connectionString || mssqlConnectionString(), "utf8").toString("base64"),
    ASFALT_MSSQL_SQL_B64: Buffer.from(sql, "utf8").toString("base64"),
    ASFALT_MSSQL_JSON_FILE: jsonFile
  };
  try {
    return childProcess.execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand], {
      cwd: ROOT,
      env,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: options.timeoutMs || 120000
    });
  } catch (error) {
    const details = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`Eroare SQL Server: ${details}`);
  } finally {
    if (jsonFile) fs.rmSync(jsonFile, { force: true });
  }
}

function mssqlConnectionString(databaseName = mssqlDatabaseName()) {
  const raw = process.env.MSSQL_CONNECTION_STRING || process.env.SQLSERVER_CONNECTION_STRING || DEFAULT_MSSQL_CONNECTION_STRING;
  return setConnectionStringValue(raw, getConnectionStringValue(raw, "Initial Catalog") ? "Initial Catalog" : "Database", databaseName);
}

function mssqlDatabaseName() {
  const raw = process.env.MSSQL_CONNECTION_STRING || process.env.SQLSERVER_CONNECTION_STRING || DEFAULT_MSSQL_CONNECTION_STRING;
  return process.env.MSSQL_DATABASE || getConnectionStringValue(raw, "Database") || getConnectionStringValue(raw, "Initial Catalog") || "InfraFlow";
}

function getConnectionStringValue(connectionString, key) {
  const expected = String(key).toLowerCase();
  const part = String(connectionString || "").split(";").find((item) => {
    const index = item.indexOf("=");
    return index > -1 && item.slice(0, index).trim().toLowerCase() === expected;
  });
  if (!part) return "";
  return part.slice(part.indexOf("=") + 1).trim();
}

function setConnectionStringValue(connectionString, key, value) {
  const expected = String(key).toLowerCase();
  const parts = String(connectionString || "").split(";").filter((item) => item.trim());
  let replaced = false;
  const updated = parts.map((part) => {
    const index = part.indexOf("=");
    if (index === -1 || part.slice(0, index).trim().toLowerCase() !== expected) return part;
    replaced = true;
    return `${part.slice(0, index).trim()}=${value}`;
  });
  if (!replaced) updated.push(`${key}=${value}`);
  return updated.join(";");
}

function quoteMssqlIdentifier(value) {
  return `[${String(value).replaceAll("]", "]]")}]`;
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

// Normalizeaza structura bazei inainte de folosire.
function normalizeDb(db) {
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.materials)) db.materials = [];
  db.materials.forEach((material) => {
    if (typeof material.recipeMaterial !== "boolean") material.recipeMaterial = true;
    material.category = material.recipeMaterial ? "asfalt" : "general";
  });
  if (!Array.isArray(db.departments)) db.departments = [];
  ensureDefaultDepartments(db);
  if (!Array.isArray(db.departmentRequests)) db.departmentRequests = [];
  if (!Array.isArray(db.departmentStocks)) db.departmentStocks = [];
  if (!Array.isArray(db.departmentConsumptions)) db.departmentConsumptions = [];
  if (!Array.isArray(db.devices)) db.devices = [];
  if (!Array.isArray(db.workstationRequests)) db.workstationRequests = [];
  if (!Array.isArray(db.procurementOrders)) db.procurementOrders = [];
  if (!Array.isArray(db.procurementReceipts)) db.procurementReceipts = [];
  if (!Array.isArray(db.referate)) db.referate = [];
  if (!Array.isArray(db.referateFlux)) db.referateFlux = [];
  if (!Array.isArray(db.referateCounters)) db.referateCounters = [];
  if (!Array.isArray(db.cpvCodes)) db.cpvCodes = [];
  if (!Array.isArray(db.paap)) db.paap = [];
  if (!Array.isArray(db.paapExecutie)) db.paapExecutie = [];
  if (!db.hr || typeof db.hr !== "object") db.hr = {};
  if (!Array.isArray(db.hr.echipamenteTipuri)) db.hr.echipamenteTipuri = [];
  if (!Array.isArray(db.hr.echipamenteMarimi)) db.hr.echipamenteMarimi = [];
  if (!Array.isArray(db.hr.echipamenteDepartament)) db.hr.echipamenteDepartament = [];
  if (!Array.isArray(db.hr.angajatEchipamente)) db.hr.angajatEchipamente = [];
  if (!Array.isArray(db.hr.echipamenteDotari)) db.hr.echipamenteDotari = [];
  if (!Array.isArray(db.fleetAssets)) db.fleetAssets = [];
  if (!Array.isArray(db.fleetRequests)) db.fleetRequests = [];
  if (!Array.isArray(db.fleetMeterReadings)) db.fleetMeterReadings = [];
  if (!Array.isArray(db.costCenters)) db.costCenters = [];
  if (!Array.isArray(db.technicalWorkLogs)) db.technicalWorkLogs = [];
  if (!Array.isArray(db.technicalClients)) db.technicalClients = [];
  if (!Array.isArray(db.asphaltSales)) db.asphaltSales = [];
  if (!Array.isArray(db.nexusExpenses)) db.nexusExpenses = [];
  if (!Array.isArray(db.projects)) db.projects = [];
  if (!Array.isArray(db.departmentConnections)) db.departmentConnections = [];
  if (!Array.isArray(db.workflowTemplates)) db.workflowTemplates = [];
  if (!Array.isArray(db.workflowRequests)) db.workflowRequests = [];
  if (!Array.isArray(db.workflowAudit)) db.workflowAudit = [];
  if (!Array.isArray(db.audit)) db.audit = [];
  if (!Array.isArray(db.stockMovements)) db.stockMovements = [];
  if (!Array.isArray(db.consumptions)) db.consumptions = [];
  if (!Array.isArray(db.deliveries)) db.deliveries = [];
  if (!Array.isArray(db.recipes)) db.recipes = [];
  if (!db.inventory || typeof db.inventory !== "object") db.inventory = {};
  if (!Array.isArray(db.inventory.department_stocks)) db.inventory.department_stocks = [];
  if (!Array.isArray(db.inventory.stock_transfers)) db.inventory.stock_transfers = [];
  if (!Array.isArray(db.inventory.department_consumptions)) db.inventory.department_consumptions = [];
  if (!db.settings || typeof db.settings !== "object") db.settings = {};
  if (db.settings.ai_enabled === undefined) db.settings.ai_enabled = 0;
  if (db.settings.ai_model_default === undefined) db.settings.ai_model_default = "claude-haiku-4-5";
  if (db.settings.ai_monthly_budget === undefined) db.settings.ai_monthly_budget = 200;
  if (db.settings.ai_limit_per_user === undefined) db.settings.ai_limit_per_user = 30;
  if (db.settings.ai_limit_per_company === undefined) db.settings.ai_limit_per_company = 500;
  if (db.settings.tva_implicit === undefined) db.settings.tva_implicit = Number(db.settings.cota_tva_standard ?? 21);
  db.settings.license = normalizeLicense(db.settings.license || {});
  db.settings.networkAccessMode = normalizeNetworkAccessMode(db.settings.networkAccessMode);
  db.settings.scaleDbPath = String(db.settings.scaleDbPath || "").trim();
  db.settings.scaleProductMap = normalizeScaleProductMap(db.settings.scaleProductMap || {});
  db.settings.nexusDbPath = String(db.settings.nexusDbPath || "").trim();
  db.settings.autominderDbPath = String(db.settings.autominderDbPath || "").trim();
  db.settings.rolePermissionOverrides = normalizeRolePermissionOverrides(db.settings.rolePermissionOverrides || {});
  if (db.settings.setupCompleted !== false) db.settings.setupCompleted = true;
  if (typeof db.settings.initialStockCompleted !== "boolean") {
    db.settings.initialStockCompleted = inferInitialStockCompleted(db);
  }
  ensureDefaultWorkflowTemplates(db);
  ensureDefaultDepartmentConnections(db);
  syncWorkflowIndexes(db);
  ensureActiveSuperadmin(db);
  return db;
}

function ensureDefaultDepartments(db) {
  const exists = db.departments.some((department) => {
    const code = String(department.cod || department.code || "").toLowerCase();
    const name = String(department.denumire || department.name || "").toLowerCase();
    return code === "gestiune" || name === "gestiune";
  });
  if (exists) return;
  db.departments.push({
    id: "dept-gestiune",
    cod: "gestiune",
    denumire: "Gestiune",
    name: "Gestiune",
    descriere: "Depozit si gestiune materiale",
    moduleKey: "gestiune",
    active: true,
    createdAt: new Date().toISOString()
  });
}

function ensureDefaultWorkflowTemplates(db) {
  const existing = new Set(db.workflowTemplates.map((item) => item.type));
  defaultWorkflowTemplates.forEach((template) => {
    if (existing.has(template.type)) return;
    db.workflowTemplates.push({
      ...template,
      active: true,
      createdAt: new Date().toISOString()
    });
  });
}

function ensureDefaultDepartmentConnections(db) {
  const existing = new Set(db.departmentConnections.map((item) => `${item.sourceModuleKey || item.source}|${item.targetModuleKey || item.target}`));
  defaultDepartmentConnections.forEach(([sourceModuleKey, targetModuleKey, label]) => {
    const key = `${sourceModuleKey}|${targetModuleKey}`;
    if (existing.has(key)) return;
    db.departmentConnections.push({
      id: `dc-${sourceModuleKey}-${targetModuleKey}`,
      sourceModuleKey,
      targetModuleKey,
      sourceDepartmentId: findDepartmentByModule(db, sourceModuleKey)?.id || "",
      targetDepartmentId: findDepartmentByModule(db, targetModuleKey)?.id || "",
      type: "workflow",
      label,
      active: true,
      createdAt: new Date().toISOString()
    });
  });
}

function syncWorkflowIndexes(db) {
  (db.departmentRequests || []).forEach((request) => syncWorkflowForDepartmentRequest(db, null, request, "sync"));
  (db.fleetRequests || []).forEach((request) => syncWorkflowForFleetRequest(db, null, request, "sync"));
}

function findDepartmentByModule(db, moduleKey) {
  const normalized = String(moduleKey || "").toLowerCase();
  return (db.departments || []).find((department) => String(department.moduleKey || "").toLowerCase() === normalized)
    || (db.departments || []).find((department) => moduleKeyForDepartmentName(department.name) === normalized)
    || null;
}

function findDepartmentByName(db, name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return null;
  return (db.departments || []).find((department) => String(department.name || "").trim().toLowerCase() === normalized) || null;
}

function moduleKeyForDepartmentName(name) {
  const value = String(name || "").toLowerCase();
  if (value.includes("tehnic")) return "tehnic";
  if (value.includes("mecanizare") || value.includes("parc")) return "mecanizare";
  if (value.includes("gestiune")) return "gestiune";
  if (value.includes("conta")) return "contabilitate";
  if (value.includes("betoane")) return "betoane";
  if (value.includes("asternere")) return "asternere";
  if (value.includes("canalizare")) return "canalizare";
  if (value.includes("achiz")) return "achizitii";
  if (value.includes("siguranta")) return "siguranta";
  if (value.includes("product") || value.includes("asfalt") || value.includes("statie")) return "production";
  return "custom";
}

function ensureProjectForJob(db, jobName, sourceType = "", sourceId = "", user = null, extra = {}) {
  const name = String(jobName || "").trim();
  if (!name) return null;
  const existing = (db.projects || []).find((project) => String(project.name || "").trim().toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const project = {
    id: stableEntityId("project", name),
    code: "",
    name,
    clientName: String(extra.clientName || ""),
    contractNo: String(extra.contractNo || ""),
    type: String(extra.type || "general"),
    status: "active",
    location: String(extra.location || ""),
    sourceType,
    sourceId,
    createdBy: user?.id || "",
    createdByName: user?.name || "",
    createdAt: new Date().toISOString()
  };
  db.projects.push(project);
  return project;
}

function workflowStatusFromDepartment(status) {
  return ({
    new: "SUBMIS",
    accepted: "IN_EXECUTIE",
    planned: "IN_EXECUTIE",
    partial: "IN_EXECUTIE",
    done: "FINALIZAT",
    rejected: "RESPINS"
  })[status] || "SUBMIS";
}

function workflowStatusFromFleet(status) {
  return ({
    new: "SUBMIS",
    approved: "IN_EXECUTIE",
    planned: "IN_EXECUTIE",
    done: "FINALIZAT",
    rejected: "RESPINS",
    canceled: "ANULAT"
  })[status] || "SUBMIS";
}

function syncWorkflowForDepartmentRequest(db, user, request, action = "updated", oldStatus = "") {
  if (!request) return null;
  const project = ensureProjectForJob(db, request.jobName, "department_request", request.id, user, { location: request.location });
  const requesterDepartment = findDepartmentByName(db, request.department);
  const targetDepartment = request.type === "asphalt" ? findDepartmentByModule(db, "production") : findDepartmentByModule(db, "gestiune");
  return upsertWorkflowRequest(db, user, {
    id: stableEntityId("wfr", `department_request:${request.id}`),
    templateType: request.type === "asphalt" ? "asphalt" : "material",
    requestType: request.type === "asphalt" ? "asphalt" : "material",
    sourceType: "department_request",
    sourceId: request.id,
    title: request.itemName || request.materialName || request.requestedMaterialName || "Solicitare materiale",
    status: workflowStatusFromDepartment(request.status),
    oldStatus,
    action,
    priority: request.priority || "medie",
    requesterUserId: request.createdBy || "",
    requesterDepartmentId: requesterDepartment?.id || "",
    targetDepartmentId: targetDepartment?.id || "",
    projectId: project?.id || "",
    amount: Number(request.amount || 0),
    unit: request.unit || "",
    neededDate: request.neededDate || "",
    createdAt: request.createdAt || new Date().toISOString(),
    payload: request
  });
}

function syncWorkflowForFleetRequest(db, user, request, action = "updated", oldStatus = "") {
  if (!request) return null;
  const project = ensureProjectForJob(db, request.jobName, "fleet_request", request.id, user, { location: request.location });
  const requesterDepartment = findDepartmentByName(db, request.department);
  const targetDepartment = findDepartmentByModule(db, "mecanizare");
  return upsertWorkflowRequest(db, user, {
    id: stableEntityId("wfr", `fleet_request:${request.id}`),
    templateType: "fleet",
    requestType: "fleet",
    sourceType: "fleet_request",
    sourceId: request.id,
    title: `${request.assetName || "Utilaj"} / ${request.jobName || request.department || ""}`.trim(),
    status: workflowStatusFromFleet(request.status),
    oldStatus,
    action,
    priority: "medie",
    requesterUserId: request.createdBy || "",
    requesterDepartmentId: requesterDepartment?.id || "",
    targetDepartmentId: targetDepartment?.id || "",
    projectId: project?.id || "",
    amount: fleetRequestHours(request),
    unit: "ore",
    neededDate: request.date || "",
    createdAt: request.createdAt || new Date().toISOString(),
    payload: request
  });
}

function upsertWorkflowRequest(db, user, input) {
  const existing = db.workflowRequests.find((item) => item.sourceType === input.sourceType && item.sourceId === input.sourceId);
  const template = db.workflowTemplates.find((item) => item.type === input.templateType);
  const now = new Date().toISOString();
  const payload = safeJsonObject(input.payload);
  if (existing) {
    const previousStatus = existing.status || "";
    Object.assign(existing, {
      templateId: template?.id || existing.templateId || "",
      requestType: input.requestType,
      title: input.title,
      status: input.status,
      priority: input.priority,
      requesterUserId: input.requesterUserId,
      requesterDepartmentId: input.requesterDepartmentId,
      targetDepartmentId: input.targetDepartmentId,
      projectId: input.projectId,
      amount: input.amount,
      unit: input.unit,
      neededDate: input.neededDate,
      payload,
      updatedAt: now,
      completedAt: input.status === "FINALIZAT" ? (existing.completedAt || now) : existing.completedAt || ""
    });
    if (user && (previousStatus !== input.status || input.action !== "sync")) {
      addWorkflowAudit(db, user, existing, input.action, previousStatus, input.status);
    }
    return existing;
  }
  const created = {
    id: input.id,
    templateId: template?.id || "",
    requestType: input.requestType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title,
    status: input.status,
    priority: input.priority,
    requesterUserId: input.requesterUserId,
    requesterDepartmentId: input.requesterDepartmentId,
    targetDepartmentId: input.targetDepartmentId,
    projectId: input.projectId,
    amount: input.amount,
    unit: input.unit,
    neededDate: input.neededDate,
    payload,
    createdAt: input.createdAt,
    updatedAt: input.action === "sync" ? "" : now,
    completedAt: input.status === "FINALIZAT" ? now : ""
  };
  db.workflowRequests.push(created);
  if (user) addWorkflowAudit(db, user, created, input.action, input.oldStatus || "", input.status);
  return created;
}

function addWorkflowAudit(db, user, request, action, oldStatus = "", newStatus = "") {
  db.workflowAudit.push({
    id: id("wfa"),
    requestId: request.id,
    sourceType: request.sourceType,
    sourceId: request.sourceId,
    action,
    oldStatus,
    newStatus,
    userId: user.id,
    userName: user.name,
    details: request.title || "",
    createdAt: new Date().toISOString()
  });
}

function safeJsonObject(value) {
  if (!value || typeof value !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function fleetRequestHours(request) {
  if (!validTimeValue(request.startTime) || !validTimeValue(request.endTime)) return 0;
  const [startHour, startMinute] = request.startTime.split(":").map(Number);
  const [endHour, endMinute] = request.endTime.split(":").map(Number);
  return round(Math.max(0, (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60));
}

function stableEntityId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha1").update(String(value || "").toLowerCase()).digest("hex").slice(0, 20)}`;
}

function inferInitialStockCompleted(db) {
  return Boolean(
    (db.consumptions || []).some((item) => !item.canceled) ||
    (db.stockMovements || []).length ||
    (db.deliveries || []).some((item) => !item.canceled)
  );
}

function ensureActiveSuperadmin(db) {
  if (!Array.isArray(db.users) || !db.users.length) return;
  if (db.users.some((user) => user.active !== false && user.role === "superadmin")) return;
  const admin = db.users.find((user) => user.active !== false && user.username === "admin")
    || db.users.find((user) => user.active !== false && user.role === "admin")
    || db.users.find((user) => user.active !== false);
  if (admin) admin.role = "superadmin";
}

function normalizeRolePermissionOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const allowed = new Set(allPermissions);
  return Object.fromEntries(Object.entries(input)
    .filter(([role]) => rolePermissions[role] && role !== "superadmin")
    .map(([role, permissions]) => [
      role,
      Array.from(new Set(Array.isArray(permissions) ? permissions.filter((permission) => allowed.has(permission)) : []))
    ]));
}

function normalizeLicense(license, strict = false) {
  const plan = String(license.plan || "internal-preview").trim();
  const expiresAt = license.expiresAt ? String(license.expiresAt) : null;
  if (strict && !["trial", "internal", "full"].includes(plan)) throwHttp(400, "Tip licenta invalid.");
  if (expiresAt && !validDateValue(expiresAt)) throwHttp(400, "Data expirare licenta invalida.");
  const trialStartedAt = license.trialStartedAt && validDateValue(license.trialStartedAt) ? String(license.trialStartedAt) : null;
  const trialDays = Math.max(1, Number(license.trialDays || 30));
  const trialExpiresAt = plan === "trial"
    ? (expiresAt || addDays(trialStartedAt || localDate(new Date()), trialDays - 1))
    : null;
  const normalized = {
    plan,
    licenseId: String(license.licenseId || license.id || "").trim(),
    clientName: String(license.clientName || license.companyName || "").trim(),
    clientCode: String(license.clientCode || "").trim(),
    companyTaxId: String(license.companyTaxId || "").trim(),
    maxUsers: Math.max(1, Number(license.maxUsers || 1)),
    maxDevices: Math.max(1, Number(license.maxDevices || 1)),
    expiresAt,
    trialDays,
    trialStartedAt,
    trialExpiresAt,
    modules: Array.isArray(license.modules) ? license.modules.map((item) => String(item).trim()).filter(Boolean) : [],
    issuedAt: license.issuedAt || null,
    importedAt: license.importedAt || null,
    source: license.source || "manual",
    signature: license.signature || "",
    payload: license.payload || ""
  };
  normalized.status = licenseStatus(normalized);
  return normalized;
}

function licenseStatus(license) {
  if (license.expiresAt && license.expiresAt < localDate(new Date())) return "expired";
  if (license.source === "signed-file") return "active";
  if (license.plan === "trial") {
    if (license.trialExpiresAt && license.trialExpiresAt < localDate(new Date())) return "expired";
    return "active";
  }
  return "internal";
}

function normalizeNetworkAccessMode(value) {
  return String(value || "internal-only").trim() === "open" ? "open" : "internal-only";
}

function normalizeScaleProductMap(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.entries(input).reduce((map, [product, materialId]) => {
    const productKey = normalizeScaleProductName(product);
    const value = String(materialId || "").trim();
    if (productKey && value) map[productKey] = value;
    return map;
  }, {});
}

function normalizeScaleProductName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validTimeValue(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function round(value) {
  return Number((Number(value || 0)).toFixed(3));
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function validDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return localDate(date);
}

module.exports = {
  DB_MODE,
  DB_FILE,
  SEED_FILE,
  MSSQL_APP_STATE_TABLE,
  DEFAULT_MSSQL_CONNECTION_STRING,
  MSSQL_RELATIONAL_MODE,
  loadPreferredDatabaseEnv,
  ensureDatabase,
  readDb,
  writeDb,
  cloneDb,
  readMssqlDb,
  writeMssqlDb,
  runMssqlScalar,
  runMssqlScalarPooled,
  getMssqlPool,
  closeMssqlPool,
  applyMssqlBaseSchema,
  applyMssqlMigrations,
  syncMssqlCpvCodes,
  ensureMssqlDatabase,
  normalizeDb
};

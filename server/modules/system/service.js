const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const childProcess = require('child_process')
const os = require('os')
const coreDb = require('../../core/db')
const { writeDb, DB_MODE, DB_FILE, MSSQL_APP_STATE_TABLE, MSSQL_RELATIONAL_MODE, DEFAULT_MSSQL_CONNECTION_STRING } = coreDb
const { addAudit } = require('../../core/audit')
const { assertPasswordPolicy, hashPassword, passwordPolicyFromSettings } = require('../../core/auth')

const ROOT = path.resolve(__dirname, '../../..')
const PORT = Number(process.env.INFRAFLOW_PORT || process.env.PORT || 4180)
const POSTGRES_APP_STATE_TABLE = 'app_state'
const APP_VERSION = readPackageVersion()
const RELEASE_MANIFEST_FORMAT = 'asfalt-pro-release-manifest-v1'
const RELEASE_MANIFEST_FILE = path.join(ROOT, 'release-manifest.json')
const UPDATE_UPLOAD_MAX_BYTES = 250 * 1024 * 1024
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAYNXaZvihiimTZ3M0C7DLvUoYMfgD3qty3Ohm0+/0SFQ=
-----END PUBLIC KEY-----`;

function startMssqlKeepAlive() {
  if (DB_MODE !== "mssql" && DB_MODE !== "sqlserver") return;
  const ping = () => {
    try {
      runMssqlScalar("select 1;");
    } catch (error) {
      console.error("Conexiune SQL Server indisponibila:", error.message);
    }
  };
  ping();
  setInterval(ping, 5 * 60 * 1000).unref?.();
}

function checkMonthlyDepartmentRequests(db) {
  const today = localDate(new Date());
  const currentMonth = today.slice(0, 7);
  let count = 0;
  (db.departmentRequests || []).forEach(req => {
    if (["new", "accepted", "planned"].includes(req.status)) {
      const reqMonth = (req.createdAt || req.neededDate || today).slice(0, 7);
      if (reqMonth < currentMonth) {
        req.status = "partial";
        count++;
      }
    }
  });
  if (count > 0) {
    addAudit(db, { id: "system", name: "Sistem" }, "inchidere_luna_solicitari", `Marcat ${count} solicitari vechi ca Partial.`);
    writeDb(db);
  }
}

function ensureAppIntegrity() {
  if (String(process.env.VERIFY_APP_INTEGRITY || "") !== "1") return;
  verifyReleaseManifest(ROOT);
}

function verifyReleaseManifest(packageRoot) {
  const manifestFile = path.join(packageRoot, "release-manifest.json");
  if (!fs.existsSync(manifestFile)) {
    throw new Error("Lipseste release-manifest.json.");
  }
  const document = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const payload = verifyReleaseManifestDocument(document);
  payload.files.forEach((item) => verifyManifestFile(packageRoot, item));
  return { document, payload };
}

function verifyReleaseManifestDocument(document) {
  if (document.format !== RELEASE_MANIFEST_FORMAT || !document.payload || !document.signature) {
    throw new Error("Manifest integritate invalid.");
  }
  const valid = crypto.verify(
    null,
    Buffer.from(String(document.payload), "utf8"),
    crypto.createPublicKey(LICENSE_PUBLIC_KEY),
    Buffer.from(String(document.signature), "base64url")
  );
  if (!valid) throw new Error("Semnatura manifestului de integritate este invalida.");
  const payload = JSON.parse(Buffer.from(String(document.payload), "base64url").toString("utf8"));
  if (payload.format !== RELEASE_MANIFEST_FORMAT || !Array.isArray(payload.files)) {
    throw new Error("Payload manifest integritate invalid.");
  }
  return payload;
}

function verifyManifestFile(packageRoot, item) {
  const relativePath = String(item.path || "");
  const expected = String(item.sha256 || "");
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Cale invalida in manifest: ${relativePath}`);
  }
  const filePath = path.join(packageRoot, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Fisier lipsa din pachet: ${relativePath}`);
  }
  const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  if (actual !== expected) {
    throw new Error(`Fisier modificat fata de manifest: ${relativePath}`);
  }
}

function ensureAppIntegrityLegacy() {
  if (String(process.env.VERIFY_APP_INTEGRITY || "") !== "1") return;
  if (!fs.existsSync(RELEASE_MANIFEST_FILE)) {
    throw new Error("Verificarea integritatii este activa, dar lipseste release-manifest.json.");
  }
  const document = JSON.parse(fs.readFileSync(RELEASE_MANIFEST_FILE, "utf8"));
  if (document.format !== RELEASE_MANIFEST_FORMAT || !document.payload || !document.signature) {
    throw new Error("Manifest integritate invalid.");
  }
  const valid = crypto.verify(
    null,
    Buffer.from(String(document.payload), "utf8"),
    crypto.createPublicKey(LICENSE_PUBLIC_KEY),
    Buffer.from(String(document.signature), "base64url")
  );
  if (!valid) throw new Error("Semnatura manifestului de integritate este invalida.");
  const payload = JSON.parse(Buffer.from(String(document.payload), "base64url").toString("utf8"));
  if (payload.format !== RELEASE_MANIFEST_FORMAT || !Array.isArray(payload.files)) {
    throw new Error("Payload manifest integritate invalid.");
  }
  payload.files.forEach((item) => {
    const relativePath = String(item.path || "");
    const expected = String(item.sha256 || "");
    if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
      throw new Error(`Cale invalida in manifest: ${relativePath}`);
    }
    const filePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`Fisier lipsa din pachet: ${relativePath}`);
    }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    if (actual !== expected) {
      throw new Error(`Fisier modificat fata de manifest: ${relativePath}`);
    }
  });
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

function ensureMssqlRelationalSchema() {
  if (!MSSQL_RELATIONAL_MODE) return;
  runMssqlScriptFile(path.join(ROOT, "db", "mssql-schema.sql"));
  syncMssqlRelationalFromAppState();
}

function syncMssqlRelationalFromAppState() {
  if (!MSSQL_RELATIONAL_MODE) return;
  runMssqlScriptFile(path.join(ROOT, "db", "mssql-import-app-state.sql"));
}

function runMssqlScriptFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Script SQL lipsa: ${filePath}`);
  const sql = fs.readFileSync(filePath, "utf8");
  runMssqlScalar(`${sql}\nselect 1;`, { timeoutMs: 300000 });
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

function buildSystemDiagnostics(db) {
  const backupInfo = latestBackupInfo();
  const logInfo = readRecentLogs();
  const integrity = integrityStatus();
  const license = normalizeLicense(db.settings?.license || {});
  const sqlServerMode = DB_MODE === "mssql" || DB_MODE === "sqlserver";
  const dataFile = DB_MODE === "postgres" || sqlServerMode ? null : fileInfo(DB_FILE);
  const devices = activeDevices(db);
  return {
    app: {
      name: "InfraFlow",
      version: APP_VERSION,
      port: PORT,
      root: ROOT,
      node: process.version,
      platform: process.platform,
      uptimeSeconds: Math.round(process.uptime()),
      networkUrls: networkUrls()
    },
    security: {
      networkAccessMode: db.settings?.networkAccessMode || "internal-only",
      activeDevices: devices.length,
      maxDevices: license.maxDevices,
      registeredDevices: (db.devices || []).length
    },
    database: {
      mode: DB_MODE,
      jsonFile: dataFile,
      postgres: {
        enabled: DB_MODE === "postgres",
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        psqlAvailable: Boolean(findCommand("psql")),
        table: POSTGRES_APP_STATE_TABLE
      },
      sqlServer: {
        enabled: sqlServerMode,
        relationalMode: sqlServerMode && MSSQL_RELATIONAL_MODE,
        hasConnectionString: Boolean(process.env.MSSQL_CONNECTION_STRING || process.env.SQLSERVER_CONNECTION_STRING),
        database: sqlServerMode ? mssqlDatabaseName() : "",
        table: MSSQL_APP_STATE_TABLE
      }
    },
    license: {
      plan: license.plan,
      status: license.status,
      clientName: license.clientName || "",
      maxUsers: license.maxUsers,
      maxDevices: license.maxDevices,
      expiresAt: license.expiresAt || "",
      trialStartedAt: license.trialStartedAt || "",
      trialExpiresAt: license.trialExpiresAt || "",
      modules: license.modules || []
    },
    counts: {
      users: (db.users || []).length,
      activeUsers: (db.users || []).filter((user) => user.active !== false).length,
      materials: (db.materials || []).length,
      recipes: (db.recipes || []).length,
      activeRecipes: (db.recipes || []).filter((recipe) => recipe.active !== false).length,
      consumptions: (db.consumptions || []).length,
      deliveries: (db.deliveries || []).length,
      stockMovements: (db.stockMovements || []).length,
      plans: (db.productionPlans || []).length,
      requests: (db.departmentRequests || []).length,
      procurementOrders: (db.procurementOrders || []).length,
      procurementReceipts: (db.procurementReceipts || []).length,
      fleetAssets: (db.fleetAssets || []).length,
      fleetRequests: (db.fleetRequests || []).length,
      costCenters: (db.costCenters || []).length,
      technicalWorkLogs: (db.technicalWorkLogs || []).length,
      technicalClients: (db.technicalClients || []).length,
      asphaltSales: (db.asphaltSales || []).length,
      nexusExpenses: (db.nexusExpenses || []).length,
      activeDevices: devices.length,
      auditEvents: (db.audit || []).length
    },
    backup: backupInfo,
    integrity,
    logs: logInfo,
    maintenance: buildMaintenanceJournal(db),
    readiness: buildReadinessChecklist(db, { backupInfo, integrity, logInfo, dataFile, license })
  };
}

function buildSecurityAccessDiagnostic(db, sessionStore = new Map(), req = null) {
  const settings = db.settings || {};
  const license = normalizeLicense(settings.license || {});
  const devices = activeDevices(db);
  const users = Array.isArray(db.users) ? db.users : [];
  const devicesById = new Map((db.devices || []).map((device) => [String(device.id || ""), device]));
  const currentSessionId = req ? publicSessionId(sessionTokenFromRequest(req)) : "";
  const sessionsList = Array.from(sessionStore?.entries?.() || []).map(([token, session]) => {
    const sessionId = publicSessionId(token);
    const user = users.find((item) => String(item.id) === String(session.userId));
    const device = devicesById.get(String(session.deviceId || ""));
    return {
      id: sessionId,
      isCurrent: Boolean(currentSessionId && sessionId === currentSessionId),
      canRevoke: Boolean(!currentSessionId || sessionId !== currentSessionId),
      userId: session.userId || null,
      userName: user?.name || user?.username || "utilizator",
      username: user?.username || "",
      deviceName: device?.name || "Stație necunoscută",
      deviceId: shortId(session.deviceId || device?.id || ""),
      ip: maskIp(device?.lastIp || ""),
      startedAt: session.createdAt || (session.loginAt ? new Date(session.loginAt).toISOString() : ""),
      lastSeenAt: device?.lastSeenAt || "",
    };
  }).sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));

  const networkMode = normalizeNetworkAccessMode(settings.networkAccessMode);
  const sessionIdleTimeoutMinutes = normalizeSessionIdleMinutes(settings.session_idle_timeout_min ?? settings.sessionIdleTimeoutMinutes, 480);
  const sessionAbsoluteTimeoutHours = normalizeSessionAbsoluteHours(settings.session_absolute_timeout_hours ?? settings.sessionAbsoluteTimeoutHours, 24);
  const passwordPolicy = passwordPolicyFromSettings(settings);
  const passwordPolicyStrong = passwordPolicy.minLength >= 10
    && passwordPolicy.requireUppercase
    && passwordPolicy.requireLowercase
    && passwordPolicy.requireNumber
    && passwordPolicy.disallowUsername;
  const sqlServerMode = DB_MODE === "mssql" || DB_MODE === "sqlserver";
  const appUrls = networkUrls();
  const tunnelUrl = String(settings.publicUrl || settings.public_url || settings.cloudflareTunnelUrl || settings.cloudflare_tunnel_url || "").trim();
  const remoteRecommended = networkMode === "open"
    ? "Pentru acces extern comercial, folosește Cloudflare Tunnel sau VPN și păstrează SQL Server nepublicat."
    : "Accesul API este limitat la localhost/rețea privată/VPN; pentru exterior folosește un tunnel HTTPS controlat.";
  const warnings = [];
  if (networkMode === "open") warnings.push("Acces API permis din afara rețelei private. Folosește doar dacă există protecție HTTPS/VPN/tunnel.");
  if (!tunnelUrl) warnings.push("Nu este notat un URL public/tunnel în profilul organizației; pentru suport și audit va fi util să îl configurăm ulterior.");
  if ((db.devices || []).length > devices.length) warnings.push("Există stații dezactivate/arhivate în registru. Verifică periodic lista de dispozitive.");
  if (license.status !== "active") warnings.push("Licența nu este semnată activ pentru client; pentru producție folosește licență comercială semnată.");
  if (!passwordPolicyStrong) warnings.push("Politica de parole este permisivă. Pentru date sensibile recomandăm minimum 10 caractere, litere mari/mici și cifre.");

  const score = Math.max(45, 100
    - (networkMode === "open" ? 25 : 0)
    - (!tunnelUrl ? 5 : 0)
    - (license.status !== "active" ? 10 : 0)
    - (sessionsList.length > Number(license.maxUsers || 1) ? 10 : 0)
    - (!passwordPolicyStrong ? 8 : 0));
  const verdictStatus = networkMode === "open" ? "attention" : warnings.length ? "good_with_notes" : "protected";

  return {
    generatedAt: new Date().toISOString(),
    verdict: {
      status: verdictStatus,
      score,
      title: verdictStatus === "protected" ? "Protejat" : verdictStatus === "attention" ? "Necesită atenție" : "Protejat, cu observații",
      summary: networkMode === "open"
        ? "Aplicația permite acces API și din afara rețelei private. Verifică expunerea și folosește tunnel/VPN."
        : "Aplicația limitează accesul API la localhost, rețea privată sau VPN. Baza de date rămâne în spatele serverului.",
    },
    access: {
      networkAccessMode: networkMode,
      currentRequestIp: req ? maskIp(clientIp(req)) : "",
      localOnly: networkMode !== "open",
      appUrls,
      tunnelUrl,
      recommendation: remoteRecommended,
    },
    database: {
      mode: DB_MODE,
      sqlServerEnabled: sqlServerMode,
      sqlServerDatabase: sqlServerMode ? mssqlDatabaseName() : "",
      relationalMode: sqlServerMode && MSSQL_RELATIONAL_MODE,
      browserDirectAccess: false,
      publicExposureKnown: false,
      safetyNote: "InfraFlow accesează baza de date server-side. Clientul web/Electron nu primește connection string sau parolă SQL.",
    },
    sessions: {
      active: sessionsList.length,
      maxUsers: license.maxUsers,
      currentSessionId,
      policy: {
        idleTimeoutMinutes: sessionIdleTimeoutMinutes,
        absoluteTimeoutHours: sessionAbsoluteTimeoutHours,
        description: `Sesiunile expiră după ${sessionIdleTimeoutMinutes} minute de inactivitate sau după ${sessionAbsoluteTimeoutHours} ore de la autentificare.`,
      },
      recent: sessionsList.slice(0, 12),
    },
    passwordPolicy: {
      ...passwordPolicy,
      strong: passwordPolicyStrong,
      description: [
        `Minimum ${passwordPolicy.minLength} caractere`,
        passwordPolicy.requireUppercase ? "literă mare" : "",
        passwordPolicy.requireLowercase ? "literă mică" : "",
        passwordPolicy.requireNumber ? "cifră" : "",
        passwordPolicy.requireSymbol ? "simbol" : "",
        passwordPolicy.disallowUsername ? "fără username în parolă" : "",
      ].filter(Boolean).join(" · "),
    },
    devices: {
      active: devices.length,
      registered: (db.devices || []).length,
      maxDevices: license.maxDevices,
      recent: devices
        .slice()
        .sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")))
        .slice(0, 8)
        .map((device) => ({
          id: shortId(device.id || ""),
          name: device.name || "Stație de lucru",
          lastSeenAt: device.lastSeenAt || "",
          lastUserName: device.lastUserName || device.lastUsername || "",
          ip: maskIp(device.lastIp || ""),
        })),
    },
    checklist: [
      {
        status: networkMode === "open" ? "warn" : "ok",
        title: "Acces aplicație",
        detail: networkMode === "open" ? "Permis și din exterior; verifică tunnel/VPN/HTTPS." : "Limitat la localhost/rețea privată/VPN.",
      },
      {
        status: "ok",
        title: "Bază de date",
        detail: "Accesată doar de server; nu trimitem connection string către client.",
      },
      {
        status: sessionsList.length <= Number(license.maxUsers || 1) ? "ok" : "warn",
        title: "Sesiuni active",
        detail: `${sessionsList.length} sesiuni active / limită licență ${license.maxUsers || 1}.`,
      },
      {
        status: "ok",
        title: "Expirare sesiuni",
        detail: `${sessionIdleTimeoutMinutes} minute inactivitate / ${sessionAbsoluteTimeoutHours} ore durată maximă.`,
      },
      {
        status: passwordPolicyStrong ? "ok" : "warn",
        title: "Politică parole",
        detail: `${passwordPolicy.minLength}+ caractere${passwordPolicy.requireNumber ? ", cifră" : ""}${passwordPolicy.requireUppercase ? ", literă mare" : ""}${passwordPolicy.disallowUsername ? ", fără username" : ""}.`,
      },
      {
        status: devices.length <= Number(license.maxDevices || 1) ? "ok" : "warn",
        title: "Stații autorizate",
        detail: `${devices.length} stații active / limită licență ${license.maxDevices || 1}.`,
      },
      {
        status: tunnelUrl ? "ok" : "info",
        title: "Acces remote",
        detail: tunnelUrl ? `URL/tunnel notat: ${tunnelUrl}` : "Recomandare: Cloudflare Tunnel sau VPN, fără SQL public.",
      },
    ],
    warnings,
    nextSteps: [
      "Nu expune portul SQL Server la internet; doar serverul InfraFlow trebuie să vorbească cu baza.",
      "Pentru acces de la distanță, folosește HTTPS prin Cloudflare Tunnel sau VPN.",
      "Revizuiește periodic stațiile autorizate și închide sesiunile vechi când un dispozitiv pleacă din firmă.",
      "Pas ulterior: 2FA pentru rolurile sensibile și jurnal de autentificări eșuate.",
    ],
  };
}

function buildReadinessChecklist(db, context = {}) {
  const backupInfo = context.backupInfo || latestBackupInfo();
  const integrity = context.integrity || integrityStatus();
  const logInfo = context.logInfo || readRecentLogs();
  const sqlServerMode = DB_MODE === "mssql" || DB_MODE === "sqlserver";
  const dataFile = context.dataFile || (DB_MODE === "postgres" || sqlServerMode ? null : fileInfo(DB_FILE));
  const license = context.license || normalizeLicense(db.settings?.license || {});
  const activeUsers = (db.users || []).filter((user) => user.active !== false);
  const devices = activeDevices(db);
  const latestBackupAgeHours = backupInfo.latest?.modifiedAt
    ? (Date.now() - new Date(backupInfo.latest.modifiedAt).getTime()) / 36e5
    : null;
  const items = [];
  const add = (status, title, detail) => items.push({ status, title, detail });

  add(db.settings?.setupCompleted === true ? "ok" : "bad", "Configurare initiala", db.settings?.setupCompleted === true ? "Finalizata." : "Instalarea nu este configurata complet.");
  add(activeUsers.some((user) => user.role === "superadmin") ? "ok" : "bad", "Superadmin activ", activeUsers.some((user) => user.role === "superadmin") ? "Exista cel putin un Superadmin activ." : "Lipseste un Superadmin activ.");
  add(["active", "internal"].includes(license.status) ? (license.status === "internal" ? "warn" : "ok") : "bad", "Licenta", license.status === "active" ? "Licenta este activa." : license.status === "internal" ? "Licenta interna/trial local. Pentru client foloseste licenta semnata." : "Licenta expirata sau invalida.");
  add(activeUsers.length <= Number(license.maxUsers || 1) ? "ok" : "bad", "Limita utilizatori", `${activeUsers.length} utilizatori activi / limita ${license.maxUsers || 1}.`);
  add(devices.length <= Number(license.maxDevices || 1) ? "ok" : "bad", "Limita dispozitive", `${devices.length} statii autorizate / limita ${license.maxDevices || 1}.`);
  add(db.settings?.networkAccessMode === "open" ? "warn" : "ok", "Acces retea", db.settings?.networkAccessMode === "open" ? "Acces API permis si din afara retelei private. Foloseste doar temporar." : "Acces API limitat la localhost/retea privata/VPN.");
  add(DB_MODE === "postgres" || sqlServerMode || dataFile?.exists ? "ok" : "bad", "Baza de date", DB_MODE === "postgres" ? "Ruleaza in modul PostgreSQL." : sqlServerMode ? `Ruleaza in modul SQL Server (${mssqlDatabaseName()}).` : dataFile?.exists ? `Fisier JSON gasit: ${formatBytesServer(dataFile.size)}.` : "Fisierul bazei JSON lipseste.");
  add(backupInfo.latest ? (latestBackupAgeHours <= 48 ? "ok" : latestBackupAgeHours <= 168 ? "warn" : "bad") : "bad", "Backup recent", backupInfo.latest ? `Ultimul backup: ${backupInfo.latest.name}, acum ${formatAgeHours(latestBackupAgeHours)}.` : "Nu exista backup pe server.");
  add(integrity.manifestExists ? (integrity.valid === false ? "bad" : "ok") : "warn", "Integritate pachet", integrity.manifestExists ? (integrity.valid === false ? "Manifest invalid." : "Manifest gasit si verificarea nu raporteaza erori.") : "Nu exista manifest semnat in aceasta instalare.");
  add(logInfo.errors?.tail?.trim() ? "warn" : "ok", "Log erori", logInfo.errors?.tail?.trim() ? "Exista erori recente in log. Verifica sectiunea Log erori recente." : "Nu exista erori recente in log.");
  add((db.materials || []).length > 0 && (db.recipes || []).length > 0 ? "ok" : "warn", "Date de lucru", `${(db.materials || []).length} materiale si ${(db.recipes || []).length} retete.`);

  const overall = items.some((item) => item.status === "bad") ? "bad" : items.some((item) => item.status === "warn") ? "warn" : "ok";
  return { overall, items };
}

function buildSupportDiagnostic(db) {
  const diagnostic = buildSystemDiagnostics(db);
  return {
    format: "asfalt-pro-support-diagnostic-v1",
    generatedAt: new Date().toISOString(),
    note: "Fisier pentru suport tehnic. Nu contine parole sau cheia privata de licentiere.",
    diagnostic
  };
}

function buildRecipesMaterialsConfig(db) {
  return {
    format: "asfalt-pro-recipes-materials-v1",
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    stockIncluded: false,
    materials: (db.materials || []).map((material) => ({
      id: material.id,
      name: material.name,
      unit: material.unit,
      alert: Number(material.alert || 0),
      recipeMaterial: material.recipeMaterial !== false
    })),
    recipes: (db.recipes || []).map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      version: Number(recipe.version || 1),
      active: recipe.active !== false,
      percentages: recipe.percentages || {}
    }))
  };
}

function importRecipesMaterialsConfig(db, user, input) {
  if (!input || typeof input !== "object") throwHttp(400, "Configuratie invalida.");
  if (!Array.isArray(input.materials) || !Array.isArray(input.recipes)) {
    throwHttp(400, "Configuratia trebuie sa contina listele materials si recipes.");
  }
  const materials = input.materials.map(normalizeConfigMaterial);
  const materialIds = new Set();
  materials.forEach((material) => {
    if (materialIds.has(material.id)) throwHttp(400, `Material duplicat in configuratie: ${material.id}.`);
    materialIds.add(material.id);
  });
  const existingById = new Map((db.materials || []).map((material) => [material.id, material]));
  const importedMaterialIds = new Set(materials.map((material) => material.id));
  db.materials = materials.map((material) => ({
    ...material,
    stock: Number(existingById.get(material.id)?.stock || 0)
  })).concat((db.materials || []).filter((material) => !importedMaterialIds.has(material.id)));

  const recipes = input.recipes.map((recipe) => normalizeConfigRecipe(db, recipe));
  const recipeIds = new Set();
  recipes.forEach((recipe) => {
    if (recipeIds.has(recipe.id)) throwHttp(400, `Reteta duplicata in configuratie: ${recipe.id}.`);
    recipeIds.add(recipe.id);
  });
  if (!recipes.some((recipe) => recipe.active !== false)) throwHttp(400, "Configuratia trebuie sa contina cel putin o reteta activa.");
  const importedRecipeIds = new Set(recipes.map((recipe) => recipe.id));
  db.recipes = recipes.map((recipe) => {
    const existing = (db.recipes || []).find((item) => item.id === recipe.id);
    return {
      ...existing,
      ...recipe,
      updatedBy: user.id,
      updatedAt: new Date().toISOString()
    };
  }).concat((db.recipes || [])
    .filter((recipe) => !importedRecipeIds.has(recipe.id))
    .map((recipe) => ({ ...recipe, active: false, archivedBy: user.id, archivedAt: new Date().toISOString() })));
  return { materials: db.materials.length, recipes: db.recipes.length };
}

function normalizeConfigMaterial(input) {
  const idValue = String(input.id || "").trim();
  const idValueSafe = idValue || slugId(input.name || "material");
  if (!/^[a-z0-9._-]{2,64}$/.test(idValueSafe)) throwHttp(400, `ID material invalid: ${idValueSafe}.`);
  const name = String(input.name || "").trim();
  const unit = String(input.unit || "t").trim();
  if (!name) throwHttp(400, "Un material nu are nume.");
  if (!unit) throwHttp(400, `Materialul ${name} nu are unitate.`);
  return {
    id: idValueSafe,
    name,
    unit,
    alert: round(Number(input.alert || 0)),
    recipeMaterial: input.recipeMaterial !== false
  };
}

function normalizeConfigRecipe(db, input) {
  const idValue = String(input.id || "").trim();
  const idValueSafe = idValue || slugId(input.name || "reteta");
  if (!/^[a-z0-9._-]{2,64}$/.test(idValueSafe)) throwHttp(400, `ID reteta invalid: ${idValueSafe}.`);
  const name = String(input.name || "").trim();
  if (!name) throwHttp(400, "O reteta nu are nume.");
  return {
    id: idValueSafe,
    name,
    version: Math.max(1, Number(input.version || 1)),
    active: input.active !== false,
    percentages: normalizeRecipePercentages(db, input.percentages || {})
  };
}

function slugId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || id("item");
}

function formatBytesServer(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatAgeHours(hoursValue) {
  const hours = Math.max(0, Number(hoursValue || 0));
  if (hours < 1) return "sub 1 ora";
  if (hours < 48) return `${Math.round(hours)} ore`;
  return `${Math.round(hours / 24)} zile`;
}

function buildMaintenanceJournal(db) {
  const labels = {
    backup_creat: "Backup creat",
    restore_date: "Restaurare fisier",
    restore_backup_server: "Restaurare server",
    update_aplicatie_instalat: "Update instalat",
    restart_aplicatie_programat: "Restart programat",
    licenta_importata: "Licenta importata",
    config_retete_materiale_importata: "Config importata",
    dispozitiv_autorizat: "Statie autorizata",
    dispozitiv_eliminat: "Statie eliminata",
    setup_initial_finalizat: "Setup initial",
    setari_modificate: "Setari modificate",
    audit_curatat: "Audit curatat"
  };
  const actions = new Set(Object.keys(labels));
  return (db.audit || [])
    .filter((item) => actions.has(item.action))
    .slice()
    .reverse()
    .slice(0, 30)
    .map((item) => ({
      id: item.id,
      at: item.at,
      type: item.action,
      label: labels[item.action] || item.action,
      userName: item.userName || "-",
      details: item.details || ""
    }));
}

function latestBackupInfo() {
  const dir = path.join(ROOT, "backups");
  if (!fs.existsSync(dir)) {
    return { directory: dir, exists: false, count: 0, latest: null, items: [] };
  }
  const backups = listBackupFiles()
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return {
    directory: dir,
    exists: true,
    count: backups.length,
    latest: backups[0] || null,
    items: backups.slice(0, 20)
  };
}

function installUpdatePackage(db, user, archiveBuffer, options = {}) {
  if (!Buffer.isBuffer(archiveBuffer) || archiveBuffer.length < 128) throwHttp(400, "Pachetul de update este gol sau invalid.");
  const fileName = safeDisplayFileName(options.fileName || "update.zip");
  if (!fileName.toLowerCase().endsWith(".zip")) throwHttp(400, "Incarca un pachet ZIP.");
  const updateRoot = path.join(ROOT, "runtime", "remote-updates");
  fs.mkdirSync(updateRoot, { recursive: true });
  const timestamp = backupTimestamp(new Date());
  const workDir = path.join(updateRoot, `update-${timestamp}-${crypto.randomBytes(4).toString("hex")}`);
  const zipPath = path.join(workDir, fileName);
  const extractDir = path.join(workDir, "extracted");
  fs.mkdirSync(workDir, { recursive: true });
  try {
    fs.writeFileSync(zipPath, archiveBuffer);
    expandZipArchive(zipPath, extractDir);
    const packageRoot = findExtractedPackageRoot(extractDir);
    const { payload } = verifyReleaseManifest(packageRoot);
    validateUpdatePackageRoot(packageRoot, payload);
    const currentVersion = readPackageVersion();
    const packageVersion = readPackageVersionFrom(packageRoot);
    if (compareVersions(packageVersion, currentVersion) <= 0) {
      throwHttp(400, `Pachetul are versiunea ${packageVersion}, iar aplicatia curenta este ${currentVersion}. Incarca o versiune mai noua.`);
    }
    const dataBackup = createServerBackup(db, user, `Backup automat inainte de update ${currentVersion} -> ${packageVersion}`);
    const filesBackup = backupApplicationFiles([...payload.files, { path: "release-manifest.json" }], timestamp);
    installManifestFiles(packageRoot, payload.files);
    fs.copyFileSync(path.join(packageRoot, "release-manifest.json"), RELEASE_MANIFEST_FILE);
    addAudit(db, user, "update_aplicatie_instalat", `Update ${currentVersion} -> ${packageVersion}. Pachet: ${fileName}. Backup date: ${dataBackup?.name || "-"}. Backup fisiere: ${path.basename(filesBackup)}`);
    return {
      ok: true,
      currentVersion,
      installedVersion: packageVersion,
      cacheVersion: readCacheVersionFromPackage(packageRoot),
      backup: dataBackup,
      filesBackup,
      checkedFiles: payload.files.length,
      restartRequired: true,
      message: "Update instalat. Apasa Restart aplicatie pentru incarcarea versiunii noi."
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function verificaUpdateDisponibil(licenta) {
  const versiuneCurenta = readPackageVersion()
  try {
    const url = 'https://updates.infraflow.ro/api/check' +
      '?versiune=' + versiuneCurenta +
      '&licenta=' + (licenta?.licenseId || 'DEMO')
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const info = await res.json()
    return {
      disponibil: info.versiune_noua !== versiuneCurenta,
      versiune_curenta: versiuneCurenta,
      versiune_noua: info.versiune_noua || versiuneCurenta,
      changelog: info.changelog || '',
      obligatoriu: info.obligatoriu || false
    }
  } catch {
    return {
      disponibil: false,
      versiune_curenta: versiuneCurenta,
      eroare: 'Server update indisponibil'
    }
  }
}

async function instaleazaUpdateOnline(db, user, licenta, versiune) {
  if (!licenta?.update?.permise) throwHttp(402, 'Update-uri neincluse în licență.')
  if (licenta.update.expira_la && new Date() > new Date(licenta.update.expira_la)) {
    throwHttp(402, 'Abonament update expirat.')
  }
  const targetVersion = versiune || (await verificaUpdateDisponibil(licenta)).versiune_noua
  if (!targetVersion) throwHttp(400, 'Versiune update lipsă.')
  const currentVersion = readPackageVersion()
  createServerBackup(db, user, `Backup automat înainte de update online ${currentVersion} -> ${targetVersion}`)
  const url = 'https://updates.infraflow.ro/api/download/' + encodeURIComponent(targetVersion) +
    '?licenta=' + encodeURIComponent(licenta?.licenseId || 'DEMO')
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throwHttp(502, 'Nu am putut descărca pachetul de update.')
  const archiveBuffer = Buffer.from(await response.arrayBuffer())
  const result = installUpdatePackage(db, user, archiveBuffer, {
    fileName: `infraflow-${targetVersion}.zip`
  })
  scheduleApplicationRestart()
  return { ok: true, versiune: targetVersion, result }
}

function expandZipArchive(zipPath, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });
  const script = `Expand-Archive -LiteralPath ${powershellSingleQuote(zipPath)} -DestinationPath ${powershellSingleQuote(destinationDir)} -Force`;
  childProcess.execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000
  });
}

function findExtractedPackageRoot(extractDir) {
  const candidates = [extractDir]
    .concat(fs.readdirSync(extractDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(extractDir, entry.name)));
  const found = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "server", "server.js"))
    && fs.existsSync(path.join(candidate, "public", "index.html"))
    && fs.existsSync(path.join(candidate, "release-manifest.json"))
  );
  if (!found) throwHttp(400, "Pachetul ZIP nu contine o aplicatie InfraFlow valida.");
  return found;
}

function validateUpdatePackageRoot(packageRoot, payload) {
  const blocked = [
    "data/app-db.json",
    "license-tools",
    "release-tools",
    "backups",
    "logs"
  ];
  const manifestPaths = new Set((payload.files || []).map((item) => String(item.path || "").replace(/\\/g, "/")));
  blocked.forEach((entry) => {
    if (manifestPaths.has(entry) || fs.existsSync(path.join(packageRoot, entry))) {
      throwHttp(400, `Pachetul contine element interzis pentru update: ${entry}`);
    }
  });
  ["server/server.js", "public/index.html", "package.json", "release-manifest.json"].forEach((entry) => {
    if (!fs.existsSync(path.join(packageRoot, entry))) throwHttp(400, `Pachet incomplet. Lipseste: ${entry}`);
  });
}

function readPackageVersionFrom(packageRoot) {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version || "0.0.0");
  } catch {
    throwHttp(400, "Nu pot citi versiunea din package.json.");
  }
}

function readCacheVersionFromPackage(packageRoot) {
  const serverFile = path.join(packageRoot, "server", "server.js");
  if (!fs.existsSync(serverFile)) return "";
  const match = fs.readFileSync(serverFile, "utf8").match(/CLIENT_CACHE_VERSION\s*=\s*"([^"]+)"/);
  return match ? match[1] : "";
}

function backupApplicationFiles(files, timestamp) {
  const backupDir = path.join(ROOT, "backups", `app-files-before-update-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  files.forEach((item) => {
    const relativePath = String(item.path || "").replace(/\\/g, "/");
    if (!isSafeRelativePath(relativePath)) return;
    const source = path.join(ROOT, relativePath);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
    const destination = path.join(backupDir, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  });
  return backupDir;
}

function installManifestFiles(packageRoot, files) {
  files.forEach((item) => {
    const relativePath = String(item.path || "").replace(/\\/g, "/");
    if (!isSafeRelativePath(relativePath)) throwHttp(400, `Cale invalida in pachet: ${relativePath}`);
    if (relativePath === "data/app-db.json") throwHttp(400, "Pachetul nu are voie sa contina baza clientului.");
    const source = path.join(packageRoot, relativePath);
    const destination = path.join(ROOT, relativePath);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throwHttp(400, `Fisier lipsa la instalare: ${relativePath}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  });
}

function scheduleApplicationRestart() {
  const port = Number(process.env.INFRAFLOW_PORT || process.env.PORT || PORT || 4180);
  const timestamp = Date.now();
  const taskName = `InfraFlow ERP Restart ${timestamp}`;
  const scriptPath = path.join(ROOT, "runtime", `restart-${timestamp}.ps1`);
  const launcherPath = path.join(ROOT, "runtime", `restart-launcher-${timestamp}.ps1`);
  const logPath = path.join(ROOT, "runtime", "restart-last.log");
  const startScriptPath = path.join(ROOT, "scripts", "windows", "start-infraflow.ps1");
  const startBatPath = path.join(ROOT, "start-server.bat");
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });

  const script = `
$ErrorActionPreference = "Stop"
$logPath = ${powershellSingleQuote(logPath)}
$rootPath = ${powershellSingleQuote(ROOT)}
$startBatPath = ${powershellSingleQuote(startBatPath)}
$startScriptPath = ${powershellSingleQuote(startScriptPath)}
$port = ${port}
function Write-RestartLog([string]$Message) {
  "[$(Get-Date -Format o)] $Message" | Add-Content -LiteralPath $logPath -Encoding UTF8
}
function Wait-InfraFlowHealth {
  for ($i = 1; $i -le 30; $i++) {
    try {
      Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2 | Out-Null
      Write-RestartLog "Health OK pe portul $port dupa $i incercari."
      return
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  Write-RestartLog "AVERTISMENT: serverul nu a raspuns la /api/health dupa restart."
}
try {
  "[$(Get-Date -Format o)] Restart helper pornit." | Set-Content -LiteralPath $logPath -Encoding UTF8
  Start-Sleep -Seconds 3

  $service = Get-Service -Name "InfraFlow" -ErrorAction SilentlyContinue
  if ($service) {
    Write-RestartLog "Restart serviciu InfraFlow."
    Restart-Service -Name "InfraFlow" -Force -ErrorAction Stop
  } else {
    $task = Get-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
    if ($task) {
      Write-RestartLog "Restart task InfraFlow ERP."
      Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
      Stop-Process -Id ${process.pid} -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
      Start-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction Stop
    } else {
      Write-RestartLog "Restart fallback proces direct."
      Stop-Process -Id ${process.pid} -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
      if (Test-Path -LiteralPath $startBatPath) {
        Write-RestartLog "Pornesc start-server.bat pentru pastrarea configuratiei runtime."
        Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $startBatPath) -WorkingDirectory $rootPath -WindowStyle Hidden
      } elseif (Test-Path -LiteralPath $startScriptPath) {
        Write-RestartLog "Pornesc scripts/windows/start-infraflow.ps1."
        Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $startScriptPath, "-Port", "$port") -WorkingDirectory $rootPath -WindowStyle Hidden
      } else {
        throw "Nu exista nici start-server.bat, nici scripts/windows/start-infraflow.ps1."
      }
    }
  }
  Write-RestartLog "Comanda de restart executata."
  Wait-InfraFlowHealth
} catch {
  Write-RestartLog "EROARE: $($_.Exception.Message)"
} finally {
  Start-Sleep -Seconds 2
  Unregister-ScheduledTask -TaskName ${powershellSingleQuote(taskName)} -Confirm:$false -ErrorAction SilentlyContinue
}
`;
  fs.writeFileSync(scriptPath, script, "utf8");

  const launcher = `
$ErrorActionPreference = "Stop"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ${powershellSingleQuote(`-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`)}
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName ${powershellSingleQuote(taskName)} -Action $action -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName ${powershellSingleQuote(taskName)}
`;
  fs.writeFileSync(launcherPath, launcher, "utf8");

  console.log(`[UPDATE] Restart programat prin task Windows independent: ${taskName}`);
  if (String(process.env.INFRAFLOW_RESTART_DRY_RUN || "") === "1") {
    return { taskName, scriptPath, launcherPath, logPath, dryRun: true };
  }
  try {
    childProcess.execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", launcherPath], {
      cwd: ROOT,
      stdio: "ignore",
      windowsHide: true
    });
  } catch (error) {
    console.error(`[UPDATE] Task restart indisponibil, folosesc fallback direct: ${error.message}`);
    const child = childProcess.spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      cwd: ROOT,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
  }
  return { taskName, scriptPath, launcherPath, logPath, dryRun: false };
}

function compareVersions(a, b) {
  const left = String(a || "0").split(".").map((part) => Number(part) || 0);
  const right = String(b || "0").split(".").map((part) => Number(part) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

function isSafeRelativePath(relativePath) {
  return Boolean(relativePath)
    && !relativePath.includes("..")
    && !path.isAbsolute(relativePath)
    && !relativePath.split("/").some((part) => !part || part === "." || part === "..");
}

function powershellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function safeDisplayFileName(value) {
  return path.basename(String(value || "update.zip")).replace(/[^a-zA-Z0-9._ -]/g, "_") || "update.zip";
}

function listBackupFiles() {
  return backupDirectories()
    .flatMap((dir) => fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => backupFileInfo(name, dir)) : [])
    .filter(Boolean);
}

function backupFileInfo(name, preferredDir = "") {
  const safeName = String(name || "");
  if (!/^(infraflow|asfalt-pro)-backup-\d{8}-\d{6}\.(json|bak)$/.test(safeName)) return null;
  const dir = preferredDir || backupDirectories().find((candidate) => fs.existsSync(path.join(candidate, safeName)));
  if (!dir) return null;
  const filePath = path.join(dir, safeName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  const stat = fs.statSync(filePath);
  return { name: safeName, path: filePath, size: stat.size, modifiedAt: stat.mtime.toISOString() };
}

function createServerBackup(db, user, details) {
  if (["mssql", "sqlserver"].includes(DB_MODE)) return createMssqlServerBackup(db, user, details);
  fs.mkdirSync(path.join(ROOT, "backups"), { recursive: true });
  addAudit(db, user, "backup_creat", details || "Backup creat manual");
  writeDb(db);
  let createdAt = new Date();
  let name = `infraflow-backup-${backupTimestamp(createdAt)}.json`;
  let filePath = path.join(ROOT, "backups", name);
  while (fs.existsSync(filePath)) {
    createdAt = new Date(createdAt.getTime() + 1000);
    name = `infraflow-backup-${backupTimestamp(createdAt)}.json`;
    filePath = path.join(ROOT, "backups", name);
  }
  const payload = { ...db, backupCreatedAt: new Date().toISOString() };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  const meta = {
    createdAt: payload.backupCreatedAt,
    source: DB_MODE,
    backupFile: filePath,
    createdBy: user?.username || user?.name || ""
  };
  fs.writeFileSync(`${filePath}.meta.json`, JSON.stringify(meta, null, 2));
  return backupFileInfo(name);
}

function createMssqlServerBackup(db, user, details) {
  const dir = process.env.MSSQL_BACKUP_DIR || "C:\\InfraFlow\\backups";
  fs.mkdirSync(dir, { recursive: true });
  addAudit(db, user, "backup_creat", details || "Backup MSSQL creat manual");
  writeDb(db);
  const name = `infraflow-backup-${backupTimestamp(new Date())}.bak`;
  const filePath = path.join(dir, name);
  const database = coreDb.mssqlDatabaseName();
  coreDb.runMssqlScalar(`
    backup database [${String(database).replace(/]/g, "]]")}] to disk = N'${String(filePath).replace(/'/g, "''")}' with init, checksum;
    select 1;
  `, { timeoutMs: 300000 });
  listBackupFiles()
    .filter((item) => item.name.endsWith(".bak"))
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
    .slice(7)
    .forEach((item) => fs.rmSync(item.path, { force: true }));
  return backupFileInfo(name, dir);
}

function restoreMssqlServerBackup(backup, db, user) {
  if (!["mssql", "sqlserver"].includes(DB_MODE)) {
    throw httpError(400, "Restaurarea .bak este disponibila numai in modul MSSQL.");
  }
  if (!backup || !String(backup.name || "").endsWith(".bak")) {
    throw httpError(400, "Selectati un backup MSSQL valid, cu extensia .bak.");
  }
  const safetyBackup = createMssqlServerBackup(db, user, `Backup automat inainte de restaurare MSSQL: ${backup.name}`);
  const database = coreDb.mssqlDatabaseName();
  const quotedDatabase = `[${String(database).replace(/]/g, "]]")}]`;
  const escapedPath = String(backup.path).replace(/'/g, "''");
  coreDb.runMssqlScalar(`
    use [master];
    alter database ${quotedDatabase} set single_user with rollback immediate;
    begin try
      restore database ${quotedDatabase} from disk = N'${escapedPath}' with replace, recovery;
      alter database ${quotedDatabase} set multi_user;
      select 1;
    end try
    begin catch
      if db_id(N'${String(database).replace(/'/g, "''")}') is not null
        alter database ${quotedDatabase} set multi_user;
      raiserror(N'Restaurarea bazei INFRAFLOW a esuat.', 16, 1);
    end catch;
  `, {
    connectionString: coreDb.mssqlConnectionString("master"),
    timeoutMs: 600000
  });
  return { restoredFrom: backup.name, safetyBackup };
}

function backupDirectories() {
  return [...new Set([path.join(ROOT, "backups"), process.env.MSSQL_BACKUP_DIR || "C:\\InfraFlow\\backups"])];
}

function readRecentLogs() {
  const logsDir = path.join(ROOT, "logs");
  const outFile = path.join(logsDir, "infraflow.out.log");
  const errFile = path.join(logsDir, "infraflow.err.log");
  return {
    directory: logsDir,
    output: logFileInfo(outFile),
    errors: logFileInfo(errFile)
  };
}

function logFileInfo(filePath) {
  if (!fs.existsSync(filePath)) return { path: filePath, exists: false, size: 0, tail: "" };
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    exists: true,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    tail: tailText(filePath, 6000)
  };
}

function tailText(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function integrityStatus() {
  const status = {
    verifyEnabled: String(process.env.VERIFY_APP_INTEGRITY || "") === "1",
    manifestPath: RELEASE_MANIFEST_FILE,
    manifestExists: fs.existsSync(RELEASE_MANIFEST_FILE),
    valid: null,
    checkedFiles: 0,
    error: ""
  };
  if (!status.manifestExists) return status;
  try {
    const document = JSON.parse(fs.readFileSync(RELEASE_MANIFEST_FILE, "utf8"));
    const payload = verifyReleaseManifestDocument(document);
    status.checkedFiles = payload.files.length;
    payload.files.forEach((item) => verifyManifestFile(item));
    status.valid = true;
  } catch (error) {
    status.valid = false;
    status.error = error.message;
  }
  return status;
}

function fileInfo(filePath) {
  if (!fs.existsSync(filePath)) return { path: filePath, exists: false, size: 0 };
  const stat = fs.statSync(filePath);
  return { path: filePath, exists: true, size: stat.size, modifiedAt: stat.mtime.toISOString() };
}

function findCommand(command) {
  try {
    childProcess.execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function networkUrls() {
  const urls = [`http://localhost:${PORT}`];
  Object.values(os.networkInterfaces()).flat().forEach((address) => {
    if (!address || address.family !== "IPv4" || address.internal) return;
    urls.push(`http://${address.address}:${PORT}`);
  });
  return [...new Set(urls)];
}

function readPackageVersion() {
  const candidates = [
    path.join(ROOT, "version.json"),
    path.join(ROOT, "package.json"),
    path.join(ROOT, "server", "package.json")
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const pkg = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (String(pkg.version || "").trim()) return String(pkg.version).trim();
    } catch {
      // Continua cu urmatorul fisier.
    }
  }
  return "0.0.0";
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

function requiresInitialSetup(db) {
  return db?.settings?.setupCompleted === false;
}

function completeInitialSetup(db, body) {
  const companyName = String(body.companyName || "").trim();
  const stationName = String(body.stationName || "").trim();
  const location = String(body.location || "").trim();
  const adminName = String(body.adminName || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  if (!companyName) throwHttp(400, "Numele firmei este obligatoriu.");
  if (!stationName) throwHttp(400, "Numele punctului de lucru este obligatoriu.");
  if (!adminName) throwHttp(400, "Numele Superadminului este obligatoriu.");
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throwHttp(400, "Utilizatorul trebuie sa aiba 3-32 caractere: litere, cifre, punct, minus sau underscore.");
  assertPasswordPolicy(password, { username, name }, {});
  if (password !== confirmPassword) throwHttp(400, "Parolele nu coincid.");

  const now = new Date().toISOString();
  const user = {
    id: id("user"),
    name: adminName,
    username,
    passwordHash: hashPassword(password),
    role: "superadmin",
    active: true,
    createdAt: now,
    createdBy: "initial-setup"
  };
  const licenseText = String(body.licenseText || "").trim();
  const trialDays = Math.max(1, Number(body.trialDays || 30));
  const license = licenseText
    ? importSignedLicense(licenseText)
    : normalizeLicense({
      plan: "trial",
      clientName: companyName,
      maxUsers: Math.max(1, Number(body.maxUsers || 50)),
      maxDevices: Math.max(1, Number(body.maxDevices || 50)),
      trialDays,
      trialStartedAt: localDate(new Date()),
      source: "initial-setup"
    });

  db.settings = {
    ...db.settings,
    companyName,
    stationName,
    location,
    appCredit: db.settings.appCredit || "Aplicatie realizata de Constantin Constantin",
    setupCompleted: true,
    setupCompletedAt: now,
    initialStockCompleted: false,
    networkAccessMode: "internal-only",
    scaleDbPath: String(db.settings.scaleDbPath || "").trim(),
    scaleProductMap: normalizeScaleProductMap(db.settings.scaleProductMap || {}),
    nexusDbPath: String(db.settings.nexusDbPath || "").trim(),
    autominderDbPath: String(db.settings.autominderDbPath || "").trim(),
    rolePermissionOverrides: normalizeRolePermissionOverrides(db.settings.rolePermissionOverrides || {}),
    license
  };
  db.users = [user];
  if (!Array.isArray(db.audit)) db.audit = [];
  addAudit(db, user, "setup_initial_finalizat", `${companyName} / ${stationName}`);
  return { db: normalizeDb(db), user };
}

function ensureActiveSuperadmin(db) {
  if (!Array.isArray(db.users) || !db.users.length) return;
  if (db.users.some((user) => user.active !== false && user.role === "superadmin")) return;
  const admin = db.users.find((user) => user.active !== false && user.username === "admin")
    || db.users.find((user) => user.active !== false && user.role === "admin")
    || db.users.find((user) => user.active !== false);
  if (admin) admin.role = "superadmin";
}

function serveStatic(res, requestedPath) {
  const cleanPath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Acces interzis.");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Fisier inexistent.");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function permissionsFor(role, settings = {}) {
  const overrides = normalizeRolePermissionOverrides(settings.rolePermissionOverrides || {});
  const permissions = overrides[role] || rolePermissions[role] || rolePermissions.viewer;
  const expanded = new Set(permissions);
  Object.entries(legacyPermissionAliases).forEach(([legacy, granular]) => {
    if (granular.some((permission) => expanded.has(permission))) {
      expanded.add(legacy);
    }
  });
  return Array.from(expanded);
}

function effectivePermissionsFor(role, settings) {
  return permissionsFor(role, settings).filter((permission) => permissionAllowedByLicense(permission, settings?.license));
}

function effectivePermissionsForUser(user, db) {
  const permissions = effectivePermissionsFor(user.role, db.settings);
  if (user.role === "superadmin" || !user.departmentId) return permissions;
  const department = (db.departments || []).find((item) => item.id === user.departmentId);
  if (!department || !Array.isArray(department.permissions)) return permissions;
  return permissions.filter((permission) => department.permissions.includes(permission));
}

function permissionAllowedByLicense(permission, licenseInput) {
  const license = normalizeLicense(licenseInput || {});
  if (license.status === "internal") return true;
  if (license.status === "expired") return licenseAdminPermissions.has(permission);
  if (licenseAdminPermissions.has(permission) || permission === "users:manage") return true;
  const modules = normalizedLicenseModules(license);
  if (!modules.length || modules.includes("all") || modules.includes("full")) return true;
  const granular = legacyPermissionAliases[permission] || [permission];
  const allowed = new Set();
  modules.forEach((module) => {
    (licenseModulePermissions[module] || []).forEach((item) => allowed.add(item));
  });
  return granular.some((item) => allowed.has(item));
}

function normalizedLicenseModules(license) {
  return Array.isArray(license.modules)
    ? license.modules.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
    : [];
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

function rolePermissionCatalog() {
  return Object.entries(permissionGroups).map(([id, permissions]) => ({
    id,
    label: permissionGroupLabels[id] || id,
    permissions: permissions.map((permission) => ({
      id: permission,
      label: permissionLabels[permission] || permission
    }))
  }));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    departmentId: user.departmentId || ""
  };
}

function adminUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    departmentId: user.departmentId || "",
    active: user.active !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function adminDepartment(dept) {
  return {
    id: dept.id,
    name: dept.name,
    moduleKey: dept.moduleKey || moduleKeyForDepartmentName(dept.name),
    color: dept.color || "",
    permissions: dept.permissions || []
  };
}

function rolesList(settings) {
  const overrides = normalizeRolePermissionOverrides(settings?.rolePermissionOverrides || {});
  return Object.entries(rolePermissions).map(([id, permissions]) => {
    const effective = effectivePermissionsFor(id, settings);
    return {
      id,
      name: roleInfo[id]?.name || id,
      description: roleInfo[id]?.description || "",
      modules: roleModules(id, settings),
      permissions: effective,
      basePermissions: permissions,
      customized: Boolean(overrides[id])
    };
  });
}

function roleModules(role, settings) {
  const permissions = effectivePermissionsFor(role, settings);
  const modules = [];
  if (permissions.includes("settings:manage")) modules.push("licenta/setari");
  if (permissions.includes("system:view")) modules.push("sistem/diagnostic");
  if (permissions.includes("users:manage")) modules.push("utilizatori");
  if (permissions.includes("planning:manage")) modules.push("planificare");
  if (permissions.includes("department_requests:manage")) modules.push("solicitari");
  if (permissions.includes("materials:edit") || permissions.includes("stock_operations:create")) modules.push("gestiune stoc");
  if (permissions.includes("deliveries:create")) modules.push("aprovizionari");
  if (permissions.includes("procurement_orders:create") || permissions.includes("procurement_orders:receive")) modules.push("comenzi aprovizionare");
  if (permissions.includes("mechanization:manage") || permissions.includes("mechanization:request")) modules.push("mecanizare");
  if (permissions.includes("technical:worklog") && !permissions.includes("technical:sales")) modules.push("pontaj utilaj/lucrare");
  if (permissions.includes("technical:sales") || permissions.includes("technical:view")) modules.push("departament tehnic");
  if (permissions.includes("cost_accounting:manage") || permissions.includes("cost_accounting:import")) modules.push("contabilitate costuri");
  if (permissions.includes("consumptions:create")) modules.push("consum asfalt");
  if (permissions.includes("recipes:manage")) modules.push("retete");
  if (permissions.includes("audit:view")) modules.push("audit");
  if (!modules.length) modules.push("citire");
  return modules;
}

function updateRolePermissions(db, user, roleId, body) {
  const role = String(roleId || "").trim();
  if (!rolePermissions[role]) throwHttp(404, "Rol inexistent.");
  if (role === "superadmin") throwHttp(400, "Permisiunile Superadminului nu se modifica.");
  if (!db.settings || typeof db.settings !== "object") db.settings = {};
  db.settings.rolePermissionOverrides = normalizeRolePermissionOverrides(db.settings.rolePermissionOverrides || {});
  if (body.reset === true) {
    delete db.settings.rolePermissionOverrides[role];
  } else {
    db.settings.rolePermissionOverrides[role] = sanitizeRolePermissions(body.permissions);
  }
  db.settings.rolePermissionOverridesUpdatedAt = new Date().toISOString();
  db.settings.rolePermissionOverridesUpdatedBy = user.id;
  db.settings.rolePermissionOverridesUpdatedByName = user.name;
  return rolesList(db.settings).find((item) => item.id === role);
}

function sanitizeRolePermissions(permissions) {
  const allowed = new Set(allPermissions);
  return Array.from(new Set((Array.isArray(permissions) ? permissions : [])
    .map((permission) => String(permission || "").trim())
    .filter((permission) => allowed.has(permission))));
}

function createUser(db, actor, body) {
  const username = String(body.username || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  const role = String(body.role || "viewer");
  if (!name) throwHttp(400, "Numele utilizatorului este obligatoriu.");
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throwHttp(400, "Utilizatorul trebuie sa aiba 3-32 caractere: litere, cifre, punct, minus sau underscore.");
  if (db.users.some((user) => user.username.toLowerCase() === username)) throwHttp(400, "Acest nume de utilizator exista deja.");
  if (!rolePermissions[role]) throwHttp(400, "Rol invalid.");
  ensureCanAssignRole(actor, role);
  enforceUserLimit(db, body.active !== false);
  assertPasswordPolicy(password, { username, name }, db.settings || {});
  const user = {
    id: id("user"),
    name,
    username,
    passwordHash: hashPassword(password),
    role,
    departmentId: String(body.departmentId || "").trim(),
    active: body.active !== false,
    createdBy: actor.id,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  return user;
}

function updateUser(db, actor, userId, body) {
  const user = db.users.find((item) => item.id === userId);
  if (!user) throwHttp(404, "Utilizator inexistent.");
  const previous = { role: user.role, active: user.active !== false };
  const name = String(body.name ?? user.name).trim();
  const role = String(body.role ?? user.role);
  if (!name) throwHttp(400, "Numele utilizatorului este obligatoriu.");
  if (!rolePermissions[role]) throwHttp(400, "Rol invalid.");
  ensureCanManageUser(actor, user, role);
  const nextActive = body.active !== undefined ? Boolean(body.active) : user.active !== false;
  if (user.active === false && nextActive) enforceUserLimit(db, true);
  user.name = name;
  user.role = role;
  user.active = nextActive;
  if (body.departmentId !== undefined) {
    user.departmentId = String(body.departmentId || "").trim();
  }
  if (body.password) {
    const password = String(body.password);
    assertPasswordPolicy(password, { username, name }, db.settings || {});
    user.passwordHash = hashPassword(password);
    delete user.password;
  }
  if (user.id === actor.id) user.active = true;
  if (!db.users.some((item) => item.active !== false && item.role === "superadmin")) {
    user.role = previous.role;
    user.active = previous.active;
    throwHttp(400, "Trebuie sa existe cel putin un Superadmin activ.");
  }
  user.updatedBy = actor.id;
  user.updatedAt = new Date().toISOString();
  return user;
}

function ensureCanAssignRole(actor, role) {
  if (role === "superadmin" && actor.role !== "superadmin") {
    throwHttp(403, "Doar un Superadmin poate crea alt Superadmin.");
  }
}

function ensureCanManageUser(actor, user, nextRole) {
  if (actor.role === "superadmin") return;
  if (user.role === "superadmin" || nextRole === "superadmin") {
    throwHttp(403, "Doar un Superadmin poate modifica rolul Superadmin.");
  }
}

function enforceUserLimit(db, willBeActive) {
  if (!willBeActive) return;
  const license = normalizeLicense(db.settings?.license || {});
  if (license.status === "internal") return;
  const activeUsers = db.users.filter((user) => user.active !== false).length;
  if (activeUsers >= Number(license.maxUsers || 1)) {
    throwHttp(400, `Licenta permite maxim ${license.maxUsers} utilizatori activi.`);
  }
}

function readJsonBody(req, maxBytes = 1_000_000) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        reject(new Error("Payload prea mare."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON invalid."));
      }
    });
  });
}

function readBinaryBody(req, maxBytes = 10_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(httpError(413, "Payload prea mare."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function sendBuffer(res, status, buffer, type, filename) {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store"
  });
  res.end(buffer);
}

function buildDashboard(db) {
  const todayKey = localDate(new Date());
  const monthKey = todayKey.slice(0, 7);
  const active = activeConsumptions(db);
  const todayTotal = sum(active.filter((item) => item.date === todayKey), "asphalt");
  const monthTotal = sum(active.filter((item) => item.date.startsWith(monthKey)), "asphalt");
  const criticalStocks = db.materials.filter((material) => Number(material.stock || 0) <= Number(material.alert || 0));
  const stockAlerts = buildStockAlerts(db);
  return {
    metrics: {
      todayAsphalt: round(todayTotal),
      monthAsphalt: round(monthTotal),
      criticalStocks: criticalStocks.length,
      stockAlerts: stockAlerts.length
    },
    criticalStocks,
    stockAlerts,
    productionCapacity: db.recipes.filter((recipe) => recipe.active !== false).map((recipe) => ({
      recipeId: recipe.id,
      recipeName: recipe.name,
      ...calculateRecipeCapacity(db, recipe)
    })).sort((a, b) => b.tons - a.tons),
    recentConsumptions: active.slice().sort(sortNewest).slice(0, 10),
    license: db.settings.license,
    initialStock: {
      completed: db.settings.initialStockCompleted === true,
      completedAt: db.settings.initialStockCompletedAt || "",
      completedByName: db.settings.initialStockCompletedByName || ""
    }
  };
}

function buildCompanyMap(db, user) {
  const workflows = db.workflowRequests || [];
  const departments = (db.departments || []).filter((item) => item.active !== false);
  const connectionRows = (db.departmentConnections || []).filter((item) => item.active !== false);
  const visibleModules = new Set(moduleDefinitionsForUser(user, db));
  const workflowByDepartment = new Map();
  workflows.forEach((request) => {
    [request.requesterDepartmentId, request.targetDepartmentId].filter(Boolean).forEach((departmentId) => {
      const current = workflowByDepartment.get(departmentId) || { open: 0, done: 0, rejected: 0 };
      if (["FINALIZAT"].includes(request.status)) current.done += 1;
      else if (["RESPINS", "ANULAT"].includes(request.status)) current.rejected += 1;
      else current.open += 1;
      workflowByDepartment.set(departmentId, current);
    });
  });
  return {
    summary: {
      departments: departments.length,
      connections: connectionRows.length,
      openWorkflows: workflows.filter((item) => !["FINALIZAT", "RESPINS", "ANULAT"].includes(item.status)).length,
      projects: (db.projects || []).filter((item) => item.status !== "closed").length
    },
    departments: departments.map((department) => ({
      id: department.id,
      name: department.name,
      moduleKey: department.moduleKey || moduleKeyForDepartmentName(department.name),
      color: department.color || "",
      metrics: workflowByDepartment.get(department.id) || { open: 0, done: 0, rejected: 0 },
      activeForUser: user.role === "superadmin" || visibleModules.has(department.moduleKey || moduleKeyForDepartmentName(department.name))
    })),
    connections: connectionRows.map((connection) => ({
      id: connection.id,
      sourceModuleKey: connection.sourceModuleKey || connection.source || "",
      targetModuleKey: connection.targetModuleKey || connection.target || "",
      sourceDepartmentId: connection.sourceDepartmentId || "",
      targetDepartmentId: connection.targetDepartmentId || "",
      label: connection.label || "",
      type: connection.type || "workflow"
    })),
    workflows: workflows
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .slice(0, 12)
      .map((request) => ({
        id: request.id,
        title: request.title,
        requestType: request.requestType,
        status: request.status,
        priority: request.priority,
        neededDate: request.neededDate,
        sourceType: request.sourceType,
        sourceId: request.sourceId
      }))
  };
}

function moduleDefinitionsForUser(user, db) {
  if (user.role === "superadmin") return ["production", "tehnic", "contabilitate", "mecanizare", "betoane", "asternere", "siguranta", "canalizare", "gestiune", "achizitii", "ru"];
  const permissions = effectivePermissionsForUser(user, db);
  const modules = new Set();
  if (permissions.some((item) => item.startsWith("materials:") || item.startsWith("stock:") || item.startsWith("department_stock:"))) modules.add("gestiune");
  if (permissions.some((item) => item.startsWith("planning:") || item.startsWith("consumptions:") || item.startsWith("recipes:"))) modules.add("production");
  if (permissions.some((item) => item.startsWith("fleet:"))) modules.add("mecanizare");
  if (permissions.some((item) => item.startsWith("technical:"))) modules.add("tehnic");
  if (permissions.some((item) => item.startsWith("accounting:"))) modules.add("contabilitate");
  if (permissions.some((item) => item.startsWith("procurement:"))) modules.add("achizitii");
  if (user.departmentId) {
    const department = (db.departments || []).find((item) => item.id === user.departmentId);
    if (department) modules.add(department.moduleKey || moduleKeyForDepartmentName(department.name));
  }
  return Array.from(modules);
}

function buildNotifications(db, user) {
  const stockAlerts = buildStockAlerts(db);
  const criticalStocks = db.materials
    .filter((material) => Number(material.stock || 0) <= Number(material.alert || 0))
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0) || a.name.localeCompare(b.name));
  const openRequests = (db.departmentRequests || [])
    .filter((request) => !["done", "rejected"].includes(request.status))
    .sort((a, b) => String(a.neededDate || "").localeCompare(String(b.neededDate || "")));

  const notifications = [];

  stockAlerts.forEach((item) => {
    const shortage = Number(item.shortage || 0);
    const title = shortage > 0
      ? `Lipsa estimata: ${item.materialName}`
      : `Stoc estimat sub prag: ${item.materialName}`;
    const detail = shortage > 0
      ? `Lipsesc ${fmt(shortage)} ${item.unit}. Stoc curent: ${fmt(item.stock)} ${item.unit}. Necesar total: ${fmt(item.required)} ${item.unit}.`
      : `Stoc estimat ${fmt(item.projectedStock)} ${item.unit}, prag ${fmt(item.alert)} ${item.unit}.`;
    notifications.push({
      id: `stock-alert-${item.materialId}`,
      type: "stock",
      severity: shortage > 0 ? "bad" : "warn",
      title,
      detail,
      targetView: "planning",
      targetLabel: "Vezi necesar",
      roles: ["inventory", "procurement", "manager", "superadmin", "admin"],
      materialId: item.materialId,
      materialName: item.materialName,
      shortage,
      required: item.required,
      unit: item.unit
    });
  });

  criticalStocks.forEach((material) => {
    notifications.push({
      id: `critical-stock-${material.id}`,
      type: "critical_stock",
      severity: Number(material.stock || 0) <= 0 ? "bad" : "warn",
      title: `Stoc critic: ${material.name}`,
      detail: `Stoc curent ${fmt(material.stock)} ${material.unit}, prag ${fmt(material.alert)} ${material.unit}.`,
      targetView: "stocks",
      targetLabel: "Vezi stocuri",
      roles: ["inventory", "manager", "superadmin", "admin", "procurement"],
      materialId: material.id,
      materialName: material.name,
      unit: material.unit
    });
  });

  openRequests
    .filter((request) => request.priority === "urgent" || String(request.neededDate || "") <= localDate(new Date()))
    .slice(0, 20)
    .forEach((request) => {
      notifications.push({
        id: `request-${request.id}`,
        type: "department_request",
        severity: request.priority === "urgent" ? "bad" : "warn",
        title: request.priority === "urgent" ? `Solicitare urgenta: ${request.department}` : `Solicitare scadenta: ${request.department}`,
        detail: `${request.type === "asphalt" ? request.recipeName : request.materialName || request.requestedMaterialName || request.itemName} / ${fmt(request.amount)} ${request.unit} / necesar ${request.neededDate || "-"}.`,
        targetView: "departmentRequests",
        targetLabel: "Vezi solicitari",
        roles: ["manager", "superadmin", "admin", "inventory", "procurement"],
        requestId: request.id
      });
    });

  buildFleetAlerts(db).slice(0, 20).forEach((alert) => {
    notifications.push({
      id: alert.id,
      type: "fleet_alert",
      severity: alert.severity,
      title: alert.title,
      detail: alert.detail,
      targetView: "mechanization",
      targetLabel: "Vezi mecanizare",
      roles: ["mechanization", "technical", "manager", "superadmin", "admin"],
      assetId: alert.assetId
    });
  });

  const visible = notifications.filter((item) => notificationVisibleForRole(item, user.role));
  const bad = visible.filter((item) => item.severity === "bad").length;
  const warn = visible.filter((item) => item.severity === "warn").length;
  return {
    summary: {
      total: visible.length,
      bad,
      warn,
      stock: visible.filter((item) => item.type === "stock" || item.type === "critical_stock").length,
      requests: visible.filter((item) => item.type === "department_request").length,
      fleet: visible.filter((item) => item.type === "fleet_alert").length
    },
    notifications: visible.slice(0, 50)
  };
}

function notificationVisibleForRole(notification, role) {
  if (role === "superadmin" || role === "admin") return true;
  return !Array.isArray(notification.roles) || notification.roles.includes(role);
}

function buildStockAlerts(db) {
  const demand = Object.fromEntries(db.materials.map((material) => [material.id, {
    materialId: material.id,
    materialName: material.name,
    unit: material.unit,
    stock: Number(material.stock || 0),
    alert: Number(material.alert || 0),
    fromPlans: 0,
    fromRequests: 0
  }]));

  (db.productionPlans || []).forEach((plan) => {
    (plan.materials || []).forEach((usage) => addDemand(demand, usage.materialId, usage.amount, "plan"));
  });

  (db.departmentRequests || [])
    .filter((request) => !["done", "rejected"].includes(request.status))
    .forEach((request) => {
      if (request.type === "asphalt" && request.planId) return;
      if (request.type === "material") {
        addDemand(demand, request.materialId, request.amount, "request");
        return;
      }
      const needs = Array.isArray(request.materials) && request.materials.length
        ? request.materials
        : requestMaterialsFromRecipe(db, request);
      needs.forEach((usage) => addDemand(demand, usage.materialId, usage.amount, "request"));
    });

  return Object.values(demand)
    .map((item) => {
      const fromPlans = round(item.fromPlans);
      const fromRequests = round(item.fromRequests);
      const required = round(fromPlans + fromRequests);
      const projectedStock = round(item.stock - required);
      const shortage = round(Math.max(0, required - item.stock));
      return {
        ...item,
        fromPlans,
        fromRequests,
        required,
        projectedStock,
        shortage,
        severity: shortage > 0 ? "bad" : "warn"
      };
    })
    .filter((item) => item.required > 0 && (item.shortage > 0 || item.projectedStock <= item.alert))
    .sort((a, b) => b.shortage - a.shortage || a.projectedStock - b.projectedStock || a.materialName.localeCompare(b.materialName));
}

function buildProcurementRequirements(db) {
  return buildStockAlerts(db);
}

function addDemand(demand, materialId, amountValue, source) {
  const amount = round(Number(amountValue || 0));
  if (!demand[materialId] || amount <= 0) return;
  if (source === "plan") demand[materialId].fromPlans += amount;
  if (source === "request") demand[materialId].fromRequests += amount;
}

function requestMaterialsFromRecipe(db, request) {
  const recipe = db.recipes.find((item) => item.id === request.recipeId);
  if (!recipe) return [];
  return recipeMaterialNeeds(db, recipe, Number(request.amount || 0), 0, false);
}

function buildDailyReport(db, dateValue) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || "")) ? String(dateValue) : localDate(new Date());
  const consumptions = activeConsumptions(db).filter((item) => item.date === date).sort(sortNewest);
  const deliveries = db.deliveries.filter((item) => !item.canceled && item.date === date).sort(sortNewest);
  const manualMovements = db.stockMovements
    .filter((item) => !item.canceled && item.date === date && (item.type === "manual_in" || item.type === "manual_out"))
    .sort(sortNewest);
  const dailyMovements = db.stockMovements.filter((item) => item.date === date);
  const asphaltTotal = round(consumptions.reduce((total, item) => total + Number(item.asphalt || 0), 0));
  const criticalStocks = db.materials
    .filter((material) => Number(material.stock || 0) <= Number(material.alert || 0))
    .map((material) => ({
      materialId: material.id,
      materialName: material.name,
      stock: Number(material.stock || 0),
      alert: Number(material.alert || 0),
      unit: material.unit
    }));
  return {
    date,
    metrics: {
      asphaltTotal,
      consumptionsCount: consumptions.length,
      deliveriesCount: deliveries.length,
      manualInCount: manualMovements.filter((item) => item.amount > 0).length,
      manualOutCount: manualMovements.filter((item) => item.amount < 0).length,
      criticalStocksCount: criticalStocks.length
    },
    consumptions: consumptions.map((item) => ({
      id: item.id,
      reportNo: item.reportNo,
      jobName: item.jobName || "",
      recipeName: item.recipeName,
      ticket: item.ticket || "",
      asphalt: Number(item.asphalt || 0),
      operatorName: item.operatorName || ""
    })),
    deliveries: deliveries.map((item) => ({
      id: item.id,
      materialName: item.materialName,
      amount: Number(item.amount || 0),
      unit: item.unit,
      supplier: item.supplier || "",
      document: item.document || "",
      operatorName: item.operatorName || ""
    })),
    manualMovements: manualMovements.map((item) => ({
      id: item.id,
      type: item.type,
      materialName: item.materialName,
      amount: Number(item.amount || 0),
      unit: item.unit,
      department: item.department || "",
      jobName: item.jobName || "",
      transportDoc: item.transportDoc || "",
      createdByName: item.createdByName || ""
    })),
    materialTotals: buildMaterialReportTotals(db, consumptions, deliveries, manualMovements, dailyMovements, date, date),
    criticalStocks
  };
}

function buildPeriodReport(db, fromValue, toValue) {
  const fallback = localDate(new Date());
  const from = validDateValue(fromValue) ? String(fromValue) : `${fallback.slice(0, 7)}-01`;
  const to = validDateValue(toValue) ? String(toValue) : fallback;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const consumptions = activeConsumptions(db)
    .filter((item) => item.date >= start && item.date <= end)
    .sort(sortNewest);
  const deliveries = db.deliveries
    .filter((item) => !item.canceled && item.date >= start && item.date <= end)
    .sort(sortNewest);
  const manualMovements = db.stockMovements
    .filter((item) => !item.canceled && item.date >= start && item.date <= end && (item.type === "manual_in" || item.type === "manual_out"))
    .sort(sortNewest);
  const periodMovements = db.stockMovements.filter((item) => item.date >= start && item.date <= end);
  const asphaltTotal = round(consumptions.reduce((total, item) => total + Number(item.asphalt || 0), 0));
  const criticalStocks = db.materials
    .filter((material) => Number(material.stock || 0) <= Number(material.alert || 0))
    .map((material) => ({
      materialId: material.id,
      materialName: material.name,
      stock: Number(material.stock || 0),
      alert: Number(material.alert || 0),
      unit: material.unit
    }));
  return {
    from: start,
    to: end,
    metrics: {
      asphaltTotal,
      consumptionsCount: consumptions.length,
      deliveriesCount: deliveries.length,
      manualInCount: manualMovements.filter((item) => item.amount > 0).length,
      manualOutCount: manualMovements.filter((item) => item.amount < 0).length,
      criticalStocksCount: criticalStocks.length
    },
    consumptions: consumptions.map((item) => ({
      id: item.id,
      date: item.date,
      reportNo: item.reportNo,
      jobName: item.jobName || "",
      recipeName: item.recipeName,
      ticket: item.ticket || "",
      asphalt: Number(item.asphalt || 0),
      operatorName: item.operatorName || ""
    })),
    deliveries: deliveries.map((item) => ({
      id: item.id,
      date: item.date,
      materialName: item.materialName,
      amount: Number(item.amount || 0),
      unit: item.unit,
      supplier: item.supplier || "",
      document: item.document || "",
      operatorName: item.operatorName || ""
    })),
    manualMovements: manualMovements.map((item) => ({
      id: item.id,
      date: item.date,
      type: item.type,
      materialName: item.materialName,
      amount: Number(item.amount || 0),
      unit: item.unit,
      department: item.department || "",
      jobName: item.jobName || "",
      transportDoc: item.transportDoc || "",
      createdByName: item.createdByName || ""
    })),
    materialTotals: buildMaterialReportTotals(db, consumptions, deliveries, manualMovements, periodMovements, start, end),
    criticalStocks
  };
}

function buildAccountingReport(db, monthValue) {
  const month = validMonthValue(monthValue) ? String(monthValue) : localDate(new Date()).slice(0, 7);
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  const rows = db.materials.map((material) => {
    const movements = (db.stockMovements || [])
      .filter((movement) => movement.materialId === material.id && movement.date >= from && movement.date <= to);
    const deliveries = sumMovements(movements, (item) => item.type === "delivery" && Number(item.amount || 0) > 0);
    const asphaltConsumption = Math.abs(sumMovements(movements, (item) => item.type === "consumption" && Number(item.amount || 0) < 0));
    const manualIn = sumMovements(movements, (item) => item.type === "manual_in" && Number(item.amount || 0) > 0);
    const manualOut = Math.abs(sumMovements(movements, (item) => item.type === "manual_out" && Number(item.amount || 0) < 0));
    const adjustments = sumMovements(movements, (item) => !isOpeningStockMovement(item) && !["delivery", "consumption", "manual_in", "manual_out"].includes(item.type));
    const openingStock = stockAtStartOfDate(db, material.id, from);
    const closingStock = stockAtEndOfDate(db, material.id, to);
    const calculatedClosing = round(openingStock + deliveries + manualIn - asphaltConsumption - manualOut + adjustments);
    return {
      materialId: material.id,
      materialName: material.name,
      unit: material.unit,
      openingStock: round(openingStock),
      deliveries: round(deliveries),
      asphaltConsumption: round(asphaltConsumption),
      manualIn: round(manualIn),
      manualOut: round(manualOut),
      adjustments: round(adjustments),
      closingStock: round(closingStock),
      calculatedClosing,
      difference: round(closingStock - calculatedClosing)
    };
  });
  return {
    month,
    from,
    to,
    metrics: {
      materials: rows.length,
      deliveries: round(rows.reduce((total, item) => total + Number(item.deliveries || 0), 0)),
      asphaltConsumption: round(rows.reduce((total, item) => total + Number(item.asphaltConsumption || 0), 0)),
      manualOut: round(rows.reduce((total, item) => total + Number(item.manualOut || 0), 0)),
      differences: rows.filter((item) => Math.abs(Number(item.difference || 0)) > 0.0005).length
    },
    rows
  };
}

function sumMovements(movements, predicate) {
  return round(movements.filter(predicate).reduce((total, item) => total + Number(item.amount || 0), 0));
}

function isOpeningStockMovement(movement) {
  return movement?.type === "opening_stock";
}

function isStockBalanceMovement(movement) {
  return isOpeningStockMovement(movement) || movement?.type === "adjustment";
}

function buildMaterialReportTotals(db, consumptions, deliveries, manualMovements, reportMovements, startDate, endDate) {
  const monthStart = `${startDate.slice(0, 7)}-01`;
  const previousDate = previousLocalDate(startDate);
  const totals = Object.fromEntries(db.materials.map((material) => [material.id, {
    materialId: material.id,
    materialName: material.name,
    unit: material.unit,
    stock: Number(material.stock || 0),
    monthOpeningStock: stockAtStartOfDate(db, material.id, monthStart),
    previousDayStock: previousDate ? stockAtEndOfDate(db, material.id, previousDate) : stockAtStartOfDate(db, material.id, startDate),
    openingStock: stockAtStartOfDate(db, material.id, startDate),
    closingStock: stockAtEndOfDate(db, material.id, endDate),
    consumed: 0,
    delivered: 0,
    manualIn: 0,
    manualOut: 0,
    netMovement: 0
  }]));
  consumptions.forEach((consumption) => {
    (consumption.materials || []).forEach((usage) => {
      if (totals[usage.materialId]) totals[usage.materialId].consumed += Number(usage.amount || 0);
    });
  });
  deliveries.forEach((delivery) => {
    if (totals[delivery.materialId]) totals[delivery.materialId].delivered += Number(delivery.amount || 0);
  });
  manualMovements.forEach((movement) => {
    if (!totals[movement.materialId]) return;
    if (Number(movement.amount || 0) > 0) totals[movement.materialId].manualIn += Number(movement.amount || 0);
    if (Number(movement.amount || 0) < 0) totals[movement.materialId].manualOut += Math.abs(Number(movement.amount || 0));
  });
  reportMovements.forEach((movement) => {
    if (totals[movement.materialId] && !isOpeningStockMovement(movement)) totals[movement.materialId].netMovement += Number(movement.amount || 0);
  });
  return Object.values(totals).map((item) => ({
    ...item,
    monthOpeningStock: round(item.monthOpeningStock),
    previousDayStock: round(item.previousDayStock),
    openingStock: round(item.openingStock),
    closingStock: round(item.closingStock),
    consumed: round(item.consumed),
    delivered: round(item.delivered),
    manualIn: round(item.manualIn),
    manualOut: round(item.manualOut),
    netMovement: round(item.netMovement),
    stock: round(item.stock)
  }));
}

function stockAtStartOfDate(db, materialId, dateValue) {
  return historicalStock(db, materialId, (movement) =>
    movement.date > dateValue || (movement.date === dateValue && !isOpeningStockMovement(movement))
  );
}

function stockAtEndOfDate(db, materialId, dateValue) {
  return historicalStock(db, materialId, (movement) => movement.date > dateValue);
}

function previousLocalDate(dateValue) {
  if (!validDateValue(dateValue)) return "";
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return localDate(date);
}

function historicalStock(db, materialId, futureMovement) {
  const material = db.materials.find((item) => item.id === materialId);
  const currentStock = Number(material?.stock || 0);
  const futureDelta = (db.stockMovements || [])
    .filter((movement) => movement.materialId === materialId && futureMovement(movement))
    .reduce((total, movement) => total + Number(movement.amount || 0), 0);
  return currentStock - futureDelta;
}

function periodFromUrl(url) {
  const fallback = localDate(new Date());
  return {
    from: url.searchParams.get("from") || `${fallback.slice(0, 7)}-01`,
    to: url.searchParams.get("to") || fallback
  };
}

function accountingMonthFromUrl(url) {
  const fallback = localDate(new Date()).slice(0, 7);
  const month = url.searchParams.get("month") || fallback;
  return validMonthValue(month) ? month : fallback;
}

function validMonthValue(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function lastDayOfMonth(monthValue) {
  const [year, month] = String(monthValue).split("-").map(Number);
  return localDate(new Date(year, month, 0));
}

function validDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function calculateRecipeCapacity(db, recipe) {
  const recipeMaterials = db.materials.filter((material) => material.recipeMaterial);
  const constraints = recipeMaterials
    .map((material) => {
      const percent = Number(recipe.percentages?.[material.id] || 0);
      if (percent <= 0) return null;
      const stock = Math.max(0, Number(material.stock || 0));
      return {
        materialId: material.id,
        materialName: material.name,
        unit: material.unit,
        stock,
        tons: stock * 100 / percent
      };
    })
    .filter(Boolean);
  if (!constraints.length) {
    return { tons: 0, limitingMaterial: "Reteta fara procente" };
  }
  const limit = constraints.reduce((min, item) => item.tons < min.tons ? item : min, constraints[0]);
  return {
    tons: round(limit.tons),
    limitingMaterial: `${limit.materialName} (${fmt(limit.stock)} ${limit.unit})`
  };
}

function createMaterial(db, user, body) {
  const name = String(body.name || "").trim();
  const unit = String(body.unit || "t").trim();
  const recipeMaterial = body.recipeMaterial === true || body.recipeMaterial === "true";
  const stock = round(Number(body.stock || 0));
  const alert = round(Number(body.alert || 0));
  if (!name) throwHttp(400, "Denumirea materialului este obligatorie.");
  if (!unit) throwHttp(400, "Unitatea de masura este obligatorie.");
  if (stock < 0 || alert < 0) throwHttp(400, "Stocul si pragul nu pot fi negative.");
  const duplicate = (db.materials || []).find((item) => String(item.name || "").trim().toLowerCase() === name.toLowerCase());
  if (duplicate) throwHttp(409, "Exista deja un material cu aceasta denumire.");
  const material = {
    id: uniqueMaterialId(db, name),
    name,
    unit,
    stock,
    alert,
    recipeMaterial,
    category: recipeMaterial ? "asfalt" : "general",
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.materials.push(material);
  if (stock > 0) {
    db.stockMovements.push({
      id: id("stock"),
      type: "opening_stock",
      materialId: material.id,
      materialName: material.name,
      date: validDateValue(body.stockDate) ? String(body.stockDate) : localDate(new Date()),
      amount: stock,
      unit: material.unit,
      note: "Sold initial material nou",
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString()
    });
  }
  return material;
}

function uniqueMaterialId(db, name) {
  const base = slugify(name) || "material";
  const used = new Set((db.materials || []).map((item) => item.id));
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function updateMaterial(db, body) {
  const material = db.materials.find((item) => item.id === body.id);
  if (!material) throwHttp(404, "Material inexistent.");
  const previousStock = Number(material.stock || 0);
  const movementDate = validDateValue(body.stockDate) ? String(body.stockDate) : localDate(new Date());
  const movementType = body.stockMode === "adjustment" ? "adjustment" : "opening_stock";
  material.stock = round(Number(body.stock ?? material.stock));
  material.alert = round(Number(body.alert ?? material.alert));
  material.unit = String(body.unit || material.unit);
  if (previousStock !== material.stock) {
    db.stockMovements.push({
      id: id("stock"),
      type: movementType,
      materialId: material.id,
      materialName: material.name,
      date: movementDate,
      amount: round(material.stock - previousStock),
      unit: material.unit,
      note: movementType === "opening_stock" ? "Sold initial stoc" : "Editare manuala stoc",
      createdAt: new Date().toISOString()
    });
    return { material, message: `Stoc actualizat pe data ${movementDate}.` };
  }
  if (body.redateLastAdjustment) {
    const movement = latestManualStockEdit(db, material.id);
    if (!movement) return { material, message: "Nu exista o ajustare manuala de reparat pentru acest material." };
    const oldDate = movement.date;
    movement.date = movementDate;
    movement.type = movementType;
    movement.note = movementType === "opening_stock" ? "Sold initial stoc" : "Editare manuala stoc";
    movement.redatedAt = new Date().toISOString();
    movement.redatedFrom = oldDate;
    return { material, message: `Data ultimei ajustari a fost mutata din ${oldDate} in ${movementDate}.` };
  }
  return { material, message: "Stocul si pragul au fost salvate." };
}

function latestManualStockEdit(db, materialId) {
  return (db.stockMovements || [])
    .filter((movement) =>
      movement.materialId === materialId &&
      (movement.type === "adjustment" || movement.type === "opening_stock") &&
      (movement.note === "Editare manuala stoc" || movement.note === "Sold initial stoc")
    )
    .sort((a, b) => `${b.createdAt || ""}${b.id || ""}`.localeCompare(`${a.createdAt || ""}${a.id || ""}`))[0];
}

function createDepartmentRequest(db, user, body) {
  const type = String(body.type || "asphalt");
  if (!["asphalt", "material"].includes(type)) throwHttp(400, "Tip solicitare invalid.");
  const department = String(body.department || "").trim();
  if (!department) throwHttp(400, "Departamentul este obligatoriu.");
  if (user.role !== "superadmin" && user.departmentId) {
    const userDepartment = (db.departments || []).find((item) => item.id === user.departmentId)?.name || "";
    if (userDepartment && department !== userDepartment) throwHttp(403, "Poti trimite solicitari doar pentru departamentul tau.");
  }
  const neededDate = validDateValue(body.neededDate) ? String(body.neededDate) : localDate(new Date());
  let recipe = null;
  let material = null;
  let technical = null;
  let amount = round(Number(body.amount || 0));
  let materials = [];
  let requestedMaterialName = "";
  let requestedUnit = "";
  if (type === "asphalt") {
    recipe = db.recipes.find((item) => item.id === body.recipeId && item.active !== false);
    if (!recipe) throwHttp(400, "Alege reteta pentru solicitarea de asfalt.");
    technical = normalizeRequestTechnical(db, recipe, body.technical);
    if (technical) amount = technical.asphalt;
    materials = recipeMaterialNeeds(db, recipe, amount, 0, false);
  } else {
    const materialId = String(body.materialId || "").trim();
    if (materialId && materialId !== "__custom__") {
      material = db.materials.find((item) => item.id === materialId);
      if (!material) throwHttp(400, "Materialul ales nu exista in gestiune.");
    } else {
      requestedMaterialName = String(body.requestedMaterialName || body.customMaterialName || "").trim();
      requestedUnit = String(body.requestedUnit || body.unit || "t").trim();
      if (!requestedMaterialName) throwHttp(400, "Scrie denumirea materialului solicitat.");
      if (!requestedUnit) throwHttp(400, "Alege unitatea pentru materialul solicitat.");
    }
  }
  if (amount <= 0) throwHttp(400, "Cantitatea solicitata trebuie sa fie mai mare decat zero.");

  const request = {
    id: id("solicitare"),
    type,
    status: "new", // statusuri: new, accepted, planned, partial, done, rejected
    neededDate,
    department,
    jobName: String(body.jobName || "").trim(),
    location: String(body.location || "").trim(),
    orderNo: String(body.orderNo || "").trim(),
    priority: ["scazuta", "medie", "ridicata", "urgenta"].includes(String(body.priority || "")) ? String(body.priority) : "medie",
    description: String(body.description || body.note || "").trim(),
    recipeId: recipe?.id || "",
    recipeName: recipe?.name || "",
    materialId: material?.id || "",
    materialName: material?.name || "",
    requestedMaterialName,
    requestedUnit,
    mappedMaterialId: "",
    mappedMaterialName: "",
    itemName: recipe ? `Asfalt ${recipe.name}` : (material?.name || requestedMaterialName),
    amount,
    unit: recipe ? "t" : (material?.unit || requestedUnit),
    orderDate: validDateValue(body.orderDate) ? String(body.orderDate) : "",
    technical,
    materials,
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.departmentRequests.push(request);
  syncWorkflowForDepartmentRequest(db, user, request, "created");
  return request;
}

function updateDepartmentRequest(db, user, idValue, body) {
  const request = db.departmentRequests.find((item) => item.id === idValue);
  if (!request) throwHttp(404, "Solicitare inexistenta.");
  const oldWorkflowStatus = workflowStatusFromDepartment(request.status);
  const mapMaterialId = body.materialId !== undefined
    ? String(body.materialId || "").trim()
    : body.mappedMaterialId !== undefined
      ? String(body.mappedMaterialId || "").trim()
      : "";
  if (request.type === "material" && mapMaterialId) {
    const material = db.materials.find((item) => item.id === mapMaterialId);
    if (!material) throwHttp(404, "Materialul real ales pentru mapare nu exista.");
    if (!request.requestedMaterialName) request.requestedMaterialName = request.itemName || request.materialName || "";
    if (!request.requestedUnit) request.requestedUnit = request.unit || material.unit;
    request.materialId = material.id;
    request.materialName = material.name;
    request.mappedMaterialId = material.id;
    request.mappedMaterialName = material.name;
    request.mappedAt = new Date().toISOString();
    request.mappedBy = user.id;
    request.mappedByName = user.name;
    request.itemName = material.name;
    request.unit = material.unit;
  }
  const status = String(body.status || request.status);
  if (!["new", "accepted", "planned", "partial", "done", "rejected"].includes(status)) throwHttp(400, "Status invalid.");
  if (status === "done" && request.type === "material" && !request.materialId) {
    throwHttp(400, "Mapeaza solicitarea la un material real inainte sa o marchezi realizata.");
  }
  request.status = status;
  if (body.jobName !== undefined) request.jobName = String(body.jobName || "").trim();
  if (body.location !== undefined) request.location = String(body.location || "").trim();
  if (body.orderNo !== undefined) request.orderNo = String(body.orderNo || "").trim();
  if (body.priority !== undefined) request.priority = String(body.priority || "medie");
  if (body.description !== undefined) request.description = String(body.description || "").trim();
  request.managerNote = String(body.managerNote ?? request.managerNote ?? "").trim();
  request.updatedBy = user.id;
  request.updatedByName = user.name;
  request.updatedAt = new Date().toISOString();
  syncWorkflowForDepartmentRequest(db, user, request, "updated", oldWorkflowStatus);
  return request;
}

function createPlanFromDepartmentRequest(db, user, idValue) {
  const request = db.departmentRequests.find((item) => item.id === idValue);
  if (!request) throwHttp(404, "Solicitare inexistenta.");
  if (request.type !== "asphalt") throwHttp(400, "Doar solicitarile de asfalt se pot transforma direct in plan de productie.");
  if (request.planId) throwHttp(400, "Solicitarea este deja planificata.");
  const plan = createProductionPlan(db, user, {
    date: request.neededDate,
    jobName: [request.department, request.jobName].filter(Boolean).join(" / "),
    recipeId: request.recipeId,
    asphalt: request.amount,
    emulsion: 0,
    sourceRequestId: request.id,
    orderNo: request.orderNo || "",
    orderDate: request.orderDate || "",
    technical: request.technical || null
  });
  request.status = "planned";
  request.planId = plan.id;
  request.updatedBy = user.id;
  request.updatedByName = user.name;
  request.updatedAt = new Date().toISOString();
  syncWorkflowForDepartmentRequest(db, user, request, "planned", "SUBMIS");
  return plan;
}

function normalizeRequestTechnical(db, recipe, technical) {
  if (!technical || typeof technical !== "object") return null;
  const length = round(Number(technical.length || 0));
  const width = round(Number(technical.width || 0));
  const thickness = round(Number(technical.thickness || 0));
  const loss = Math.max(0, round(Number(technical.loss || 0)));
  const density = round(Number(technical.density || 0));
  const hasAny = [length, width, thickness, density, loss].some((value) => value > 0);
  if (!hasAny) return null;
  if (length <= 0 || width <= 0 || thickness <= 0 || density <= 0) {
    throwHttp(400, "Completeaza lungime, latime, grosime si densitate pentru calculul tehnic.");
  }
  const area = round(length * width);
  const volume = round(area * thickness / 100);
  const baseAsphalt = round(volume * density);
  const asphalt = round(baseAsphalt * (1 + loss / 100));
  return {
    length,
    width,
    thickness,
    loss,
    density,
    area,
    volume,
    baseAsphalt,
    asphalt,
    materials: recipeMaterialNeeds(db, recipe, asphalt, 0, false)
  };
}

function normalizeStoredTechnical(technical) {
  if (!technical || typeof technical !== "object") return null;
  return {
    length: round(Number(technical.length || 0)),
    width: round(Number(technical.width || 0)),
    thickness: round(Number(technical.thickness || 0)),
    loss: round(Number(technical.loss || 0)),
    density: round(Number(technical.density || 0)),
    area: round(Number(technical.area || 0)),
    volume: round(Number(technical.volume || 0)),
    baseAsphalt: round(Number(technical.baseAsphalt || 0)),
    asphalt: round(Number(technical.asphalt || 0))
  };
}

function recipeMaterialNeeds(db, recipe, asphalt, emulsion, includeZero) {
  return db.materials
    .map((material) => {
      const amount = material.recipeMaterial
        ? asphalt * Number(recipe.percentages?.[material.id] || 0) / 100
        : Number(emulsion || 0);
      return {
        materialId: material.id,
        materialName: material.name,
        amount: round(amount),
        unit: material.unit
      };
    })
    .filter((item) => includeZero || item.amount > 0);
}

function createStockOperation(db, user, body) {
  const material = db.materials.find((item) => item.id === body.materialId);
  if (!material) throwHttp(404, "Material inexistent.");
  const direction = String(body.direction || "out");
  if (!["in", "out"].includes(direction)) throwHttp(400, "Tip miscare invalid.");
  const amount = round(Number(body.amount || 0));
  if (amount <= 0) throwHttp(400, "Cantitatea trebuie sa fie mai mare decat zero.");
  const signedAmount = direction === "in" ? amount : -amount;
  material.stock = round(Number(material.stock || 0) + signedAmount);
  const details = [
    body.department ? `Departament: ${body.department}` : "",
    body.jobName ? `Lucrare: ${body.jobName}` : "",
    body.transportDoc ? `Bon: ${body.transportDoc}` : "",
    body.note ? `Obs: ${body.note}` : ""
  ].filter(Boolean).join(" / ");
  const movement = {
    id: id("stock"),
    type: direction === "in" ? "manual_in" : "manual_out",
    materialId: material.id,
    materialName: material.name,
    date: String(body.date || localDate(new Date())),
    amount: signedAmount,
    unit: material.unit,
    department: String(body.department || "").trim(),
    jobName: String(body.jobName || "").trim(),
    transportDoc: String(body.transportDoc || "").trim(),
    note: details || "Miscare manuala stoc",
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.stockMovements.push(movement);
  return movement;
}

function cancelStockOperation(db, user, idValue) {
  const movement = db.stockMovements.find((item) =>
    item.id === idValue &&
    (item.type === "manual_in" || item.type === "manual_out")
  );
  if (!movement || movement.canceled) throwHttp(404, "Miscarea de stoc nu poate fi anulata.");
  const material = db.materials.find((item) => item.id === movement.materialId);
  if (!material) throwHttp(404, "Material inexistent.");
  const reverseAmount = round(-Number(movement.amount || 0));
  material.stock = round(Number(material.stock || 0) + reverseAmount);
  db.stockMovements.push({
    id: id("stock"),
    type: movement.type === "manual_in" ? "cancel_manual_in" : "cancel_manual_out",
    materialId: material.id,
    materialName: material.name,
    date: localDate(new Date()),
    amount: reverseAmount,
    unit: material.unit,
    department: movement.department || "",
    jobName: movement.jobName || "",
    transportDoc: movement.transportDoc || "",
    note: `Anulare: ${movement.note || movement.id}`,
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  });
  movement.canceled = true;
  movement.canceledAt = new Date().toISOString();
  movement.canceledBy = user.id;
  movement.canceledByName = user.name;
  return movement;
}

function transferMaterialToDepartment(db, user, body) {
  const materialId = String(body.materialId || "");
  const department = String(body.department || "").trim();
  const amount = round(Number(body.amount || 0));
  if (!materialId || !department || amount <= 0) {
    throwHttp(400, "Date transfer incomplete (material, departament, cantitate).");
  }
  const material = db.materials.find(m => m.id === materialId);
  if (!material) throwHttp(404, "Material inexistent.");
  if (Number(material.stock || 0) < amount) {
    throwHttp(400, `Stoc insuficient in depozit central (${material.stock} ${material.unit}).`);
  }
  material.stock = round(Number(material.stock || 0) - amount);
  const movement = {
    id: id("stock"),
    type: "transfer_to_dept",
    materialId: material.id,
    materialName: material.name,
    date: String(body.date || localDate(new Date())),
    amount: -amount,
    unit: material.unit,
    department: department,
    transferStatus: "pending",
    confirmedAt: "",
    confirmedBy: "",
    confirmedByName: "",
    note: [String(body.note || "").trim(), `Transfer catre departament: ${department}`].filter(Boolean).join(" | "),
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.stockMovements.push(movement);
  return { material, movement };
}

function departmentTransfersForUser(db, user) {
  const userDepartment = user.departmentId
    ? (db.departments || []).find((item) => item.id === user.departmentId)?.name || ""
    : "";
  return (db.stockMovements || [])
    .filter((item) => item.type === "transfer_to_dept" && !item.canceled)
    .filter((item) => !userDepartment || item.department === userDepartment)
    .map((item) => ({
      ...item,
      transferStatus: item.transferStatus || "confirmed"
    }))
    .sort(sortNewest);
}

function confirmDepartmentTransfer(db, user, idValue) {
  const movement = (db.stockMovements || []).find((item) => item.id === idValue && item.type === "transfer_to_dept");
  if (!movement || movement.canceled) throwHttp(404, "Transfer inexistent.");
  if ((movement.transferStatus || "confirmed") !== "pending") throwHttp(400, "Transferul este deja confirmat.");
  if (user.role !== "superadmin" && user.departmentId) {
    const userDepartment = (db.departments || []).find((item) => item.id === user.departmentId)?.name || "";
    if (userDepartment && movement.department !== userDepartment) {
      throwHttp(403, "Nu poti confirma transferul altui departament.");
    }
  }
  let deptStock = db.departmentStocks.find((item) => item.materialId === movement.materialId && item.department === movement.department);
  if (!deptStock) {
    deptStock = {
      materialId: movement.materialId,
      materialName: movement.materialName,
      department: movement.department,
      stock: 0,
      unit: movement.unit
    };
    db.departmentStocks.push(deptStock);
  }
  deptStock.stock = round(Number(deptStock.stock || 0) + Math.abs(Number(movement.amount || 0)));
  movement.transferStatus = "confirmed";
  movement.confirmedAt = new Date().toISOString();
  movement.confirmedBy = user.id;
  movement.confirmedByName = user.name;
  return movement;
}

function recordDepartmentConsumption(db, user, body) {
  const materialId = String(body.materialId || "");
  const department = String(body.department || "").trim();
  const jobRequestId = String(body.jobRequestId || "");
  const amount = round(Number(body.amount || 0));
  if (!materialId || !department || amount <= 0 || !jobRequestId) {
    throwHttp(400, "Date consum incomplete.");
  }
  const deptStock = db.departmentStocks.find(s => s.materialId === materialId && s.department === department);
  if (!deptStock || Number(deptStock.stock || 0) < amount) {
    throwHttp(400, `Stoc insuficient in departamentul ${department} (${deptStock?.stock || 0}).`);
  }
  deptStock.stock = round(Number(deptStock.stock || 0) - amount);
  const consumption = {
    id: id("dept_consum"),
    date: String(body.date || localDate(new Date())),
    materialId,
    materialName: deptStock.materialName,
    department,
    jobRequestId,
    amount,
    unit: deptStock.unit,
    note: String(body.note || "").trim(),
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.departmentConsumptions.push(consumption);
  const request = db.departmentRequests.find(r => r.id === jobRequestId);
  if (request && ["accepted", "planned", "new"].includes(request.status)) {
    request.status = "partial";
  }
  return consumption;
}

function updateSettings(current, body) {
  const license = current.license || {};
  const passwordPolicy = passwordPolicyFromSettings({ ...current, ...body });
  const plan = String(body.licensePlan || license.plan || "internal-preview").trim();
  const trialDays = Math.max(1, Number(body.trialDays || license.trialDays || 30));
  const trialStartedAt = plan === "trial"
    ? (license.trialStartedAt || localDate(new Date()))
    : (license.trialStartedAt || null);
  return {
    ...current,
    companyName: String(body.companyName || current.companyName || "Organizație").trim(),
    stationName: String(body.stationName || "").trim(),
    location: String(body.location || "").trim(),
    logoDataUrl: validLogoDataUrl(body.logoDataUrl !== undefined ? body.logoDataUrl : current.logoDataUrl || ""),
    appCredit: current.appCredit || "Aplicatie realizata de Constantin Constantin",
    initialStockCompleted: current.initialStockCompleted === true,
    initialStockCompletedAt: current.initialStockCompletedAt || "",
    initialStockCompletedBy: current.initialStockCompletedBy || "",
    initialStockCompletedByName: current.initialStockCompletedByName || "",
    networkAccessMode: normalizeNetworkAccessMode(body.networkAccessMode || current.networkAccessMode),
    password_min_length: passwordPolicy.minLength,
    password_require_uppercase: passwordPolicy.requireUppercase,
    password_require_lowercase: passwordPolicy.requireLowercase,
    password_require_number: passwordPolicy.requireNumber,
    password_require_symbol: passwordPolicy.requireSymbol,
    password_disallow_username: passwordPolicy.disallowUsername,
    scaleDbPath: String(body.scaleDbPath ?? current.scaleDbPath ?? "").trim(),
    scaleProductMap: normalizeScaleProductMap(body.scaleProductMap !== undefined ? body.scaleProductMap : current.scaleProductMap || {}),
    nexusDbPath: String(body.nexusDbPath ?? current.nexusDbPath ?? "").trim(),
    autominderDbPath: String(body.autominderDbPath ?? current.autominderDbPath ?? "").trim(),
    rolePermissionOverrides: normalizeRolePermissionOverrides(current.rolePermissionOverrides || {}),
    license: normalizeLicense({
      ...license,
      plan,
      maxUsers: Math.max(1, Number(body.maxUsers || license.maxUsers || 1)),
      maxDevices: Math.max(1, Number(body.maxDevices || license.maxDevices || 1)),
      expiresAt: body.expiresAt || license.expiresAt || null,
      trialDays,
      trialStartedAt
    })
  };
}

function completeInitialStock(db, user, body) {
  if (body.confirmed !== true) throwHttp(400, "Confirmarea stocurilor initiale este obligatorie.");
  if (!db.settings || typeof db.settings !== "object") db.settings = {};
  if (db.settings.initialStockCompleted === true) return db.settings;
  const now = new Date().toISOString();
  db.settings.initialStockCompleted = true;
  db.settings.initialStockCompletedAt = now;
  db.settings.initialStockCompletedBy = user.id;
  db.settings.initialStockCompletedByName = user.name;
  addAudit(db, user, "stoc_initial_finalizat", `Stocuri initiale confirmate la ${now}`);
  return db.settings;
}

function importSignedLicense(input) {
  const document = parseLicenseDocument(input);
  if (document.format !== LICENSE_FORMAT) throwHttp(400, "Fisier de licenta invalid.");
  if (!document.payload || !document.signature) throwHttp(400, "Licenta nu contine payload si semnatura.");
  const valid = crypto.verify(
    null,
    Buffer.from(String(document.payload), "utf8"),
    crypto.createPublicKey(LICENSE_PUBLIC_KEY),
    Buffer.from(String(document.signature), "base64url")
  );
  if (!valid) throwHttp(400, "Semnatura licentei este invalida.");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(String(document.payload), "base64url").toString("utf8"));
  } catch {
    throwHttp(400, "Payload licenta invalid.");
  }
  return normalizeLicense({
    ...payload,
    source: "signed-file",
    signature: document.signature,
    payload: document.payload,
    importedAt: new Date().toISOString()
  }, true);
}

function parseLicenseDocument(input) {
  if (input && typeof input === "object" && input.format) return input;
  const text = typeof input === "string" ? input.trim() : JSON.stringify(input || {});
  if (text.startsWith(`${LICENSE_TOKEN_PREFIX}.`)) {
    const [, payload, signature] = text.split(".");
    return { format: LICENSE_FORMAT, payload, signature };
  }
  try {
    return JSON.parse(text);
  } catch {
    throwHttp(400, "Licenta trebuie sa fie fisier JSON sau cod de activare valid.");
  }
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
    maxUsers: plan === "trial" && license.source === "initial-setup" && Number(license.maxUsers || 1) <= 5 ? 50 : Math.max(1, Number(license.maxUsers || 1)),
    maxDevices: plan === "trial" && license.source === "initial-setup" && Number(license.maxDevices || 1) <= 10 ? 50 : Math.max(1, Number(license.maxDevices || 1)),
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

function clientIp(req) {
  const raw = req.socket?.remoteAddress || "";
  return normalizeIp(raw);
}

function normalizeIp(value) {
  let ip = String(value || "").trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

function isPrivateNetworkAddress(ipValue) {
  const ip = normalizeIp(ipValue);
  if (!ip || ip === "127.0.0.1" || ip === "localhost") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
  }
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  return false;
}

function shortId(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

function publicSessionId(token) {
  return `session-${crypto.createHash("sha256").update(String(token || "")).digest("hex").slice(0, 10)}`;
}

function normalizeSessionIdleMinutes(value, fallback = 480) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(15, Math.min(1440, Math.round(n)));
}

function normalizeSessionAbsoluteHours(value, fallback = 24) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(168, Math.round(n)));
}

function sessionTokenFromRequest(req) {
  const header = req?.headers?.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  try {
    const url = new URL(req?.url || "", `http://${req?.headers?.host || "localhost"}`);
    return url.searchParams.get("token") || "";
  } catch {
    return "";
  }
}

function maskIp(value) {
  const ip = normalizeIp(value);
  if (!ip) return "";
  const parts = ip.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:…`;
  return ip;
}

function buildDeviceRegistry(db) {
  const license = normalizeLicense(db.settings?.license || {});
  const devices = (db.devices || []).map((device) => ({
    id: device.id,
    name: device.name || "Statie de lucru",
    active: device.active !== false,
    createdAt: device.createdAt || "",
    lastSeenAt: device.lastSeenAt || "",
    lastIp: device.lastIp || "",
    lastUsername: device.lastUsername || "",
    lastUserName: device.lastUserName || "",
    userAgent: device.lastUserAgent || device.firstUserAgent || ""
  }));
  return {
    devices,
    pendingRequests: (db.workstationRequests || [])
      .filter((request) => request.status === "pending")
      .map(publicWorkstationRequest),
    recentRequests: (db.workstationRequests || [])
      .filter((request) => request.status !== "pending")
      .slice(-10)
      .reverse()
      .map(publicWorkstationRequest),
    activeCount: devices.filter((device) => device.active).length,
    maxDevices: license.maxDevices,
    networkAccessMode: normalizeNetworkAccessMode(db.settings?.networkAccessMode)
  };
}

function publicWorkstationRequest(request) {
  return {
    id: request.id,
    stationName: request.stationName || "Statie de lucru",
    departmentName: request.departmentName || "",
    requestedUserName: request.requestedUserName || "",
    requestedUsername: request.requestedUsername || "",
    requestedRole: request.requestedRole || "department",
    status: request.status || "pending",
    deviceId: request.deviceId || "",
    ip: request.ip || "",
    createdAt: request.createdAt || "",
    resolvedAt: request.resolvedAt || "",
    resolvedByName: request.resolvedByName || ""
  };
}

function approveWorkstationRequest(db, actor, requestId, body) {
  const request = (db.workstationRequests || []).find((item) => item.id === requestId);
  if (!request) throwHttp(404, "Cerere statie inexistenta.");
  if (request.status !== "pending") throwHttp(409, "Cererea nu mai este in asteptare.");
  const departmentName = String(body.departmentName || request.departmentName || "").trim();
  const role = rolePermissions[String(body.role || request.requestedRole || "department")] ? String(body.role || request.requestedRole || "department") : "department";
  const username = normalizeUsername(body.username || request.requestedUsername || suggestedUsername(request.requestedUserName));
  const name = String(body.name || request.requestedUserName || username).trim();
  const password = String(body.password || "");
  if (!departmentName) throwHttp(400, "Departamentul este obligatoriu.");
  if (!name) throwHttp(400, "Numele utilizatorului este obligatoriu.");
  assertPasswordPolicy(password, { username, name }, db.settings || {});
  let department = (db.departments || []).find((item) => item.name.toLowerCase() === departmentName.toLowerCase());
  if (!department) {
    department = {
      id: id("dept"),
      name: departmentName,
      moduleKey: moduleKeyForDepartmentName(departmentName),
      permissions: defaultPermissionsForDepartmentName(departmentName),
      createdBy: actor.id,
      createdAt: new Date().toISOString()
    };
    db.departments.push(department);
  }
  const user = createUser(db, actor, {
    name,
    username,
    password,
    role,
    departmentId: department.id,
    active: true
  });
  const device = {
    id: request.deviceId,
    name: request.stationName || "Statie de lucru",
    active: true,
    createdAt: request.createdAt || new Date().toISOString(),
    firstIp: request.ip || "",
    firstUserAgent: request.userAgent || "",
    lastSeenAt: new Date().toISOString(),
    lastIp: request.ip || "",
    lastUserAgent: request.userAgent || "",
    lastUserId: user.id,
    lastUsername: user.username,
    lastUserName: user.name,
    departmentId: department.id,
    departmentName: department.name
  };
  const existingDeviceIndex = (db.devices || []).findIndex((item) => item.id === device.id);
  if (existingDeviceIndex >= 0) db.devices[existingDeviceIndex] = { ...db.devices[existingDeviceIndex], ...device };
  else db.devices.push(device);
  request.status = "approved";
  request.resolvedAt = new Date().toISOString();
  request.resolvedBy = actor.id;
  request.resolvedByName = actor.name;
  request.createdUserId = user.id;
  request.departmentId = department.id;
  return { request: publicWorkstationRequest(request), user: adminUser(user), department: adminDepartment(department), device };
}

function updateWorkstationRequestStatus(db, actor, requestId, status) {
  const request = (db.workstationRequests || []).find((item) => item.id === requestId);
  if (!request) throwHttp(404, "Cerere statie inexistenta.");
  request.status = status;
  request.resolvedAt = new Date().toISOString();
  request.resolvedBy = actor.id;
  request.resolvedByName = actor.name;
  return publicWorkstationRequest(request);
}

function suggestedUsername(value) {
  const clean = String(value || "utilizator").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 28);
  return clean || `user.${Date.now().toString(36)}`;
}

function normalizeUsername(value) {
  const username = suggestedUsername(value);
  return /^[a-z0-9._-]{3,32}$/.test(username) ? username : `user.${Date.now().toString(36)}`;
}

function defaultPermissionsForDepartmentName(name) {
  const key = moduleKeyForDepartmentName(name);
  const module = licenseModulePermissions[key] || [];
  const base = new Set(["dashboard:view", "department_requests:view", "department_requests:create"]);
  module.forEach((permission) => base.add(permission));
  return Array.from(base).filter((permission) => allPermissions.includes(permission));
}

function activeDevices(db) {
  return (db.devices || []).filter((device) => device.active !== false);
}

function removeRegisteredDevice(db, idValue) {
  const deviceId = normalizeDeviceId(idValue);
  const index = (db.devices || []).findIndex((device) => device.id === deviceId);
  if (index === -1) throwHttp(404, "Statia de lucru nu exista.");
  const [device] = db.devices.splice(index, 1);
  return device;
}

function normalizeDeviceId(value) {
  const idValue = String(value || "").trim().toLowerCase();
  if (/^[a-z0-9._:-]{12,96}$/.test(idValue)) return idValue;
  return fallbackDeviceId(idValue, "");
}

function fallbackDeviceId(ip, userAgent) {
  return `device-${crypto.createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 24)}`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return localDate(date);
}

function validLogoDataUrl(value) {
  const logo = String(value || "");
  if (!logo) return "";
  if (logo.length > 500_000) throwHttp(400, "Logo-ul este prea mare. Foloseste o imagine sub 500 KB.");
  if (!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(logo)) {
    throwHttp(400, "Logo invalid. Sunt acceptate imagini PNG, JPG, WEBP sau SVG.");
  }
  return logo;
}

function validateRestoreData(data) {
  if (!data || typeof data !== "object") throwHttp(400, "Backup invalid.");
  const requiredArrays = [
    "users", "materials", "recipes", "consumptions", "deliveries",
    "stockMovements", "productionPlans", "audit", "departmentRequests",
    "departmentStocks", "departmentConsumptions"
  ];
  requiredArrays.forEach((key) => {
    if (!Array.isArray(data[key])) throwHttp(400, `Backup invalid: lipseste ${key}.`);
  });
  if (!data.settings || typeof data.settings !== "object") throwHttp(400, "Backup invalid: lipsesc setarile.");
  return {
    version: Number(data.version || 1),
    settings: updateSettings(data.settings, data.settings),
    users: data.users,
    materials: data.materials,
    recipes: data.recipes,
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    consumptions: data.consumptions,
    deliveries: data.deliveries,
    stockMovements: data.stockMovements,
    productionPlans: data.productionPlans,
    projects: Array.isArray(data.projects) ? data.projects : [],
    departmentConnections: Array.isArray(data.departmentConnections) ? data.departmentConnections : [],
    workflowTemplates: Array.isArray(data.workflowTemplates) ? data.workflowTemplates : [],
    workflowRequests: Array.isArray(data.workflowRequests) ? data.workflowRequests : [],
    workflowAudit: Array.isArray(data.workflowAudit) ? data.workflowAudit : [],
    departmentRequests: Array.isArray(data.departmentRequests) ? data.departmentRequests : [],
    departmentStocks: Array.isArray(data.departmentStocks) ? data.departmentStocks : [],
    departmentConsumptions: Array.isArray(data.departmentConsumptions) ? data.departmentConsumptions : [],
    procurementOrders: Array.isArray(data.procurementOrders) ? data.procurementOrders : [],
    procurementReceipts: Array.isArray(data.procurementReceipts) ? data.procurementReceipts : [],
    fleetAssets: Array.isArray(data.fleetAssets) ? data.fleetAssets : [],
    fleetRequests: Array.isArray(data.fleetRequests) ? data.fleetRequests : [],
    fleetMeterReadings: Array.isArray(data.fleetMeterReadings) ? data.fleetMeterReadings : [],
    costCenters: Array.isArray(data.costCenters) ? data.costCenters : [],
    technicalWorkLogs: Array.isArray(data.technicalWorkLogs) ? data.technicalWorkLogs : [],
    technicalClients: Array.isArray(data.technicalClients) ? data.technicalClients : [],
    asphaltSales: Array.isArray(data.asphaltSales) ? data.asphaltSales : [],
    nexusExpenses: Array.isArray(data.nexusExpenses) ? data.nexusExpenses : [],
    devices: Array.isArray(data.devices) ? data.devices : [],
    workstationRequests: Array.isArray(data.workstationRequests) ? data.workstationRequests : [],
    audit: data.audit
  };
}

function createRecipe(db, user, body) {
  const name = String(body.name || "").trim();
  if (!name) throwHttp(400, "Numele retetei este obligatoriu.");
  const percentages = normalizeRecipePercentages(db, body.percentages || {});
  const recipe = {
    id: id("reteta"),
    name,
    version: 1,
    active: true,
    percentages,
    createdBy: user.id,
    createdAt: new Date().toISOString()
  };
  db.recipes.push(recipe);
  return recipe;
}

function updateRecipe(db, user, recipeId, body) {
  const recipe = db.recipes.find((item) => item.id === recipeId);
  if (!recipe) throwHttp(404, "Reteta inexistenta.");
  const name = String(body.name || recipe.name).trim();
  if (!name) throwHttp(400, "Numele retetei este obligatoriu.");
  recipe.name = name;
  recipe.percentages = normalizeRecipePercentages(db, body.percentages || recipe.percentages || {});
  recipe.version = Number(recipe.version || 1) + 1;
  recipe.updatedBy = user.id;
  recipe.updatedAt = new Date().toISOString();
  return recipe;
}

function deleteRecipe(db, user, recipeId) {
  const recipe = db.recipes.find((item) => item.id === recipeId);
  if (!recipe) throwHttp(404, "Reteta inexistenta.");
  const activeRecipes = db.recipes.filter((item) => item.active !== false);
  if (activeRecipes.length <= 1 && recipe.active !== false) throwHttp(400, "Nu poti sterge sau arhiva ultima reteta disponibila.");
  const usage = [];
  if (db.consumptions.some((item) => item.recipeId === recipeId)) usage.push("consumuri");
  if (db.productionPlans.some((item) => item.recipeId === recipeId)) usage.push("planuri");
  if ((db.departmentRequests || []).some((item) => item.recipeId === recipeId)) usage.push("solicitari");
  if (usage.length) {
    recipe.active = false;
    recipe.archivedBy = user.id;
    recipe.archivedAt = new Date().toISOString();
    recipe.archiveReason = `Folosita in ${usage.join(", ")}; pastrata pentru istoric.`;
    return recipe;
  }
  db.recipes = db.recipes.filter((item) => item.id !== recipeId);
  recipe.deletedBy = user.id;
  recipe.deletedAt = new Date().toISOString();
  return recipe;
}

function normalizeRecipePercentages(db, percentages) {
  return Object.fromEntries(db.materials
    .filter((material) => material.recipeMaterial)
    .map((material) => [material.id, round(Number(percentages[material.id] || 0))]));
}

function createConsumption(db, user, body) {
  if (db.settings?.initialStockCompleted !== true) {
    throwHttp(409, "Consumurile sunt blocate pana la finalizarea stocurilor initiale in sectiunea Stocuri.");
  }
  const recipe = db.recipes.find((item) => item.id === body.recipeId && item.active !== false);
  if (!recipe) throwHttp(404, "Reteta inexistenta.");
  const asphalt = round(Number(body.asphalt || 0));
  if (asphalt <= 0) throwHttp(400, "Cantitatea de asfalt trebuie sa fie mai mare decat zero.");
  const date = String(body.date || localDate(new Date()));
  const materialUsage = db.materials.map((material) => {
    const amount = material.recipeMaterial ? asphalt * Number(recipe.percentages?.[material.id] || 0) / 100 : Number(body.emulsion || 0);
    return {
      materialId: material.id,
      materialName: material.name,
      amount: round(amount),
      unit: material.unit
    };
  });
  materialUsage.forEach((usage) => {
    const material = db.materials.find((item) => item.id === usage.materialId);
    material.stock = round(Number(material.stock || 0) - usage.amount);
    db.stockMovements.push({
      id: id("stock"),
      type: "consumption",
      materialId: material.id,
      materialName: material.name,
      date,
      amount: -usage.amount,
      unit: material.unit,
      note: `${body.jobName || "-"} / ${recipe.name}`,
      createdAt: new Date().toISOString()
    });
  });
  const consumption = {
    id: id("consum"),
    reportNo: nextReportNo(db, date),
    date,
    jobName: String(body.jobName || "").trim(),
    ticket: String(body.ticket || "").trim(),
    operatorId: user.id,
    operatorName: user.name,
    recipeId: recipe.id,
    recipeName: recipe.name,
    recipeVersion: recipe.version || 1,
    recipeSnapshot: recipe.percentages,
    asphalt,
    emulsion: round(Number(body.emulsion || 0)),
    materials: materialUsage,
    canceled: false,
    createdAt: new Date().toISOString()
  };
  db.consumptions.push(consumption);
  return consumption;
}

function cancelConsumption(db, user, idValue) {
  const consumption = db.consumptions.find((item) => item.id === idValue);
  if (!consumption || consumption.canceled) throwHttp(404, "Consumul nu poate fi anulat.");
  consumption.materials.forEach((usage) => {
    const material = db.materials.find((item) => item.id === usage.materialId);
    if (!material) return;
    material.stock = round(Number(material.stock || 0) + Number(usage.amount || 0));
    db.stockMovements.push({
      id: id("stock"),
      type: "cancel_consumption",
      materialId: material.id,
      materialName: material.name,
      date: localDate(new Date()),
      amount: round(Number(usage.amount || 0)),
      unit: material.unit,
      note: consumption.reportNo,
      createdAt: new Date().toISOString()
    });
  });
  consumption.canceled = true;
  consumption.canceledAt = new Date().toISOString();
  consumption.canceledBy = user.id;
  return consumption;
}

function createDelivery(db, user, body) {
  let createdMaterial = null;
  if (String(body.materialId || "") === "__new__") {
    createdMaterial = createMaterial(db, user, {
      ...(body.newMaterial || {}),
      stock: 0,
      stockDate: body.date
    });
    body.materialId = createdMaterial.id;
  }
  const material = db.materials.find((item) => item.id === body.materialId);
  if (!material) throwHttp(404, "Material inexistent.");
  const amount = round(Number(body.amount || 0));
  if (amount <= 0) throwHttp(400, "Cantitatea trebuie sa fie mai mare decat zero.");
  material.stock = round(Number(material.stock || 0) + amount);
  const delivery = {
    id: id("intrare"),
    date: String(body.date || localDate(new Date())),
    materialId: material.id,
    materialName: material.name,
    amount,
    unit: material.unit,
    supplier: String(body.supplier || "").trim(),
    document: String(body.document || "").trim(),
    operatorId: user.id,
    operatorName: user.name,
    canceled: false,
    createdAt: new Date().toISOString()
  };
  if (createdMaterial) delivery.createdMaterial = createdMaterial;
  db.deliveries.push(delivery);
  db.stockMovements.push({
    id: id("stock"),
    type: "delivery",
    materialId: material.id,
    materialName: material.name,
    date: delivery.date,
    amount,
    unit: material.unit,
    note: [delivery.document, delivery.supplier].filter(Boolean).join(" / "),
    createdAt: new Date().toISOString()
  });
  return delivery;
}

function cancelDelivery(db, user, idValue) {
  const delivery = db.deliveries.find((item) => item.id === idValue);
  if (!delivery || delivery.canceled) throwHttp(404, "Aprovizionarea nu poate fi anulata.");
  const material = db.materials.find((item) => item.id === delivery.materialId);
  if (!material) throwHttp(404, "Material inexistent.");
  material.stock = round(Number(material.stock || 0) - Number(delivery.amount || 0));
  db.stockMovements.push({
    id: id("stock"),
    type: "cancel_delivery",
    materialId: material.id,
    materialName: material.name,
    date: localDate(new Date()),
    amount: -round(Number(delivery.amount || 0)),
    unit: material.unit,
    note: [delivery.document, delivery.supplier].filter(Boolean).join(" / "),
    createdAt: new Date().toISOString()
  });
  delivery.canceled = true;
  delivery.canceledAt = new Date().toISOString();
  delivery.canceledBy = user.id;
  delivery.canceledByName = user.name;
  const receipt = delivery.sourceReceiptId
    ? (db.procurementReceipts || []).find((item) => item.id === delivery.sourceReceiptId)
    : null;
  if (receipt && !receipt.canceled) {
    receipt.canceled = true;
    receipt.canceledAt = delivery.canceledAt;
    receipt.canceledBy = user.id;
    receipt.canceledByName = user.name;
  }
  if (delivery.sourceOrderId) syncProcurementOrderTotals(db, user, delivery.sourceOrderId);
  return delivery;
}

function deleteDelivery(db, user, idValue) {
  const delivery = db.deliveries.find((item) => item.id === idValue);
  if (!delivery || delivery.deleted) throwHttp(404, "Aprovizionarea nu poate fi stearsa.");
  if (!delivery.canceled) cancelDelivery(db, user, idValue);
  delivery.deleted = true;
  delivery.deletedAt = new Date().toISOString();
  delivery.deletedBy = user.id;
  delivery.deletedByName = user.name;
  const receipt = delivery.sourceReceiptId
    ? (db.procurementReceipts || []).find((item) => item.id === delivery.sourceReceiptId)
    : null;
  if (receipt) {
    receipt.canceled = true;
    receipt.deleted = true;
    receipt.deletedAt = delivery.deletedAt;
    receipt.deletedBy = user.id;
    receipt.deletedByName = user.name;
  }
  if (delivery.sourceOrderId) syncProcurementOrderTotals(db, user, delivery.sourceOrderId);
  return { delivery };
}

function procurementOrdersView(db) {
  return (db.procurementOrders || [])
    .filter((order) => !order.deleted)
    .map((order) => {
      const receivedAmount = round((db.procurementReceipts || [])
        .filter((receipt) => receipt.orderId === order.id && !receipt.canceled && !receipt.deleted)
        .reduce((total, receipt) => total + Number(receipt.amount || 0), 0));
      const remainingAmount = Math.max(0, round(Number(order.amount || 0) - receivedAmount));
      const status = order.closedAt || remainingAmount <= 0 ? "closed" : receivedAmount > 0 ? "partial" : order.status || "open";
      return {
        ...order,
        receivedAmount,
        remainingAmount,
        status
      };
    })
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
}

function procurementStatusLabel(status) {
  return {
    open: "Deschisa",
    partial: "Partiala",
    closed: "Inchisa",
    canceled: "Anulata"
  }[status] || status || "-";
}

function createProcurementOrder(db, user, body) {
  const material = db.materials.find((item) => item.id === body.materialId);
  if (!material) throwHttp(404, "Material inexistent.");
  const amount = round(Number(body.amount || 0));
  if (amount <= 0) throwHttp(400, "Cantitatea comandata trebuie sa fie mai mare decat zero.");
  const orderNo = String(body.orderNo || "").trim();
  if (!orderNo) throwHttp(400, "Numarul comenzii este obligatoriu.");
  const order = {
    id: id("po"),
    date: validDateValue(body.date) ? String(body.date) : localDate(new Date()),
    expectedDate: validDateValue(body.expectedDate) ? String(body.expectedDate) : "",
    orderNo,
    supplier: String(body.supplier || "").trim(),
    materialId: material.id,
    materialName: material.name,
    amount,
    receivedAmount: 0,
    remainingAmount: amount,
    unit: material.unit,
    status: "open",
    note: String(body.note || "").trim(),
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.procurementOrders.push(order);
  return order;
}

function receiveProcurementOrder(db, user, orderId, body) {
  const order = (db.procurementOrders || []).find((item) => item.id === orderId);
  if (!order) throwHttp(404, "Comanda inexistenta.");
  if (order.status === "closed" || order.status === "canceled") throwHttp(400, "Comanda este inchisa.");
  const material = db.materials.find((item) => item.id === order.materialId);
  if (!material) throwHttp(404, "Material inexistent.");
  const amount = round(Number(body.amount || 0));
  if (amount <= 0) throwHttp(400, "Cantitatea receptionata trebuie sa fie mai mare decat zero.");
  const document = String(body.document || "").trim();
  const cmr = String(body.cmr || "").trim();
  const scaleTicket = String(body.scaleTicket || "").trim();
  const scaleTicketId = String(body.scaleTicketId || "").trim();
  const scaleProduct = String(body.scaleProduct || "").trim();
  const usedReceipt = findUsedScaleReceipt(db, scaleTicketId, scaleTicket);
  if (usedReceipt) {
    throwHttp(400, `Tichetul cantar ${scaleTicket || scaleTicketId} este deja folosit la comanda ${usedReceipt.orderNo || "-"} din ${usedReceipt.date || "-"}.`);
  }
  const scaleMapping = scaleProduct ? scaleMaterialForProduct(db, scaleProduct) : null;
  if (scaleMapping?.material && scaleMapping.material.id !== material.id) {
    throwHttp(400, `Produsul din cantar "${scaleProduct}" este mapat la ${scaleMapping.material.name}, dar comanda aleasa este pentru ${material.name}. Alege comanda corecta sau schimba maparea.`);
  }
  const vehicleNo = String(body.vehicleNo || "").trim();
  const trailerNo = String(body.trailerNo || "").trim();
  const receipt = {
    id: id("receptie"),
    orderId: order.id,
    orderNo: order.orderNo,
    date: validDateValue(body.date) ? String(body.date) : localDate(new Date()),
    materialId: material.id,
    materialName: material.name,
    amount,
    unit: material.unit,
    supplier: order.supplier,
    document,
    cmr,
    scaleTicket,
    scaleTicketId,
    scaleProduct,
    vehicleNo,
    trailerNo,
    note: String(body.note || "").trim(),
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.procurementReceipts.push(receipt);
  material.stock = round(Number(material.stock || 0) + amount);
  const delivery = {
    id: id("intrare"),
    date: receipt.date,
    materialId: material.id,
    materialName: material.name,
    amount,
    unit: material.unit,
    supplier: receipt.supplier,
    document: [document, cmr, scaleTicket].filter(Boolean).join(" / "),
    operatorId: user.id,
    operatorName: user.name,
    sourceOrderId: order.id,
    sourceReceiptId: receipt.id,
    scaleTicketId,
    scaleProduct,
    canceled: false,
    createdAt: new Date().toISOString()
  };
  db.deliveries.push(delivery);
  db.stockMovements.push({
    id: id("stock"),
    type: "delivery",
    materialId: material.id,
    materialName: material.name,
    date: receipt.date,
    amount,
    unit: material.unit,
    note: [order.orderNo, document, cmr, scaleTicket, scaleProduct, vehicleNo, trailerNo].filter(Boolean).join(" / "),
    createdAt: new Date().toISOString()
  });
  const view = procurementOrdersView(db).find((item) => item.id === order.id);
  order.receivedAmount = view.receivedAmount;
  order.remainingAmount = view.remainingAmount;
  order.status = view.remainingAmount <= 0 ? "closed" : "partial";
  order.updatedAt = new Date().toISOString();
  order.updatedBy = user.id;
  order.updatedByName = user.name;
  return { order: { ...order }, receipt, delivery };
}

function closeProcurementOrder(db, user, orderId) {
  const order = (db.procurementOrders || []).find((item) => item.id === orderId);
  if (!order) throwHttp(404, "Comanda inexistenta.");
  order.status = "closed";
  order.closedAt = new Date().toISOString();
  order.closedBy = user.id;
  order.closedByName = user.name;
  const view = procurementOrdersView(db).find((item) => item.id === order.id);
  order.receivedAmount = view.receivedAmount;
  order.remainingAmount = view.remainingAmount;
  return order;
}

function syncProcurementOrderTotals(db, user, orderId) {
  const order = (db.procurementOrders || []).find((item) => item.id === orderId);
  if (!order || order.deleted) return null;
  const receivedAmount = round((db.procurementReceipts || [])
    .filter((receipt) => receipt.orderId === order.id && !receipt.canceled && !receipt.deleted)
    .reduce((total, receipt) => total + Number(receipt.amount || 0), 0));
  order.receivedAmount = receivedAmount;
  order.remainingAmount = Math.max(0, round(Number(order.amount || 0) - receivedAmount));
  if (order.status !== "canceled" && !order.closedAt) {
    order.status = order.remainingAmount <= 0 ? "closed" : receivedAmount > 0 ? "partial" : "open";
  }
  order.updatedAt = new Date().toISOString();
  order.updatedBy = user.id;
  order.updatedByName = user.name;
  return order;
}

function deleteProcurementOrder(db, user, orderId) {
  const order = (db.procurementOrders || []).find((item) => item.id === orderId);
  if (!order || order.deleted) throwHttp(404, "Comanda nu poate fi stearsa.");
  let reversedDeliveries = 0;
  const reversedReceiptIds = new Set();
  (db.deliveries || [])
    .filter((delivery) => delivery.sourceOrderId === order.id && !delivery.deleted)
    .forEach((delivery) => {
      if (!delivery.canceled) {
        cancelDelivery(db, user, delivery.id);
        reversedDeliveries += 1;
      }
      if (delivery.sourceReceiptId) reversedReceiptIds.add(delivery.sourceReceiptId);
      delivery.deleted = true;
      delivery.deletedAt = new Date().toISOString();
      delivery.deletedBy = user.id;
      delivery.deletedByName = user.name;
    });
  let deletedReceipts = 0;
  (db.procurementReceipts || [])
    .filter((receipt) => receipt.orderId === order.id && !receipt.deleted)
    .forEach((receipt) => {
      if (!receipt.canceled && !reversedReceiptIds.has(receipt.id)) {
        const material = (db.materials || []).find((item) => item.id === receipt.materialId);
        if (material) {
          const amount = round(Number(receipt.amount || 0));
          material.stock = round(Number(material.stock || 0) - amount);
          db.stockMovements.push({
            id: id("stock"),
            type: "cancel_delivery",
            materialId: material.id,
            materialName: material.name,
            date: localDate(new Date()),
            amount: -amount,
            unit: material.unit,
            note: [order.orderNo, receipt.document, receipt.cmr, receipt.scaleTicket, "stergere comanda"].filter(Boolean).join(" / "),
            createdAt: new Date().toISOString()
          });
          reversedDeliveries += 1;
        }
      }
      receipt.canceled = true;
      receipt.canceledAt = receipt.canceledAt || new Date().toISOString();
      receipt.canceledBy = receipt.canceledBy || user.id;
      receipt.canceledByName = receipt.canceledByName || user.name;
      receipt.deleted = true;
      receipt.deletedAt = new Date().toISOString();
      receipt.deletedBy = user.id;
      receipt.deletedByName = user.name;
      deletedReceipts += 1;
    });
  order.deleted = true;
  order.deletedAt = new Date().toISOString();
  order.deletedBy = user.id;
  order.deletedByName = user.name;
  order.status = "deleted";
  order.receivedAmount = 0;
  order.remainingAmount = Number(order.amount || 0);
  return { order, reversedDeliveries, deletedReceipts };
}

function setScaleProductMap(db, user, body) {
  const product = String(body.product || "").trim();
  if (!product) throwHttp(400, "Produsul din cantar este obligatoriu.");
  const productKey = normalizeScaleProductName(product);
  if (!productKey) throwHttp(400, "Produsul din cantar nu poate fi mapat.");
  const materialId = String(body.materialId || "").trim();
  const material = (db.materials || []).find((item) => item.id === materialId);
  if (!material) throwHttp(404, "Materialul ales pentru mapare nu exista.");
  db.settings.scaleProductMap = normalizeScaleProductMap(db.settings.scaleProductMap || {});
  db.settings.scaleProductMap[productKey] = material.id;
  db.settings.scaleProductMapUpdatedAt = new Date().toISOString();
  db.settings.scaleProductMapUpdatedBy = user.id;
  db.settings.scaleProductMapUpdatedByName = user.name;
  return {
    product,
    productKey,
    materialId: material.id,
    materialName: material.name,
    unit: material.unit
  };
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

function scaleMaterialForProduct(db, product) {
  const productKey = normalizeScaleProductName(product);
  if (!productKey) return { material: null, source: "" };
  const manualId = normalizeScaleProductMap(db.settings?.scaleProductMap || {})[productKey];
  const manualMaterial = (db.materials || []).find((item) => item.id === manualId);
  if (manualMaterial) return { material: manualMaterial, source: "manual" };
  const inferredMaterial = inferScaleMaterial(db, productKey);
  return inferredMaterial
    ? { material: inferredMaterial, source: "automat" }
    : { material: null, source: "" };
}

function inferScaleMaterial(db, productKey) {
  const materials = db.materials || [];
  const byId = (idValue) => materials.find((item) => item.id === idValue);
  const byName = (needle) => materials.find((item) => normalizeScaleProductName(item.name).includes(needle));
  const exact = materials.find((item) => {
    const materialKey = normalizeScaleProductName(item.name);
    return materialKey && (productKey === materialKey || productKey.includes(materialKey) || materialKey.includes(productKey));
  });
  if (exact) return exact;
  if (productKey.includes("BITUM")) return byId("bitum") || byName("BITUM");
  if (productKey.includes("FILER")) return byId("filer") || byName("FILER");
  if (productKey.includes("EMULSIE")) return byId("emulsie") || byName("EMULSIE");
  if (/\b0\s*4\b/.test(productKey)) return byId("agregate-0-4") || byName("0 4");
  if (/\b4\s*8\b/.test(productKey)) return byId("agregate-4-8") || byName("4 8");
  if (/\b8\s*16\b/.test(productKey)) return byId("agregate-8-16") || byName("8 16");
  if (/\b16\s*22\b/.test(productKey) || /\b16\s*22\s*4\b/.test(productKey)) return byId("agregate-16-22-4") || byName("16 22");
  return null;
}

function findUsedScaleReceipt(db, scaleTicketId, scaleTicket) {
  const keys = [scaleTicketId, scaleTicket].map((item) => String(item || "").trim()).filter(Boolean);
  if (!keys.length) return null;
  return (db.procurementReceipts || []).find((receipt) => {
    if (receipt.canceled) return false;
    const receiptKeys = [receipt.scaleTicketId, receipt.scaleTicket].map((item) => String(item || "").trim()).filter(Boolean);
    return keys.some((key) => receiptKeys.includes(key));
  }) || null;
}

function usedScaleTicketMap(db) {
  const used = new Map();
  (db.procurementReceipts || []).forEach((receipt) => {
    if (receipt.canceled) return;
    [receipt.scaleTicketId, receipt.scaleTicket].forEach((key) => {
      const normalized = String(key || "").trim();
      if (!normalized) return;
      used.set(normalized, {
        receiptId: receipt.id,
        orderId: receipt.orderId,
        orderNo: receipt.orderNo,
        date: receipt.date,
        materialName: receipt.materialName
      });
    });
  });
  return used;
}

function scaleStatus(settings = {}) {
  const dbPath = resolveScaleDbPath(settings);
  const status = {
    configuredPath: String(settings.scaleDbPath || "").trim(),
    path: dbPath || "",
    exists: Boolean(dbPath && fs.existsSync(dbPath)),
    readable: false,
    tickets: 0,
    error: ""
  };
  if (!status.exists) return status;
  try {
    const sqlite = loadSqlite();
    const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
    status.tickets = Number(db.prepare("select count(*) as c from tichete_cantarire").get().c || 0);
    status.readable = true;
    db.close();
  } catch (error) {
    status.error = error.message;
  }
  return status;
}

function readScaleTickets(appDb = {}, url) {
  const status = scaleStatus(appDb.settings || {});
  if (!status.exists) throwHttp(404, "Baza Cantar Auto nu a fost gasita. Configureaza calea in Setari.");
  if (!status.readable) throwHttp(400, `Baza Cantar Auto nu poate fi citita: ${status.error || "eroare necunoscuta"}`);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const type = String(url.searchParams.get("type") || "").trim().toLowerCase();
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") || 50)));
  const rawLimit = Math.min(10000, Math.max(500, limit * 50));
  const usedTickets = usedScaleTicketMap(appDb);
  const sqlite = loadSqlite();
  const db = new sqlite.DatabaseSync(status.path, { readOnly: true });
  try {
    const rows = db.prepare(`
      select
        cantarire_id,
        nr_tichet,
        tip_inregistrare,
        nr_inmatriculare,
        nr_trailer,
        nr_comanda,
        nr_aviz,
        client,
        furnizor,
        produs,
        um,
        greutate_prima_cantarire,
        data_prima_cantarire,
        greutate_a_doua_cantarire,
        data_a_doua_cantarire,
        greutate_neta,
        operator,
        comentarii
      from tichete_cantarire
      where greutate_neta is not null and greutate_neta > 0
      order by cantarire_id desc
      limit ?
    `).all(rawLimit);
    const tickets = rows.map(normalizeScaleTicket)
      .map((ticket) => enrichScaleTicket(appDb, usedTickets, ticket))
      .filter((ticket) => !from || ticket.date >= from)
      .filter((ticket) => !to || ticket.date <= to)
      .filter((ticket) => !type || String(ticket.type || "").toLowerCase() === type)
      .filter((ticket) => !query || scaleTicketSearchText(ticket).includes(query))
      .slice(0, limit);
    return { status, tickets };
  } finally {
    db.close();
  }
}

function enrichScaleTicket(appDb, usedTickets, ticket) {
  const mapping = scaleMaterialForProduct(appDb, ticket.product);
  const used = usedTickets.get(ticket.id) || usedTickets.get(ticket.ticketNo) || null;
  return {
    ...ticket,
    productKey: normalizeScaleProductName(ticket.product),
    mappedMaterialId: mapping.material?.id || "",
    mappedMaterialName: mapping.material?.name || "",
    mappedMaterialUnit: mapping.material?.unit || "",
    mappingSource: mapping.source || "",
    used: Boolean(used),
    usedReceiptId: used?.receiptId || "",
    usedByOrderId: used?.orderId || "",
    usedByOrderNo: used?.orderNo || "",
    usedDate: used?.date || "",
    usedMaterialName: used?.materialName || ""
  };
}

function normalizeScaleTicket(row) {
  const second = julianToLocalDateTime(row.data_a_doua_cantarire);
  const first = julianToLocalDateTime(row.data_prima_cantarire);
  const dateTime = second.date ? second : first;
  const unit = String(row.um || "kg").trim() || "kg";
  const net = round(Number(row.greutate_neta || 0));
  const unitLower = unit.toLowerCase();
  return {
    id: String(row.cantarire_id),
    ticketNo: String(row.nr_tichet || row.cantarire_id || "").trim(),
    type: String(row.tip_inregistrare || "").trim(),
    date: dateTime.date || localDate(new Date()),
    time: dateTime.time || "",
    vehicleNo: String(row.nr_inmatriculare || "").trim(),
    trailerNo: String(row.nr_trailer || "").trim(),
    orderNo: String(row.nr_comanda || "").trim(),
    document: String(row.nr_aviz || "").trim(),
    client: String(row.client || "").trim(),
    supplier: String(row.furnizor || "").trim(),
    product: String(row.produs || "").trim(),
    unit,
    netWeight: net,
    amountKg: unitLower === "kg" ? net : unitLower === "t" || unitLower === "tona" || unitLower === "tone" ? round(net * 1000) : net,
    amountTons: unitLower === "kg" ? round(net / 1000) : unitLower === "t" || unitLower === "tona" || unitLower === "tone" ? net : round(net / 1000),
    firstWeight: round(Number(row.greutate_prima_cantarire || 0)),
    secondWeight: round(Number(row.greutate_a_doua_cantarire || 0)),
    operator: String(row.operator || "").trim(),
    note: String(row.comentarii || "").trim()
  };
}

function scaleTicketSearchText(ticket) {
  return [
    ticket.ticketNo,
    ticket.type,
    ticket.vehicleNo,
    ticket.trailerNo,
    ticket.orderNo,
    ticket.document,
    ticket.client,
    ticket.supplier,
    ticket.product,
    ticket.mappedMaterialName,
    ticket.usedByOrderNo,
    ticket.note
  ].join(" ").toLowerCase();
}

function julianToLocalDateTime(value) {
  const julian = Number(value || 0);
  if (!Number.isFinite(julian) || julian <= 0) return { date: "", time: "" };
  const date = new Date((julian - 2440587.5) * 86400000);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toISOString().slice(11, 16)
  };
}

function loadSqlite() {
  try {
    return require("node:sqlite");
  } catch {
    throwHttp(500, "Runtime-ul Node.js nu include suport SQLite. Foloseste runtime-ul inclus in pachetul InfraFlow actualizat.");
  }
}

function resolveScaleDbPath(settings = {}) {
  const configured = String(settings.scaleDbPath || "").trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(ROOT, configured);
  const candidates = [
    path.resolve(ROOT, "..", "Cantar Auto", "dbs", "cantare.db"),
    path.resolve(ROOT, "Cantar Auto", "dbs", "cantare.db")
  ];
  return candidates.find((item) => fs.existsSync(item)) || candidates[0] || "";
}

function fleetAssetsView(db) {
  return (db.fleetAssets || [])
    .slice()
    .sort((a, b) => String(a.name || a.registration || "").localeCompare(String(b.name || b.registration || "")));
}

function fleetRequestsView(db) {
  return (db.fleetRequests || []).slice().sort(sortNewest);
}

function fleetCategoryLabel(category) {
  return category === "vehicle" ? "Autovehicul" : "Utilaj";
}

function fleetAssetLabel(asset) {
  return [asset.registration, asset.name || asset.assetName, asset.type].filter(Boolean).join(" / ") || asset.assetName || asset.category || "-";
}

function fleetAssetShortLabel(asset) {
  const category = asset.category || "";
  const identifier = category === "vehicle"
    ? asset.registration
    : (asset.assetCode || asset.registration || asset.assetCostCenterName || asset.costCenterName || asset.inventoryNo || asset.serialNo);
  const descriptor = category === "vehicle"
    ? [asset.brand || asset.assetBrand, asset.type || asset.assetType].filter(Boolean).join(" ")
    : (asset.type || asset.assetType || asset.name || asset.assetName);
  return [identifier, compactFleetLabelText(descriptor)].filter(Boolean).join(" - ") || fleetAssetLabel(asset);
}

function fleetRequestAssetLabel(db, request) {
  const asset = (db.fleetAssets || []).find((item) => item.id === request.assetId) || request;
  return fleetAssetShortLabel(asset);
}

function compactFleetLabelText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^[A-Z0-9 ._/-]+$/.test(text) && /[A-Z]/.test(text)) {
    return text.toLowerCase().replace(/(^|[\s/_-])([a-z])/g, (_, separator, letter) => `${separator}${letter.toUpperCase()}`);
  }
  return text;
}

function fleetStatusLabel(status) {
  return {
    new: "Noua",
    approved: "Aprobata",
    planned: "Planificata",
    done: "Realizata",
    rejected: "Respinsa",
    canceled: "Anulata"
  }[status] || status || "-";
}

function normalizeFleetMeterUnit(value) {
  const unit = String(value || "").trim().toLowerCase();
  return unit === "hours" || unit === "ore" || unit === "ora" ? "hours" : "km";
}

function fleetMeterUnitLabel(value) {
  return normalizeFleetMeterUnit(value) === "hours" ? "ore" : "km";
}

function fleetNumber(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return 0;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? round(number) : 0;
}

function fleetInteger(value, fallback) {
  const number = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

function fleetDate(value) {
  return validDateValue(value) ? String(value) : "";
}

function fleetImportDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (validDateValue(text)) return text;
  const numeric = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (numeric) {
    const [, day, month, year] = numeric;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return validDateValue(iso) ? iso : "";
  }
  const monthNames = {
    ian: 1,
    ianuarie: 1,
    feb: 2,
    februarie: 2,
    mar: 3,
    martie: 3,
    apr: 4,
    aprilie: 4,
    mai: 5,
    iun: 6,
    iunie: 6,
    iul: 7,
    iulie: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    septembrie: 9,
    oct: 10,
    octombrie: 10,
    nov: 11,
    noiembrie: 11,
    dec: 12,
    decembrie: 12
  };
  const literal = normalizeImportDateText(text).match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!literal) return "";
  const [, day, monthName, year] = literal;
  const month = monthNames[monthName];
  if (!month) return "";
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return validDateValue(iso) ? iso : "";
}

function normalizeImportDateText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function createFleetAsset(db, user, body) {
  const category = String(body.category || "vehicle").trim();
  if (!["vehicle", "equipment"].includes(category)) throwHttp(400, "Categoria trebuie sa fie autovehicul sau utilaj.");
  const name = String(body.name || "").trim();
  const registration = String(body.registration || "").trim().toUpperCase();
  if (!name && !registration) throwHttp(400, "Completeaza numarul de inmatriculare sau denumirea utilajului.");
  const meterUnit = normalizeFleetMeterUnit(body.meterUnit || (category === "equipment" ? "hours" : "km"));
  const currentMeter = fleetNumber(body.currentMeter);
  const hasInitialMeter = body.initialMeter !== undefined && body.initialMeter !== null && String(body.initialMeter).trim() !== "";
  const initialMeter = hasInitialMeter ? fleetNumber(body.initialMeter) : currentMeter;
  const alertDays = Math.max(1, fleetInteger(body.alertDays, 30));
  const alertMeter = fleetNumber(body.alertMeter) || (meterUnit === "hours" ? 50 : 500);
  const lastMeterDate = fleetImportDate(body.lastMeterDate) || (currentMeter > 0 ? localDate(new Date()) : "");
  const asset = {
    id: id("fleet"),
    category,
    registration,
    name: name || registration,
    type: String(body.type || "").trim(),
    brand: String(body.brand || "").trim(),
    model: String(body.model || "").trim(),
    department: String(body.department || "").trim(),
    costCenterName: String(body.costCenterName || "").trim(),
    location: String(body.location || "").trim(),
    inventoryNo: String(body.inventoryNo || "").trim(),
    assetCode: String(body.assetCode || "").trim(),
    serialNo: String(body.serialNo || "").trim(),
    vin: String(body.vin || "").trim().toUpperCase(),
    engineSerial: String(body.engineSerial || "").trim(),
    year: fleetInteger(body.year, 0) || "",
    fuelType: String(body.fuelType || "").trim(),
    tankCapacity: fleetNumber(body.tankCapacity),
    standardConsumption: fleetNumber(body.standardConsumption),
    meterUnit,
    initialMeter,
    currentMeter,
    lastMeterDate,
    serviceIntervalMeter: fleetNumber(body.serviceIntervalMeter),
    serviceIntervalMonths: fleetInteger(body.serviceIntervalMonths, 0) || 0,
    nextServiceDate: fleetDate(body.nextServiceDate),
    nextServiceMeter: fleetNumber(body.nextServiceMeter),
    inspectionType: String(body.inspectionType || (category === "vehicle" ? "ITP" : "ISCIR / metrologie")).trim(),
    inspectionIntervalMonths: fleetInteger(body.inspectionIntervalMonths, 0) || 0,
    nextInspectionDate: fleetDate(body.nextInspectionDate),
    alertDays,
    alertMeter,
    notes: String(body.notes || "").trim(),
    active: true,
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.fleetAssets.push(asset);
  if (currentMeter > 0) {
    if (!Array.isArray(db.fleetMeterReadings)) db.fleetMeterReadings = [];
    db.fleetMeterReadings.push(createFleetMeterReading(asset, user, currentMeter, 0, asset.lastMeterDate, "Rulaj initial"));
  }
  return asset;
}

function updateFleetAssetMeter(db, user, assetId, body) {
  const asset = (db.fleetAssets || []).find((item) => item.id === assetId && item.active !== false);
  if (!asset) throwHttp(404, "Utilajul sau autovehiculul nu exista.");
  const currentMeter = fleetNumber(body.currentMeter);
  const previousMeter = fleetNumber(asset.currentMeter);
  const date = validDateValue(body.date) ? String(body.date) : localDate(new Date());
  const meterUnit = normalizeFleetMeterUnit(body.meterUnit || asset.meterUnit || (asset.category === "equipment" ? "hours" : "km"));
  asset.meterUnit = meterUnit;
  asset.currentMeter = currentMeter;
  asset.lastMeterDate = date;
  asset.lastMeterNote = String(body.note || "").trim();
  asset.updatedBy = user.id;
  asset.updatedByName = user.name;
  asset.updatedAt = new Date().toISOString();
  if (!Array.isArray(db.fleetMeterReadings)) db.fleetMeterReadings = [];
  db.fleetMeterReadings.push(createFleetMeterReading(asset, user, currentMeter, previousMeter, date, asset.lastMeterNote));
  return asset;
}

function createFleetMeterReading(asset, user, currentMeter, previousMeter, date, note) {
  return {
    id: id("fleetmeter"),
    assetId: asset.id,
    assetName: asset.name,
    registration: asset.registration,
    category: asset.category,
    date,
    previousMeter: round(previousMeter),
    meter: round(currentMeter),
    meterUnit: normalizeFleetMeterUnit(asset.meterUnit),
    note: String(note || "").trim(),
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
}

function previewFleetAssetXmlImport(db, body) {
  const category = normalizeFleetImportCategory(body.category);
  const rows = parseFleetAssetXmlRows(body.xmlText, category);
  const previewRows = rows.slice(0, 100).map((row) => {
    const duplicate = findDuplicateFleetAsset(db, row.asset);
    const valid = Boolean(row.asset.name || row.asset.registration);
    return {
      ...row,
      status: !valid ? "invalid" : duplicate ? "duplicate" : "new",
      statusLabel: !valid ? "Lipsesc denumirea si numarul" : duplicate ? `Duplicat: ${fleetAssetLabel(duplicate)}` : "Nou"
    };
  });
  return {
    category,
    totalRows: rows.length,
    previewRows,
    previewLimit: 100
  };
}

function importFleetAssetsFromXml(db, user, body) {
  const category = normalizeFleetImportCategory(body.category);
  const duplicateMode = String(body.duplicateMode || "skip").trim() === "update" ? "update" : "skip";
  const rows = parseFleetAssetXmlRows(body.xmlText, category);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const details = [];

  rows.forEach((row) => {
    if (!row.asset.name && !row.asset.registration) {
      skipped += 1;
      details.push({ row: row.row, status: "invalid", message: "Lipsesc denumirea si numarul de inmatriculare." });
      return;
    }
    const duplicate = findDuplicateFleetAsset(db, row.asset);
    if (duplicate && duplicateMode === "skip") {
      skipped += 1;
      details.push({ row: row.row, status: "duplicate", message: `Exista deja: ${fleetAssetLabel(duplicate)}` });
      return;
    }
    if (duplicate && duplicateMode === "update") {
      updateFleetAssetFromImport(db, duplicate, row.asset, user);
      updated += 1;
      details.push({ row: row.row, status: "updated", message: `Actualizat: ${fleetAssetLabel(duplicate)}` });
      return;
    }
    const created = createFleetAsset(db, user, row.asset);
    created.importedFrom = "xml";
    created.importedAt = new Date().toISOString();
    imported += 1;
    details.push({ row: row.row, status: "imported", message: `Adaugat: ${fleetAssetLabel(created)}` });
  });

  return {
    category,
    totalRows: rows.length,
    imported,
    updated,
    skipped,
    details: details.slice(0, 100),
    assets: fleetAssetsView(db)
  };
}

function parseFleetAssetXmlRows(xmlText, fallbackCategory) {
  const xml = String(xmlText || "").trim();
  if (!xml) throwHttp(400, "Alege un fisier XML pentru import.");
  if (xml.length > 18_000_000) throwHttp(400, "Fisierul XML este prea mare pentru importul direct.");
  const records = extractXmlRecords(xml);
  if (!records.length) throwHttp(400, "Nu am gasit randuri importabile in XML. Exporta lista tabelara din softul sursa.");
  return records.map((record, index) => ({
    row: index + 1,
    source: record,
    asset: mapXmlRecordToFleetAsset(record, fallbackCategory)
  }));
}

function extractXmlRecords(xmlText) {
  const spreadsheetRecords = extractExcelSpreadsheetRecords(xmlText);
  if (spreadsheetRecords.length) return spreadsheetRecords;

  const xml = String(xmlText || "")
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const candidates = new Map();
  walkXmlElements(xml, (tag, content) => {
    const record = extractXmlRecordFields(content);
    if (Object.keys(record).length < 2) return;
    if (!candidates.has(tag)) candidates.set(tag, []);
    candidates.get(tag).push(record);
  });

  const selfClosingPattern = /<([A-Za-z_][\w:.-]*)(\s[^>]*?)\/>/g;
  let match;
  while ((match = selfClosingPattern.exec(xml))) {
    const tag = stripXmlPrefix(match[1]);
    const record = extractXmlAttributes(match[2] || "");
    if (Object.keys(record).length < 2) continue;
    if (!candidates.has(tag)) candidates.set(tag, []);
    candidates.get(tag).push(record);
  }

  const groups = Array.from(candidates.entries())
    .filter(([, rows]) => rows.length > 1 || Object.keys(rows[0] || {}).some((key) => fleetImportFieldName(key)))
    .sort((a, b) => b[1].length - a[1].length || xmlRecordScore(b[1]) - xmlRecordScore(a[1]));
  return groups[0]?.[1] || [];
}

function extractExcelSpreadsheetRecords(xmlText) {
  const xml = String(xmlText || "");
  if (!/<(?:\w+:)?Workbook\b/i.test(xml) || !/<(?:\w+:)?Worksheet\b/i.test(xml) || !/<(?:\w+:)?Row\b/i.test(xml)) return [];
  const rows = extractExcelRows(xml);
  if (rows.length < 2) return [];
  const headerIndex = findExcelHeaderRow(rows);
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((header, index) => String(header || `Coloana ${index + 1}`).trim());
  return rows
    .slice(headerIndex + 1)
    .map((cells) => rowCellsToRecord(headers, cells))
    .filter((record) => Object.values(record).filter(isUsefulImportCell).length >= 2);
}

function extractExcelRows(xmlText) {
  const rows = [];
  const rowPattern = /<(?:\w+:)?Row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Row>/gi;
  let row;
  while ((row = rowPattern.exec(xmlText))) {
    rows.push(extractExcelCells(row[1] || ""));
  }
  return rows;
}

function extractExcelCells(rowXml) {
  const cells = [];
  const cellPattern = /<(?:\w+:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Cell>/gi;
  let cell;
  let column = 0;
  while ((cell = cellPattern.exec(rowXml))) {
    const attrs = extractXmlAttributes(cell[1] || "");
    if (attrs.Index) {
      const indexedColumn = Number(attrs.Index) - 1;
      if (Number.isInteger(indexedColumn) && indexedColumn >= 0) column = indexedColumn;
    }
    cells[column] = xmlTextContent(cell[2] || "");
    column += 1;
  }
  return cells;
}

function findExcelHeaderRow(rows) {
  let best = { index: -1, score: 0 };
  rows.forEach((cells, index) => {
    const score = cells.reduce((total, cell) => total + (fleetImportFieldName(cell) ? 1 : 0), 0);
    if (score > best.score) best = { index, score };
  });
  return best.score >= 3 ? best.index : -1;
}

function rowCellsToRecord(headers, cells) {
  const record = {};
  headers.forEach((header, index) => {
    if (!header) return;
    const value = cells[index] ?? "";
    if (value || !record[header]) record[header] = value;
  });
  return record;
}

function isUsefulImportCell(value) {
  const text = String(value || "").trim();
  return Boolean(text && text !== "-" && text.toLowerCase() !== "total");
}

function walkXmlElements(fragment, onElement, depth = 0) {
  if (depth > 8) return;
  const elementPattern = /<([A-Za-z_][\w:.-]*)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = elementPattern.exec(fragment))) {
    const tag = stripXmlPrefix(match[1]);
    const content = match[3] || "";
    onElement(tag, content);
    if (/<[A-Za-z_][\w:.-]*(\s[^>]*)?>/.test(content)) walkXmlElements(content, onElement, depth + 1);
  }
}

function extractXmlRecordFields(content) {
  const record = {};
  const childPattern = /<([A-Za-z_][\w:.-]*)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let child;
  while ((child = childPattern.exec(content))) {
    const key = stripXmlPrefix(child[1]);
    const value = xmlTextContent(child[3]);
    if (value || !record[key]) record[key] = value;
    const attrs = extractXmlAttributes(child[2] || "");
    Object.entries(attrs).forEach(([attrKey, attrValue]) => {
      if (!record[`${key}_${attrKey}`]) record[`${key}_${attrKey}`] = attrValue;
    });
  }
  return record;
}

function extractXmlAttributes(attributeText) {
  const attrs = {};
  const attrPattern = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let attr;
  while ((attr = attrPattern.exec(attributeText))) {
    attrs[stripXmlPrefix(attr[1])] = decodeXmlEntities(attr[2] ?? attr[3] ?? "");
  }
  return attrs;
}

function xmlTextContent(value) {
  return decodeXmlEntities(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripXmlPrefix(value) {
  return String(value || "").split(":").pop();
}

function xmlRecordScore(rows) {
  return rows.reduce((score, row) => score + Object.keys(row).filter((key) => fleetImportFieldName(key)).length, 0);
}

function mapXmlRecordToFleetAsset(record, fallbackCategory) {
  const asset = {
    category: fallbackCategory,
    registration: "",
    name: "",
    type: "",
    brand: "",
    model: "",
    department: "",
    costCenterName: "",
    location: "",
    inventoryNo: "",
    assetCode: "",
    serialNo: "",
    vin: "",
    engineSerial: "",
    year: "",
    fuelType: "",
    meterUnit: fallbackCategory === "equipment" ? "hours" : "km",
    initialMeter: 0,
    currentMeter: 0,
    lastMeterDate: "",
    serviceIntervalMeter: 0,
    serviceIntervalMonths: 0,
    inspectionIntervalMonths: 0,
    tankCapacity: 0,
    standardConsumption: 0,
    notes: ""
  };
  const numericFields = new Set(["initialMeter", "currentMeter", "serviceIntervalMeter", "tankCapacity", "standardConsumption"]);
  const integerFields = new Set(["serviceIntervalMonths", "inspectionIntervalMonths"]);
  Object.entries(record || {}).forEach(([key, value]) => {
    const cleanValue = cleanImportText(value);
    const field = fleetImportFieldName(key);
    if (!field) return;
    if (field === "category") {
      asset.category = normalizeFleetImportCategory(cleanValue, fallbackCategory);
      return;
    }
    if (field === "meterUnit") {
      asset.meterUnit = normalizeFleetMeterUnit(cleanValue);
      return;
    }
    if (numericFields.has(field)) {
      asset[field] = fleetNumber(cleanValue);
      if (/ore|hours|hour|h$/i.test(String(key)) || /ore|hours|hour/i.test(cleanValue)) asset.meterUnit = "hours";
      return;
    }
    if (integerFields.has(field)) {
      asset[field] = fleetInteger(cleanValue, 0) || 0;
      return;
    }
    if (field === "lastMeterDate") {
      asset.lastMeterDate = fleetImportDate(cleanValue);
      return;
    }
    asset[field] = cleanValue;
  });
  if (asset.category === "vehicle" && looksLikeEquipmentImport(record, asset)) {
    asset.category = "equipment";
    asset.meterUnit = "hours";
  }
  if (!asset.name) asset.name = [asset.brand, asset.model, asset.type].filter(Boolean).join(" ").trim() || asset.registration;
  if (!asset.type && asset.category === "vehicle") asset.type = "Autovehicul";
  if (!asset.type && asset.category === "equipment") asset.type = "Utilaj";
  asset.registration = String(asset.registration || "").trim().toUpperCase();
  asset.vin = String(asset.vin || asset.serialNo || "").trim().toUpperCase();
  asset.year = fleetInteger(asset.year, 0) || "";
  asset.currentMeter = fleetNumber(asset.currentMeter);
  asset.initialMeter = fleetNumber(asset.initialMeter);
  asset.serviceIntervalMeter = fleetNumber(asset.serviceIntervalMeter);
  asset.serviceIntervalMonths = fleetInteger(asset.serviceIntervalMonths, 0) || 0;
  asset.inspectionIntervalMonths = fleetInteger(asset.inspectionIntervalMonths, 0) || 0;
  asset.tankCapacity = fleetNumber(asset.tankCapacity);
  asset.standardConsumption = fleetNumber(asset.standardConsumption);
  asset.alertDays = 30;
  asset.alertMeter = asset.meterUnit === "hours" ? 50 : 500;
  return asset;
}

function cleanImportText(value) {
  const text = String(value || "").trim();
  return text === "-" ? "" : text;
}

function looksLikeEquipmentImport(record, asset) {
  if (asset.registration) return false;
  const keys = Object.keys(record || {}).map((key) => normalizeImportKey(key));
  return ["codutilaj", "periodicitateiscirluni", "intervalrevizieorefunctionare", "indexcurent"].some((key) => keys.includes(key));
}

function fleetImportFieldName(key) {
  const normalized = normalizeImportKey(key);
  const aliases = {
    category: ["categorie", "tipcategorie", "tipactiv", "assetcategory"],
    registration: ["nrinmatriculare", "numarinmatriculare", "numardeinmatriculare", "numarulinmatriculare", "numaruldeinmatriculare", "inmatriculare", "nrauto", "numarauto", "nrmasina", "numarmasina", "placa", "placuta", "registration", "regno", "licenseplate"],
    name: ["denumire", "nume", "numeactiv", "denumireactiv", "masina", "utilaj", "vehicul", "autovehicul", "assetname", "name"],
    type: ["tip", "tipauto", "tiputilaj", "tipvehicul", "clasa", "caroserie", "vehicletype", "assettype"],
    brand: ["marca", "brand", "make", "producator", "fabricant"],
    model: ["model", "modelvehicul", "modelutilaj"],
    department: ["departament", "compartiment", "sectie", "sector"],
    costCenterName: ["centrucost", "centrudecost", "costcenter", "centru"],
    location: ["locatie", "punctlucru", "garaj", "depozit", "sediu"],
    inventoryNo: ["nrinventar", "numarinventar", "inventar", "inventoryno", "inventorynumber"],
    assetCode: ["cod", "codactiv", "codutilaj", "codmasina", "assetcode"],
    vin: ["vin", "seriesasiu", "sasiu", "seriedesasiu", "numaridentificare", "serieidentificare"],
    serialNo: ["serie", "seria", "serienumar", "serial", "serialno", "serialnumber"],
    engineSerial: ["seriemotor", "motornr", "nrmotor", "numarmotor", "engineserial"],
    year: ["an", "anfabricatie", "anfabricatiei", "year", "manufactureyear"],
    fuelType: ["combustibil", "carburant", "motorizare", "fuel", "fueltype"],
    initialMeter: ["rulajinitial", "kilometrajinitial", "kminitiali", "kilometriinitiali", "indexinitial", "initialmeter"],
    currentMeter: ["rulaj", "kilometraj", "km", "odometru", "ultimavaloareodometru", "index", "indexcurent", "ore", "orefunctionare", "orelucru", "hours"],
    lastMeterDate: ["datacitireindex", "dataultimeicitiriodometru", "datarulaj", "dataodometru", "lastmeterdate"],
    serviceIntervalMeter: ["intervalreviziekm", "intervalrevizieore", "intervalrevizieorefunctionare", "intervalrevizie", "serviceintervalmeter"],
    serviceIntervalMonths: ["periodicitaterevizieluni", "revizieluni", "serviceintervalmonths"],
    inspectionIntervalMonths: ["periodicitateitpluni", "periodicitateiscirluni", "inspectieluni", "inspectionintervalmonths"],
    tankCapacity: ["capacitatereservor", "capacitaterezervorlitri", "rezervorlitri", "tankcapacity"],
    standardConsumption: ["consumstandard", "consumstandardl100km", "consumstandardlitriora", "standardconsumption"],
    meterUnit: ["umrulaj", "unitaterulaj", "meterunit"],
    notes: ["observatii", "observatiialtespecificatiitehnice", "altespecificatiitehnice", "note", "notes"]
  };
  return Object.entries(aliases).find(([, values]) => values.includes(normalized))?.[0] || "";
}

function normalizeImportKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeFleetImportCategory(value, fallback = "vehicle") {
  const raw = normalizeImportKey(value);
  if (!raw) return fallback;
  if (["equipment", "utilaj", "utilaje", "echipament", "echipamente"].includes(raw)) return "equipment";
  if (["vehicle", "auto", "autovehicul", "autovehicule", "masina", "masini", "camion", "camioane"].includes(raw)) return "vehicle";
  return fallback;
}

function findDuplicateFleetAsset(db, asset) {
  const registration = normalizeImportDuplicateValue(asset.registration);
  const vin = normalizeImportDuplicateValue(asset.vin);
  const inventoryNo = normalizeImportDuplicateValue(asset.inventoryNo);
  const assetCode = normalizeImportDuplicateValue(asset.assetCode);
  const name = normalizeImportDuplicateValue(asset.name);
  const type = normalizeImportDuplicateValue(asset.type);
  return (db.fleetAssets || []).find((existing) => {
    if (existing.active === false) return false;
    if (registration && normalizeImportDuplicateValue(existing.registration) === registration) return true;
    if (vin && normalizeImportDuplicateValue(existing.vin || existing.serialNo) === vin) return true;
    if (inventoryNo && normalizeImportDuplicateValue(existing.inventoryNo) === inventoryNo) return true;
    if (assetCode && normalizeImportDuplicateValue(existing.assetCode) === assetCode) return true;
    return !registration && name && normalizeImportDuplicateValue(existing.name) === name && normalizeImportDuplicateValue(existing.type) === type;
  });
}

function normalizeImportDuplicateValue(value) {
  return normalizeImportKey(value);
}

function updateFleetAssetFromImport(db, existing, incoming, user) {
  const previousMeter = fleetNumber(existing.currentMeter);
  [
    "category",
    "registration",
    "name",
    "type",
    "brand",
    "model",
    "department",
    "costCenterName",
    "location",
    "inventoryNo",
    "assetCode",
    "serialNo",
    "vin",
    "engineSerial",
    "year",
    "fuelType",
    "meterUnit",
    "initialMeter",
    "currentMeter",
    "lastMeterDate",
    "serviceIntervalMeter",
    "serviceIntervalMonths",
    "inspectionIntervalMonths",
    "tankCapacity",
    "standardConsumption",
    "notes"
  ].forEach((key) => {
    if (incoming[key] !== "" && incoming[key] !== 0) existing[key] = incoming[key];
  });
  existing.updatedBy = user.id;
  existing.updatedByName = user.name;
  existing.updatedAt = new Date().toISOString();
  existing.importedFrom = "xml";
  existing.importedAt = new Date().toISOString();
  if (fleetNumber(existing.currentMeter) > 0 && fleetNumber(existing.currentMeter) !== previousMeter) {
    if (!Array.isArray(db.fleetMeterReadings)) db.fleetMeterReadings = [];
    db.fleetMeterReadings.push(createFleetMeterReading(existing, user, fleetNumber(existing.currentMeter), previousMeter, existing.lastMeterDate || localDate(new Date()), "Import XML"));
  }
  return existing;
}

function createFleetRequest(db, user, body) {
  const asset = (db.fleetAssets || []).find((item) => item.id === body.assetId && item.active !== false);
  if (!asset) throwHttp(404, "Alege utilajul sau autovehiculul solicitat.");
  const date = validDateValue(body.date) ? String(body.date) : localDate(new Date());
  const startTime = validTimeValue(body.startTime) ? String(body.startTime) : "";
  const endTime = validTimeValue(body.endTime) ? String(body.endTime) : "";
  if (!startTime || !endTime || startTime >= endTime) throwHttp(400, "Intervalul orar este invalid.");
  const department = String(body.department || "").trim();
  const jobName = String(body.jobName || "").trim();
  if (!department) throwHttp(400, "Departamentul este obligatoriu.");
  if (!jobName) throwHttp(400, "Lucrarea este obligatorie pentru solicitarea de mecanizare.");
  const conflict = fleetRequestConflict(db, asset.id, date, startTime, endTime);
  if (conflict) {
    throwHttp(409, `Utilajul este deja solicitat in intervalul ${conflict.startTime}-${conflict.endTime} pentru ${conflict.jobName || conflict.department || "alta lucrare"}.`);
  }
  const request = {
    id: id("fleetreq"),
    assetId: asset.id,
    assetName: asset.name,
    registration: asset.registration,
    category: asset.category,
    assetType: asset.type,
    assetBrand: asset.brand,
    assetCode: asset.assetCode,
    assetCostCenterName: asset.costCenterName,
    date,
    startTime,
    endTime,
    department,
    jobName,
    location: String(body.location || "").trim(),
    note: String(body.note || "").trim(),
    status: "new",
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.fleetRequests.push(request);
  syncWorkflowForFleetRequest(db, user, request, "created");
  return request;
}

function updateFleetRequestStatus(db, user, requestId, body) {
  const request = (db.fleetRequests || []).find((item) => item.id === requestId);
  if (!request) throwHttp(404, "Solicitarea nu exista.");
  const oldWorkflowStatus = workflowStatusFromFleet(request.status);
  const status = String(body.status || "").trim();
  if (!["approved", "planned", "done", "rejected", "canceled"].includes(status)) throwHttp(400, "Status invalid.");
  if (["approved", "planned"].includes(status)) {
    const conflict = fleetRequestConflict(db, request.assetId, request.date, request.startTime, request.endTime, request.id);
    if (conflict) throwHttp(409, `Exista suprapunere cu solicitarea ${conflict.jobName || conflict.department || conflict.id}.`);
  }
  request.status = status;
  request.updatedBy = user.id;
  request.updatedByName = user.name;
  request.updatedAt = new Date().toISOString();
  syncWorkflowForFleetRequest(db, user, request, "status_changed", oldWorkflowStatus);
  return request;
}

function fleetRequestConflict(db, assetId, date, startTime, endTime, excludeId = "") {
  return (db.fleetRequests || []).find((item) =>
    item.id !== excludeId &&
    item.assetId === assetId &&
    item.date === date &&
    !["done", "rejected", "canceled"].includes(item.status) &&
    startTime < item.endTime &&
    endTime > item.startTime
  );
}

function buildFleetAlerts(db) {
  const todayKey = localDate(new Date());
  return fleetAssetsView(db)
    .filter((asset) => asset.active !== false)
    .flatMap((asset) => fleetAlertsForAsset(asset, todayKey))
    .sort((a, b) =>
      fleetAlertSeverityRank(a.severity) - fleetAlertSeverityRank(b.severity) ||
      Number(a.remainingDays ?? 999999) - Number(b.remainingDays ?? 999999) ||
      Number(a.remainingMeter ?? 999999999) - Number(b.remainingMeter ?? 999999999) ||
      String(a.assetName || "").localeCompare(String(b.assetName || ""))
    );
}

function fleetAlertsForAsset(asset, todayKey) {
  const alerts = [];
  const assetName = fleetAssetLabel(asset);
  const meterUnit = normalizeFleetMeterUnit(asset.meterUnit || (asset.category === "equipment" ? "hours" : "km"));
  const currentMeter = fleetNumber(asset.currentMeter);
  const alertDays = Math.max(1, fleetInteger(asset.alertDays, 30));
  const alertMeter = fleetNumber(asset.alertMeter) || (meterUnit === "hours" ? 50 : 500);
  addFleetDateAlert(alerts, asset, assetName, "service-date", "Revizie", asset.nextServiceDate, alertDays, todayKey);
  addFleetMeterAlert(alerts, asset, assetName, "service-meter", "Revizie", asset.nextServiceMeter, currentMeter, alertMeter, meterUnit);
  addFleetDateAlert(alerts, asset, assetName, "inspection-date", asset.inspectionType || (asset.category === "vehicle" ? "ITP" : "ISCIR / metrologie"), asset.nextInspectionDate, alertDays, todayKey);
  return alerts;
}

function addFleetDateAlert(alerts, asset, assetName, type, label, dueDate, alertDays, todayKey) {
  if (!validDateValue(dueDate)) return;
  const remainingDays = dateDiffDays(todayKey, dueDate);
  if (remainingDays > alertDays) return;
  const overdue = remainingDays < 0;
  alerts.push({
    id: `fleet-${type}-${asset.id}`,
    type,
    severity: overdue ? "bad" : "warn",
    title: `${label} ${overdue ? "depasita" : "apropiata"}`,
    detail: `${assetName}: scadenta ${dueDate} (${fleetDaysText(remainingDays)}).`,
    assetId: asset.id,
    assetName,
    registration: asset.registration || "",
    category: asset.category,
    dueDate,
    remainingDays
  });
}

function addFleetMeterAlert(alerts, asset, assetName, type, label, dueMeter, currentMeter, alertMeter, meterUnit) {
  const due = fleetNumber(dueMeter);
  if (due <= 0) return;
  const remainingMeter = round(due - currentMeter);
  if (remainingMeter > alertMeter) return;
  const overdue = remainingMeter < 0;
  const unitLabel = fleetMeterUnitLabel(meterUnit);
  alerts.push({
    id: `fleet-${type}-${asset.id}`,
    type,
    severity: overdue ? "bad" : "warn",
    title: `${label} dupa ${unitLabel} ${overdue ? "depasita" : "apropiata"}`,
    detail: `${assetName}: curent ${fmt(currentMeter)} ${unitLabel}, scadenta ${fmt(due)} ${unitLabel} (${fleetMeterText(remainingMeter, unitLabel)}).`,
    assetId: asset.id,
    assetName,
    registration: asset.registration || "",
    category: asset.category,
    currentMeter,
    dueMeter: due,
    remainingMeter,
    meterUnit
  });
}

function dateDiffDays(from, to) {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function fleetDaysText(days) {
  if (days < 0) return `${Math.abs(days)} zile depasire`;
  if (days === 0) return "scadenta azi";
  if (days === 1) return "1 zi ramasa";
  return `${days} zile ramase`;
}

function fleetMeterText(remaining, unitLabel) {
  if (remaining < 0) return `${fmt(Math.abs(remaining))} ${unitLabel} depasire`;
  if (remaining === 0) return "scadenta acum";
  return `${fmt(remaining)} ${unitLabel} ramase`;
}

function fleetAlertSeverityRank(severity) {
  return severity === "bad" ? 0 : 1;
}

function validTimeValue(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function costCentersView(db) {
  return (db.costCenters || [])
    .filter((item) => item.active !== false)
    .slice()
    .sort((a, b) => String(a.code || a.name || "").localeCompare(String(b.code || b.name || "")));
}

function createCostCenter(db, user, body) {
  const name = String(body.name || "").trim();
  const code = String(body.code || "").trim().toUpperCase();
  if (!name) throwHttp(400, "Numele centrului de cost este obligatoriu.");
  const duplicate = (db.costCenters || []).find((item) =>
    item.active !== false &&
    (normalizeCostKey(item.name) === normalizeCostKey(name) || (code && normalizeCostKey(item.code) === normalizeCostKey(code)))
  );
  if (duplicate) throwHttp(409, "Exista deja un centru de cost cu acest nume sau cod.");
  const center = {
    id: id("costcenter"),
    code,
    name,
    type: String(body.type || "department").trim() || "department",
    parentId: String(body.parentId || "").trim(),
    note: String(body.note || "").trim(),
    active: true,
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.costCenters.push(center);
  return center;
}

function findCostCenter(db, value) {
  const needle = normalizeCostKey(value);
  if (!needle) return null;
  return (db.costCenters || []).find((item) =>
    item.active !== false &&
    [item.id, item.code, item.name].some((candidate) => normalizeCostKey(candidate) === needle)
  ) || null;
}

function normalizeCostKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findFleetAsset(db, body) {
  const idValue = String(body.assetId || "").trim();
  const registration = normalizeCostKey(body.registration || body.vehicleNo || body.assetRegistration || "");
  const name = normalizeCostKey(body.assetName || body.name || "");
  return (db.fleetAssets || []).find((asset) => {
    if (asset.active === false) return false;
    if (idValue && asset.id === idValue) return true;
    if (registration && normalizeCostKey(asset.registration) === registration) return true;
    if (name && [asset.name, asset.assetName, fleetAssetLabel(asset)].some((candidate) => normalizeCostKey(candidate) === name)) return true;
    return false;
  }) || null;
}

function workLogDocumentMeta(assetOrLog = {}) {
  const category = assetOrLog.category || "";
  if (category === "vehicle") return { kind: "foaie_zi", label: "Nr. foaie zi" };
  if (category === "equipment") return { kind: "raport_zi", label: "Raport zi utilaj" };
  return { kind: "document", label: "Document" };
}

function createTechnicalWorkLog(db, user, body) {
  const asset = findFleetAsset(db, body);
  if (!asset) throwHttp(404, "Alege autovehiculul sau utilajul pentru pontaj.");
  const costCenter = findCostCenter(db, body.costCenterId || body.costCenterName || body.department);
  if (!costCenter) throwHttp(400, "Alege centrul de cost/departamentul pentru pontaj.");
  const date = validDateValue(body.date) ? String(body.date) : localDate(new Date());
  const startTime = validTimeValue(body.startTime) ? String(body.startTime) : "";
  const endTime = validTimeValue(body.endTime) ? String(body.endTime) : "";
  let hours = round(Number(body.hours || 0));
  if (hours <= 0 && startTime && endTime) hours = hoursBetween(startTime, endTime);
  if (hours <= 0) throwHttp(400, "Completeaza orele lucrate sau un interval orar valid.");
  const jobName = String(body.jobName || "").trim();
  if (!jobName) throwHttp(400, "Lucrarea este obligatorie pentru pontaj.");
  const documentMeta = workLogDocumentMeta(asset);
  const workLog = {
    id: id("worklog"),
    date,
    assetId: asset.id,
    assetName: asset.name || asset.registration || "",
    registration: asset.registration || "",
    category: asset.category || "",
    costCenterId: costCenter.id,
    costCenterCode: costCenter.code || "",
    costCenterName: costCenter.name,
    department: costCenter.name,
    jobName,
    location: String(body.location || "").trim(),
    startTime,
    endTime,
    hours,
    documentNo: String(body.documentNo || body.document || "").trim(),
    documentKind: documentMeta.kind,
    documentLabel: documentMeta.label,
    operatorName: String(body.operatorName || "").trim(),
    note: String(body.note || "").trim(),
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.technicalWorkLogs.push(workLog);
  return workLog;
}

function hoursBetween(startTime, endTime) {
  if (!validTimeValue(startTime) || !validTimeValue(endTime) || startTime >= endTime) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return round(((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60);
}

function filteredTechnicalWorkLogs(db, url) {
  const { from, to } = periodFromUrl(url);
  const assetId = String(url.searchParams.get("assetId") || "").trim();
  const costCenterId = String(url.searchParams.get("costCenterId") || "").trim();
  const job = String(url.searchParams.get("job") || "").trim().toLowerCase();
  return (db.technicalWorkLogs || [])
    .filter((item) => item.date >= from && item.date <= to)
    .filter((item) => !assetId || item.assetId === assetId)
    .filter((item) => !costCenterId || item.costCenterId === costCenterId)
    .filter((item) => !job || String(item.jobName || "").toLowerCase().includes(job))
    .sort(sortNewest);
}

function technicalClientsView(db) {
  return (db.technicalClients || [])
    .filter((client) => client.active !== false)
    .slice()
    .sort((a, b) => String(a.name || a.cif || "").localeCompare(String(b.name || b.cif || "")));
}

function createTechnicalClient(db, user, body) {
  const client = buildTechnicalClientPayload(body);
  if (!client.name) throwHttp(400, "Denumirea clientului este obligatorie.");
  if (client.cif && (db.technicalClients || []).some((item) => item.active !== false && item.cif === client.cif)) {
    throwHttp(409, "Exista deja un client cu acest CIF.");
  }
  const saved = {
    id: id("client"),
    ...client,
    active: true,
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.technicalClients.push(saved);
  return saved;
}

function updateTechnicalClient(db, user, clientId, body) {
  const client = (db.technicalClients || []).find((item) => item.id === clientId && item.active !== false);
  if (!client) throwHttp(404, "Clientul nu exista.");
  const next = buildTechnicalClientPayload(body);
  if (!next.name) throwHttp(400, "Denumirea clientului este obligatorie.");
  if (next.cif && (db.technicalClients || []).some((item) => item.id !== client.id && item.active !== false && item.cif === next.cif)) {
    throwHttp(409, "Exista deja un client cu acest CIF.");
  }
  Object.assign(client, next, {
    updatedBy: user.id,
    updatedByName: user.name,
    updatedAt: new Date().toISOString()
  });
  return client;
}

function buildTechnicalClientPayload(body = {}) {
  return {
    cif: normalizeRomanianCif(body.cif),
    name: String(body.name || body.denumire || "").trim(),
    registrationNo: String(body.registrationNo || body.nrRegCom || body.tradeRegisterNo || "").trim(),
    address: String(body.address || body.adresa || "").trim(),
    phone: String(body.phone || body.telefon || "").trim(),
    email: String(body.email || "").trim(),
    note: String(body.note || "").trim(),
    source: String(body.source || "").trim(),
    lastLookupAt: String(body.lastLookupAt || "").trim()
  };
}

function findTechnicalClient(db, value) {
  const needle = String(value || "").trim();
  if (!needle) return null;
  const cif = normalizeRomanianCif(needle);
  return (db.technicalClients || []).find((client) =>
    client.active !== false && (client.id === needle || (cif && client.cif === cif))
  ) || null;
}

function normalizeRomanianCif(value) {
  const digits = String(value || "").toUpperCase().replace(/^RO/, "").replace(/\D+/g, "");
  return digits.slice(0, 13);
}

function postJson(targetUrl, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(new URL(targetUrl), {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Charset": "utf-8",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 15000
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(httpError(502, `ANAF a raspuns cu status ${response.statusCode}.`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(httpError(502, "Raspunsul ANAF nu este JSON valid."));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(httpError(504, "ANAF nu a raspuns in timp util."));
    });
    request.on("error", (error) => {
      reject(error.status ? error : httpError(502, `Nu pot contacta ANAF: ${error.message}`));
    });
    request.write(body);
    request.end();
  });
}

function createAsphaltSale(db, user, body) {
  const sourceConsumptionId = String(body.sourceConsumptionId || "").trim();
  const sourceConsumption = sourceConsumptionId
    ? activeConsumptions(db).find((item) => item.id === sourceConsumptionId)
    : null;
  if (sourceConsumptionId && !sourceConsumption) throwHttp(404, "Consumul ales pentru vanzare nu exista sau este anulat.");
  if (sourceConsumption && (db.asphaltSales || []).some((item) => item.sourceConsumptionId === sourceConsumption.id)) {
    throwHttp(400, "Acest consum este deja inregistrat ca vanzare.");
  }
  const recipe = (db.recipes || []).find((item) => item.id === (body.recipeId || sourceConsumption?.recipeId));
  const amount = round(Number(body.amount || sourceConsumption?.asphalt || 0));
  if (amount <= 0) throwHttp(400, "Cantitatea vanduta trebuie sa fie mai mare decat zero.");
  const selectedClient = findTechnicalClient(db, body.clientId);
  const client = String(body.client || selectedClient?.name || "").trim();
  const jobName = String(body.jobName || sourceConsumption?.jobName || sourceConsumption?.reportNo || "Consum asfalt").trim();
  if (!client && !jobName) throwHttp(400, "Completeaza clientul sau lucrarea pentru vanzarea de asfalt.");
  const sale = {
    id: id("asphaltsale"),
    date: validDateValue(body.date) ? String(body.date) : sourceConsumption?.date || localDate(new Date()),
    clientId: selectedClient?.id || "",
    client,
    clientCif: selectedClient?.cif || normalizeRomanianCif(body.clientCif),
    clientAddress: selectedClient?.address || String(body.clientAddress || "").trim(),
    clientRegistrationNo: selectedClient?.registrationNo || String(body.clientRegistrationNo || "").trim(),
    jobName,
    recipeId: recipe?.id || String(body.recipeId || sourceConsumption?.recipeId || "").trim(),
    recipeName: recipe?.name || String(body.recipeName || sourceConsumption?.recipeName || "").trim(),
    amount,
    unit: "t",
    documentNo: String(body.documentNo || body.document || sourceConsumption?.ticket || sourceConsumption?.reportNo || "").trim(),
    vehicleNo: String(body.vehicleNo || "").trim().toUpperCase(),
    note: String(body.note || (sourceConsumption ? `Generata din consum ${sourceConsumption.reportNo || sourceConsumption.id}` : "")).trim(),
    sourceConsumptionId: sourceConsumption?.id || "",
    sourceConsumptionReportNo: sourceConsumption?.reportNo || "",
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.asphaltSales.push(sale);
  return sale;
}

function updateAsphaltSale(db, user, saleId, body) {
  const sale = (db.asphaltSales || []).find((item) => item.id === saleId);
  if (!sale) throwHttp(404, "Vanzarea de asfalt nu exista.");
  const selectedClient = body.clientId !== undefined ? findTechnicalClient(db, body.clientId) : null;
  if (body.clientId && !selectedClient) throwHttp(404, "Clientul selectat nu exista.");
  if (body.clientId !== undefined) {
    sale.clientId = selectedClient?.id || "";
    sale.clientCif = selectedClient?.cif || normalizeRomanianCif(body.clientCif);
    sale.clientAddress = selectedClient?.address || String(body.clientAddress || "").trim();
    sale.clientRegistrationNo = selectedClient?.registrationNo || String(body.clientRegistrationNo || "").trim();
    if (selectedClient) sale.client = selectedClient.name;
  }
  if (body.client !== undefined) sale.client = String(body.client || sale.client || "").trim();
  if (body.jobName !== undefined) sale.jobName = String(body.jobName || "").trim();
  if (body.documentNo !== undefined || body.document !== undefined) sale.documentNo = String(body.documentNo || body.document || "").trim();
  if (body.vehicleNo !== undefined) sale.vehicleNo = String(body.vehicleNo || "").trim().toUpperCase();
  if (body.note !== undefined) sale.note = String(body.note || "").trim();
  if (!sale.sourceConsumptionId) {
    if (validDateValue(body.date)) sale.date = String(body.date);
    if (body.recipeId !== undefined) {
      const recipe = (db.recipes || []).find((item) => item.id === body.recipeId);
      sale.recipeId = recipe?.id || String(body.recipeId || "").trim();
      sale.recipeName = recipe?.name || String(body.recipeName || "").trim();
    }
    if (body.amount !== undefined) {
      const amount = round(Number(body.amount || 0));
      if (amount <= 0) throwHttp(400, "Cantitatea vanduta trebuie sa fie mai mare decat zero.");
      sale.amount = amount;
    }
  }
  if (!sale.client && !sale.jobName) throwHttp(400, "Completeaza clientul sau lucrarea pentru vanzarea de asfalt.");
  sale.updatedBy = user.id;
  sale.updatedByName = user.name;
  sale.updatedAt = new Date().toISOString();
  return sale;
}

function filteredAsphaltSales(db, url) {
  const { from, to } = periodFromUrl(url);
  const recipeId = String(url.searchParams.get("recipeId") || "").trim();
  const client = String(url.searchParams.get("client") || "").trim().toLowerCase();
  const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
  return (db.asphaltSales || [])
    .filter((item) => item.date >= from && item.date <= to)
    .filter((item) => !recipeId || item.recipeId === recipeId)
    .filter((item) => !client || String(item.client || "").toLowerCase().includes(client))
    .filter((item) => !query || [item.client, item.jobName, item.documentNo, item.vehicleNo].join(" ").toLowerCase().includes(query))
    .sort(sortNewest);
}

function buildAccountingAsphaltSales(db, url) {
  const sales = filteredAsphaltSales(db, url);
  const recipeIds = new Set(sales.map((item) => item.recipeId).filter(Boolean));
  const recipes = (db.recipes || [])
    .filter((recipe) => recipeIds.has(recipe.id) || (db.asphaltSales || []).some((sale) => sale.recipeId === recipe.id))
    .map((recipe) => ({ id: recipe.id, name: recipe.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
  const clients = Array.from(new Set((db.asphaltSales || []).map((item) => String(item.client || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "ro"));
  const byClient = Array.from(sales.reduce((map, item) => {
    const key = item.client || "Fara client";
    const current = map.get(key) || { client: key, rows: 0, amount: 0 };
    current.rows += 1;
    current.amount = round(current.amount + Number(item.amount || 0));
    map.set(key, current);
    return map;
  }, new Map()).values()).sort((a, b) => b.amount - a.amount);
  const byRecipe = Array.from(sales.reduce((map, item) => {
    const key = item.recipeName || "Fara reteta";
    const current = map.get(key) || { recipeName: key, rows: 0, amount: 0 };
    current.rows += 1;
    current.amount = round(current.amount + Number(item.amount || 0));
    map.set(key, current);
    return map;
  }, new Map()).values()).sort((a, b) => b.amount - a.amount);
  return {
    sales,
    clients,
    recipes,
    metrics: {
      rows: sales.length,
      amount: round(sales.reduce((total, item) => total + Number(item.amount || 0), 0)),
      clients: new Set(sales.map((item) => item.client).filter(Boolean)).size,
      recipes: new Set(sales.map((item) => item.recipeId || item.recipeName).filter(Boolean)).size
    },
    byClient,
    byRecipe
  };
}

function buildTechnicalReportFromUrl(db, url) {
  const { from, to } = periodFromUrl(url);
  return buildTechnicalReport(db, from, to, {
    job: String(url.searchParams.get("job") || "").trim(),
    recipeId: String(url.searchParams.get("recipeId") || "").trim()
  });
}

function buildTechnicalReport(db, fromValue, toValue, filters = {}) {
  const fallback = localDate(new Date());
  const from = validDateValue(fromValue) ? String(fromValue) : `${fallback.slice(0, 7)}-01`;
  const to = validDateValue(toValue) ? String(toValue) : fallback;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const jobFilter = String(filters.job || "").trim().toLowerCase();
  const recipeId = String(filters.recipeId || "").trim();
  const filterRecipe = recipeId ? (db.recipes || []).find((recipe) => recipe.id === recipeId) : null;
  const workLogs = (db.technicalWorkLogs || [])
    .filter((item) => item.date >= start && item.date <= end)
    .filter((item) => !jobFilter || String(item.jobName || "").toLowerCase().includes(jobFilter))
    .sort(sortNewest);
  const sales = (db.asphaltSales || [])
    .filter((item) => item.date >= start && item.date <= end)
    .filter((item) => !recipeId || item.recipeId === recipeId)
    .filter((item) => !jobFilter || String(item.jobName || item.client || "").toLowerCase().includes(jobFilter))
    .sort(sortNewest);
  const salesByConsumption = new Map(sales.filter((item) => item.sourceConsumptionId).map((item) => [item.sourceConsumptionId, item]));
  const deptConsumptions = (db.departmentConsumptions || [])
    .filter((item) => item.date >= start && item.date <= end)
    .filter((item) => {
      if (!jobFilter) return true;
      const request = (db.departmentRequests || []).find(r => r.id === item.jobRequestId);
      const requestMatch = request && String(request.jobName || "").toLowerCase().includes(jobFilter);
      return requestMatch || String(item.materialName || "").toLowerCase().includes(jobFilter);
    })
    .sort(sortNewest);
  const production = activeConsumptions(db)
    .filter((item) => item.date >= start && item.date <= end)
    .filter((item) => !recipeId || item.recipeId === recipeId)
    .filter((item) => !jobFilter || String(item.jobName || "").toLowerCase().includes(jobFilter))
    .sort(sortNewest)
    .map((item) => {
      const sale = salesByConsumption.get(item.id);
      return {
        ...item,
        soldFromConsumption: Boolean(sale),
        saleId: sale?.id || "",
        soldAmount: sale ? Number(sale.amount || 0) : 0
      };
    });
  const producedTotal = round(production.reduce((total, item) => total + Number(item.asphalt || 0), 0));
  const soldTotal = round(sales.reduce((total, item) => total + Number(item.amount || 0), 0));
  return {
    from: start,
    to: end,
    filters: {
      job: filters.job || "",
      recipeId,
      recipeName: filterRecipe?.name || ""
    },
    metrics: {
      workLogs: workLogs.length,
      workHours: round(workLogs.reduce((total, item) => total + Number(item.hours || 0), 0)),
      producedTotal,
      soldTotal,
      remainingTotal: round(producedTotal - soldTotal)
    },
    workLogs,
    sales,
    production,
    deptConsumptions,
    hoursByAsset: aggregateRows(workLogs, (item) => item.assetId || item.assetName || "-", () => ({
      assetName: "",
      category: "",
      registration: "",
      hours: 0,
      jobs: new Set(),
      costCenters: new Set()
    }), (row, item) => {
      row.assetName = fleetAssetLabel(item);
      row.category = fleetCategoryLabel(item.category);
      row.registration = item.registration || "";
      row.hours += Number(item.hours || 0);
      if (item.jobName) row.jobs.add(item.jobName);
      if (item.costCenterName) row.costCenters.add(item.costCenterName);
    }).map(finalizeHoursAggregate),
    hoursByJob: aggregateRows(workLogs, (item) => normalizeCostKey(item.jobName) || "-", () => ({
      jobName: "",
      hours: 0,
      assets: new Set(),
      costCenters: new Set()
    }), (row, item) => {
      row.jobName = item.jobName || "-";
      row.hours += Number(item.hours || 0);
      row.assets.add(fleetAssetLabel(item));
      if (item.costCenterName) row.costCenters.add(item.costCenterName);
    }).map(finalizeHoursAggregate),
    productionByRecipe: buildProductionSalesRows(production, sales, "recipe"),
    productionByJob: buildProductionSalesRows(production, sales, "job")
  };
}

function finalizeHoursAggregate(row) {
  return {
    ...row,
    hours: round(row.hours),
    jobs: Array.from(row.jobs || []).sort().join(", "),
    assets: Array.from(row.assets || []).sort().join(", "),
    costCenters: Array.from(row.costCenters || []).sort().join(", ")
  };
}

function buildProductionSalesRows(production, sales, mode) {
  const rows = new Map();
  const keyFor = (item) => mode === "recipe"
    ? (item.recipeId || item.recipeName || "nespecificat")
    : normalizeCostKey(item.jobName || item.client || "nespecificat");
  const labelFor = (item) => mode === "recipe"
    ? (item.recipeName || "Nespecificat")
    : (item.jobName || item.client || "Nespecificat");
  const ensure = (key, label) => {
    if (!rows.has(key)) rows.set(key, { label, produced: 0, sold: 0, remaining: 0 });
    return rows.get(key);
  };
  production.forEach((item) => {
    const row = ensure(keyFor(item), labelFor(item));
    row.produced += Number(item.asphalt || 0);
  });
  sales.forEach((item) => {
    const row = ensure(keyFor(item), labelFor(item));
    row.sold += Number(item.amount || 0);
  });
  return Array.from(rows.values()).map((row) => ({
    ...row,
    produced: round(row.produced),
    sold: round(row.sold),
    remaining: round(row.produced - row.sold)
  })).sort((a, b) => b.produced - a.produced || a.label.localeCompare(b.label));
}

function aggregateRows(items, keyFn, createFn, addFn) {
  const rows = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!rows.has(key)) rows.set(key, createFn(item));
    addFn(rows.get(key), item);
  });
  return Array.from(rows.values());
}

function filteredNexusExpenses(db, url) {
  const { from, to } = periodFromUrl(url);
  const costCenterId = String(url.searchParams.get("costCenterId") || "").trim();
  const assetId = String(url.searchParams.get("assetId") || "").trim();
  return (db.nexusExpenses || [])
    .filter((item) => item.date >= from && item.date <= to)
    .filter((item) => !costCenterId || item.costCenterId === costCenterId)
    .filter((item) => !assetId || item.assetId === assetId)
    .sort(sortNewest);
}

function importNexusExpenses(db, user, body) {
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) throwHttp(400, "Nu exista randuri de importat.");
  const imported = [];
  const existingCounts = new Map();
  (db.nexusExpenses || []).forEach((item) => {
    const key = nexusExpenseKey(item);
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
  });
  let skipped = 0;
  let duplicates = 0;
  rows.forEach((row) => {
    const expense = normalizeNexusExpense(db, user, row);
    if (!expense) {
      skipped += 1;
      return;
    }
    const key = nexusExpenseKey(expense);
    const existingCount = existingCounts.get(key) || 0;
    if (existingCount > 0) {
      existingCounts.set(key, existingCount - 1);
      skipped += 1;
      duplicates += 1;
      return;
    }
    db.nexusExpenses.push(expense);
    imported.push(expense);
  });
  return {
    imported: imported.length,
    skipped,
    duplicates,
    totalAmount: round(imported.reduce((total, item) => total + Number(item.amount || 0), 0)),
    expenses: imported
  };
}

function normalizeNexusExpense(db, user, row) {
  const date = normalizeImportedDate(readRowField(row, ["date", "data", "data document", "data_doc"]));
  const amount = normalizeImportedAmount(readRowField(row, ["amount", "suma", "valoare", "debit", "total"]));
  if (!date || amount === 0) return null;
  const centerInput = readRowField(row, ["costCenterId", "centru cost", "centru de cost", "departament", "centru", "cost_center"]);
  const asset = findFleetAsset(db, {
    assetId: readRowField(row, ["assetId", "subcentru id", "utilaj id"]),
    registration: readRowField(row, ["nr inmatriculare", "numar", "auto", "masina", "registration"]),
    assetName: readRowField(row, ["subcentru", "utilaj", "masina utilaj", "activ", "asset"])
  });
  const assetCenterInput = asset ? (asset.costCenterId || asset.costCenterName || asset.department) : "";
  const costCenter = findCostCenter(db, centerInput) || findCostCenter(db, assetCenterInput);
  return {
    id: id("nexusexp"),
    date,
    costCenterId: costCenter?.id || "",
    costCenterCode: costCenter?.code || "",
    costCenterName: costCenter?.name || String(centerInput || assetCenterInput || "").trim() || "Nemapat",
    assetId: asset?.id || "",
    assetName: asset ? fleetAssetLabel(asset) : String(readRowField(row, ["subcentru", "utilaj", "masina utilaj", "activ", "asset"]) || "").trim(),
    registration: asset?.registration || String(readRowField(row, ["nr inmatriculare", "numar", "auto", "masina", "registration"]) || "").trim().toUpperCase(),
    expenseType: String(readRowField(row, ["tip", "categorie", "cont", "cheltuiala", "expenseType"]) || "").trim() || "Cheltuiala",
    amount,
    currency: String(readRowField(row, ["moneda", "currency"]) || "RON").trim().toUpperCase() || "RON",
    documentNo: String(readRowField(row, ["document", "nr document", "factura", "nr factura"]) || "").trim(),
    supplier: String(readRowField(row, ["furnizor", "partener", "supplier"]) || "").trim(),
    note: String(readRowField(row, ["observatii", "descriere", "explicatie", "note"]) || "").trim(),
    source: "nexus-import",
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
}

function nexusExpenseKey(item) {
  return [
    item.date,
    normalizeCostKey(item.costCenterId || item.costCenterName),
    normalizeCostKey(item.assetId || item.assetName || item.registration),
    normalizeCostKey(item.expenseType),
    Number(item.amount || 0).toFixed(3),
    normalizeCostKey(item.documentNo),
    normalizeCostKey(item.supplier),
    normalizeCostKey(item.note)
  ].join("|");
}

function parseNexusExpensesXlsx(body) {
  const raw = String(body?.fileBase64 || body?.content || "").trim();
  if (!raw) throwHttp(400, "Fisierul XLSX nu a ajuns la server.");
  const base64 = raw.includes(",") ? raw.split(",").pop() : raw;
  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throwHttp(400, "Fisierul XLSX nu poate fi citit.");
  }
  if (!buffer.length) throwHttp(400, "Fisierul XLSX este gol.");
  if (buffer.length > 15 * 1024 * 1024) throwHttp(400, "Fisierul XLSX este prea mare pentru import.");
  const rows = readXlsxFirstSheetRows(buffer);
  const mapped = mapNexusExpenseReportRows(rows);
  if (!mapped.length) throwHttp(400, "Nu am gasit randuri de cheltuieli in exportul Nexus.");
  return mapped;
}

function readXlsxFirstSheetRows(buffer) {
  const entries = unzipXlsxEntries(buffer);
  const sharedStrings = parseXlsxSharedStrings(entries.get("xl/sharedstrings.xml"));
  const sheetPath = firstXlsxSheetPath(entries);
  const sheetXml = entries.get(sheetPath);
  if (!sheetXml) throwHttp(400, "Fisierul XLSX nu contine foaia de calcul.");
  return parseXlsxSheetXml(sheetXml.toString("utf8"), sharedStrings);
}

function unzipXlsxEntries(buffer) {
  const entries = new Map();
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 66000); index -= 1) {
    if (buffer.readUInt32LE(index) === eocdSignature) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) throwHttp(400, "Fisierul XLSX nu este valid.");
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throwHttp(400, "Structura XLSX este invalida.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8").replace(/\\/g, "/").toLowerCase();
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.slice(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) {
      content = data;
    } else if (method === 8) {
      content = zlib.inflateRawSync(data);
    } else {
      throwHttp(400, `Fisier XLSX cu metoda ZIP neacceptata: ${method}.`);
    }
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function firstXlsxSheetPath(entries) {
  const workbookXml = entries.get("xl/workbook.xml")?.toString("utf8") || "";
  const relationshipsXml = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  const firstSheet = [...workbookXml.matchAll(/<sheet\b([^>]*)>/gi)]
    .map((match) => xmlAttributes(match[1]))
    .find((attrs) => attrs["r:id"] || attrs.id);
  const relationshipId = firstSheet?.["r:id"] || firstSheet?.id || "";
  if (relationshipId && relationshipsXml) {
    const relationship = [...relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?>/gi)]
      .map((match) => xmlAttributes(match[1]))
      .find((attrs) => attrs.Id === relationshipId || attrs.id === relationshipId);
    if (relationship?.Target || relationship?.target) {
      const target = String(relationship.Target || relationship.target).replace(/\\/g, "/");
      return (target.startsWith("/") ? target.slice(1) : `xl/${target}`).toLowerCase();
    }
  }
  return [...entries.keys()].find((key) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(key)) || "xl/worksheets/sheet1.xml";
}

function parseXlsxSharedStrings(buffer) {
  if (!buffer) return [];
  const xml = buffer.toString("utf8");
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => parseXlsxText(match[1]));
}

function parseXlsxSheetXml(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const row = [];
    const rowXml = rowMatch[1].replace(/<c\b[^>]*\/>/gi, "");
    for (const cellMatch of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = xmlAttributes(cellMatch[1]);
      const ref = attrs.r || "";
      const columnIndex = xlsxColumnIndex(ref.replace(/\d+/g, "")) ?? row.length;
      row[columnIndex] = parseXlsxCellValue(cellMatch[2], attrs, sharedStrings);
    }
    rows.push(row);
  }
  return rows;
}

function parseXlsxCellValue(xml, attrs, sharedStrings) {
  const type = attrs.t || "";
  if (type === "s") {
    const index = Number(xmlValue(xml));
    return sharedStrings[index] || "";
  }
  if (type === "inlineStr") return parseXlsxText(xml);
  if (type === "str") return xmlDecode(xmlValue(xml));
  if (type === "b") return xmlValue(xml) === "1";
  const value = xmlValue(xml);
  if (value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : xmlDecode(value);
}

function mapNexusExpenseReportRows(rows) {
  const headerIndex = rows.findIndex((row) =>
    row.some((value) => normalizeCostKey(value) === "DATA") &&
    row.some((value) => normalizeCostKey(value) === "NR DOCUMENT") &&
    row.some((value) => normalizeCostKey(value) === "SUMA DEBIT")
  );
  if (headerIndex < 0) throwHttp(400, "Nu am gasit antetul exportului Nexus.");
  const headers = rows[headerIndex] || [];
  const col = (names) => findXlsxHeaderColumn(headers, names);
  const accountHeaderCol = col(["Cont"]);
  const accountCol = accountHeaderCol === 0 && !cellText(headers[1]) ? 1 : accountHeaderCol;
  const dateCol = col(["Data"]);
  const journalCol = col(["Jurnal"]);
  const docTypeCol = col(["Tip document"]);
  const docNoCol = col(["Nr document"]);
  const descriptionCol = col(["Descriere"]);
  const correspondentCol = col(["Cont corespondent"]);
  const supplierCol = col(["Partener cont corespondent"]);
  const debitCol = col(["Suma debit"]);
  const creditCol = col(["Suma credit"]);
  const dcCol = col(["D/C"]);
  const registrationNoCol = col(["Nr inregistrare"]);
  let currentGroup = "";
  const mapped = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const title = cellText(row[0]);
    if (/^BONURI DE CONSUM\s*:/i.test(title)) {
      currentGroup = normalizeSpace(title.replace(/^BONURI DE CONSUM\s*:\s*/i, ""));
      continue;
    }
    const date = xlsxImportedDate(row[dateCol]);
    const amount = xlsxNumber(row[debitCol]) - xlsxNumber(row[creditCol]);
    if (!date || amount === 0) continue;
    const description = cellText(row[descriptionCol]);
    const account = cellText(row[accountCol]);
    const correspondent = cellText(row[correspondentCol]);
    const documentNo = cellText(row[docNoCol]);
    const documentType = cellText(row[docTypeCol]);
    const journal = cellText(row[journalCol]);
    const registration = inferVehicleRegistration(`${description} ${currentGroup}`);
    mapped.push({
      Data: date,
      Subcentru: currentGroup,
      Utilaj: currentGroup,
      "Nr inmatriculare": registration,
      Suma: amount,
      Tip: [account, correspondent && correspondent !== "401" ? correspondent : ""].filter(Boolean).join(" / ") || "Cheltuiala",
      Cont: account,
      "Cont corespondent": correspondent,
      Document: [documentType, documentNo].filter(Boolean).join(" "),
      "Nr document": documentNo,
      Furnizor: cellText(row[supplierCol]),
      Observatii: [
        description,
        journal ? `Jurnal ${journal}` : "",
        cellText(row[dcCol]) ? `D/C ${cellText(row[dcCol])}` : "",
        cellText(row[registrationNoCol]) ? `Nr inregistrare ${cellText(row[registrationNoCol])}` : "",
        currentGroup ? `Grup Nexus ${currentGroup}` : ""
      ].filter(Boolean).join(" | ")
    });
  }
  return mapped;
}

function findXlsxHeaderColumn(headers, names) {
  const normalizedNames = names.map(normalizeCostKey);
  return headers.findIndex((header) => normalizedNames.includes(normalizeCostKey(header)));
}

function xlsxImportedDate(value) {
  if (typeof value === "number" && Number.isFinite(value)) return excelSerialDate(value);
  const text = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);
  if (validDateValue(text)) return text;
  return normalizeImportedDate(text);
}

function excelSerialDate(serial) {
  const millis = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function xlsxNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return round(value);
  return normalizeImportedAmount(value);
}

function cellText(value) {
  return normalizeSpace(String(value ?? ""));
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function inferVehicleRegistration(value) {
  const text = normalizeSpace(value).toUpperCase();
  const match = text.match(/\b[A-Z]{1,2}\s*\d{2,3}\s*[A-Z]{2,3}\b/);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function xlsxColumnIndex(column) {
  const letters = String(column || "").toUpperCase();
  if (!letters) return null;
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

function xmlAttributes(text) {
  const attrs = {};
  for (const match of String(text || "").matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    attrs[match[1]] = xmlDecode(match[2]);
  }
  return attrs;
}

function xmlValue(xml) {
  const match = String(xml || "").match(/<v[^>]*>([\s\S]*?)<\/v>/i);
  return match ? xmlDecode(match[1]) : "";
}

function parseXlsxText(xml) {
  return [...String(xml || "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
    .map((match) => xmlDecode(match[1]))
    .join("");
}

function xmlDecode(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function readRowField(row, names) {
  if (!row || typeof row !== "object") return "";
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeCostKey(key), value]));
  for (const name of names) {
    const key = normalizeCostKey(name);
    if (Object.prototype.hasOwnProperty.call(normalized, key)) return normalized[key];
  }
  return "";
}

function normalizeImportedDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);
  if (validDateValue(text)) return text;
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeImportedAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return round(value);
  const raw = String(value || "").trim();
  if (!raw) return 0;
  let cleaned = raw
    .replace(/\s/g, "")
    .replace(/RON|LEI|EUR|EURO/gi, "");
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  }
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? round(amount) : 0;
}

function buildCostAccountingReport(db, fromValue, toValue) {
  const fallback = localDate(new Date());
  const from = validDateValue(fromValue) ? String(fromValue) : `${fallback.slice(0, 7)}-01`;
  const to = validDateValue(toValue) ? String(toValue) : fallback;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const workLogs = (db.technicalWorkLogs || []).filter((item) => item.date >= start && item.date <= end);
  const expenses = (db.nexusExpenses || []).filter((item) => item.date >= start && item.date <= end);
  const rows = new Map();
  const ensure = (costCenterId, costCenterName, assetId, assetName, registration) => {
    const key = `${costCenterId || costCenterName || "none"}|${assetId || assetName || registration || "none"}`;
    if (!rows.has(key)) {
      rows.set(key, {
        costCenterId: costCenterId || "",
        costCenterName: costCenterName || "Nemapat",
        assetId: assetId || "",
        assetName: assetName || "Fara subcentru",
        registration: registration || "",
        hours: 0,
        expenses: 0,
        costPerHour: 0
      });
    }
    return rows.get(key);
  };
  workLogs.forEach((item) => {
    const row = ensure(item.costCenterId, item.costCenterName, item.assetId, fleetAssetLabel(item), item.registration);
    row.hours += Number(item.hours || 0);
  });
  expenses.forEach((item) => {
    const row = ensure(item.costCenterId, item.costCenterName, item.assetId, item.assetName, item.registration);
    row.expenses += Number(item.amount || 0);
  });
  const finalRows = Array.from(rows.values()).map((row) => ({
    ...row,
    hours: round(row.hours),
    expenses: round(row.expenses),
    costPerHour: row.hours > 0 ? round(row.expenses / row.hours) : 0
  })).sort((a, b) => a.costCenterName.localeCompare(b.costCenterName) || a.assetName.localeCompare(b.assetName));
  const expensesByType = aggregateRows(expenses, (item) => normalizeCostKey(item.expenseType) || "-", () => ({
    expenseType: "",
    amount: 0,
    rows: 0
  }), (row, item) => {
    row.expenseType = item.expenseType || "-";
    row.amount += Number(item.amount || 0);
    row.rows += 1;
  }).map((row) => ({ ...row, amount: round(row.amount) })).sort((a, b) => b.amount - a.amount);
  return {
    from: start,
    to: end,
    metrics: {
      costCenters: new Set(finalRows.map((item) => item.costCenterId || item.costCenterName)).size,
      rows: finalRows.length,
      hours: round(finalRows.reduce((total, item) => total + Number(item.hours || 0), 0)),
      expenses: round(finalRows.reduce((total, item) => total + Number(item.expenses || 0), 0)),
      averageCostPerHour: finalRows.reduce((total, item) => total + Number(item.hours || 0), 0) > 0
        ? round(finalRows.reduce((total, item) => total + Number(item.expenses || 0), 0) / finalRows.reduce((total, item) => total + Number(item.hours || 0), 0))
        : 0
    },
    rows: finalRows,
    expensesByType,
    expenses: expenses.slice().sort(sortNewest),
    workLogs: workLogs.slice().sort(sortNewest)
  };
}

function createProductionPlan(db, user, body) {
  const recipe = db.recipes.find((item) => item.id === body.recipeId && item.active !== false);
  if (!recipe) throwHttp(404, "Reteta inexistenta.");
  const asphalt = round(Number(body.asphalt || 0));
  if (asphalt <= 0) throwHttp(400, "Cantitatea planificata trebuie sa fie mai mare decat zero.");
  const materialNeeds = recipeMaterialNeeds(db, recipe, asphalt, Number(body.emulsion || 0), true);
  const plan = {
    id: id("plan"),
    date: String(body.date || localDate(new Date())),
    jobName: String(body.jobName || "").trim(),
    recipeId: recipe.id,
    recipeName: recipe.name,
    recipeVersion: recipe.version || 1,
    asphalt,
    emulsion: round(Number(body.emulsion || 0)),
    materials: materialNeeds,
    sourceRequestId: String(body.sourceRequestId || "").trim(),
    orderNo: String(body.orderNo || "").trim(),
    orderDate: validDateValue(body.orderDate) ? String(body.orderDate) : "",
    technical: normalizeStoredTechnical(body.technical),
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  db.productionPlans.push(plan);
  return plan;
}

function deleteProductionPlan(db, user, idValue) {
  const plan = db.productionPlans.find((item) => item.id === idValue);
  if (!plan) throwHttp(404, "Plan inexistent.");
  db.productionPlans = db.productionPlans.filter((item) => item.id !== idValue);
  plan.deletedBy = user.id;
  plan.deletedAt = new Date().toISOString();
  return plan;
}

function activeConsumptions(db) {
  return db.consumptions.filter((item) => !item.canceled);
}

function filteredConsumptions(db, url) {
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const recipeId = url.searchParams.get("recipeId") || "";
  const job = String(url.searchParams.get("job") || "").trim().toLowerCase();
  return activeConsumptions(db)
    .filter((item) => !from || item.date >= from)
    .filter((item) => !to || item.date <= to)
    .filter((item) => !recipeId || item.recipeId === recipeId)
    .filter((item) => !job || String(item.jobName || "").toLowerCase().includes(job))
    .sort(sortNewest);
}

function filteredDepartmentRequests(db, url) {
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const status = url.searchParams.get("status") || "";
  const type = url.searchParams.get("type") || "";
  const department = String(url.searchParams.get("department") || "").trim().toLowerCase();
  return (db.departmentRequests || [])
    .filter((item) => !from || item.neededDate >= from)
    .filter((item) => !to || item.neededDate <= to)
    .filter((item) => !status || item.status === status)
    .filter((item) => !type || item.type === type)
    .filter((item) => !department || String(item.department || "").toLowerCase().includes(department))
    .sort((a, b) => `${b.neededDate}${b.createdAt}`.localeCompare(`${a.neededDate}${a.createdAt}`));
}

function filteredStockOperations(db, url) {
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const materialId = url.searchParams.get("materialId") || "";
  const direction = url.searchParams.get("direction") || "";
  const department = String(url.searchParams.get("department") || "").trim().toLowerCase();
  const job = String(url.searchParams.get("job") || "").trim().toLowerCase();
  const document = String(url.searchParams.get("document") || "").trim().toLowerCase();
  return db.stockMovements
    .filter((item) => ["manual_in", "manual_out", "transfer_to_dept"].includes(item.type) && !item.canceled)
    .filter((item) => !from || item.date >= from)
    .filter((item) => !to || item.date <= to)
    .filter((item) => !materialId || item.materialId === materialId)
    .filter((item) => !direction || (direction === "out" ? ["manual_out", "transfer_to_dept"].includes(item.type) : item.type === "manual_in"))
    .filter((item) => !department || String(item.department || "").toLowerCase().includes(department))
    .filter((item) => !job || String(item.jobName || "").toLowerCase().includes(job))
    .filter((item) => !document || String(item.transportDoc || "").toLowerCase().includes(document))
    .sort(sortNewest);
}

function ledgerRows(db, filters) {
  return db.stockMovements
    .filter((item) => !filters.materialId || item.materialId === filters.materialId)
    .filter((item) => !filters.from || item.date >= filters.from)
    .filter((item) => !filters.to || item.date <= filters.to)
    .sort((a, b) => `${a.date}${a.createdAt}`.localeCompare(`${b.date}${b.createdAt}`));
}

function nextReportNo(db, date) {
  const key = date.replaceAll("-", "");
  const sameDay = db.consumptions.filter((item) => item.date === date).length + 1;
  return `RP-${key}-${String(sameDay).padStart(3, "0")}`;
}

function sortNewest(a, b) {
  return `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`);
}

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function backupTimestamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${h}${min}${s}`;
}

function sum(rows, key) {
  return rows.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function round(value) {
  return Number((Number(value || 0)).toFixed(3));
}

function fmt(value) {
  return round(value).toLocaleString("ro-RO", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function buildConsumptionsWorkbook(db, rows, url) {
  const materialHeaders = db.materials.map((material) => `${material.name} (${material.unit})`);
  const totals = Object.fromEntries(db.materials.map((material) => [
    material.id,
    rows.reduce((sumValue, item) => sumValue + Number(item.materials.find((usage) => usage.materialId === material.id)?.amount || 0), 0)
  ]));
  const asphaltTotal = rows.reduce((sumValue, item) => sumValue + Number(item.asphalt || 0), 0);
  return exportXlsxWorkbook([
    {
      name: "Consumuri",
      rows: [
        ["Perioada", `${url.searchParams.get("from") || "inceput"} - ${url.searchParams.get("to") || "sfarsit"}`],
        [],
        ["Data", "Raport", "Lucrare", "Reteta", "Versiune", "Bon / auto", "Operator", "Asfalt (t)", ...materialHeaders],
        ...rows.map((item) => [
          item.date,
          item.reportNo,
          item.jobName || "",
          item.recipeName,
          item.recipeVersion || "",
          item.ticket || "",
          item.operatorName || "",
          Number(item.asphalt || 0),
          ...db.materials.map((material) => Number(item.materials.find((usage) => usage.materialId === material.id)?.amount || 0))
        ]),
        ["TOTAL", "", "", "", "", "", "", asphaltTotal, ...db.materials.map((material) => totals[material.id] || 0)]
      ]
    },
    {
      name: "Stocuri",
      rows: [
        ["Material", "Stoc", "Prag alerta", "Unitate"],
        ...db.materials.map((material) => [material.name, Number(material.stock || 0), Number(material.alert || 0), material.unit])
      ]
    }
  ]);
}

function buildDailyReportWorkbook(report) {
  return exportXlsxWorkbook([
    {
      name: "Totaluri materiale",
      rows: [
        ["Data", report.date],
        ["Asfalt zi", report.metrics.asphaltTotal],
        ["Consumuri", report.metrics.consumptionsCount],
        ["Intrari", report.metrics.deliveriesCount],
        ["Iesiri departamente", report.metrics.manualOutCount],
        [],
        ["Material", "UM", "Stoc inceput luna", "Stoc zi precedenta", "Stoc inceput zi", "Intrari", "Consum asfalt", "Intrari manuale", "Iesiri manuale", "Net zi", "Stoc final zi"],
        ...report.materialTotals.map((item) => [
          item.materialName,
          item.unit,
          item.monthOpeningStock,
          item.previousDayStock,
          item.openingStock,
          item.delivered,
          item.consumed,
          item.manualIn,
          item.manualOut,
          item.netMovement,
          item.closingStock
        ])
      ]
    },
    {
      name: "Consum asfalt",
      rows: [
        ["Raport", "Lucrare", "Reteta", "Bon / auto", "Asfalt", "Operator"],
        ...report.consumptions.map((item) => [item.reportNo || "", item.jobName || "", item.recipeName || "", item.ticket || "", item.asphalt, item.operatorName || ""])
      ]
    },
    {
      name: "Intrari",
      rows: [
        ["Material", "Cantitate", "UM", "Furnizor", "Document", "Operator"],
        ...report.deliveries.map((item) => [item.materialName || "", item.amount, item.unit || "", item.supplier || "", item.document || "", item.operatorName || ""])
      ]
    },
    {
      name: "Miscari departamente",
      rows: [
        ["Tip", "Material", "Cantitate", "UM", "Departament", "Lucrare", "Bon", "Operator"],
        ...report.manualMovements.map((item) => [typeLabel(item.type), item.materialName || "", Math.abs(Number(item.amount || 0)), item.unit || "", item.department || "", item.jobName || "", item.transportDoc || "", item.createdByName || ""])
      ]
    }
  ]);
}

function buildPeriodReportWorkbook(report) {
  return exportXlsxWorkbook([
    {
      name: "Totaluri materiale",
      rows: [
        ["Perioada", `${report.from} - ${report.to}`],
        ["Asfalt perioada", report.metrics.asphaltTotal],
        ["Consumuri", report.metrics.consumptionsCount],
        ["Intrari", report.metrics.deliveriesCount],
        ["Iesiri departamente", report.metrics.manualOutCount],
        [],
        ["Material", "UM", "Stoc inceput", "Intrari", "Consum asfalt", "Intrari manuale", "Iesiri manuale", "Net perioada", "Stoc final perioada"],
        ...report.materialTotals.map((item) => [
          item.materialName,
          item.unit,
          item.openingStock,
          item.delivered,
          item.consumed,
          item.manualIn,
          item.manualOut,
          item.netMovement,
          item.closingStock
        ])
      ]
    },
    {
      name: "Consum asfalt",
      rows: [
        ["Data", "Raport", "Lucrare", "Reteta", "Bon / auto", "Asfalt", "Operator"],
        ...report.consumptions.map((item) => [item.date, item.reportNo || "", item.jobName || "", item.recipeName || "", item.ticket || "", item.asphalt, item.operatorName || ""])
      ]
    },
    {
      name: "Intrari",
      rows: [
        ["Data", "Material", "Cantitate", "UM", "Furnizor", "Document", "Operator"],
        ...report.deliveries.map((item) => [item.date, item.materialName || "", item.amount, item.unit || "", item.supplier || "", item.document || "", item.operatorName || ""])
      ]
    },
    {
      name: "Miscari departamente",
      rows: [
        ["Data", "Tip", "Material", "Cantitate", "UM", "Departament", "Lucrare", "Bon", "Operator"],
        ...report.manualMovements.map((item) => [item.date, typeLabel(item.type), item.materialName || "", Math.abs(Number(item.amount || 0)), item.unit || "", item.department || "", item.jobName || "", item.transportDoc || "", item.createdByName || ""])
      ]
    }
  ]);
}

function buildLedgerWorkbook(rows, material, filters) {
  return exportXlsxWorkbook([
    {
      name: "Fisa stoc",
      rows: [
        ["Material", material?.name || "Toate materialele"],
        ["Unitate", material?.unit || ""],
        ["Perioada", `${filters.from || "inceput"} - ${filters.to || "sfarsit"}`],
        [],
        ["Data", "Material", "Tip", "Document / lucrare", "Intrare", "Iesire", "Ajustare", "Unitate"],
        ...rows.map((item) => [
          item.date,
          item.materialName,
          typeLabel(item.type),
          item.note || "",
          item.amount > 0 && !isStockBalanceMovement(item) ? Number(item.amount || 0) : 0,
          item.amount < 0 && !isStockBalanceMovement(item) ? Math.abs(Number(item.amount || 0)) : 0,
          isStockBalanceMovement(item) ? Number(item.amount || 0) : 0,
          item.unit
        ])
      ]
    }
  ]);
}

function buildAccountingReportWorkbook(report) {
  return exportXlsxWorkbook([
    {
      name: "Raport contabil",
      rows: [
        ["Luna", report.month],
        ["Perioada", `${report.from} - ${report.to}`],
        ["Materiale", report.metrics.materials],
        [],
        ["Material", "UM", "Stoc inceput luna", "Intrari luna", "Consum asfalt", "Intrari manuale", "Iesiri departamente", "Ajustari/anulari", "Stoc final luna", "Diferenta"],
        ...report.rows.map((item) => [
          item.materialName,
          item.unit,
          item.openingStock,
          item.deliveries,
          item.asphaltConsumption,
          item.manualIn,
          item.manualOut,
          item.adjustments,
          item.closingStock,
          item.difference
        ])
      ]
    }
  ]);
}

function buildStockOperationsWorkbook(rows, url) {
  const inTotal = rows.filter((item) => item.amount > 0).reduce((sumValue, item) => sumValue + Number(item.amount || 0), 0);
  const outTotal = rows.filter((item) => item.amount < 0).reduce((sumValue, item) => sumValue + Math.abs(Number(item.amount || 0)), 0);
  return exportXlsxWorkbook([
    {
      name: "Miscari stoc",
      rows: [
        ["Perioada", `${url.searchParams.get("from") || "inceput"} - ${url.searchParams.get("to") || "sfarsit"}`],
        ["Intrari total", inTotal],
        ["Iesiri total", outTotal],
        [],
        ["Data", "Tip", "Material", "Cantitate", "Unitate", "Departament", "Lucrare", "Bon transport", "Observatii", "Operator"],
        ...rows.map((item) => [
          item.date,
          typeLabel(item.type),
          item.materialName,
          Math.abs(Number(item.amount || 0)),
          item.unit,
          item.department || "",
          item.jobName || "",
          item.transportDoc || "",
          item.note || "",
          item.createdByName || ""
        ])
      ]
    }
  ]);
}

function buildProcurementWorkbook(rows) {
  const totalShortage = rows.reduce((sumValue, item) => sumValue + Number(item.shortage || 0), 0);
  return exportXlsxWorkbook([
    {
      name: "Necesar aprovizionare",
      rows: [
        ["Generat la", new Date().toLocaleString("ro-RO")],
        ["Materiale cu alerta", rows.length],
        ["Lipsa totala", totalShortage],
        [],
        ["Material", "Necesar total", "Din planuri", "Din solicitari", "Stoc curent", "Stoc estimat", "Lipsa", "Prag alerta", "Unitate"],
        ...rows.map((item) => [
          item.materialName,
          Number(item.required || 0),
          Number(item.fromPlans || 0),
          Number(item.fromRequests || 0),
          Number(item.stock || 0),
          Number(item.projectedStock || 0),
          Number(item.shortage || 0),
          Number(item.alert || 0),
          item.unit
        ])
      ]
    }
  ]);
}

function buildProcurementOrdersWorkbook(db) {
  const orders = procurementOrdersView(db);
  const receipts = (db.procurementReceipts || []).filter((item) => !item.canceled && !item.deleted).slice().sort(sortNewest);
  const materialsById = new Map((db.materials || []).map((material) => [material.id, material]));
  const mapRows = Object.entries(normalizeScaleProductMap(db.settings?.scaleProductMap || {}))
    .map(([product, materialId]) => {
      const material = materialsById.get(materialId);
      return [product, material?.name || materialId, material?.unit || ""];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return exportXlsxWorkbook([
    {
      name: "Comenzi",
      rows: [
        ["Generat la", new Date().toLocaleString("ro-RO")],
        ["Comenzi", orders.length],
        [],
        ["Data", "Data estimata", "Nr. comanda", "Material", "Furnizor", "Comandat", "Receptionat", "Ramas", "UM", "Status", "Observatii"],
        ...orders.map((order) => [
          order.date,
          order.expectedDate || "",
          order.orderNo || "",
          order.materialName || "",
          order.supplier || "",
          Number(order.amount || 0),
          Number(order.receivedAmount || 0),
          Number(order.remainingAmount || 0),
          order.unit || "",
          procurementStatusLabel(order.status),
          order.note || ""
        ])
      ]
    },
    {
      name: "Receptii",
      rows: [
        ["Data", "Comanda", "Material", "Cantitate", "UM", "Furnizor", "Aviz/factura", "CMR", "Tichet cantar", "Produs cantar", "Auto", "Semiremorca", "Operator", "Observatii"],
        ...receipts.map((receipt) => [
          receipt.date,
          receipt.orderNo || "",
          receipt.materialName || "",
          Number(receipt.amount || 0),
          receipt.unit || "",
          receipt.supplier || "",
          receipt.document || "",
          receipt.cmr || "",
          receipt.scaleTicket || "",
          receipt.scaleProduct || "",
          receipt.vehicleNo || "",
          receipt.trailerNo || "",
          receipt.createdByName || "",
          receipt.note || ""
        ])
      ]
    },
    {
      name: "Mapari cantar",
      rows: [
        ["Produs Cantar Auto", "Material InfraFlow", "UM"],
        ...mapRows
      ]
    }
  ]);
}

function buildFleetWorkbook(db) {
  const assets = fleetAssetsView(db);
  const requests = fleetRequestsView(db);
  const alerts = buildFleetAlerts(db);
  const meterReadings = (db.fleetMeterReadings || []).slice().sort(sortNewest);
  return exportXlsxWorkbook([
    {
      name: "Programari",
      rows: [
        ["Generat la", new Date().toLocaleString("ro-RO")],
        ["Solicitari", requests.length],
        [],
        ["Data", "Start", "Final", "Activ", "Categorie", "Departament", "Lucrare", "Locatie", "Status", "Solicitant", "Observatii"],
        ...requests.map((request) => [
          request.date,
          request.startTime,
          request.endTime,
          fleetRequestAssetLabel(db, request),
          fleetCategoryLabel(request.category),
          request.department || "",
          request.jobName || "",
          request.location || "",
          fleetStatusLabel(request.status),
          request.createdByName || "",
          request.note || ""
        ])
      ]
    },
    {
      name: "Parc auto utilaje",
      rows: [
        ["Categorie", "Nr. inmatriculare", "Denumire", "Tip", "Marca", "Model", "Departament", "Centru cost", "Locatie", "Cod activ", "Nr. inventar", "An", "Serie sasiu/VIN", "Serie motor", "Combustibil", "Rulaj curent", "UM rulaj", "Revizie la data", "Revizie la rulaj", "Inspectie", "Inspectie la data", "Activ", "Creat de"],
        ...assets.map((asset) => [
          fleetCategoryLabel(asset.category),
          asset.registration || "",
          asset.name || "",
          asset.type || "",
          asset.brand || "",
          asset.model || "",
          asset.department || "",
          asset.costCenterName || "",
          asset.location || "",
          asset.assetCode || "",
          asset.inventoryNo || "",
          asset.year || "",
          asset.vin || asset.serialNo || "",
          asset.engineSerial || "",
          asset.fuelType || "",
          Number(asset.currentMeter || 0),
          fleetMeterUnitLabel(asset.meterUnit),
          asset.nextServiceDate || "",
          Number(asset.nextServiceMeter || 0) || "",
          asset.inspectionType || "",
          asset.nextInspectionDate || "",
          asset.active === false ? "Nu" : "Da",
          asset.createdByName || ""
        ])
      ]
    },
    {
      name: "Alerte",
      rows: [
        ["Status", "Tip", "Activ", "Nr.", "Detalii", "Scadenta data", "Scadenta rulaj", "Rulaj curent", "UM"],
        ...alerts.map((alert) => [
          alert.severity === "bad" ? "Critic" : "Atentie",
          alert.title,
          alert.assetName || "",
          alert.registration || "",
          alert.detail || "",
          alert.dueDate || "",
          alert.dueMeter || "",
          alert.currentMeter || "",
          alert.meterUnit ? fleetMeterUnitLabel(alert.meterUnit) : ""
        ])
      ]
    },
    {
      name: "Istoric rulaj",
      rows: [
        ["Data", "Activ", "Nr.", "Categorie", "Rulaj precedent", "Rulaj nou", "UM", "Operator", "Observatii"],
        ...meterReadings.map((reading) => [
          reading.date || "",
          reading.assetName || "",
          reading.registration || "",
          fleetCategoryLabel(reading.category),
          Number(reading.previousMeter || 0),
          Number(reading.meter || 0),
          fleetMeterUnitLabel(reading.meterUnit),
          reading.createdByName || "",
          reading.note || ""
        ])
      ]
    }
  ]);
}

function buildTechnicalReportWorkbook(report) {
  return exportXlsxWorkbook([
    {
      name: "Sumar tehnic",
      rows: [
        ["Perioada", `${report.from} - ${report.to}`],
        ["Filtru lucrare", report.filters?.job || "Toate"],
        ["Filtru reteta", report.filters?.recipeName || report.filters?.recipeId || "Toate"],
        ["Ore lucrate", report.metrics.workHours],
        ["Asfalt fabricat", report.metrics.producedTotal],
        ["Asfalt vandut", report.metrics.soldTotal],
        ["Ramas", report.metrics.remainingTotal],
        [],
        ["Reteta", "Fabricat", "Vandut", "Ramas"],
        ...report.productionByRecipe.map((row) => [row.label, row.produced, row.sold, row.remaining])
      ]
    },
    {
      name: "Ore pe utilaj",
      rows: [
        ["Utilaj/auto", "Categorie", "Nr.", "Ore", "Lucrari", "Centre cost"],
        ...report.hoursByAsset.map((row) => [row.assetName, row.category, row.registration, row.hours, row.jobs || "", row.costCenters || ""])
      ]
    },
    {
      name: "Ore pe lucrare",
      rows: [
        ["Lucrare", "Ore", "Utilaje", "Centre cost"],
        ...report.hoursByJob.map((row) => [row.jobName, row.hours, row.assets || "", row.costCenters || ""])
      ]
    },
    {
      name: "Vanzari asfalt",
      rows: [
        ["Data", "Client", "CIF", "Lucrare", "Reteta", "Cantitate", "Document", "Auto", "Operator", "Observatii"],
        ...report.sales.map((sale) => [
          sale.date,
          sale.client || "",
          sale.clientCif || "",
          sale.jobName || "",
          sale.recipeName || "",
          Number(sale.amount || 0),
          sale.documentNo || "",
          sale.vehicleNo || "",
          sale.createdByName || "",
          sale.note || ""
        ])
      ]
    },
    {
      name: "Consumuri asfalt",
      rows: [
        ["Data", "Raport", "Lucrare", "Reteta", "Cantitate", "Bon/auto", "Operator", "Status vanzare"],
        ...report.production.map((item) => [
          item.date,
          item.reportNo || "",
          item.jobName || "",
          item.recipeName || "",
          Number(item.asphalt || 0),
          [item.ticket, item.vehicleNo].filter(Boolean).join(" / "),
          item.operatorName || item.createdByName || "",
          item.soldFromConsumption ? `Vandut ${item.soldAmount ? `${fmt(item.soldAmount)} t` : ""}`.trim() : "Nevandut"
        ])
      ]
    },
    {
      name: "Pontaje",
      rows: [
        ["Data", "Utilaj/auto", "Centru cost", "Lucrare", "Start", "Final", "Ore", "Tip document", "Nr. document", "Operator", "Observatii"],
        ...report.workLogs.map((item) => [
          item.date,
          fleetAssetLabel(item),
          item.costCenterName || "",
          item.jobName || "",
          item.startTime || "",
          item.endTime || "",
          Number(item.hours || 0),
          item.documentLabel || workLogDocumentMeta(item).label,
          item.documentNo || "",
          item.operatorName || item.createdByName || "",
          item.note || ""
        ])
      ]
    }
  ]);
}

function buildCostAccountingWorkbook(report) {
  return exportXlsxWorkbook([
    {
      name: "Costuri pe ora",
      rows: [
        ["Perioada", `${report.from} - ${report.to}`],
        ["Ore", report.metrics.hours],
        ["Cheltuieli", report.metrics.expenses],
        ["Cost mediu pe ora", report.metrics.averageCostPerHour],
        [],
        ["Centru cost", "Subcentru", "Nr.", "Ore", "Cheltuieli", "Cost/ora"],
        ...report.rows.map((row) => [
          row.costCenterName,
          row.assetName,
          row.registration || "",
          row.hours,
          row.expenses,
          row.costPerHour
        ])
      ]
    },
    {
      name: "Cheltuieli pe tip",
      rows: [
        ["Tip cheltuiala", "Randuri", "Suma"],
        ...report.expensesByType.map((row) => [row.expenseType, row.rows, row.amount])
      ]
    },
    {
      name: "Cheltuieli Nexus",
      rows: [
        ["Data", "Centru cost", "Subcentru", "Nr.", "Tip", "Suma", "Moneda", "Document", "Furnizor", "Observatii"],
        ...report.expenses.map((expense) => [
          expense.date,
          expense.costCenterName || "",
          expense.assetName || "",
          expense.registration || "",
          expense.expenseType || "",
          Number(expense.amount || 0),
          expense.currency || "RON",
          expense.documentNo || "",
          expense.supplier || "",
          expense.note || ""
        ])
      ]
    },
    {
      name: "Ore folosite",
      rows: [
        ["Data", "Centru cost", "Utilaj/auto", "Lucrare", "Ore", "Tip document", "Nr. document"],
        ...report.workLogs.map((item) => [
          item.date,
          item.costCenterName || "",
          fleetAssetLabel(item),
          item.jobName || "",
          Number(item.hours || 0),
          item.documentLabel || workLogDocumentMeta(item).label,
          item.documentNo || ""
        ])
      ]
    }
  ]);
}

function buildConsumptionsReport(db, rows, url) {
  const materialHeaders = db.materials.map((material) => `<th>${htmlEscape(material.name)}<br><span>${htmlEscape(material.unit)}</span></th>`).join("");
  const totals = Object.fromEntries(db.materials.map((material) => [
    material.id,
    rows.reduce((sumValue, item) => sumValue + Number(item.materials.find((usage) => usage.materialId === material.id)?.amount || 0), 0)
  ]));
  const asphaltTotal = rows.reduce((sumValue, item) => sumValue + Number(item.asphalt || 0), 0);
  const body = rows.map((item) => `
    <tr>
      <td>${htmlEscape(item.date)}</td>
      <td>${htmlEscape(item.reportNo)}</td>
      <td>${htmlEscape(item.jobName || "-")}</td>
      <td>${htmlEscape(item.recipeName)}</td>
      <td>${htmlEscape(item.ticket || "-")}</td>
      <td class="num">${fmt(item.asphalt)}</td>
      <td>${htmlEscape(item.operatorName || "-")}</td>
      ${db.materials.map((material) => `<td class="num">${fmt(item.materials.find((usage) => usage.materialId === material.id)?.amount || 0)}</td>`).join("")}
    </tr>
  `).join("") || `<tr><td colspan="${7 + db.materials.length}">Nu exista consumuri pentru filtrele selectate.</td></tr>`;
  const totalsRow = `
    <tr class="total">
      <td colspan="5">TOTAL</td>
      <td class="num">${fmt(asphaltTotal)}</td>
      <td></td>
      ${db.materials.map((material) => `<td class="num">${fmt(totals[material.id] || 0)}</td>`).join("")}
    </tr>
  `;
  return reportPage(db, {
    title: "Raport consumuri asfalt",
    subtitle: `Perioada: ${htmlEscape(url.searchParams.get("from") || "inceput")} - ${htmlEscape(url.searchParams.get("to") || "sfarsit")}`,
    content: `
      <table>
        <thead>
          <tr><th>Data</th><th>Raport</th><th>Lucrare</th><th>Reteta</th><th>Bon / auto</th><th>Asfalt<br><span>t</span></th><th>Operator</th>${materialHeaders}</tr>
        </thead>
        <tbody>${body}${rows.length ? totalsRow : ""}</tbody>
      </table>
    `
  });
}

function buildStockOperationsReport(db, rows, url) {
  const inTotal = rows.filter((item) => item.amount > 0).reduce((sumValue, item) => sumValue + Number(item.amount || 0), 0);
  const outTotal = rows.filter((item) => item.amount < 0).reduce((sumValue, item) => sumValue + Math.abs(Number(item.amount || 0)), 0);
  const body = rows.map((item) => `
    <tr>
      <td>${htmlEscape(item.date)}</td>
      <td>${htmlEscape(typeLabel(item.type))}</td>
      <td>${htmlEscape(item.materialName || "-")}</td>
      <td class="num">${fmt(Math.abs(Number(item.amount || 0)))}</td>
      <td>${htmlEscape(item.unit || "")}</td>
      <td>${htmlEscape(item.department || "-")}</td>
      <td>${htmlEscape(item.jobName || "-")}</td>
      <td>${htmlEscape(item.transportDoc || "-")}</td>
      <td>${htmlEscape(item.createdByName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="9">Nu exista miscari pentru filtrele selectate.</td></tr>`;
  return reportPage(db, {
    title: "Raport miscari stoc",
    subtitle: `Perioada: ${htmlEscape(url.searchParams.get("from") || "inceput")} - ${htmlEscape(url.searchParams.get("to") || "sfarsit")}`,
    content: `
      <div class="summary">
        <span>Intrari manuale: <strong>${fmt(inTotal)}</strong></span>
        <span>Iesiri manuale: <strong>${fmt(outTotal)}</strong></span>
        <span>Randuri: <strong>${rows.length}</strong></span>
      </div>
      <table>
        <thead>
          <tr><th>Data</th><th>Tip</th><th>Material</th><th>Cantitate</th><th>UM</th><th>Departament</th><th>Lucrare</th><th>Bon</th><th>Operator</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `
  });
}

function buildDailyReportPage(db, report) {
  const materialRows = report.materialTotals.map((item) => `
    <tr>
      <td>${htmlEscape(item.materialName)}</td>
      <td class="num">${fmt(item.monthOpeningStock)} ${htmlEscape(item.unit)}</td>
      <td class="num">${fmt(item.previousDayStock)} ${htmlEscape(item.unit)}</td>
      <td class="num">${fmt(item.openingStock)} ${htmlEscape(item.unit)}</td>
      <td class="num">${fmt(item.delivered)}</td>
      <td class="num">${fmt(item.consumed)}</td>
      <td class="num">${fmt(item.manualIn)}</td>
      <td class="num">${fmt(item.manualOut)}</td>
      <td class="num">${fmt(item.netMovement)}</td>
      <td class="num">${fmt(item.closingStock)} ${htmlEscape(item.unit)}</td>
    </tr>
  `).join("");
  const consumptionRows = report.consumptions.map((item) => `
    <tr>
      <td>${htmlEscape(item.reportNo || "-")}</td>
      <td>${htmlEscape(item.jobName || "-")}</td>
      <td>${htmlEscape(item.recipeName || "-")}</td>
      <td>${htmlEscape(item.ticket || "-")}</td>
      <td class="num">${fmt(item.asphalt)} t</td>
      <td>${htmlEscape(item.operatorName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="6">Nu exista consumuri in ziua selectata.</td></tr>`;
  const deliveryRows = report.deliveries.map((item) => `
    <tr>
      <td>${htmlEscape(item.materialName || "-")}</td>
      <td class="num">${fmt(item.amount)} ${htmlEscape(item.unit || "")}</td>
      <td>${htmlEscape(item.supplier || "-")}</td>
      <td>${htmlEscape(item.document || "-")}</td>
      <td>${htmlEscape(item.operatorName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">Nu exista intrari in ziua selectata.</td></tr>`;
  const manualRows = report.manualMovements.map((item) => `
    <tr>
      <td>${htmlEscape(typeLabel(item.type))}</td>
      <td>${htmlEscape(item.materialName || "-")}</td>
      <td class="num">${fmt(Math.abs(item.amount))} ${htmlEscape(item.unit || "")}</td>
      <td>${htmlEscape(item.department || "-")}</td>
      <td>${htmlEscape(item.jobName || "-")}</td>
      <td>${htmlEscape(item.transportDoc || "-")}</td>
      <td>${htmlEscape(item.createdByName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="7">Nu exista miscari catre alte departamente in ziua selectata.</td></tr>`;
  const criticalRows = report.criticalStocks.map((item) => `
    <tr>
      <td>${htmlEscape(item.materialName)}</td>
      <td class="num">${fmt(item.stock)} ${htmlEscape(item.unit)}</td>
      <td class="num">${fmt(item.alert)} ${htmlEscape(item.unit)}</td>
    </tr>
  `).join("") || `<tr><td colspan="3">Nu exista stocuri critice.</td></tr>`;
  return reportPage(db, {
    title: "Raport zi gestionar",
    subtitle: `Data: ${htmlEscape(report.date)}`,
    content: `
      <div class="summary">
        <span>Asfalt: <strong>${fmt(report.metrics.asphaltTotal)} t</strong></span>
        <span>Consumuri: <strong>${report.metrics.consumptionsCount}</strong></span>
        <span>Intrari: <strong>${report.metrics.deliveriesCount}</strong></span>
        <span>Iesiri departamente: <strong>${report.metrics.manualOutCount}</strong></span>
        <span>Stocuri critice: <strong>${report.metrics.criticalStocksCount}</strong></span>
      </div>
      <h2>Totaluri pe materiale</h2>
      <table>
        <thead><tr><th>Material</th><th>Stoc inceput luna</th><th>Stoc zi precedenta</th><th>Stoc inceput zi</th><th>Intrari</th><th>Consum asfalt</th><th>Intrari manuale</th><th>Iesiri manuale</th><th>Net zi</th><th>Stoc final zi</th></tr></thead>
        <tbody>${materialRows}</tbody>
      </table>
      <h2>Consum asfalt</h2>
      <table>
        <thead><tr><th>Raport</th><th>Lucrare</th><th>Reteta</th><th>Bon / auto</th><th>Asfalt</th><th>Operator</th></tr></thead>
        <tbody>${consumptionRows}</tbody>
      </table>
      <h2>Intrari materiale</h2>
      <table>
        <thead><tr><th>Material</th><th>Cantitate</th><th>Furnizor</th><th>Document</th><th>Operator</th></tr></thead>
        <tbody>${deliveryRows}</tbody>
      </table>
      <h2>Miscari catre alte departamente</h2>
      <table>
        <thead><tr><th>Tip</th><th>Material</th><th>Cantitate</th><th>Departament</th><th>Lucrare</th><th>Bon</th><th>Operator</th></tr></thead>
        <tbody>${manualRows}</tbody>
      </table>
      <h2>Stocuri critice</h2>
      <table>
        <thead><tr><th>Material</th><th>Stoc</th><th>Prag</th></tr></thead>
        <tbody>${criticalRows}</tbody>
      </table>
    `
  });
}

function buildPeriodReportPage(db, report) {
  const materialRows = report.materialTotals.map((item) => `
    <tr>
      <td>${htmlEscape(item.materialName)}</td>
      <td class="num">${fmt(item.openingStock)} ${htmlEscape(item.unit)}</td>
      <td class="num">${fmt(item.delivered)}</td>
      <td class="num">${fmt(item.consumed)}</td>
      <td class="num">${fmt(item.manualIn)}</td>
      <td class="num">${fmt(item.manualOut)}</td>
      <td class="num">${fmt(item.netMovement)}</td>
      <td class="num">${fmt(item.closingStock)} ${htmlEscape(item.unit)}</td>
    </tr>
  `).join("");
  const consumptionRows = report.consumptions.map((item) => `
    <tr>
      <td>${htmlEscape(item.date)}</td>
      <td>${htmlEscape(item.reportNo || "-")}</td>
      <td>${htmlEscape(item.jobName || "-")}</td>
      <td>${htmlEscape(item.recipeName || "-")}</td>
      <td>${htmlEscape(item.ticket || "-")}</td>
      <td class="num">${fmt(item.asphalt)} t</td>
      <td>${htmlEscape(item.operatorName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="7">Nu exista consumuri in perioada selectata.</td></tr>`;
  const deliveryRows = report.deliveries.map((item) => `
    <tr>
      <td>${htmlEscape(item.date)}</td>
      <td>${htmlEscape(item.materialName || "-")}</td>
      <td class="num">${fmt(item.amount)} ${htmlEscape(item.unit || "")}</td>
      <td>${htmlEscape(item.supplier || "-")}</td>
      <td>${htmlEscape(item.document || "-")}</td>
      <td>${htmlEscape(item.operatorName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="6">Nu exista intrari in perioada selectata.</td></tr>`;
  const manualRows = report.manualMovements.map((item) => `
    <tr>
      <td>${htmlEscape(item.date)}</td>
      <td>${htmlEscape(typeLabel(item.type))}</td>
      <td>${htmlEscape(item.materialName || "-")}</td>
      <td class="num">${fmt(Math.abs(item.amount))} ${htmlEscape(item.unit || "")}</td>
      <td>${htmlEscape(item.department || "-")}</td>
      <td>${htmlEscape(item.jobName || "-")}</td>
      <td>${htmlEscape(item.transportDoc || "-")}</td>
      <td>${htmlEscape(item.createdByName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="8">Nu exista miscari catre alte departamente in perioada selectata.</td></tr>`;
  const criticalRows = report.criticalStocks.map((item) => `
    <tr>
      <td>${htmlEscape(item.materialName)}</td>
      <td class="num">${fmt(item.stock)} ${htmlEscape(item.unit)}</td>
      <td class="num">${fmt(item.alert)} ${htmlEscape(item.unit)}</td>
    </tr>
  `).join("") || `<tr><td colspan="3">Nu exista stocuri critice.</td></tr>`;
  return reportPage(db, {
    title: "Raport perioada gestionar",
    subtitle: `Perioada: ${htmlEscape(report.from)} - ${htmlEscape(report.to)}`,
    content: `
      <div class="summary">
        <span>Asfalt: <strong>${fmt(report.metrics.asphaltTotal)} t</strong></span>
        <span>Consumuri: <strong>${report.metrics.consumptionsCount}</strong></span>
        <span>Intrari: <strong>${report.metrics.deliveriesCount}</strong></span>
        <span>Iesiri departamente: <strong>${report.metrics.manualOutCount}</strong></span>
        <span>Stocuri critice: <strong>${report.metrics.criticalStocksCount}</strong></span>
      </div>
      <h2>Totaluri pe materiale</h2>
      <table>
        <thead><tr><th>Material</th><th>Stoc inceput</th><th>Intrari</th><th>Consum asfalt</th><th>Intrari manuale</th><th>Iesiri manuale</th><th>Net perioada</th><th>Stoc final perioada</th></tr></thead>
        <tbody>${materialRows}</tbody>
      </table>
      <h2>Consum asfalt</h2>
      <table>
        <thead><tr><th>Data</th><th>Raport</th><th>Lucrare</th><th>Reteta</th><th>Bon / auto</th><th>Asfalt</th><th>Operator</th></tr></thead>
        <tbody>${consumptionRows}</tbody>
      </table>
      <h2>Intrari materiale</h2>
      <table>
        <thead><tr><th>Data</th><th>Material</th><th>Cantitate</th><th>Furnizor</th><th>Document</th><th>Operator</th></tr></thead>
        <tbody>${deliveryRows}</tbody>
      </table>
      <h2>Miscari catre alte departamente</h2>
      <table>
        <thead><tr><th>Data</th><th>Tip</th><th>Material</th><th>Cantitate</th><th>Departament</th><th>Lucrare</th><th>Bon</th><th>Operator</th></tr></thead>
        <tbody>${manualRows}</tbody>
      </table>
      <h2>Stocuri critice curente</h2>
      <table>
        <thead><tr><th>Material</th><th>Stoc</th><th>Prag</th></tr></thead>
        <tbody>${criticalRows}</tbody>
      </table>
    `
  });
}

function buildAccountingReportPage(db, report) {
  const materialRows = report.rows.map((item) => `
    <tr>
      <td>${htmlEscape(item.materialName)}</td>
      <td>${htmlEscape(item.unit)}</td>
      <td class="num">${fmt(item.openingStock)}</td>
      <td class="num">${fmt(item.deliveries)}</td>
      <td class="num">${fmt(item.asphaltConsumption)}</td>
      <td class="num">${fmt(item.manualIn)}</td>
      <td class="num">${fmt(item.manualOut)}</td>
      <td class="num">${fmt(item.adjustments)}</td>
      <td class="num">${fmt(item.closingStock)}</td>
      <td class="num">${fmt(item.difference)}</td>
    </tr>
  `).join("");
  return reportPage(db, {
    title: "Raport lunar contabil",
    subtitle: `Luna: ${htmlEscape(report.month)} / ${htmlEscape(report.from)} - ${htmlEscape(report.to)}`,
    content: `
      <div class="summary">
        <span>Materiale: <strong>${report.metrics.materials}</strong></span>
        <span>Intrari: <strong>${fmt(report.metrics.deliveries)}</strong></span>
        <span>Consum asfalt: <strong>${fmt(report.metrics.asphaltConsumption)}</strong></span>
        <span>Iesiri departamente: <strong>${fmt(report.metrics.manualOut)}</strong></span>
        <span>Diferente: <strong>${report.metrics.differences}</strong></span>
      </div>
      <h2>Solduri si miscari pe materiale</h2>
      <table>
        <thead><tr><th>Material</th><th>UM</th><th>Stoc inceput luna</th><th>Intrari luna</th><th>Consum asfalt</th><th>Intrari manuale</th><th>Iesiri departamente</th><th>Ajustari/anulari</th><th>Stoc final luna</th><th>Diferenta</th></tr></thead>
        <tbody>${materialRows}</tbody>
      </table>
    `
  });
}

function buildLedgerReport(db, rows, material, filters) {
  const inTotal = rows.filter((item) => item.amount > 0 && !isStockBalanceMovement(item)).reduce((sumValue, item) => sumValue + Number(item.amount || 0), 0);
  const outTotal = rows.filter((item) => item.amount < 0 && !isStockBalanceMovement(item)).reduce((sumValue, item) => sumValue + Math.abs(Number(item.amount || 0)), 0);
  const adjTotal = rows.filter((item) => isStockBalanceMovement(item)).reduce((sumValue, item) => sumValue + Number(item.amount || 0), 0);
  const body = rows.map((item) => `
    <tr>
      <td>${htmlEscape(item.date)}</td>
      <td>${htmlEscape(item.materialName || "-")}</td>
      <td>${htmlEscape(typeLabel(item.type))}</td>
      <td>${htmlEscape(item.note || "-")}</td>
      <td class="num">${item.amount > 0 && !isStockBalanceMovement(item) ? fmt(item.amount) : "-"}</td>
      <td class="num">${item.amount < 0 && !isStockBalanceMovement(item) ? fmt(Math.abs(item.amount)) : "-"}</td>
      <td class="num">${isStockBalanceMovement(item) ? fmt(item.amount) : "-"}</td>
      <td>${htmlEscape(item.unit || material?.unit || "")}</td>
    </tr>
  `).join("") || `<tr><td colspan="8">Nu exista miscari pentru filtrele selectate.</td></tr>`;
  return reportPage(db, {
    title: `Fisa stoc - ${htmlEscape(material?.name || "Toate materialele")}`,
    subtitle: `Perioada: ${htmlEscape(filters.from || "inceput")} - ${htmlEscape(filters.to || "sfarsit")}`,
    content: `
      <div class="summary">
        <span>Intrari: <strong>${fmt(inTotal)}</strong></span>
        <span>Iesiri: <strong>${fmt(outTotal)}</strong></span>
        <span>Ajustari: <strong>${fmt(adjTotal)}</strong></span>
        ${material ? `<span>Stoc curent: <strong>${fmt(material.stock)} ${htmlEscape(material.unit)}</strong></span>` : ""}
      </div>
      <table>
        <thead>
          <tr><th>Data</th><th>Material</th><th>Tip</th><th>Document / lucrare</th><th>Intrare</th><th>Iesire</th><th>Ajustare</th><th>UM</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `
  });
}

function buildProcurementOrdersReport(db) {
  const orders = procurementOrdersView(db);
  const receipts = (db.procurementReceipts || []).filter((item) => !item.canceled && !item.deleted).slice().sort(sortNewest);
  const openCount = orders.filter((order) => ["open", "partial"].includes(order.status)).length;
  const closedCount = orders.filter((order) => order.status === "closed").length;
  const ticketReceipts = receipts.filter((receipt) => receipt.scaleTicket || receipt.scaleTicketId).length;
  const orderRows = orders.map((order) => `
    <tr>
      <td>${htmlEscape(order.date)}</td>
      <td>${htmlEscape(order.expectedDate || "-")}</td>
      <td>${htmlEscape(order.orderNo || "-")}</td>
      <td>${htmlEscape(order.materialName || "-")}</td>
      <td>${htmlEscape(order.supplier || "-")}</td>
      <td class="num">${fmt(order.amount)} ${htmlEscape(order.unit || "")}</td>
      <td class="num">${fmt(order.receivedAmount)} ${htmlEscape(order.unit || "")}</td>
      <td class="num">${fmt(order.remainingAmount)} ${htmlEscape(order.unit || "")}</td>
      <td>${htmlEscape(procurementStatusLabel(order.status))}</td>
    </tr>
  `).join("") || `<tr><td colspan="9">Nu exista comenzi de aprovizionare.</td></tr>`;
  const receiptRows = receipts.map((receipt) => `
    <tr>
      <td>${htmlEscape(receipt.date)}</td>
      <td>${htmlEscape(receipt.orderNo || "-")}</td>
      <td>${htmlEscape(receipt.materialName || "-")}</td>
      <td class="num">${fmt(receipt.amount)} ${htmlEscape(receipt.unit || "")}</td>
      <td>${htmlEscape(receipt.document || "-")}</td>
      <td>${htmlEscape(receipt.cmr || "-")}</td>
      <td>${htmlEscape(receipt.scaleTicket || "-")}</td>
      <td>${htmlEscape(receipt.scaleProduct || "-")}</td>
      <td>${htmlEscape([receipt.vehicleNo, receipt.trailerNo].filter(Boolean).join(" / ") || "-")}</td>
      <td>${htmlEscape(receipt.createdByName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="10">Nu exista receptii pe comenzi.</td></tr>`;
  return reportPage(db, {
    title: "Raport comenzi aprovizionare",
    subtitle: "Comenzi, receptii si tichete cantar importate",
    content: `
      <div class="summary">
        <span>Comenzi deschise: <strong>${openCount}</strong></span>
        <span>Comenzi inchise: <strong>${closedCount}</strong></span>
        <span>Receptii: <strong>${receipts.length}</strong></span>
        <span>Receptii cu tichet: <strong>${ticketReceipts}</strong></span>
      </div>
      <h2>Comenzi</h2>
      <table>
        <thead><tr><th>Data</th><th>Estimat</th><th>Comanda</th><th>Material</th><th>Furnizor</th><th>Comandat</th><th>Receptionat</th><th>Ramas</th><th>Status</th></tr></thead>
        <tbody>${orderRows}</tbody>
      </table>
      <h2>Receptii</h2>
      <table>
        <thead><tr><th>Data</th><th>Comanda</th><th>Material</th><th>Cantitate</th><th>Aviz/factura</th><th>CMR</th><th>Tichet</th><th>Produs cantar</th><th>Auto</th><th>Operator</th></tr></thead>
        <tbody>${receiptRows}</tbody>
      </table>
    `
  });
}

function buildFleetReport(db) {
  const assets = fleetAssetsView(db);
  const requests = fleetRequestsView(db);
  const alerts = buildFleetAlerts(db);
  const statusCounts = requests.reduce((counts, request) => {
    counts[request.status || "new"] = (counts[request.status || "new"] || 0) + 1;
    return counts;
  }, {});
  const alertRows = alerts.map((alert) => `
    <tr>
      <td>${htmlEscape(alert.severity === "bad" ? "Critic" : "Atentie")}</td>
      <td>${htmlEscape(alert.title || "-")}</td>
      <td>${htmlEscape(alert.assetName || "-")}</td>
      <td>${htmlEscape(alert.detail || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">Nu exista alerte de mecanizare.</td></tr>`;
  const requestRows = requests.map((request) => `
    <tr>
      <td>${htmlEscape(request.date)}</td>
      <td>${htmlEscape(`${request.startTime || ""}-${request.endTime || ""}`)}</td>
      <td>${htmlEscape(fleetRequestAssetLabel(db, request))}</td>
      <td>${htmlEscape(request.department || "-")}</td>
      <td>${htmlEscape(request.jobName || "-")}</td>
      <td>${htmlEscape(request.location || "-")}</td>
      <td>${htmlEscape(fleetStatusLabel(request.status))}</td>
      <td>${htmlEscape(request.createdByName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="8">Nu exista solicitari de mecanizare.</td></tr>`;
  const assetRows = assets.map((asset) => `
    <tr>
      <td>${htmlEscape(fleetCategoryLabel(asset.category))}</td>
      <td>${htmlEscape(asset.registration || "-")}</td>
      <td>${htmlEscape(asset.name || "-")}</td>
      <td>${htmlEscape(asset.type || "-")}</td>
      <td>${htmlEscape([asset.brand, asset.model].filter(Boolean).join(" / ") || "-")}</td>
      <td>${htmlEscape(asset.department || "-")}</td>
      <td>${htmlEscape(asset.costCenterName || "-")}</td>
      <td>${htmlEscape(asset.location || "-")}</td>
      <td class="num">${htmlEscape(`${fmt(asset.currentMeter || 0)} ${fleetMeterUnitLabel(asset.meterUnit)}`)}</td>
      <td>${htmlEscape(asset.nextServiceDate || "-")}</td>
      <td>${htmlEscape(asset.nextInspectionDate || "-")}</td>
      <td>${htmlEscape(asset.createdByName || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="12">Nu exista autovehicule sau utilaje.</td></tr>`;
  return reportPage(db, {
    title: "Raport mecanizare",
    subtitle: "Programari, solicitari si parc auto/utilaje",
    content: `
      <div class="summary">
        <span>Active: <strong>${assets.length}</strong></span>
        <span>Solicitari: <strong>${requests.length}</strong></span>
        <span>Alerte: <strong>${alerts.length}</strong></span>
        <span>Noi: <strong>${statusCounts.new || 0}</strong></span>
        <span>Aprobate/planificate: <strong>${(statusCounts.approved || 0) + (statusCounts.planned || 0)}</strong></span>
        <span>Realizate: <strong>${statusCounts.done || 0}</strong></span>
      </div>
      <h2>Alerte mecanizare</h2>
      <table>
        <thead><tr><th>Status</th><th>Tip</th><th>Activ</th><th>Detalii</th></tr></thead>
        <tbody>${alertRows}</tbody>
      </table>
      <h2>Solicitari mecanizare</h2>
      <table>
        <thead><tr><th>Data</th><th>Interval</th><th>Activ</th><th>Departament</th><th>Lucrare</th><th>Locatie</th><th>Status</th><th>Creat de</th></tr></thead>
        <tbody>${requestRows}</tbody>
      </table>
      <h2>Parc auto si utilaje</h2>
      <table>
        <thead><tr><th>Categorie</th><th>Nr.</th><th>Denumire</th><th>Tip</th><th>Marca/model</th><th>Departament</th><th>Centru cost</th><th>Locatie</th><th>Rulaj</th><th>Revizie data</th><th>Inspectie data</th><th>Creat de</th></tr></thead>
        <tbody>${assetRows}</tbody>
      </table>
    `
  });
}

function buildTechnicalReportPage(db, report) {
  const recipeRows = report.productionByRecipe.map((row) => `
    <tr>
      <td>${htmlEscape(row.label)}</td>
      <td class="num">${fmt(row.produced)} t</td>
      <td class="num">${fmt(row.sold)} t</td>
      <td class="num">${fmt(row.remaining)} t</td>
    </tr>
  `).join("") || `<tr><td colspan="4">Nu exista productie sau vanzari in perioada selectata.</td></tr>`;
  const assetRows = report.hoursByAsset.map((row) => `
    <tr>
      <td>${htmlEscape(row.assetName || "-")}</td>
      <td>${htmlEscape(row.category || "-")}</td>
      <td class="num">${fmt(row.hours)} ore</td>
      <td>${htmlEscape(row.jobs || "-")}</td>
      <td>${htmlEscape(row.costCenters || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">Nu exista ore lucrate in perioada selectata.</td></tr>`;
  const jobRows = report.hoursByJob.map((row) => `
    <tr>
      <td>${htmlEscape(row.jobName || "-")}</td>
      <td class="num">${fmt(row.hours)} ore</td>
      <td>${htmlEscape(row.assets || "-")}</td>
      <td>${htmlEscape(row.costCenters || "-")}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">Nu exista ore pe lucrari.</td></tr>`;
  const consumptionRows = (report.production || []).map((item) => `
    <tr>
      <td>${htmlEscape(item.date || "-")}</td>
      <td>${htmlEscape(item.reportNo || "-")}</td>
      <td>${htmlEscape(item.jobName || "-")}</td>
      <td>${htmlEscape(item.recipeName || "-")}</td>
      <td class="num">${fmt(item.asphalt || 0)} t</td>
      <td>${htmlEscape([item.ticket, item.vehicleNo].filter(Boolean).join(" / ") || "-")}</td>
      <td>${htmlEscape(item.operatorName || item.createdByName || "-")}</td>
      <td>${htmlEscape(item.soldFromConsumption ? `Vandut ${item.soldAmount ? `${fmt(item.soldAmount)} t` : ""}`.trim() : "Nevandut")}</td>
    </tr>
  `).join("") || `<tr><td colspan="8">Nu exista consumuri de asfalt in perioada selectata.</td></tr>`;
  const filterParts = [
    report.filters?.job ? `Lucrare: ${report.filters.job}` : "",
    report.filters?.recipeId ? `Reteta: ${report.filters.recipeName || report.filters.recipeId}` : ""
  ].filter(Boolean);
  return reportPage(db, {
    title: "Raport departament tehnic",
    subtitle: `Perioada: ${htmlEscape(report.from)} - ${htmlEscape(report.to)}${filterParts.length ? ` / ${htmlEscape(filterParts.join(" / "))}` : ""}`,
    content: `
      <div class="summary">
        <span>Ore utilaje: <strong>${fmt(report.metrics.workHours)}</strong></span>
        <span>Fabricat: <strong>${fmt(report.metrics.producedTotal)} t</strong></span>
        <span>Vandut: <strong>${fmt(report.metrics.soldTotal)} t</strong></span>
        <span>Ramas: <strong>${fmt(report.metrics.remainingTotal)} t</strong></span>
      </div>
      <h2>Productie asfalt</h2>
      <table>
        <thead><tr><th>Reteta</th><th>Fabricat</th><th>Vandut</th><th>Ramas</th></tr></thead>
        <tbody>${recipeRows}</tbody>
      </table>
      <h2>Consumuri asfalt</h2>
      <table>
        <thead><tr><th>Data</th><th>Raport</th><th>Lucrare</th><th>Reteta</th><th>Cantitate</th><th>Bon/auto</th><th>Operator</th><th>Status vanzare</th></tr></thead>
        <tbody>${consumptionRows}</tbody>
      </table>
      <h2>Ore lucrate pe utilaj</h2>
      <table>
        <thead><tr><th>Utilaj/auto</th><th>Categorie</th><th>Ore</th><th>Lucrari</th><th>Centre cost</th></tr></thead>
        <tbody>${assetRows}</tbody>
      </table>
      <h2>Ore lucrate pe lucrare</h2>
      <table>
        <thead><tr><th>Lucrare</th><th>Ore</th><th>Utilaje</th><th>Centre cost</th></tr></thead>
        <tbody>${jobRows}</tbody>
      </table>
    `
  });
}

function buildCostAccountingReportPage(db, report) {
  const costRows = report.rows.map((row) => `
    <tr>
      <td>${htmlEscape(row.costCenterName || "-")}</td>
      <td>${htmlEscape(row.assetName || "-")}</td>
      <td>${htmlEscape(row.registration || "-")}</td>
      <td class="num">${fmt(row.hours)}</td>
      <td class="num">${fmt(row.expenses)} RON</td>
      <td class="num">${row.hours > 0 ? `${fmt(row.costPerHour)} RON/ora` : "-"}</td>
    </tr>
  `).join("") || `<tr><td colspan="6">Nu exista ore sau cheltuieli pentru perioada selectata.</td></tr>`;
  const typeRows = report.expensesByType.map((row) => `
    <tr>
      <td>${htmlEscape(row.expenseType || "-")}</td>
      <td class="num">${row.rows}</td>
      <td class="num">${fmt(row.amount)} RON</td>
    </tr>
  `).join("") || `<tr><td colspan="3">Nu exista cheltuieli importate.</td></tr>`;
  return reportPage(db, {
    title: "Raport contabilitate costuri",
    subtitle: `Perioada: ${htmlEscape(report.from)} - ${htmlEscape(report.to)}`,
    content: `
      <div class="summary">
        <span>Centre: <strong>${report.metrics.costCenters}</strong></span>
        <span>Ore: <strong>${fmt(report.metrics.hours)}</strong></span>
        <span>Cheltuieli: <strong>${fmt(report.metrics.expenses)} RON</strong></span>
        <span>Cost mediu: <strong>${fmt(report.metrics.averageCostPerHour)} RON/ora</strong></span>
      </div>
      <h2>Costuri pe centre si subcentre</h2>
      <table>
        <thead><tr><th>Centru cost</th><th>Subcentru</th><th>Nr.</th><th>Ore</th><th>Cheltuieli</th><th>Cost/ora</th></tr></thead>
        <tbody>${costRows}</tbody>
      </table>
      <h2>Cheltuieli pe tip</h2>
      <table>
        <thead><tr><th>Tip cheltuiala</th><th>Randuri</th><th>Suma</th></tr></thead>
        <tbody>${typeRows}</tbody>
      </table>
    `
  });
}

function reportPage(db, { title, subtitle, content }) {
  const settings = db.settings || {};
  const company = settings.companyName || "Organizație";
  const station = settings.stationName || "";
  const location = settings.location || "";
  const logo = settings.logoDataUrl ? `<img class="logo" src="${htmlEscape(settings.logoDataUrl)}" alt="Logo">` : "";
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <title>${htmlEscape(title)}</title>
  <style>
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #17211d; background: #fff; }
    .page { padding: 26px; }
    header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #17211d; padding-bottom: 14px; margin-bottom: 18px; }
    .identity { display: flex; align-items: flex-start; gap: 12px; }
    .logo { width: 64px; max-height: 64px; object-fit: contain; }
    h1 { margin: 0; font-size: 24px; }
    h2 { margin: 6px 0 0; font-size: 16px; color: #4f5f57; font-weight: 400; }
    .meta { text-align: right; color: #4f5f57; font-size: 12px; line-height: 1.5; }
    .summary { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 16px; }
    .summary span { border: 1px solid #d6dfda; border-radius: 6px; padding: 7px 9px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #cbd5d0; padding: 6px; vertical-align: top; }
    th { background: #edf3f0; text-align: left; }
    th span { color: #65736d; font-weight: 400; }
    .num { text-align: right; white-space: nowrap; }
    .total td { font-weight: 700; background: #f5f8f6; }
    footer { margin-top: 18px; display: flex; justify-content: space-between; color: #65736d; font-size: 11px; }
    .actions { margin: 0 0 14px; }
    button { min-height: 36px; border: 1px solid #176f5d; border-radius: 6px; background: #176f5d; color: white; padding: 7px 11px; cursor: pointer; }
    @media print {
      .actions { display: none; }
      .page { padding: 0; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="actions"><button onclick="window.print()">Tipareste / Salveaza PDF</button></div>
    <header>
      <div class="identity">
        ${logo}
        <div>
          <h1>${htmlEscape(company)}</h1>
          <h2>${htmlEscape(station || title)}</h2>
          ${location ? `<h2>${htmlEscape(location)}</h2>` : ""}
        </div>
      </div>
      <div class="meta">
        <strong>${htmlEscape(title)}</strong><br>
        ${subtitle}<br>
        Generat: ${htmlEscape(new Date().toLocaleString("ro-RO"))}
      </div>
    </header>
    ${content}
    <footer>
      <span>${htmlEscape(settings.appCredit || "Aplicatie realizata de Constantin Constantin")}</span>
      <span>InfraFlow</span>
    </footer>
  </div>
</body>
</html>`;
}

function typeLabel(type) {
  return {
    opening_stock: "Sold initial",
    adjustment: "Ajustare",
    manual_in: "Intrare manuala",
    manual_out: "Iesire manuala",
    transfer_to_dept: "Transfer departament",
    cancel_manual_in: "Anulare intrare manuala",
    cancel_manual_out: "Anulare iesire manuala",
    consumption: "Consum",
    cancel_consumption: "Anulare consum",
    delivery: "Intrare",
    cancel_delivery: "Anulare intrare"
  }[type] || type;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function exportXlsxWorkbook(sheets) {
  const safeSheets = sheets.map((sheet, index) => ({
    name: sanitizeSheetName(sheet.name || `Foaie ${index + 1}`),
    rows: sheet.rows || []
  }));
  const sheetXml = safeSheets.map((sheet) => worksheetXml(sheet.rows));
  const workbookSheets = safeSheets.map((sheet, index) =>
    `<sheet name="${xmlAttr(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  ).join("");
  const workbookRels = safeSheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("") + `<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  const overrides = safeSheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`]
  ];
  sheetXml.forEach((xml, index) => files.push([`xl/worksheets/sheet${index + 1}.xml`, xml]));
  return buildZip(files);
}

function worksheetXml(rows) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => cellXml(value, colIndex, rowIndex)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function cellXml(value, colIndex, rowIndex) {
  const ref = `${columnName(colIndex)}${rowIndex + 1}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlText(value ?? "")}</t></is></c>`;
}

function columnName(index) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const mod = (current - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    current = Math.floor((current - mod) / 26);
  }
  return name;
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach(([name, content]) => {
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
      nameBytes, data
    ]);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
      u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  });
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(offset), u16(0)
  ]);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable()[(crc ^ bytes[i]) & 255];
  }
  return (crc ^ -1) >>> 0;
}

function crcTable() {
  if (crcTable.cache) return crcTable.cache;
  crcTable.cache = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  return crcTable.cache;
}

function sanitizeSheetName(value) {
  return String(value).replace(/[\[\]:*?/\\]/g, " ").slice(0, 31) || "Foaie";
}

function xmlText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function xmlAttr(value) {
  return xmlText(value).replaceAll('"', "&quot;");
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  buildSystemDiagnostics,
  buildSecurityAccessDiagnostic,
  publicSessionId,
  buildReadinessChecklist,
  buildSupportDiagnostic,
  createServerBackup,
  restoreMssqlServerBackup,
  installUpdatePackage,
  listBackupFiles,
  backupFileInfo,
  readRecentLogs,
  integrityStatus,
  networkUrls,
  buildMaintenanceJournal,
  scheduleApplicationRestart,
  verifyReleaseManifest,
  verificaUpdateDisponibil,
  instaleazaUpdateOnline
}

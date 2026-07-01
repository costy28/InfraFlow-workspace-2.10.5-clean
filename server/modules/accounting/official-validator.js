const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function ensureConfigs(db) {
  db.accounting = db.accounting || {};
  db.accounting.validatorConfigs = db.accounting.validatorConfigs && typeof db.accounting.validatorConfigs === "object"
    ? db.accounting.validatorConfigs : {};
  return db.accounting.validatorConfigs;
}

function getConfig(db, code) {
  const key = String(code || "").toUpperCase();
  const saved = ensureConfigs(db)[key] || {};
  const prefix = key.replace(/[^A-Z0-9]/g, "_");
  return {
    code: key,
    path: String(process.env[`${prefix}_VALIDATOR_PATH`] || saved.path || "").trim(),
    command: String(process.env[`${prefix}_VALIDATOR_COMMAND`] || saved.command || "").trim(),
    args: parseArgs(process.env[`${prefix}_VALIDATOR_ARGS`] || saved.args || []),
    schema_version: String(saved.schema_version || "").trim(),
    source_url: String(saved.source_url || "").trim(),
    updated_at: saved.updated_at || null,
    updated_by: saved.updated_by || null
  };
}

function saveConfig(db, code, input, user) {
  const key = String(code || "").toUpperCase();
  if (!new Set(["D112", "D300", "D394", "D406"]).has(key)) throwHttp(400, "Declaratia nu accepta configurare de validator.");
  const args = parseArgs(input.args);
  if (input.command && !args.includes("{file}")) throwHttp(400, "Argumentele validatorului trebuie sa contina parametrul {file}.");
  const item = {
    path: String(input.path || "").trim(), command: String(input.command || "").trim(), args,
    schema_version: String(input.schema_version || "").trim(), source_url: String(input.source_url || "").trim(),
    updated_at: new Date().toISOString(), updated_by: user?.id || ""
  };
  ensureConfigs(db)[key] = item;
  return { code: key, ...item };
}

function diagnostic(db, code) {
  const config = getConfig(db, code);
  const available = Boolean(config.path && fs.existsSync(config.path));
  const executionEnabled = Boolean(config.command && config.args.includes("{file}"));
  return {
    ...config, configured: Boolean(config.path || config.command), available,
    args_configured: config.args.length > 0, execution_enabled: executionEnabled,
    message: executionEnabled
      ? "Comanda validatorului este configurata. Rezultatul este preluat fara reinterpretare."
      : available
        ? `Validatorul ${config.code} este localizat. Completeaza comanda si argumentele cu {file}.`
        : `Configureaza validatorul oficial ${config.code}.`
  };
}

function discover(db, code) {
  const config = getConfig(db, code);
  const roots = [
    config.path,
    process.env.ANAF_DUK_PATH,
    process.env.SAGA_FREETAB_PATH,
    path.join(process.cwd(), "storage", "validators", config.code),
    "C:\\SAGA C.3.0\\FreeTab\\dist",
    "C:\\SAGA C.3.0",
    "C:\\TEMP"
  ].filter(Boolean);
  const javaCandidates = [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java.exe") : "",
    ...roots.flatMap((root) => [path.join(root, "jre8", "bin", "java.exe"), path.join(root, "jre", "bin", "java.exe")]),
    ...findInstalledJava(),
    findOnPath("java.exe"),
    findOnPath("java")
  ].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index);
  const validatorFiles = roots.flatMap((root) => findValidatorFiles(root)).filter((item, index, all) => all.indexOf(item) === index);
  const java = javaCandidates.find((item) => executableExists(item)) || "";
  const jar = validatorFiles.find((item) => /^DUKIntegrator\.jar$/i.test(path.basename(item)))
    || validatorFiles.find((item) => /DUKIntegrator_AnLunaUI\.jar$/i.test(path.basename(item)))
    || validatorFiles.find((item) => /duk.*\.jar$/i.test(path.basename(item)))
    || validatorFiles.find((item) => /\.jar$/i.test(item)) || "";
  const suggestionArgs = config.code === "D406"
    ? ["-jar", jar, "-v", "D406", "{file}", "$", "$", "an={year}", "luna={month}"]
    : ["-jar", jar, "{file}"];
  return {
    code: config.code,
    java: javaCandidates.map((item) => ({ path: item, available: executableExists(item) })),
    validators: validatorFiles.map((item) => ({ path: item, type: path.extname(item).slice(1).toLowerCase() })),
    suggestion: java && jar ? { path: path.dirname(jar), command: java, args: suggestionArgs } : null,
    message: java && jar
      ? "Java si un validator candidat au fost detectate. Confirma versiunea schemei inainte de salvare."
      : !java && jar
        ? `Validatorul DUK a fost gasit la ${jar}, dar Java nu este instalat sau nu a fost detectat. Instaleaza Java, apoi repeta configurarea.`
        : !java ? "Java nu a fost detectat. Instaleaza sau configureaza Java, apoi repeta detectia."
        : "Java este disponibil, dar nu a fost gasit un validator local candidat."
  };
}

function requirements(db, code) {
  const discovery = discover(db, code);
  const configured = diagnostic(db, code);
  return {
    code: discovery.code,
    ready: configured.execution_enabled && discovery.java.some((item) => item.available) && configured.available,
    java: { available: discovery.java.some((item) => item.available), candidates: discovery.java },
    validator: { available: discovery.validators.length > 0 || configured.available, configured: configured.execution_enabled, path: configured.path || discovery.validators[0]?.path || "", candidates: discovery.validators },
    steps: [
      { key: "java", ok: discovery.java.some((item) => item.available), label: "Java runtime", action: "Instaleaza un runtime Java compatibil sau configureaza JAVA_HOME." },
      { key: "duk", ok: discovery.validators.length > 0 || configured.available, label: "Validator DUK", action: "Copiaza kitul DUK ANAF intr-un folder local accesibil serverului." },
      { key: "config", ok: configured.execution_enabled, label: "Configurare InfraFlow", action: "Ruleaza configurarea automata dupa ce Java si DUK sunt disponibile." }
    ],
    message: discovery.message
  };
}

function testEnvironment(db, code) {
  const info = diagnostic(db, code);
  if (!info.command) throwHttp(409, "Configureaza mai intai comanda validatorului.");
  if (!executableExists(info.command)) throwHttp(409, `Comanda nu a fost gasita: ${info.command}`);
  const isJava = /(^|[\\/])java(?:\.exe)?$/i.test(info.command);
  const testArgs = isJava ? ["-version"] : ["--version"];
  const result = spawnSync(info.command, testArgs, { encoding: "utf8", windowsHide: true, timeout: 15000 });
  return {
    code: info.code,
    ok: Number.isInteger(result.status) && result.status === 0,
    exit_code: Number.isInteger(result.status) ? result.status : -1,
    command: info.command,
    output: String(result.stderr || result.stdout || result.error?.message || "").trim(),
    validator_available: info.available,
    execution_enabled: info.execution_enabled,
    tested_at: new Date().toISOString()
  };
}

function validate(db, code, buffer, originalName) {
  const info = diagnostic(db, code);
  if (!info.execution_enabled) throwHttp(409, info.message);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), `infraflow-${String(code).toLowerCase()}-`));
  const safeName = path.basename(String(originalName || `${code}.xml`)).replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = path.join(folder, safeName);
  try {
    fs.writeFileSync(file, buffer);
    const period = extractPeriod(buffer);
    const result = spawnSync(info.command, info.args.map((item) => item
      .replaceAll("{file}", file)
      .replaceAll("{year}", period.year)
      .replaceAll("{month}", period.month)), {
      cwd: info.available && fs.statSync(info.path).isDirectory() ? info.path : process.cwd(),
      encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 5 * 1024 * 1024
    });
    const stdout = String(result.stdout || "").trim();
    const stderr = String(result.stderr || "").trim();
    const reportPath = `${file}.err.txt`;
    const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8").trim() : "";
    const exitCode = Number.isInteger(result.status) ? result.status : -1;
    return {
      code: info.code, accepted: exitCode === 0 && !report && !/\b(error|eroare|erori|fatal)\b/i.test(`${stdout}\n${stderr}`),
      exit_code: exitCode, stdout, stderr: result.error ? `${stderr}\n${result.error.message}`.trim() : stderr,
      report, issues: parseValidationReport(report),
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"), validator_path: info.path,
      schema_version: info.schema_version, validated_at: new Date().toISOString()
    };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

function parseValidationReport(value) {
  const issues = [];
  for (const raw of String(value || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (/^[EF]:/i.test(line)) issues.push(line.replace(/^[EF]:\s*/, ""));
    else if (issues.length && /^(eroare|avertizare)\b/i.test(line)) issues[issues.length - 1] += ` - ${line}`;
  }
  return issues;
}

function extractPeriod(buffer) {
  const xml = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer || "");
  const match = xml.match(/<SelectionStartDate>(\d{4})-(\d{2})-\d{2}<\/SelectionStartDate>/i);
  const now = new Date();
  return match ? { year: match[1], month: String(Number(match[2])) }
    : { year: String(now.getFullYear()), month: String(now.getMonth() + 1) };
}

function parseArgs(value) {
  if (Array.isArray(value)) return value.map(String);
  try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.map(String) : []; }
  catch (_) { throwHttp(400, "Argumentele validatorului trebuie sa fie un array JSON."); }
}
function findOnPath(command) {
  const result = spawnSync("where.exe", [command], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  return result.status === 0 ? String(result.stdout || "").split(/\r?\n/).map((item) => item.trim()).find(Boolean) || "" : "";
}
function findInstalledJava() {
  const bases = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    "C:\\Program Files",
    "C:\\Program Files (x86)"
  ].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index);
  const vendors = ["Java", "Eclipse Adoptium", "Microsoft", "Amazon Corretto", "Zulu"];
  const found = [];
  for (const base of bases) {
    for (const vendor of vendors) {
      const root = path.join(base, vendor);
      try {
        if (!fs.existsSync(root)) continue;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const direct = path.join(root, entry.name, "bin", "java.exe");
          const nested = path.join(root, entry.name, "jre", "bin", "java.exe");
          if (fs.existsSync(direct)) found.push(direct);
          if (fs.existsSync(nested)) found.push(nested);
        }
      } catch (_) { /* Locatiile fara acces sunt ignorate. */ }
    }
  }
  return found;
}
function executableExists(command) {
  if (!command) return false;
  if (path.isAbsolute(command)) return fs.existsSync(command);
  return Boolean(findOnPath(command));
}
function findValidatorFiles(root) {
  try {
    if (!fs.existsSync(root)) return [];
    const stat = fs.statSync(root);
    if (stat.isFile()) return /\.(jar|exe|bat|cmd)$/i.test(root) ? [path.resolve(root)] : [];
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(root, entry.name);
      if (entry.isFile() && /\.(jar|exe|bat|cmd)$/i.test(entry.name) && /(duk|validator|declar|anaf)/i.test(entry.name)) return [path.resolve(full)];
      if (entry.isDirectory() && /(dist|lib|validator|duk|anaf)/i.test(entry.name)) return findValidatorFiles(full);
      return [];
    });
  } catch (_) { return []; }
}
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = { getConfig, saveConfig, diagnostic, discover, requirements, testEnvironment, validate };

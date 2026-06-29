const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function buildSource(db, period) {
  const hr = db.hr || {};
  const runs = Array.isArray(hr.payrollRuns) ? hr.payrollRuns : [];
  const lines = Array.isArray(hr.payrollLines) ? hr.payrollLines : [];
  const employees = Array.isArray(hr.employees) ? hr.employees : [];
  const run = [...runs].reverse().find((item) => item.luna === period && item.status === "validat" && !item.cancelled_at);
  if (!run) throwHttp(409, "Valideaza statul salarial al lunii inainte de generarea sursei D112.");
  const employeeMap = new Map(employees.map((item) => [String(item.id), item]));
  const rows = lines.filter((item) => item.run_id === run.id && !item.cancelled_at).map((line) => {
    const employee = employeeMap.get(String(line.employee_id)) || {};
    return {
      marca: line.marca || employee.marca || "",
      cnp: String(line.cnp || employee.cnp || "").replace(/\D/g, ""),
      nume: line.employee_name || `${employee.nume || ""} ${employee.prenume || ""}`.trim(),
      zile_lucrate: line.worked_days || 0,
      ore_lucrate: line.worked_hours || 0,
      zile_co: line.leave_days || 0,
      zile_cm: line.medical_days || 0,
      indemnizatie_cm: line.medical_indemnity || 0,
      brut: line.gross || 0,
      cas: line.cas || 0,
      cass: line.cass || 0,
      impozit: line.income_tax || 0,
      net: line.net || 0,
      cam: line.cam || 0
    };
  });
  const invalid = rows.filter((item) => !/^\d{13}$/.test(item.cnp));
  if (invalid.length) throwHttp(422, `${invalid.length} angajati au CNP invalid.`);
  return {
    period,
    run,
    company: companyData(db),
    rows,
    generated_at: new Date().toISOString(),
    disclaimer: "Sursa tehnica InfraFlow. Necesita transformare si validare cu schema/validatorul ANAF aplicabil perioadei."
  };
}

function toWorkingXml(source) {
  const [year, month] = source.period.split("-");
  const employees = source.rows.map((row) => `  <asigurat cnp="${xml(row.cnp)}" marca="${xml(row.marca)}" nume="${xml(row.nume)}">
    <timp oreLucrate="${number(row.ore_lucrate)}" zileCO="${number(row.zile_co)}" zileCM="${number(row.zile_cm)}" />
    <venit brut="${number(row.brut)}" indemnizatieCM="${number(row.indemnizatie_cm)}" net="${number(row.net)}" />
    <obligatii cas="${number(row.cas)}" cass="${number(row.cass)}" impozit="${number(row.impozit)}" cam="${number(row.cam)}" />
  </asigurat>`).join("\n");
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<sursaD112 xmlns="urn:infraflow:d112:source:1" an="${xml(year)}" luna="${xml(month)}" cif="${xml(source.company.cif)}" denumire="${xml(source.company.name)}" generatLa="${xml(source.generated_at)}">
${employees}
  <total angajati="${source.rows.length}" brut="${number(source.run.total_gross)}" cas="${number(source.run.total_cas)}" cass="${number(source.run.total_cass)}" impozit="${number(source.run.total_income_tax)}" cam="${number(source.run.total_cam)}" net="${number(source.run.total_net)}" />
  <nota>${xml(source.disclaimer)}</nota>
</sursaD112>`;
  return { content, sha256: crypto.createHash("sha256").update(content).digest("hex") };
}

function validatorDiagnostic(db) {
  const configured = String(process.env.D112_VALIDATOR_PATH || db.settings?.d112_validator_path || db.accounting?.d112_validator_path || "").trim();
  const command = String(process.env.D112_VALIDATOR_COMMAND || db.settings?.d112_validator_command || "").trim();
  const args = validatorArgs(db);
  return {
    configured: Boolean(configured),
    path: configured,
    available: Boolean(configured && fs.existsSync(configured)),
    command,
    args_configured: args.length > 0,
    execution_enabled: Boolean(command && args.includes("{file}")),
    message: command && args.includes("{file}")
      ? "Comanda validatorului este configurata. Rezultatul ANAF va fi preluat fara reinterpretare."
      : configured && fs.existsSync(configured)
        ? "Validatorul este localizat. Configureaza D112_VALIDATOR_COMMAND si D112_VALIDATOR_ARGS cu parametrul {file}."
        : "Configureaza validatorul oficial D112 si comanda sa de executie."
  };
}

function validateOfficialXml(db, buffer, originalName = "D112.xml") {
  const diagnostic = validatorDiagnostic(db);
  if (!diagnostic.execution_enabled) throwHttp(409, diagnostic.message);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "infraflow-d112-"));
  const safeName = path.basename(String(originalName || "D112.xml")).replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = path.join(folder, safeName.toLowerCase().endsWith(".xml") ? safeName : `${safeName}.xml`);
  try {
    fs.writeFileSync(file, buffer);
    const args = validatorArgs(db).map((item) => item.replaceAll("{file}", file));
    const result = spawnSync(diagnostic.command, args, {
      cwd: diagnostic.available && fs.statSync(diagnostic.path).isDirectory() ? diagnostic.path : process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 5 * 1024 * 1024
    });
    const stdout = String(result.stdout || "").trim();
    const stderr = String(result.stderr || "").trim();
    const exitCode = Number.isInteger(result.status) ? result.status : -1;
    return {
      accepted: exitCode === 0 && !/\b(error|eroare|fatal)\b/i.test(`${stdout}\n${stderr}`),
      exit_code: exitCode,
      stdout,
      stderr: result.error ? `${stderr}\n${result.error.message}`.trim() : stderr,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      validator_path: diagnostic.path,
      validated_at: new Date().toISOString()
    };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

function validatorArgs(db) {
  const value = process.env.D112_VALIDATOR_ARGS || db.settings?.d112_validator_args || "";
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_) {
    return [];
  }
}

function companyData(db) {
  const source = db.company || db.settings?.company || db.setup?.company || {};
  return {
    name: source.name || source.denumire || source.company_name || "",
    cif: String(source.cif || source.cui || "").replace(/^RO/i, ""),
    address: source.address || source.adresa || ""
  };
}
function number(value) { return Number(value || 0).toFixed(2); }
function xml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char])); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = { buildSource, toWorkingXml, validatorDiagnostic, validateOfficialXml };

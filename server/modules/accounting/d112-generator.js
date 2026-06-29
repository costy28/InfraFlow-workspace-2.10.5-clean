const crypto = require("crypto");
const fs = require("fs");

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
  return {
    configured: Boolean(configured),
    path: configured,
    available: Boolean(configured && fs.existsSync(configured)),
    execution_enabled: false,
    message: configured && fs.existsSync(configured)
      ? "Validatorul este localizat. Executia automata ramane dezactivata pana la configurarea comenzii oficiale pentru versiunea curenta."
      : "Configureaza D112_VALIDATOR_PATH catre validatorul oficial instalat local."
  };
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

module.exports = { buildSource, toWorkingXml, validatorDiagnostic };

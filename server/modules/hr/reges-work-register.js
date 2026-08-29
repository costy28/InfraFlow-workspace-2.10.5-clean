const xlsx = require("xlsx");

const issueGuides = {
  "CUI angajator": { area: "Setări companie", target_tab: "settings", action: "Completează CUI-ul organizației în Setări." },
  "CNP": { area: "Date personale", target_tab: "date", action: "Completează CNP-ul în fișa angajatului." },
  "nume salariat": { area: "Date personale", target_tab: "date", action: "Completează numele și prenumele în fișa angajatului." },
  "contract activ": { area: "Contracte", target_tab: "contracte", action: "Creează sau reactivează contractul salarial operațional." },
  "număr contract": { area: "Contracte", target_tab: "contracte", action: "Completează numărul contractului activ." },
  "dată contract": { area: "Contracte", target_tab: "contracte", action: "Completează data contractului activ." },
  "dată începere": { area: "Contracte", target_tab: "contracte", action: "Completează data începerii activității." },
  "funcție": { area: "Contracte", target_tab: "contracte", action: "Verifică funcția în contract sau în fișa angajatului." },
  "normă ore": { area: "Contracte", target_tab: "contracte", action: "Verifică norma zilnică de lucru." },
  "salariu bază": { area: "Contracte", target_tab: "contracte", action: "Verifică salariul de bază brut." },
};

function guideForIssue(label, severity) {
  const guide = issueGuides[label] || { area: severity === "warning" ? "Verificare HR" : "Fișă angajat", target_tab: "date", action: "Verifică datele angajatului." };
  return { field: label, severity, ...guide };
}

function primaryGuide(issueDetails = []) {
  return issueDetails.find((item) => item.severity === "blocker") || issueDetails[0] || null;
}

function buildRegesWorkRow(employee, contract, company = {}) {
  return {
    Angajator_CUI: company.cui || company.company_cui || "",
    Angajator: company.denumire || company.company_name || "",
    CNP: employee.cnp || "",
    Nume: employee.nume || "",
    Prenume: employee.prenume || "",
    Functie_COR: contract.cod_cor || employee.cod_cor || "",
    Functie: contract.functie || employee.functia || "",
    Numar_contract: contract.numar_contract || "",
    Data_contract: contract.data_contract || "",
    Data_incepere: contract.data_incepere || contract.data_start || employee.data_angajare || "",
    Tip_contract: contract.tip || "",
    Durata: contract.durata || "",
    Norma_ore: contract.norma_ore || "",
    Salariu_baza: contract.salariu_baza || "",
    Status: contract.status || "",
    Observatii: "Fisier de lucru. Datele se verifica si se opereaza in REGES-ONLINE."
  };
}

function analyzeRegesWorkRegister(employees = [], contracts = [], company = {}) {
  const companyCui = company.cui || company.company_cui || "";
  const rows = employees.map((employee) => {
    const contract = contracts.find((item) => String(item.employee_id) === String(employee.id)) || null;
    const missing = [];
    const warnings = [];

    if (!companyCui) missing.push("CUI angajator");
    if (!employee.cnp) missing.push("CNP");
    if (!employee.nume && !employee.prenume) missing.push("nume salariat");
    if (!contract) {
      missing.push("contract activ");
    } else {
      if (!contract.numar_contract) missing.push("număr contract");
      if (!contract.data_contract) missing.push("dată contract");
      if (!contract.data_incepere && !contract.data_start && !employee.data_angajare) missing.push("dată începere");
      if (!contract.functie && !employee.functia) warnings.push("funcție");
      if (!contract.norma_ore) warnings.push("normă ore");
      if (!contract.salariu_baza) warnings.push("salariu bază");
    }

    const issue_details = [
      ...missing.map((label) => guideForIssue(label, "blocker")),
      ...warnings.map((label) => guideForIssue(label, "warning")),
    ];
    const primary = primaryGuide(issue_details);

    return {
      employee_id: employee.id,
      marca: employee.marca || "",
      employee_name: `${employee.nume || ""} ${employee.prenume || ""}`.trim() || `Angajat #${employee.id}`,
      contract_id: contract?.id || null,
      contract_number: contract?.numar_contract || "",
      severity: missing.length ? "blocker" : warnings.length ? "warning" : "ready",
      missing,
      warnings,
      issue_details,
      target_area: primary?.area || "Pregătit",
      target_tab: primary?.target_tab || "date",
      action_label: primary?.action || "Nu necesită acțiune.",
    };
  });

  const summary = rows.reduce((acc, row) => {
    acc.total += 1;
    acc[row.severity] += 1;
    return acc;
  }, { total: 0, ready: 0, warning: 0, blocker: 0 });

  return {
    summary,
    rows,
    generated_at: new Date().toISOString(),
    message: summary.blocker
      ? "Există date obligatorii lipsă înainte de export."
      : summary.warning
        ? "Exportul se poate genera, dar există câmpuri recomandate de completat."
        : "Datele principale sunt pregătite pentru registrul intern de lucru.",
  };
}

function assertRegesWorkRegisterExportable(diagnostic) {
  const blockers = Number(diagnostic?.summary?.blocker || 0);
  if (blockers <= 0) return true;
  const firstIssues = (diagnostic.rows || [])
    .filter((row) => row.severity === "blocker")
    .slice(0, 3)
    .map((row) => `${row.employee_name}: ${(row.missing || []).join(", ")}`)
    .join("; ");
  const error = new Error(
    `Registrul intern nu poate fi exportat: ${blockers} angajat(i) au lipsuri obligatorii.${firstIssues ? ` ${firstIssues}` : ""}`
  );
  error.status = 422;
  error.code = "HR_REGES_WORK_REGISTER_BLOCKED";
  error.diagnostic = diagnostic;
  throw error;
}

function diagnosticExportRows(diagnostic = {}) {
  return (diagnostic.rows || []).map((row) => ({
    "Status": row.severity === "blocker" ? "Blocat" : row.severity === "warning" ? "Atenționare" : "Pregătit",
    "Angajat": row.employee_name || "",
    "Marca": row.marca || "",
    "Contract": row.contract_number || "",
    "Zona de rezolvare": row.target_area || "",
    "Lipsuri obligatorii": (row.missing || []).join(", "),
    "Atenționări": (row.warnings || []).join(", "),
    "Acțiune recomandată": row.action_label || "Nu necesită acțiune.",
    "Detalii ghidate": (row.issue_details || []).map((item) => `${item.field} → ${item.area}: ${item.action}`).join(" | "),
  }));
}

function buildRegesDiagnosticWorkbook(diagnostic = {}) {
  const rows = diagnosticExportRows(diagnostic);
  const summaryRows = [
    { Indicator: "Angajați verificați", Valoare: diagnostic.summary?.total || 0 },
    { Indicator: "Pregătiți", Valoare: diagnostic.summary?.ready || 0 },
    { Indicator: "Atenționări", Valoare: diagnostic.summary?.warning || 0 },
    { Indicator: "Blocaje", Valoare: diagnostic.summary?.blocker || 0 },
    { Indicator: "Generat la", Valoare: diagnostic.generated_at || new Date().toISOString() },
    { Indicator: "Mesaj", Valoare: diagnostic.message || "" },
  ];
  const workbook = xlsx.utils.book_new();
  const summarySheet = xlsx.utils.json_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 72 }];
  xlsx.utils.book_append_sheet(workbook, summarySheet, "Sumar");

  const issuesSheet = xlsx.utils.json_to_sheet(rows.length ? rows : [{ Status: "Pregătit", Angajat: "", Marca: "", Contract: "", "Zona de rezolvare": "", "Lipsuri obligatorii": "", "Atenționări": "", "Acțiune recomandată": "Nu există angajați cu lipsuri în diagnostic.", "Detalii ghidate": "" }]);
  issuesSheet["!cols"] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 12 },
    { wch: 18 },
    { wch: 22 },
    { wch: 42 },
    { wch: 42 },
    { wch: 48 },
    { wch: 80 },
  ];
  issuesSheet["!autofilter"] = { ref: issuesSheet["!ref"] || "A1:A1" };
  xlsx.utils.book_append_sheet(workbook, issuesSheet, "Diagnostic");
  return workbook;
}

function buildRegesWorkbook(rows) {
  const sheet = xlsx.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0] || {}).map((key) => ({ wch: Math.max(14, Math.min(42, key.length + 6)) }));
  sheet["!autofilter"] = { ref: sheet["!ref"] || "A1:A1" };
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "Registru lucru");
  return workbook;
}

function buildInternalXml(row) {
  const fields = Object.entries(row).map(([key, value]) => `    <${key}>${escapeXml(value)}</${key}>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>\n<InfraFlowRegesWorkFile official="false">\n  <notice>Fisier intern de lucru. Nu este fisier oficial de import REGES-ONLINE.</notice>\n  <employee>\n${fields}\n  </employee>\n</InfraFlowRegesWorkFile>`;
}

function escapeXml(value) { return String(value ?? "").replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char])); }

module.exports = { analyzeRegesWorkRegister, assertRegesWorkRegisterExportable, buildRegesWorkRow, buildRegesWorkbook, buildRegesDiagnosticWorkbook, buildInternalXml };

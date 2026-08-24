const xlsx = require("xlsx");

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

    return {
      employee_id: employee.id,
      marca: employee.marca || "",
      employee_name: `${employee.nume || ""} ${employee.prenume || ""}`.trim() || `Angajat #${employee.id}`,
      contract_id: contract?.id || null,
      contract_number: contract?.numar_contract || "",
      severity: missing.length ? "blocker" : warnings.length ? "warning" : "ready",
      missing,
      warnings,
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

module.exports = { analyzeRegesWorkRegister, buildRegesWorkRow, buildRegesWorkbook, buildInternalXml };

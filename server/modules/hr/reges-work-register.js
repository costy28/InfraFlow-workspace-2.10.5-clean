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
    Data_incepere: contract.data_incepere || employee.data_angajare || "",
    Tip_contract: contract.tip || "",
    Durata: contract.durata || "",
    Norma_ore: contract.norma_ore || "",
    Salariu_baza: contract.salariu_baza || "",
    Status: contract.status || "",
    Observatii: "Fisier de lucru. Datele se verifica si se opereaza in REGES-ONLINE."
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

module.exports = { buildRegesWorkRow, buildRegesWorkbook, buildInternalXml };

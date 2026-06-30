const crypto = require("crypto");
const d112Generator = require("./d112-generator");

function generate(db, code, period, schemaVersion = "") {
  const declarationCode = String(code || "").toUpperCase();
  const [an, luna] = String(period || "").split("-").map(Number);
  if (!an || !luna) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
  let content;
  if (declarationCode === "D112") content = d112Generator.toWorkingXml(d112Generator.buildSource(db, period)).content;
  else if (declarationCode === "D300") content = d300Xml(db, an, luna, schemaVersion);
  else if (declarationCode === "D394") content = d394Xml(db, an, luna, schemaVersion);
  else throwHttp(400, "Declaratia nu accepta generare de candidat XML.");
  return {
    code: declarationCode,
    perioada: period,
    schema_version: schemaVersion || "neconfirmata",
    content,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    generated_at: new Date().toISOString(),
    warning: "Fisier candidat InfraFlow. Devine export verificat numai dupa acceptarea de validatorul configurat."
  };
}

function d300Xml(db, an, luna, schemaVersion) {
  const accounting = db.accounting || {};
  const input = activeMonth(accounting.invoicesIn, an, luna);
  const output = activeMonth(accounting.invoicesOut, an, luna);
  const deductible = money(input.reduce((sum, item) => sum + Number(item.tva || 0), 0));
  const collected = money(output.reduce((sum, item) => sum + Number(item.tva || 0), 0));
  return xmlDocument("D300", an, luna, schemaVersion, [
    `<cumparari baza="${sum(input, "valoare")}" tva="${deductible}" documente="${input.length}" />`,
    `<vanzari baza="${sum(output, "valoare")}" tva="${collected}" documente="${output.length}" />`,
    `<diferenta valoare="${money(collected - deductible)}" />`
  ]);
}

function d394Xml(db, an, luna, schemaVersion) {
  const accounting = db.accounting || {};
  const thirds = new Map((accounting.thirdParties || []).map((item) => [String(item.id), item]));
  const rows = [
    ...activeMonth(accounting.invoicesIn, an, luna).map((item) => ({ ...item, tip: "achizitie", tert: thirds.get(String(item.furnizor_id || item.tert_id)) || {} })),
    ...activeMonth(accounting.invoicesOut, an, luna).map((item) => ({ ...item, tip: "livrare", tert: thirds.get(String(item.client_id || item.tert_id)) || {} }))
  ];
  const details = rows.map((item) => `<operatie tip="${item.tip}" cui="${escapeXml(item.tert.cui || "")}" document="${escapeXml(item.nr_document || item.numar || item.id)}" baza="${money(item.valoare)}" tva="${money(item.tva)}" total="${money(item.total)}" />`);
  return xmlDocument("D394", an, luna, schemaVersion, details);
}

function xmlDocument(code, an, luna, schemaVersion, rows) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<infraflow_declaration_candidate xmlns="urn:infraflow:declaration-candidate:1" code="${code}" an="${an}" luna="${String(luna).padStart(2, "0")}" schema_version="${escapeXml(schemaVersion || "neconfirmata")}">\n  <warning>Fisier candidat. Necesita validare externa inainte de utilizare.</warning>\n  <date>\n    ${rows.join("\n    ")}\n  </date>\n</infraflow_declaration_candidate>\n`;
}

function activeMonth(items, an, luna) {
  return (items || []).filter((item) => Number(item.an) === an && Number(item.luna) === luna && !item.cancelled_at && item.status !== "anulat");
}
function sum(items, key) { return money(items.reduce((total, item) => total + Number(item[key] || 0), 0)); }
function money(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function escapeXml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = { generate };

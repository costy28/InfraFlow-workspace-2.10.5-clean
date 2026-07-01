const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const xlsx = require("xlsx");

function build({ period, acceptance, integrity, runs }) {
  const zip = new AdmZip();
  const latest = runs[0] || null;
  zip.addFile("00_SUMAR.json", Buffer.from(JSON.stringify({ perioada: period, generated_at: new Date().toISOString(), acceptance: acceptance.summary, saft: { ready: integrity.ready, issues: integrity.issues.length }, latest_run: latest ? { id: latest.id, status: latest.status, sha256: latest.sha256 } : null }, null, 2)));
  zip.addFile("01_ACCEPTANTA.xlsx", workbookBuffer(acceptance));
  zip.addFile("02_DIAGNOSTIC_SAFT.json", Buffer.from(JSON.stringify(integrity, null, 2)));
  zip.addFile("03_INSTRUCTIUNI.txt", Buffer.from(instructions(period, latest)));
  if (latest?.stored_file) {
    const fullPath = path.resolve(process.cwd(), latest.stored_file);
    const storage = path.resolve(process.cwd(), "storage");
    if (fullPath.startsWith(storage) && fs.existsSync(fullPath)) zip.addLocalFile(fullPath, "D406", latest.status === "acceptat_validator" ? `D406_${period.replace("-", "_")}.xml` : `D406_CANDIDAT_${period.replace("-", "_")}.xml`);
  }
  if (latest?.receipt_file) {
    const fullPath = path.resolve(process.cwd(), latest.receipt_file); const storage = path.resolve(process.cwd(), "storage");
    if (fullPath.startsWith(storage) && fs.existsSync(fullPath)) zip.addLocalFile(fullPath, "D406/RECIPISA", latest.receipt_original_name || path.basename(fullPath));
  }
  if (latest) zip.addFile("D406/VALIDARE.json", Buffer.from(JSON.stringify({ status: latest.status, xsd: latest.xsd_validation || null, duk: latest.validation || null, guidance: latest.guidance || [] }, null, 2)));
  return zip.toBuffer();
}

function workbookBuffer(report) {
  const sheet = xlsx.utils.aoa_to_sheet([["Acceptanta contabil-fiscala", report.perioada], [], ["Zona", "Status", "Severitate", "Mesaj", "Pas urmator"], ...report.checks.map((item) => [item.label, item.ok ? "OK" : "NECONFORM", item.severity, item.message, item.next_action])]);
  sheet["!cols"] = [{ wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 70 }, { wch: 60 }];
  const workbook = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(workbook, sheet, "Acceptanta");
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
}
function instructions(period, latest) { return [`DOSAR FISCAL INFRAFLOW - ${period}`, "", "Continutul este o copie de lucru pentru verificare si arhivare.", "XML-ul D406 poate fi depus numai daca VALIDARE.json indica status acceptat_validator.", `Ultima generare: ${latest?.status || "nu exista"}.`, "Pastrati recipisa ANAF impreuna cu acest dosar dupa depunere."].join("\r\n"); }

module.exports = { build };

const xlsx = require("xlsx");
const engine = require("./accounting-engine");
const fiscalExtras = require("./fiscal-extras");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");
const d205Validator = require("./d205-validator");

function registerFiscalExtraRoutes(router, { requireAccountingReports, requireAccountingPost }) {
  router.get("/accounting/fiscal/completion-map", requireAccountingReports, (req, res) => res.json(fiscalExtras.completionMap(req.auth.db, req.query.perioada || currentMonth())));

  router.get("/accounting/d205", requireAccountingReports, (req, res) => res.json(fiscalExtras.d205Report(req.auth.db, req.query.an)));
  router.post("/accounting/d205/entries", requireAccountingPost, (req, res, next) => writeEntry(req, res, next, "withholdingTaxEntries", normalizeD205, "accounting_d205_entry"));
  router.delete("/accounting/d205/entries/:id", requireAccountingPost, (req, res, next) => cancelEntry(req, res, next, "withholdingTaxEntries", "accounting_d205_cancel"));
  router.get("/accounting/d205/export", requireAccountingReports, (req, res, next) => {
    try { const report = fiscalExtras.d205Report(req.auth.db, req.query.an); sendWorkbook(res, `D205_lucru_${report.an}.xlsx`, "D205", [["D205 - fisa de lucru", report.an], [], ["CNP/CUI", "Beneficiar", "Tip venit", "Venit brut", "Impozit retinut"], ...report.rows.map((row) => [row.cnp_cui, row.nume, row.tip_venit, Number(row.venit_brut || 0), Number(row.impozit_retinut || 0)])]); } catch (error) { next(error); }
  });
  router.get("/accounting/d205/candidate", requireAccountingReports, (req, res, next) => { try { const report = fiscalExtras.d205Report(req.auth.db, req.query.an); if (!report.ready) throwHttp(422, report.issues.join(" ") || "Registrul D205 nu este pregatit."); const content = fiscalExtras.d205CandidateXml(report, companyData(req.auth.db), req.auth.user || {}); const validation = validateD205(content); if (!validation.accepted) throwHttp(422, `XML-ul D205 nu trece schema ANAF: ${validation.errors.join(" ")}`); sendXml(res, `D205_${report.an}.xml`, content); } catch (error) { next(error); } });
  router.get("/accounting/d205/validate", requireAccountingReports, (req, res, next) => { try { const report = fiscalExtras.d205Report(req.auth.db, req.query.an); const content = fiscalExtras.d205CandidateXml(report, companyData(req.auth.db), req.auth.user || {}); res.json({ report, validation: validateD205(content) }); } catch (error) { next(error); } });

  router.get("/accounting/intrastat", requireAccountingReports, (req, res) => res.json(fiscalExtras.intrastatReport(req.auth.db, req.query.perioada || currentMonth())));
  router.post("/accounting/intrastat/entries", requireAccountingPost, (req, res, next) => writeEntry(req, res, next, "intrastatEntries", normalizeIntrastat, "accounting_intrastat_entry"));
  router.delete("/accounting/intrastat/entries/:id", requireAccountingPost, (req, res, next) => cancelEntry(req, res, next, "intrastatEntries", "accounting_intrastat_cancel"));
  router.get("/accounting/intrastat/export", requireAccountingReports, (req, res, next) => {
    try { const report = fiscalExtras.intrastatReport(req.auth.db, req.query.perioada || currentMonth()); sendWorkbook(res, `Intrastat_${report.perioada}.xlsx`, "Intrastat", [["Intrastat - fisa de lucru", report.perioada], [], ["Flux", "Tara", "Cod NC", "Natura tranzactie", "Masa neta kg", "Valoare facturata RON"], ...report.rows.map((row) => [row.flux, row.tara_partenera, row.cod_nc, row.natura_tranzactie, Number(row.masa_neta || 0), Number(row.valoare_facturata || 0)])]); } catch (error) { next(error); }
  });
  router.get("/accounting/intrastat/candidate", requireAccountingReports, (req, res) => { const report = fiscalExtras.intrastatReport(req.auth.db, req.query.perioada || currentMonth()); sendXml(res, `Intrastat_candidat_${report.perioada}.xml`, fiscalExtras.intrastatCandidateXml(report, req.auth.db.company || req.auth.db.settings?.company || {})); });
}

function writeEntry(req, res, next, key, normalize, action) {
  try { const accounting = engine.ensureAccounting(req.auth.db); const body = normalize(req.body || {}); let item = accounting[key].find((row) => String(row.id) === String(req.body?.id || "") && !row.cancelled_at); if (!item) { item = { id: engine.nextNumericId(accounting[key]), uuid: `${key}-${Date.now()}` }; accounting[key].push(item); } Object.assign(item, body, { updated_at: new Date().toISOString(), updated_by: req.auth.user?.id || "" }); addAudit(req.auth.db, req.auth.user, action, String(item.id)); writeDb(req.auth.db); res.status(201).json({ item }); } catch (error) { next(error); }
}
function cancelEntry(req, res, next, key, action) { try { const accounting = engine.ensureAccounting(req.auth.db); const item = accounting[key].find((row) => String(row.id) === String(req.params.id) && !row.cancelled_at); if (!item) throwHttp(404, "Inregistrarea nu a fost gasita."); item.cancelled_at = new Date().toISOString(); item.cancelled_by = req.auth.user?.id || ""; item.cancelled_reason = String(req.body?.motiv || "Anulare din registrul fiscal"); addAudit(req.auth.db, req.auth.user, action, String(item.id)); writeDb(req.auth.db); res.status(204).end(); } catch (error) { next(error); } }
function normalizeD205(body) { const an = Number(body.an); if (!an || !body.cnp_cui || !body.nume || !body.tip_venit) throwHttp(422, "Completeaza anul, CNP/CUI, beneficiarul si tipul venitului."); return { an, cnp_cui: String(body.cnp_cui).trim(), nume: String(body.nume).trim(), tip_venit: fiscalExtras.d205IncomeCode(body.tip_venit), tip_plata: Number(body.tip_plata ?? 2), rezidenta: Number(body.rezidenta || 1), stat_rezidenta: String(body.stat_rezidenta || "").toUpperCase(), venit_brut: amount(body.venit_brut), impozit_retinut: amount(body.impozit_retinut), dividende_distribuite: amount(body.dividende_distribuite || 0), dividende_platite: amount(body.dividende_platite || 0), observatii: String(body.observatii || "").trim() }; }
function normalizeIntrastat(body) { const period = String(body.perioada || currentMonth()); const match = period.match(/^(\d{4})-(\d{2})$/); if (!match || !["introduceri", "expedieri"].includes(body.flux)) throwHttp(422, "Completeaza perioada si fluxul Intrastat."); if (!/^[A-Za-z]{2}$/.test(String(body.tara_partenera || "")) || !/^\d{8}$/.test(String(body.cod_nc || ""))) throwHttp(422, "Tara trebuie sa fie cod ISO, iar codul NC trebuie sa aiba 8 cifre."); return { an: Number(match[1]), luna: Number(match[2]), flux: body.flux, tara_partenera: String(body.tara_partenera).toUpperCase(), tara_origine: String(body.tara_origine || "").toUpperCase(), judet_destinatie: String(body.judet_destinatie || "").toUpperCase(), cod_nc: String(body.cod_nc), natura_tranzactie: String(body.natura_tranzactie || "11"), conditie_livrare: String(body.conditie_livrare || "").toUpperCase(), mod_transport: String(body.mod_transport || ""), masa_neta: amount(body.masa_neta), valoare_facturata: amount(body.valoare_facturata), valoare_statistica: amount(body.valoare_statistica || body.valoare_facturata), descriere: String(body.descriere || "").trim() }; }
function sendWorkbook(res, name, sheetName, rows) { const sheet = xlsx.utils.aoa_to_sheet(rows); sheet["!cols"] = [{ wch: 20 }, { wch: 34 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 24 }]; const workbook = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(workbook, sheet, sheetName); const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", `attachment; filename="${name}"`); res.end(buffer); }
function sendXml(res, name, content) { res.setHeader("Content-Type", "application/xml; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${name}"`); res.send(content); }
function amount(value) { const result = Number(value || 0); if (!Number.isFinite(result) || result < 0) throwHttp(422, "Valorile numerice trebuie sa fie pozitive."); return Math.round((result + Number.EPSILON) * 100) / 100; }
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function companyData(db) { return { ...(db.settings || {}), ...(db.settings?.general || {}), ...(db.settings?.company || {}), ...(db.company || {}) }; }
function validateD205(content) { return d205Validator.validate(content); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = registerFiscalExtraRoutes;

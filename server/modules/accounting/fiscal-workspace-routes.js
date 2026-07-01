const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const multer = require("multer");
const engine = require("./accounting-engine");
const declarations = require("./declaration-routes");
const auditRoutes = require("./end-to-end-audit-routes");
const financialStatements = require("./financial-statement-routes");
const schemaProfiles = require("./schema-profiles");
const officialValidator = require("./official-validator");
const saftGenerator = require("./saft-generator");
const saftGuidance = require("./saft-guidance");
const saftIntegrity = require("./saft-integrity");
const fiscalDossier = require("./fiscal-dossier");
const fiscalRegister = require("./fiscal-register");
const xsdValidator = require("./xsd-validator");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

function registerFiscalWorkspaceRoutes(router, middleware) {
  const { requireAccountingReports, requireAccountingPost } = middleware;
  const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  router.get("/accounting/fiscal/acceptance", requireAccountingReports, (req, res, next) => {
    try { res.json(buildAcceptance(req.auth.db, req.query.perioada || req.query.luna)); } catch (error) { next(error); }
  });

  router.post("/accounting/fiscal/acceptance/run", requireAccountingPost, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const report = buildAcceptance(req.auth.db, req.body?.perioada || req.body?.luna);
      const run = {
        id: engine.nextNumericId(accounting.fiscalAcceptanceRuns), uuid: crypto.randomUUID(), perioada: report.perioada,
        status: report.ready ? "acceptat_intern" : "neconform", report, checksum: crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex"),
        created_at: new Date().toISOString(), created_by: req.auth.user?.id || ""
      };
      accounting.fiscalAcceptanceRuns.push(run);
      synchronizeFindings(accounting, report);
      addAudit(req.auth.db, req.auth.user, "accounting_fiscal_acceptance", `${report.perioada} / ${run.status}`);
      writeDb(req.auth.db); res.status(201).json({ run });
    } catch (error) { next(error); }
  });

  router.get("/accounting/fiscal/findings", requireAccountingReports, (req, res, next) => {
    try { const period = normalizePeriod(req.query.perioada || req.query.luna); res.json({ perioada: period, findings: engine.ensureAccounting(req.auth.db).fiscalAuditFindings.filter((item) => item.perioada === period).slice().reverse() }); }
    catch (error) { next(error); }
  });

  router.post("/accounting/fiscal/findings/:id/resolve", requireAccountingPost, (req, res, next) => {
    try {
      const item = engine.ensureAccounting(req.auth.db).fiscalAuditFindings.find((row) => String(row.id) === String(req.params.id));
      if (!item) throwHttp(404, "Constatarea fiscala nu a fost gasita.");
      if (item.status === "rezolvat") throwHttp(409, "Constatarea este deja rezolvata.");
      const note = String(req.body?.note || "").trim(); if (!note) throwHttp(400, "Completeaza nota de rezolvare.");
      item.status = "rezolvat"; item.resolved_at = new Date().toISOString(); item.resolved_by = req.auth.user?.id || ""; item.resolution_note = note;
      addAudit(req.auth.db, req.auth.user, "accounting_fiscal_finding_resolve", `${item.perioada} / ${item.finding_key}`); writeDb(req.auth.db); res.json({ item });
    } catch (error) { next(error); }
  });

  router.get("/accounting/fiscal/acceptance/export", requireAccountingReports, (req, res, next) => {
    try {
      const report = buildAcceptance(req.auth.db, req.query.perioada || req.query.luna);
      const sheet = xlsx.utils.aoa_to_sheet([
        ["Acceptanta contabil-fiscala", report.perioada, report.ready ? "OK" : "Necesita interventie"], [],
        ["Zona", "Status", "Severitate", "Mesaj", "Pas urmator", "Pagina"],
        ...report.checks.map((item) => [item.label, item.ok ? "OK" : "NECONFORM", item.severity, item.message, item.next_action, item.to])
      ]);
      sheet["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 14 }, { wch: 75 }, { wch: 65 }, { wch: 42 }];
      const workbook = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(workbook, sheet, "Acceptanta");
      sendWorkbook(res, workbook, `Acceptanta_contabila_${report.perioada.replace("-", "_")}.xlsx`);
    } catch (error) { next(error); }
  });

  router.get("/accounting/saft/source", requireAccountingReports, (req, res, next) => {
    try {
      const period = normalizePeriod(req.query.perioada || req.query.luna);
      const source = saftGenerator.buildSource(req.auth.db, period);
      const integrity = saftIntegrity.inspect(req.auth.db, period);
      const readiness = declarations.buildSaftReadiness(req.auth.db, { perioada: period });
      const issueDetails = saftGuidance.guideMany([...(integrity.issues || []), ...readiness.issues.map((item) => ({ message: item.message, area: item.area, action: item.action }))]);
      res.json({ perioada: period, summary: source.summary, issues: issueDetails.map((item) => item.message), issue_details: issueDetails, readiness, integrity });
    } catch (error) { next(error); }
  });

  router.get("/accounting/saft/runs", requireAccountingReports, (req, res, next) => {
    try {
      const period = normalizePeriod(req.query.perioada || req.query.luna);
      const runs = engine.ensureAccounting(req.auth.db).saftRuns.filter((item) => item.perioada === period).slice().reverse();
      res.json({ perioada: period, runs });
    } catch (error) { next(error); }
  });

  router.post("/accounting/saft/generate", requireAccountingPost, (req, res, next) => {
    try {
      const period = normalizePeriod(req.body?.perioada || req.body?.luna);
      const run = createSaftRun(req.auth.db, period, req.auth.user);
      addAudit(req.auth.db, req.auth.user, "accounting_saft_generate", `${period} / ${run.status}`);
      writeDb(req.auth.db); res.status(201).json({ run });
    } catch (error) { next(error); }
  });

  router.post("/accounting/saft/runs/:id/recheck", requireAccountingPost, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const previous = accounting.saftRuns.find((item) => String(item.id) === String(req.params.id));
      if (!previous) throwHttp(404, "Generarea SAF-T nu a fost gasita.");
      const run = createSaftRun(req.auth.db, previous.perioada, req.auth.user, previous.id);
      addAudit(req.auth.db, req.auth.user, "accounting_saft_recheck", `${previous.id} -> ${run.id} / ${run.status}`);
      writeDb(req.auth.db); res.status(201).json({ run, previous_run_id: previous.id });
    } catch (error) { next(error); }
  });

  router.get("/accounting/fiscal/dossier", requireAccountingReports, (req, res, next) => {
    try {
      const period = normalizePeriod(req.query.perioada || req.query.luna);
      const acceptance = buildAcceptance(req.auth.db, period);
      const integrity = saftIntegrity.inspect(req.auth.db, period);
      const runs = engine.ensureAccounting(req.auth.db).saftRuns.filter((item) => item.perioada === period).slice().reverse();
      const buffer = fiscalDossier.build({ period, acceptance, integrity, runs });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="Dosar_fiscal_${period.replace("-", "_")}.zip"`);
      res.end(buffer);
    } catch (error) { next(error); }
  });

  router.get("/accounting/saft/runs/:id/download", requireAccountingReports, (req, res, next) => {
    try {
      const run = engine.ensureAccounting(req.auth.db).saftRuns.find((item) => String(item.id) === String(req.params.id));
      if (!run) throwHttp(404, "Generarea SAF-T nu a fost gasita.");
      if (run.status !== "acceptat_validator") throwHttp(409, "Descarcarea fiscala este disponibila numai dupa acceptarea validatorului configurat.");
      const fullPath = path.resolve(process.cwd(), run.stored_file || ""); const root = path.resolve(process.cwd(), "storage");
      if (!fullPath.startsWith(root) || !fs.existsSync(fullPath)) throwHttp(404, "Fisierul SAF-T nu mai exista in arhiva.");
      res.download(fullPath, `D406_${run.perioada.replace("-", "_")}.xml`);
    } catch (error) { next(error); }
  });

  router.post("/accounting/saft/runs/:id/receipt", requireAccountingPost, receiptUpload.single("file"), (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const run = accounting.saftRuns.find((item) => String(item.id) === String(req.params.id));
      if (!run) throwHttp(404, "Generarea SAF-T nu a fost gasita.");
      if (run.status !== "acceptat_validator") throwHttp(409, "Recipisa poate fi asociata numai unui D406 acceptat de validator.");
      const status = fiscalRegister.receiptStatus(req.body?.status);
      if (!status) throwHttp(400, "Status recipisa invalid.");
      const receipt = String(req.body?.recipisa || "").trim();
      if (!receipt) throwHttp(400, "Completeaza numarul recipisei ANAF.");
      if (!req.file?.buffer) throwHttp(400, "Ataseaza fisierul recipisei ANAF.");
      const storedName = fiscalRegister.safeStoredName(req.file.originalname, `D406_${run.perioada}_${Date.now()}_recipisa`);
      if (!storedName) throwHttp(400, "Recipisa trebuie sa fie PDF, XML, ZIP sau TXT.");
      const folder = path.join(process.cwd(), "storage", "accounting-declarations", run.perioada, "D406", "receipts");
      fs.mkdirSync(folder, { recursive: true });
      const fullPath = path.join(folder, storedName); fs.writeFileSync(fullPath, req.file.buffer);
      run.recipisa = receipt; run.receipt_status = status;
      run.receipt_message = String(req.body?.message || "").trim().slice(0, 1000);
      run.receipt_file = path.relative(process.cwd(), fullPath).replace(/\\/g, "/");
      run.receipt_original_name = req.file.originalname;
      run.receipt_sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
      run.received_at = new Date().toISOString(); run.received_by = req.auth.user?.id || "";
      addAudit(req.auth.db, req.auth.user, "accounting_saft_receipt", `D406 ${run.perioada} / ${receipt} / ${status}`);
      writeDb(req.auth.db); res.json({ run });
    } catch (error) { next(error); }
  });

  router.get("/accounting/saft/runs/:id/receipt", requireAccountingReports, (req, res, next) => {
    try {
      const run = engine.ensureAccounting(req.auth.db).saftRuns.find((item) => String(item.id) === String(req.params.id));
      if (!run?.receipt_file) throwHttp(404, "Rularea D406 nu are recipisa atasata.");
      const fullPath = path.resolve(process.cwd(), run.receipt_file); const root = path.resolve(process.cwd(), "storage", "accounting-declarations");
      if (!fullPath.startsWith(`${root}${path.sep}`) || !fs.existsSync(fullPath)) throwHttp(404, "Fisierul recipisei nu a fost gasit.");
      res.download(fullPath, run.receipt_original_name || path.basename(fullPath));
    } catch (error) { next(error); }
  });
}

function createSaftRun(db, period, user, previousRunId = null) {
  const accounting = engine.ensureAccounting(db);
  const schema = schemaProfiles.select(accounting, "SAF-T", period);
  if (!schema) throwHttp(409, "Incarca mai intai schema SAF-T aplicabila perioadei.");
  const generated = saftGenerator.generate(db, period, schemaProfiles.profile(schema));
  const integrity = saftIntegrity.inspect(db, period);
  const folder = path.join(process.cwd(), "storage", "accounting-declarations", period, "D406", "candidates");
  fs.mkdirSync(folder, { recursive: true });
  const fileName = `D406_candidat_${period.replace("-", "_")}_${Date.now()}.xml`;
  const fullPath = path.join(folder, fileName); fs.writeFileSync(fullPath, generated.content, "utf8");
  const xsdValidation = xsdValidator.validate(Buffer.from(generated.content), schema);
  const diagnostic = officialValidator.diagnostic(db, "D406");
  const sourceComplete = integrity.ready;
  const validation = xsdValidation.accepted && sourceComplete && diagnostic.execution_enabled ? officialValidator.validate(db, "D406", Buffer.from(generated.content), fileName) : null;
  const run = {
    id: engine.nextNumericId(accounting.saftRuns), uuid: crypto.randomUUID(), code: "D406", perioada: period, previous_run_id: previousRunId,
    schema_profile: generated.profile, source_summary: generated.source_summary, issues: [...integrity.issues.map((item) => item.message), ...xsdValidation.errors],
    sha256: generated.sha256, stored_file: path.relative(process.cwd(), fullPath).replace(/\\/g, "/"),
    status: !xsdValidation.accepted ? "respins_xsd" : !sourceComplete ? "date_incomplete" : validation?.accepted ? "acceptat_validator" : validation ? "respins_validator" : "valid_xsd_nevalidat_duk",
    xsd_validation: xsdValidation, validation,
    guidance: saftGuidance.guideMany([...(integrity.issues || []), ...xsdValidation.errors, ...(validation?.issues || [])]),
    created_at: generated.generated_at, created_by: user?.id || ""
  };
  accounting.saftRuns.push(run);
  return run;
}

function buildAcceptance(db, value) {
  const period = normalizePeriod(value); const [an, luna] = period.split("-").map(Number);
  const accounting = engine.ensureAccounting(db);
  const audit = auditRoutes.buildAudit(db, period);
  const fiscal = declarations.buildFiscalMonthCheck(db, { perioada: period });
  const balance = engine.buildBalance(db, an, luna, "sintetica");
  const financial = financialStatements.buildReport(db, { an, luna, tip: "BILANT" });
  const periodRecord = accounting.periods.find((item) => Number(item.an) === an && Number(item.luna) === luna) || { status: "deschisa" };
  const checks = [
    guided("Balanta", balance.balanced, "error", balance.balanced ? "Balanta este echilibrata." : "Totalul debit nu este egal cu totalul credit.", "Corecteaza notele dezechilibrate din Registru jurnal.", `/contabilitate/balanta?luna=${period}`),
    guided("Situatii financiare", financial.control.ok, "error", financial.control.message, "Revizuieste maparile formularului si conturile bifunctionale.", `/contabilitate/situatii-financiare?luna=${period}`),
    guided("Perioada contabila", ["inchisa", "depusa"].includes(periodRecord.status), "warning", `Perioada este ${periodRecord.status}.`, "Finalizeaza verificarile si inchide luna numai dupa corectarea erorilor.", `/contabilitate/inchidere-luna?luna=${period}`),
    ...audit.checks.map((item) => guided(item.area, item.count === 0 && !["eroare", "neinceput"].includes(item.status), "error", item.message, item.action, `/contabilitate/registru-jurnal?luna=${period}`)),
    ...fiscal.checks.map((item) => guided(item.label, item.ok, item.severity || "warning", item.message, item.ok ? "Nu este necesara nicio actiune." : "Deschide zona indicata si rezolva verificarea inainte de depunere.", item.to))
  ];
  const unique = [...new Map(checks.map((item) => [`${item.label}:${item.message}`, item])).values()];
  return { perioada: period, ready: unique.every((item) => item.ok || item.severity !== "error"), generated_at: new Date().toISOString(), checks: unique, summary: { total: unique.length, ok: unique.filter((item) => item.ok).length, errors: unique.filter((item) => !item.ok && item.severity === "error").length, warnings: unique.filter((item) => !item.ok && item.severity !== "error").length } };
}

function synchronizeFindings(accounting, report) {
  report.checks.forEach((check) => {
    const open = accounting.fiscalAuditFindings.find((item) => item.perioada === report.perioada && item.finding_key === check.key && item.status === "deschis");
    if (check.ok) { if (open) { open.status = "rezolvat_automat"; open.resolved_at = new Date().toISOString(); open.resolution_note = "Controlul ulterior a trecut fara eroare."; } return; }
    if (open) { open.severity = check.severity; open.message = check.message; open.next_action = check.next_action; return; }
    accounting.fiscalAuditFindings.push({ id: engine.nextNumericId(accounting.fiscalAuditFindings), uuid: crypto.randomUUID(), perioada: report.perioada, finding_key: check.key, severity: check.severity, message: check.message, next_action: check.next_action, status: "deschis", created_at: new Date().toISOString() });
  });
}

function guided(label, ok, severity, message, nextAction, to) { return { key: slug(label), label, ok: Boolean(ok), severity, message: String(message || ""), next_action: nextAction, to }; }
function slug(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function normalizePeriod(value) { const match = String(value || new Date().toISOString().slice(0, 7)).match(/^(\d{4})-(\d{1,2})$/); if (!match) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM."); const month = Number(match[2]); if (month < 1 || month > 12) throwHttp(400, "Luna este invalida."); return `${match[1]}-${String(month).padStart(2, "0")}`; }
function sendWorkbook(res, workbook, name) { const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", `attachment; filename="${name}"`); res.end(buffer); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

registerFiscalWorkspaceRoutes.buildAcceptance = buildAcceptance;
registerFiscalWorkspaceRoutes.createSaftRun = createSaftRun;
module.exports = registerFiscalWorkspaceRoutes;

const xlsx = require("xlsx");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const engine = require("./accounting-engine");
const fiscal = require("./fiscal-register");
const d112Generator = require("./d112-generator");
const officialValidator = require("./official-validator");
const declarationCandidates = require("./declaration-candidates");
const schemaProfiles = require("./schema-profiles");
const xsdValidator = require("./xsd-validator");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function registerDeclarationRoutes(router, { requireAccountingReports, requireAccountingPost }) {
  router.get("/accounting/declarations/readiness", requireAccountingReports, (req, res) => {
    const data = buildDeclarationReadiness(req.auth.db, req.query);
    res.status(200).json(data);
  });

  router.get("/accounting/d394", requireAccountingReports, (req, res) => {
    res.status(200).json(buildD394Data(req.auth.db, req.query));
  });

  router.get("/accounting/saft/readiness", requireAccountingReports, (req, res) => {
    res.status(200).json(buildSaftReadiness(req.auth.db, req.query));
  });

  router.get("/accounting/d112/readiness", requireAccountingReports, (req, res) => {
    res.status(200).json({ ...buildD112Readiness(req.auth.db, req.query), validator: d112Generator.validatorDiagnostic(req.auth.db) });
  });

  router.get("/accounting/d112/validator-diagnostic", requireAccountingReports, (req, res) => {
    res.status(200).json(d112Generator.validatorDiagnostic(req.auth.db));
  });

  router.get("/accounting/declarations/validators/:code", requireAccountingReports, (req, res, next) => {
    try { res.json(officialValidator.diagnostic(req.auth.db, req.params.code)); }
    catch (error) { next(error); }
  });

  router.put("/accounting/declarations/validators/:code", requireAccountingPost, (req, res, next) => {
    try {
      const item = officialValidator.saveConfig(req.auth.db, req.params.code, req.body || {}, req.auth.user);
      addAudit(req.auth.db, req.auth.user, "accounting_validator_config", `${item.code} / ${item.schema_version || "fara versiune"}`);
      writeDb(req.auth.db);
      res.json({ item, diagnostic: officialValidator.diagnostic(req.auth.db, item.code) });
    } catch (error) { next(error); }
  });

  router.get("/accounting/declarations/validators/:code/discover", requireAccountingReports, (req, res, next) => {
    try { res.json(officialValidator.discover(req.auth.db, req.params.code)); }
    catch (error) { next(error); }
  });

  router.get("/accounting/declarations/validators/:code/requirements", requireAccountingReports, (req, res, next) => {
    try { res.json(officialValidator.requirements(req.auth.db, req.params.code)); }
    catch (error) { next(error); }
  });

  router.post("/accounting/declarations/validators/:code/auto-configure", requireAccountingPost, (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      const discovery = officialValidator.discover(req.auth.db, code);
      if (!discovery.suggestion) throwHttp(409, discovery.message || `Validatorul ${code} nu a fost detectat.`);
      const current = officialValidator.getConfig(req.auth.db, code);
      const item = officialValidator.saveConfig(req.auth.db, code, {
        ...discovery.suggestion,
        schema_version: req.body?.schema_version || current.schema_version || "",
        source_url: req.body?.source_url || current.source_url || "https://static.anaf.ro/"
      }, req.auth.user);
      const test = officialValidator.testEnvironment(req.auth.db, code);
      addAudit(req.auth.db, req.auth.user, "accounting_validator_auto_config", `${code} / ${test.ok ? "ok" : "eroare"}`);
      writeDb(req.auth.db);
      res.json({ item, diagnostic: officialValidator.diagnostic(req.auth.db, code), discovery, test });
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/validators/:code/test", requireAccountingPost, (req, res, next) => {
    try {
      const result = officialValidator.testEnvironment(req.auth.db, req.params.code);
      addAudit(req.auth.db, req.auth.user, "accounting_validator_test", `${result.code} / ${result.ok ? "ok" : "eroare"}`);
      writeDb(req.auth.db);
      res.json({ result });
    } catch (error) { next(error); }
  });

  router.get("/accounting/d112/mapping", requireAccountingReports, (req, res, next) => {
    try {
      const period = fiscal.declarationPeriod(req.query.perioada || req.query.luna || currentMonth());
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      res.json(d112Generator.buildMappingReport(req.auth.db, period.value));
    } catch (error) { next(error); }
  });

  router.get("/accounting/d112/mapping-export", requireAccountingReports, (req, res, next) => {
    try {
      const period = fiscal.declarationPeriod(req.query.perioada || req.query.luna || currentMonth());
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      const report = d112Generator.buildMappingReport(req.auth.db, period.value);
      const rows = report.rows.map((item) => [item.marca, item.cnpAsig, item.numeAsig, item.prenAsig, item.dataAng, item.ore_lucrate, item.venit_brut, item.cas, item.cass, item.impozit, item.zile_cm, item.ready ? "OK" : item.errors.join("; ")]);
      const sheet = xlsx.utils.aoa_to_sheet([["Mapare D112", period.value, report.schema], [], ["Marca", "CNP", "Nume", "Prenume", "Data angajarii", "Ore", "Brut", "CAS", "CASS", "Impozit", "Zile CM", "Control"], ...rows]);
      sheet["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 15 }, ...Array(6).fill({ wch: 14 }), { wch: 60 }];
      const workbook = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(workbook, sheet, "Mapare D112");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Mapare_D112_${period.value.replace("-", "_")}.xlsx"`);
      res.end(buffer);
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/:code/validate-official-file", requireAccountingPost, receiptUpload.single("file"), (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      if (!new Set(["D112", "D300", "D394", "D406"]).has(code)) throwHttp(400, "Declaratia nu accepta validare externa.");
      if (!req.file || !String(req.file.originalname || "").toLowerCase().endsWith(".xml")) throwHttp(400, "Selecteaza fisierul XML al declaratiei.");
      const period = fiscal.declarationPeriod(req.body?.perioada || req.body?.luna || currentMonth());
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      const result = officialValidator.validate(req.auth.db, code, req.file.buffer, req.file.originalname);
      const accounting = engine.ensureAccounting(req.auth.db);
      const folder = path.join(process.cwd(), "storage", "accounting-declarations", period.value, code, "validated");
      fs.mkdirSync(folder, { recursive: true });
      const storedName = fiscal.safeStoredName(req.file.originalname, `${code}_${period.value}_${Date.now()}`);
      const fullPath = path.join(folder, storedName);
      fs.writeFileSync(fullPath, req.file.buffer);
      const run = {
        id: engine.nextNumericId(accounting.declarationValidationRuns), perioada: period.value,
        an: period.an, luna: period.luna, file_name: req.file.originalname,
        stored_file: path.relative(process.cwd(), fullPath).replace(/\\/g, "/"),
        ...result, created_by: req.auth.user?.id || "", created_at: new Date().toISOString()
      };
      accounting.declarationValidationRuns.push(run);
      addAudit(req.auth.db, req.auth.user, "accounting_official_validator", `${code} ${period.value} / ${result.accepted ? "acceptat" : "erori"}`);
      writeDb(req.auth.db);
      res.json({ run });
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/:code/generate-candidate", requireAccountingPost, (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      const period = fiscal.declarationPeriod(req.body?.perioada || req.body?.luna || currentMonth());
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      const validator = officialValidator.diagnostic(req.auth.db, code);
      const accounting = engine.ensureAccounting(req.auth.db);
      const activeSchema = schemaProfiles.select(accounting, code, period.value) || (code === "D406" ? schemaProfiles.select(accounting, "SAF-T", period.value) : null);
      const activeProfile = schemaProfiles.profile(activeSchema);
      const candidate = declarationCandidates.generate(req.auth.db, code, period.value, activeProfile || { schema_version: validator.schema_version });
      const folder = path.join(process.cwd(), "storage", "accounting-declarations", period.value, code, "candidates");
      fs.mkdirSync(folder, { recursive: true });
      const fileName = `${code}_candidat_${period.value.replace("-", "_")}_${Date.now()}.xml`;
      const fullPath = path.join(folder, fileName);
      fs.writeFileSync(fullPath, candidate.content, "utf8");
      const xsdValidation = code === "D406" ? xsdValidator.validate(Buffer.from(candidate.content), activeSchema) : null;
      const sourceComplete = candidate.issues?.length === 0;
      const result = (!xsdValidation || xsdValidation.accepted) && sourceComplete && validator.execution_enabled
        ? officialValidator.validate(req.auth.db, code, Buffer.from(candidate.content), fileName) : null;
      const item = {
        id: engine.nextNumericId(accounting.declarationCandidates), ...candidate,
        stored_file: path.relative(process.cwd(), fullPath).replace(/\\/g, "/"),
        schema_profile: activeProfile,
        accepted: Boolean(result?.accepted && (!xsdValidation || xsdValidation.accepted)), xsd_validation: xsdValidation, validation: result,
        created_by: req.auth.user?.id || ""
      };
      delete item.content;
      accounting.declarationCandidates.push(item);
      const validationStatus = xsdValidation && !xsdValidation.accepted ? "erori_xsd" : !sourceComplete ? "date_incomplete" : result ? result.accepted ? "acceptat" : "erori_validator" : "nevalidat";
      addAudit(req.auth.db, req.auth.user, "accounting_declaration_candidate", `${code} ${period.value} / ${validationStatus}`);
      writeDb(req.auth.db);
      res.status(201).json({ candidate: item });
    } catch (error) { next(error); }
  });

  router.get("/accounting/declarations/:code/candidate-download", requireAccountingReports, (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      const period = fiscal.declarationPeriod(req.query.perioada || req.query.luna || currentMonth());
      const accounting = engine.ensureAccounting(req.auth.db);
      const item = [...accounting.declarationCandidates].reverse().find((row) => row.code === code && row.perioada === period?.value && row.accepted);
      if (!item) throwHttp(409, `Nu exista un candidat ${code} acceptat de validator pentru perioada selectata.`);
      const fullPath = path.resolve(process.cwd(), item.stored_file);
      if (!fs.existsSync(fullPath)) throwHttp(404, "Fisierul candidat validat nu mai exista in arhiva.");
      res.download(fullPath, path.basename(fullPath));
    } catch (error) { next(error); }
  });

  router.get("/accounting/d112/export-source-xml", requireAccountingReports, (req, res, next) => {
    try {
      const period = fiscal.declarationPeriod(req.query.perioada || req.query.luna || currentMonth());
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      const source = d112Generator.buildSource(req.auth.db, period.value);
      const generated = d112Generator.toWorkingXml(source);
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="D112_sursa_${period.value.replace("-", "_")}.xml"`);
      res.setHeader("X-InfraFlow-SHA256", generated.sha256);
      res.send(generated.content);
    } catch (error) { next(error); }
  });

  router.post("/accounting/d112/validate-official-xml", requireAccountingPost, receiptUpload.single("file"), (req, res, next) => {
    try {
      if (!req.file) throwHttp(400, "Selecteaza fisierul XML D112 generat pentru validare.");
      if (!String(req.file.originalname || "").toLowerCase().endsWith(".xml")) throwHttp(400, "Validatorul D112 accepta aici doar fisiere XML.");
      const period = fiscal.declarationPeriod(req.body?.perioada || req.body?.luna || currentMonth());
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      const result = d112Generator.validateOfficialXml(req.auth.db, req.file.buffer, req.file.originalname);
      const accounting = engine.ensureAccounting(req.auth.db);
      accounting.d112ValidationRuns = Array.isArray(accounting.d112ValidationRuns) ? accounting.d112ValidationRuns : [];
      const run = {
        id: accounting.d112ValidationRuns.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1,
        perioada: period.value,
        file_name: req.file.originalname,
        ...result,
        created_by: req.auth.user?.id || ""
      };
      accounting.d112ValidationRuns.push(run);
      addAudit(req.auth.db, req.auth.user, "accounting_d112_official_validate", `${period.value} / ${result.accepted ? "acceptat" : "erori"}`);
      writeDb(req.auth.db);
      res.status(200).json({ run });
    } catch (error) { next(error); }
  });

  router.get("/accounting/fiscal/calendar", requireAccountingReports, (req, res, next) => {
    try {
      res.status(200).json(buildFiscalCalendar(req.auth.db, req.query));
    } catch (error) { next(error); }
  });

  router.get("/accounting/fiscal/month-check", requireAccountingReports, (req, res, next) => {
    try {
      res.status(200).json(buildFiscalMonthCheck(req.auth.db, req.query));
    } catch (error) { next(error); }
  });

  router.get("/accounting/declarations/history", requireAccountingReports, (req, res) => {
    const accounting = engine.ensureAccounting(req.auth.db);
    const [an, luna] = monthParts(req.query.perioada || req.query.luna);
    const runs = accounting.declarationRuns.filter((item) => Number(item.an) === an && Number(item.luna) === luna).slice().reverse();
    res.status(200).json({ perioada: `${an}-${String(luna).padStart(2, "0")}`, runs });
  });

  router.get("/accounting/declarations/register", requireAccountingReports, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const period = fiscal.declarationPeriod(req.query.perioada || req.query.luna || currentMonth());
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      res.status(200).json(fiscal.buildRegister(accounting.declarationRuns, period));
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/:code/validate", requireAccountingPost, (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      if (!["D300", "D394", "D112", "D406"].includes(code)) throwHttp(400, "Declaratia selectata nu are inca validare interna disponibila.");
      const accounting = engine.ensureAccounting(req.auth.db);
      const readiness = buildDeclarationReadiness(req.auth.db, req.body || req.query || {});
      const [an, luna] = monthParts(readiness.perioada);
      const relevant = code === "D300"
        ? readiness.checks.filter((item) => ["documents", "vat", "vat_accounting", "vat_balance"].includes(item.key))
        : code === "D394"
          ? readiness.checks.filter((item) => ["documents", "d394_partners", "vat_accounting", "vat_balance"].includes(item.key))
          : code === "D112"
            ? buildD112Readiness(req.auth.db, { perioada: readiness.perioada }).checks
            : buildSaftReadiness(req.auth.db, { perioada: readiness.perioada }).areas.map((item) => ({ key: item.label, label: item.label, ok: item.ok, message: item.ok ? "Mapare completa." : `${item.missing} mapari lipsa.` }));
      const errors = relevant.filter((item) => !item.ok).map((item) => item.message);
      const run = {
        id: engine.nextNumericId(accounting.declarationRuns), code, an, luna,
        status: errors.length ? "cu_erori" : "validat_intern", errors,
        checksum: crypto.createHash("sha256").update(JSON.stringify({ code, perioada: readiness.perioada, checks: relevant, vat: readiness.vat_control })).digest("hex"),
        validated_by: req.auth.user?.id || "", validated_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      accounting.declarationRuns.push(run);
      addAudit(req.auth.db, req.auth.user, "accounting_declaration_validate", `${code} ${readiness.perioada} / ${run.status}`);
      writeDb(req.auth.db);
      res.status(errors.length ? 422 : 201).json({ run, checks: relevant });
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/:code/submit", requireAccountingPost, (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      const [an, luna] = monthParts(req.body?.perioada);
      const accounting = engine.ensureAccounting(req.auth.db);
      const run = fiscal.latestRun(accounting.declarationRuns, code, an, luna, ["validat_intern", "exportat", "depus"]);
      if (!run) throwHttp(409, "Ruleaza mai intai validarea interna fara erori si exporta declaratia.");
      const receipt = String(req.body?.recipisa || "").trim();
      if (!receipt) throwHttp(400, "Completeaza numarul recipisei ANAF.");
      run.status = "depus";
      run.recipisa = receipt;
      run.submitted_at = new Date().toISOString();
      run.submitted_by = req.auth.user?.id || "";
      run.receipt_status = "in_procesare";
      run.updated_at = new Date().toISOString();
      addAudit(req.auth.db, req.auth.user, "accounting_declaration_submit", `${code} ${an}-${String(luna).padStart(2, "0")} / ${receipt}`);
      writeDb(req.auth.db);
      res.status(200).json({ run });
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/:code/exported", requireAccountingPost, (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      if (!["D300", "D394", "D112", "D406"].includes(code)) throwHttp(400, "Declaratia selectata nu poate fi marcata exportata.");
      const period = fiscal.declarationPeriod(req.body?.perioada);
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      const accounting = engine.ensureAccounting(req.auth.db);
      const run = fiscal.latestRun(accounting.declarationRuns, code, period.an, period.luna, ["validat_intern", "exportat"]);
      if (!fiscal.canExport(run)) throwHttp(409, "Valideaza intern declaratia fara erori inainte de export.");
      run.status = "exportat";
      run.exported_at = new Date().toISOString();
      run.exported_by = req.auth.user?.id || "";
      run.export_file = String(req.body?.filename || "").slice(0, 250);
      run.updated_at = new Date().toISOString();
      addAudit(req.auth.db, req.auth.user, "accounting_declaration_export", `${code} ${period.value} / ${run.export_file || "fisier"}`);
      writeDb(req.auth.db);
      res.status(200).json({ run });
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/:code/archive", requireAccountingPost, receiptUpload.single("file"), (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      if (!["D300", "D394", "D112", "D406"].includes(code)) throwHttp(400, "Declaratia selectata nu poate fi arhivata.");
      const period = fiscal.declarationPeriod(req.body?.perioada);
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      if (!req.file?.buffer) throwHttp(400, "Selecteaza fisierul declaratiei.");
      const accounting = engine.ensureAccounting(req.auth.db);
      const run = fiscal.latestRun(accounting.declarationRuns, code, period.an, period.luna, ["validat_intern", "exportat"]);
      if (!fiscal.canExport(run)) throwHttp(409, "Valideaza intern datele declaratiei inainte de arhivare.");
      const storedName = fiscal.safeStoredName(req.file.originalname, `${code}_${period.value}_${Date.now()}`);
      if (!storedName) throwHttp(400, "Declaratia trebuie sa fie PDF, XML, ZIP sau TXT.");
      const folder = path.join(process.cwd(), "storage", "accounting-declarations", period.value, code);
      fs.mkdirSync(folder, { recursive: true });
      const fullPath = path.join(folder, storedName);
      fs.writeFileSync(fullPath, req.file.buffer);
      run.status = "exportat";
      run.declaration_file = path.relative(process.cwd(), fullPath).replace(/\\/g, "/");
      run.declaration_original_name = req.file.originalname;
      run.declaration_sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
      run.exported_at = new Date().toISOString();
      run.exported_by = req.auth.user?.id || "";
      run.updated_at = run.exported_at;
      addAudit(req.auth.db, req.auth.user, "accounting_declaration_archive", `${code} ${period.value} / ${req.file.originalname}`);
      writeDb(req.auth.db);
      res.status(200).json({ run });
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/:code/receipt", requireAccountingPost, receiptUpload.single("file"), (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      if (!["D300", "D394", "D112", "D406"].includes(code)) throwHttp(400, "Declaratia selectata nu accepta recipisa.");
      const period = fiscal.declarationPeriod(req.body?.perioada);
      const status = fiscal.receiptStatus(req.body?.status);
      if (!period) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      if (!status) throwHttp(400, "Status recipisa invalid.");
      const accounting = engine.ensureAccounting(req.auth.db);
      const run = fiscal.latestRun(accounting.declarationRuns, code, period.an, period.luna, ["validat_intern", "exportat", "depus", "respins"]);
      if (!fiscal.canReceiveReceipt(run)) throwHttp(409, "Nu exista o validare activa pentru aceasta declaratie sau recipisa finala este deja inregistrata.");
      const receipt = String(req.body?.recipisa || "").trim();
      if (!receipt) throwHttp(400, "Completeaza numarul recipisei ANAF.");
      if (req.file) {
        const storedName = fiscal.safeStoredName(req.file.originalname, `${code}_${period.value}_${Date.now()}`);
        if (!storedName) throwHttp(400, "Recipisa trebuie sa fie PDF, XML, ZIP sau TXT.");
        const folder = path.join(process.cwd(), "storage", "accounting-declarations", period.value, code);
        fs.mkdirSync(folder, { recursive: true });
        const fullPath = path.join(folder, storedName);
        fs.writeFileSync(fullPath, req.file.buffer);
        run.receipt_file = path.relative(process.cwd(), fullPath).replace(/\\/g, "/");
        run.receipt_original_name = req.file.originalname;
        run.receipt_sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
      }
      run.status = fiscal.runStatusFromReceipt(status);
      run.recipisa = receipt;
      run.receipt_status = status;
      run.receipt_message = String(req.body?.message || "").trim().slice(0, 1000);
      run.received_at = new Date().toISOString();
      run.received_by = req.auth.user?.id || "";
      run.submitted_at = run.submitted_at || run.received_at;
      run.submitted_by = run.submitted_by || req.auth.user?.id || "";
      run.updated_at = run.received_at;
      addAudit(req.auth.db, req.auth.user, "accounting_declaration_receipt", `${code} ${period.value} / ${receipt} / ${status}`);
      writeDb(req.auth.db);
      res.status(200).json({ run });
    } catch (error) { next(error); }
  });

  router.get("/accounting/declarations/runs/:id/receipt", requireAccountingReports, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const run = accounting.declarationRuns.find((item) => String(item.id) === String(req.params.id));
      if (!run?.receipt_file) throwHttp(404, "Recipisa nu are fisier atasat.");
      const storageRoot = path.resolve(process.cwd(), "storage", "accounting-declarations");
      const fullPath = path.resolve(process.cwd(), run.receipt_file);
      if (!fullPath.startsWith(`${storageRoot}${path.sep}`) || !fs.existsSync(fullPath)) throwHttp(404, "Fisierul recipisei nu a fost gasit.");
      res.download(fullPath, run.receipt_original_name || path.basename(fullPath));
    } catch (error) { next(error); }
  });

  router.get("/accounting/declarations/runs/:id/file", requireAccountingReports, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const run = accounting.declarationRuns.find((item) => String(item.id) === String(req.params.id));
      if (!run?.declaration_file) throwHttp(404, "Declaratia nu are fisier arhivat.");
      const storageRoot = path.resolve(process.cwd(), "storage", "accounting-declarations");
      const fullPath = path.resolve(process.cwd(), run.declaration_file);
      if (!fullPath.startsWith(`${storageRoot}${path.sep}`) || !fs.existsSync(fullPath)) throwHttp(404, "Fisierul declaratiei nu a fost gasit.");
      res.download(fullPath, run.declaration_original_name || path.basename(fullPath));
    } catch (error) { next(error); }
  });

  router.get("/accounting/d112/export-inputs", requireAccountingReports, (req, res, next) => {
    try {
      const data = buildD112Readiness(req.auth.db, req.query);
      const workbook = xlsx.utils.book_new();
      const summary = xlsx.utils.aoa_to_sheet([
        ["Pregatire date D112", data.perioada, "Document intern - nu este declaratie ANAF"],
        [],
        ["Indicator", "Valoare"],
        ["Angajati activi", data.totals.employees],
        ["Contracte active", data.totals.contracts],
        ["Angajati pontati", data.totals.timesheet_employees],
        ["Pontaje validate", data.totals.validated_timesheets],
        ["Probleme", data.issues.length]
      ]);
      summary["!cols"] = [{ wch: 34 }, { wch: 24 }, { wch: 46 }];
      xlsx.utils.book_append_sheet(workbook, summary, "Sumar");
      const employees = xlsx.utils.aoa_to_sheet([
        ["Marca", "Nume", "CNP", "Contract", "Salariu baza", "Zile pontate", "Ore", "Pontaj validat", "Status"],
        ...data.employees.map((item) => [item.marca, item.nume, item.cnp, item.contract_number, item.salary_base, item.days, item.hours, item.timesheet_validated ? "DA" : "NU", item.ok ? "OK" : item.problems.join("; ")])
      ]);
      employees["!cols"] = [{ wch: 12 }, { wch: 36 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 60 }];
      employees["!autofilter"] = { ref: `A1:I${Math.max(1, data.employees.length + 1)}` };
      xlsx.utils.book_append_sheet(workbook, employees, "Angajati");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Pregatire_D112_${data.perioada.replace("-", "_")}.xlsx"`);
      res.end(buffer);
    } catch (error) { next(error); }
  });

  router.get("/accounting/saft/export-mapping", requireAccountingReports, (req, res, next) => {
    try {
      const data = buildSaftReadiness(req.auth.db, req.query);
      const workbook = xlsx.utils.book_new();
      const summary = xlsx.utils.aoa_to_sheet([
        ["Diagnostic mapare SAF-T", data.perioada, "Document intern de lucru"],
        ["Acoperire", `${data.coverage}%`],
        [],
        ["Zona", "Total", "Mapate", "Lipsa", "Status"],
        ...data.areas.map((area) => [area.label, area.total, area.mapped, area.missing, area.ok ? "OK" : "Necesita completare"])
      ]);
      summary["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 24 }];
      xlsx.utils.book_append_sheet(workbook, summary, "Sumar");
      const problems = xlsx.utils.aoa_to_sheet([
        ["Zona", "Identificator", "Problema", "Rezolvare"],
        ...data.issues.map((issue) => [issue.area, issue.id, issue.message, issue.action])
      ]);
      problems["!cols"] = [{ wch: 24 }, { wch: 24 }, { wch: 70 }, { wch: 70 }];
      problems["!autofilter"] = { ref: `A1:D${Math.max(1, data.issues.length + 1)}` };
      xlsx.utils.book_append_sheet(workbook, problems, "Probleme");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Diagnostic_SAFT_${data.perioada.replace("-", "_")}.xlsx"`);
      res.end(buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get("/accounting/d394/export", requireAccountingReports, (req, res, next) => {
    try {
      const data = buildD394Data(req.auth.db, req.query);
      const rows = [
        ["Pregatire D394", data.perioada, "Document intern de lucru"],
        ["Status", data.ready ? "Pregatit pentru verificare" : "Necesita verificari"],
        [],
        ["CUI", "Denumire tert", "Tip", "Cote TVA", "Nr. documente", "Baza", "TVA", "Total"],
        ...data.terti.map((row) => [row.cui, row.denumire, row.tip, row.cote.map((rate) => `${rate}%`).join(", "), row.documente, row.baza, row.tva, row.total]),
        [],
        ["TOTAL", "", "", "", data.totaluri.documente, data.totaluri.baza, data.totaluri.tva, data.totaluri.total]
      ];
      const workbook = xlsx.utils.book_new();
      const sheet = xlsx.utils.aoa_to_sheet(rows);
      sheet["!cols"] = [{ wch: 18 }, { wch: 42 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      sheet["!autofilter"] = { ref: `A4:H${Math.max(4, 3 + data.terti.length)}` };
      sheet["!freeze"] = { xSplit: 0, ySplit: 4 };
      xlsx.utils.book_append_sheet(workbook, sheet, "D394 lucru");

      const detailSheet = xlsx.utils.aoa_to_sheet([
        ["Data", "Document", "CUI", "Tert", "Tip", "Cota TVA", "Baza", "TVA", "Total", "Status"],
        ...data.detalii.map((row) => [row.data, row.document, row.cui, row.denumire, row.tip, row.cota_tva, row.baza, row.tva, row.total, row.status])
      ]);
      detailSheet["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
      detailSheet["!autofilter"] = { ref: `A1:J${Math.max(1, data.detalii.length + 1)}` };
      xlsx.utils.book_append_sheet(workbook, detailSheet, "Documente");

      if (data.warnings.length) {
        const warningSheet = xlsx.utils.aoa_to_sheet([
          ["Verificari necesare"],
          [],
          ["Mesaj"],
          ...data.warnings.map((message) => [message])
        ]);
        warningSheet["!cols"] = [{ wch: 100 }];
        xlsx.utils.book_append_sheet(workbook, warningSheet, "Verificari");
      }

      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="D394_lucru_${data.perioada.replace("-", "_")}.xlsx"`);
      res.end(buffer);
    } catch (error) {
      next(error);
    }
  });
}

function buildDeclarationReadiness(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(query.perioada || query.luna);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const inMonth = (item) => Number(item.an) === an && Number(item.luna) === luna && !["anulat", "stornat"].includes(String(item.status || ""));
  const invoices = [...accounting.invoicesIn.filter(inMonth), ...accounting.invoicesOut.filter(inMonth), ...accounting.creditNotes.filter(inMonth)];
  const drafts = invoices.filter((item) => item.status === "draft");
  const period = accounting.periods.find((item) => Number(item.an) === an && Number(item.luna) === luna) || { an, luna, status: "deschisa" };
  const d394 = buildD394Data(db, { perioada });
  const saft = buildSaftReadiness(db, { perioada });
  const d112 = buildD112Readiness(db, { perioada });
  const activeJournalIds = new Set(accounting.journals.filter((item) => engine.isActiveJournal(item) && Number(item.an) === an && Number(item.luna) === luna).map((item) => Number(item.id)));
  const vatLines = accounting.journalLines.filter((item) => activeJournalIds.has(Number(item.journal_id)) && ["4426", "4427"].includes(String(item.cont_simbol)));
  const vatAccounting = {
    deductibila: money(vatLines.filter((item) => item.cont_simbol === "4426").reduce((sum, item) => sum + Number(item.debit || 0) - Number(item.credit || 0), 0)),
    colectata: money(vatLines.filter((item) => item.cont_simbol === "4427").reduce((sum, item) => sum + Number(item.credit || 0) - Number(item.debit || 0), 0))
  };
  const vatDocuments = {
    deductibila: money(d394.detalii.filter((item) => item.tip === "achizitie").reduce((sum, item) => sum + item.tva, 0)),
    colectata: money(d394.detalii.filter((item) => item.tip === "livrare").reduce((sum, item) => sum + item.tva, 0))
  };
  const vatConsistent = Math.abs(vatAccounting.deductibila - vatDocuments.deductibila) <= 0.01 && Math.abs(vatAccounting.colectata - vatDocuments.colectata) <= 0.01;
  const balance = engine.buildBalance(db, an, luna, "sintetica");
  const balance4426 = balance.rows.find((item) => item.cont === "4426") || {};
  const balance4427 = balance.rows.find((item) => item.cont === "4427") || {};
  const vatBalance = {
    deductibila: money(Number(balance4426.rulaje_D || 0) - Number(balance4426.rulaje_C || 0)),
    colectata: money(Number(balance4427.rulaje_C || 0) - Number(balance4427.rulaje_D || 0))
  };
  const vatBalanceConsistent = balance.balanced
    && Math.abs(vatBalance.deductibila - vatAccounting.deductibila) <= 0.01
    && Math.abs(vatBalance.colectata - vatAccounting.colectata) <= 0.01;
  const checks = [
    {
      key: "documents",
      label: "Documente validate",
      ok: drafts.length === 0,
      message: drafts.length ? `${drafts.length} facturi sunt inca draft.` : "Nu exista facturi draft in perioada."
    },
    {
      key: "vat",
      label: "TVA verificat",
      ok: Boolean(period.tva_verificat_la),
      message: period.tva_verificat_la ? "TVA-ul perioadei a fost verificat." : "TVA-ul trebuie verificat din pagina TVA / D300."
    },
    {
      key: "d394_partners",
      label: "Terti D394",
      ok: d394.ready,
      message: d394.ready ? `${d394.terti.length} terti sunt pregatiti pentru verificare.` : d394.warnings[0]
    },
    {
      key: "vat_accounting",
      label: "TVA facturi vs contabilitate",
      ok: vatConsistent,
      message: vatConsistent ? "TVA-ul documentelor corespunde rulajelor 4426/4427." : `Diferente: 4426 ${money(vatAccounting.deductibila - vatDocuments.deductibila)}, 4427 ${money(vatAccounting.colectata - vatDocuments.colectata)}.`
    },
    {
      key: "vat_balance",
      label: "TVA jurnale vs balanta",
      ok: vatBalanceConsistent,
      message: vatBalanceConsistent
        ? "Rulajele TVA corespund balantei, iar balanta este echilibrata."
        : `Balanta: 4426 ${vatBalance.deductibila}, 4427 ${vatBalance.colectata}; verificati notele contabile si echilibrul balantei.`
    },
    {
      key: "period",
      label: "Status perioada",
      ok: ["inchisa", "depusa"].includes(period.status),
      message: ["inchisa", "depusa"].includes(period.status) ? `Perioada este ${period.status}.` : "Inchiderea lunii ramane pasul final inainte de depunere."
    }
  ];
  return {
    perioada,
    period,
    status: checks.every((item) => item.ok) ? "ready" : "needs_attention",
    checks,
    declarations: [
      { code: "D300", status: drafts.length === 0 && period.tva_verificat_la && vatConsistent && vatBalanceConsistent ? "pregatit" : "in_lucru", description: "Decont TVA din jurnalele de cumparari si vanzari." },
      { code: "D394", status: d394.ready && vatConsistent && vatBalanceConsistent ? "pregatit" : "in_lucru", description: "Operatiuni interne grupate pe tert si CUI." },
      { code: "D112", status: d112.ready ? "pregatit_date" : "date_incomplete", description: "Date sursa din HR pentru calcul salarial si declaratia D112." },
      { code: "D406 / SAF-T", status: saft.ready ? "pregatit_mapare" : "neconfigurat", description: `Mapare tehnica ${saft.coverage}%. XML-ul fiscal necesita in continuare schema ANAF aplicabila.` }
    ],
    vat_control: {
      accounting: vatAccounting,
      documents: vatDocuments,
      balance: vatBalance,
      consistent: vatConsistent && vatBalanceConsistent,
      documents_consistent: vatConsistent,
      balance_consistent: vatBalanceConsistent,
      balance_balanced: balance.balanced
    }
  };
}

function buildD394Data(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(query.perioada || query.luna);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const acceptedStatuses = new Set(["validat", "partial", "achitat", "incasat", "creditata"]);
  const groups = new Map();
  const missing = [];
  const details = [];
  let foreignDocuments = 0;

  addInvoices(accounting.invoicesIn, "achizitie", "furnizor_id");
  addInvoices(accounting.creditNotes.filter((item) => item.status === "validat").map((item) => ({ ...item, valoare: -Math.abs(Number(item.valoare || 0)), tva: -Math.abs(Number(item.tva || 0)), total: -Math.abs(Number(item.total || 0)) })), "achizitie", "furnizor_id");
  addInvoices(accounting.invoicesOut, "livrare", "client_id");

  function addInvoices(invoices, tip, partyKey) {
    invoices
      .filter((item) => Number(item.an) === an && Number(item.luna) === luna && acceptedStatuses.has(String(item.status || "")))
      .forEach((invoice) => {
        const tert = accounting.thirdParties.find((item) => String(item.id) === String(invoice[partyKey]));
        const cui = normalizeCui(tert?.cui || tert?.cif || "");
        const country = String(tert?.tara || "RO").trim().toUpperCase();
        const document = invoice.nr_document || invoice.numar || "";
        if (country && country !== "RO") {
          foreignDocuments += 1;
          return;
        }
        if (!tert || !isValidRomanianCui(cui)) {
          missing.push(`${tip === "achizitie" ? "Factura furnizor" : "Factura client"} ${invoice.nr_document || invoice.numar || invoice.id} nu are tert cu CUI completat.`);
          return;
        }
        if (!document) missing.push(`${tip === "achizitie" ? "Factura furnizor" : "Factura client"} ID ${invoice.id} nu are numar de document.`);
        if (!invoice.data) missing.push(`Factura ${document || invoice.id} nu are data documentului.`);
        const rate = Number(invoice.tva_procent ?? (Number(invoice.valoare || 0) ? Number(invoice.tva || 0) * 100 / Number(invoice.valoare || 1) : 0));
        const normalizedRate = money(rate);
        const key = `${tip}:${cui}`;
        const row = groups.get(key) || {
          cui,
          denumire: tert.denumire || tert.nume || "Tert",
          tip,
          documente: 0,
          baza: 0,
          tva: 0,
          total: 0
          ,cote: []
        };
        row.documente += 1;
        row.baza = money(row.baza + Number(invoice.valoare || 0));
        row.tva = money(row.tva + Number(invoice.tva || 0));
        row.total = money(row.total + Number(invoice.total || 0));
        if (!row.cote.includes(normalizedRate)) row.cote.push(normalizedRate);
        groups.set(key, row);
        details.push({
          id: invoice.id,
          uuid: invoice.uuid || "",
          data: invoice.data || "",
          document: document || `ID ${invoice.id}`,
          cui,
          denumire: tert.denumire || tert.nume || "Tert",
          tip,
          cota_tva: normalizedRate,
          baza: money(invoice.valoare || 0),
          tva: money(invoice.tva || 0),
          total: money(invoice.total || 0),
          status: invoice.status || ""
        });
      });
  }

  const terti = [...groups.values()].map((row) => ({ ...row, cote: row.cote.sort((a, b) => a - b) })).sort((a, b) => a.cui.localeCompare(b.cui, "ro", { numeric: true }) || a.tip.localeCompare(b.tip));
  return {
    perioada,
    ready: missing.length === 0,
    warnings: [...new Set(missing)],
    terti,
    detalii: details.sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.document).localeCompare(String(b.document), "ro", { numeric: true })),
    documente_externe_excluse: foreignDocuments,
    totaluri: {
      documente: terti.reduce((sum, row) => sum + row.documente, 0),
      baza: money(terti.reduce((sum, row) => sum + row.baza, 0)),
      tva: money(terti.reduce((sum, row) => sum + row.tva, 0)),
      total: money(terti.reduce((sum, row) => sum + row.total, 0))
    }
  };
}

function buildD112Readiness(db, query = {}) {
  const [an, luna] = monthParts(query.perioada || query.luna);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const monthEnd = new Date(an, luna, 0).toISOString().slice(0, 10);
  const hr = db.hr || {};
  const allEmployees = Array.isArray(hr.employees) ? hr.employees : [];
  const contracts = Array.isArray(hr.contracts) ? hr.contracts : [];
  const timeSheets = Array.isArray(hr.timeSheets) ? hr.timeSheets : [];
  const payrollRuns = Array.isArray(hr.payrollRuns) ? hr.payrollRuns : [];
  const payrollLines = Array.isArray(hr.payrollLines) ? hr.payrollLines : [];
  const activeEmployees = allEmployees.filter((item) => item.activ !== false && item.status !== "incetat");
  const issues = [];
  const rows = activeEmployees.map((employee) => {
    const contract = contracts
      .filter((item) => String(item.employee_id) === String(employee.id) && item.status !== "incetat" && (!item.data_start || item.data_start <= monthEnd))
      .sort((a, b) => String(b.data_start || b.created_at || "").localeCompare(String(a.data_start || a.created_at || "")))[0];
    const sheets = timeSheets.filter((item) => String(item.employee_id) === String(employee.id) && String(item.data || "").startsWith(perioada));
    const problems = [];
    const cnp = String(employee.cnp || "").replace(/\D/g, "");
    if (!/^\d{13}$/.test(cnp)) problems.push("CNP lipsa sau invalid");
    if (!contract) problems.push("contract activ lipsa");
    const salary = Number(contract?.salariu_baza ?? employee.salariu_baza ?? 0);
    if (!(salary > 0)) problems.push("salariu de baza lipsa");
    if (!sheets.length) problems.push("pontaj lipsa");
    const validated = sheets.length > 0 && sheets.every((item) => item.validat === true || item.validat === 1);
    if (sheets.length && !validated) problems.push("pontaj nevalidat");
    problems.forEach((message) => issues.push(issue("D112", employee.marca || employee.id, `${employee.nume || ""} ${employee.prenume || ""}: ${message}.`, "Completeaza datele in Resurse Umane si valideaza pontajul.")));
    return {
      id: employee.id,
      marca: employee.marca || "",
      nume: `${employee.nume || ""} ${employee.prenume || ""}`.trim(),
      cnp,
      has_contract: Boolean(contract),
      contract_number: contract?.nr_contract || contract?.numar || "",
      salary_base: money(salary),
      days: new Set(sheets.map((item) => item.data)).size,
      hours: money(sheets.reduce((sum, item) => sum + Number(item.ore_lucrate || item.ore || 0), 0)),
      timesheet_validated: validated,
      problems,
      ok: problems.length === 0
    };
  });
  if (!activeEmployees.length) issues.push(issue("D112", "angajati", "Nu exista angajati activi pentru perioada selectata.", "Verifica nomenclatorul de angajati."));
  const payrollRun = [...payrollRuns].reverse().find((item) => item.luna === perioada && item.status === "validat" && !item.cancelled_at) || null;
  const activePayrollLines = payrollRun
    ? payrollLines.filter((item) => item.run_id === payrollRun.id && !item.cancelled_at)
    : [];
  const inputsReady = rows.length > 0 && issues.length === 0;
  const payrollReady = Boolean(payrollRun && activePayrollLines.length === rows.length && Number(payrollRun.error_count || 0) === 0);
  if (inputsReady && !payrollReady) {
    issues.push(issue("D112", "salarizare", "Statul salarial al lunii nu este validat sau nu cuprinde toti angajatii activi.", "Genereaza si valideaza statul din Contabilitate > Salarizare."));
  }
  const activeSchema = engine.ensureAccounting(db).anafSchemas.find((item) => item.code === "D112" && item.active !== false);
  return {
    perioada,
    ready_inputs: inputsReady,
    ready: inputsReady && payrollReady,
    status: !inputsReady ? "date_incomplete" : payrollReady ? "pregatit_pentru_mapare_d112" : "asteapta_stat_salarial",
    final_export_available: false,
    active_schema: activeSchema ? { original_name: activeSchema.original_name, sha256: activeSchema.sha256 } : null,
    note: "Controlul verifica datele sursa si statul salarial validat. XML-ul D112 final necesita in continuare schema ANAF aplicabila.",
    payroll: payrollRun ? {
      id: payrollRun.id,
      uuid: payrollRun.uuid,
      status: payrollRun.status,
      employee_count: activePayrollLines.length,
      total_gross: money(payrollRun.total_gross),
      total_net: money(payrollRun.total_net),
      total_cas: money(payrollRun.total_cas),
      total_cass: money(payrollRun.total_cass),
      total_income_tax: money(payrollRun.total_income_tax),
      total_cam: money(payrollRun.total_cam),
      validated_at: payrollRun.validated_at || null
    } : null,
    checks: [
      { key: "d112_employees", label: "Angajati si CNP", ok: rows.length > 0 && rows.every((item) => /^\d{13}$/.test(item.cnp)), message: rows.length ? `${rows.filter((item) => /^\d{13}$/.test(item.cnp)).length}/${rows.length} angajati au CNP complet.` : "Nu exista angajati activi." },
      { key: "d112_contracts", label: "Contracte si salarii", ok: rows.length > 0 && rows.every((item) => item.has_contract && item.salary_base > 0), message: `${rows.filter((item) => item.has_contract && item.salary_base > 0).length}/${rows.length} angajati au contract si salariu de baza.` },
      { key: "d112_timesheets", label: "Pontaj validat", ok: rows.length > 0 && rows.every((item) => item.days > 0 && item.timesheet_validated), message: `${rows.filter((item) => item.days > 0 && item.timesheet_validated).length}/${rows.length} angajati au pontaj validat.` },
      { key: "d112_payroll", label: "Stat salarial validat", ok: payrollReady, message: payrollReady ? `Stat validat pentru ${activePayrollLines.length} angajati.` : "Genereaza si valideaza statul salarial al lunii." }
    ],
    totals: {
      employees: rows.length,
      contracts: rows.filter((item) => item.has_contract).length,
      timesheet_employees: rows.filter((item) => item.days > 0).length,
      validated_timesheets: rows.filter((item) => item.timesheet_validated).length
    },
    employees: rows,
    issues
  };
}

function buildFiscalCalendar(db, query = {}) {
  const requestedYear = Number(query.an || new Date().getFullYear());
  if (!Number.isInteger(requestedYear) || requestedYear < 2000 || requestedYear > 2200) throwHttp(400, "Anul fiscal este invalid.");
  const accounting = engine.ensureAccounting(db);
  const obligations = [];
  for (let month = 1; month <= 12; month += 1) {
    const period = `${requestedYear}-${String(month).padStart(2, "0")}`;
    ["D300", "D394", "D112", "D406"].forEach((code) => {
      const run = fiscal.latestRun(accounting.declarationRuns, code, requestedYear, month, ["validat_intern", "exportat", "depus", "respins"]);
      const dueDate = declarationDueDate(requestedYear, month, code, db.settings?.fiscal || {});
      const daysRemaining = Math.ceil((new Date(`${dueDate}T23:59:59Z`) - new Date()) / 86400000);
      obligations.push({
        code,
        perioada: period,
        termen_orientativ: dueDate,
        status: run?.status || "neinceput",
        receipt_status: run?.receipt_status || null,
        run_id: run?.id || null,
        days_remaining: daysRemaining,
        alert: run?.status === "acceptat" ? "finalizat" : daysRemaining < 0 ? "depasit" : daysRemaining <= 5 ? "urgent" : daysRemaining <= 15 ? "apropiat" : "normal"
      });
    });
  }
  return {
    an: requestedYear,
    orientativ: true,
    note: "Termenele sunt orientative. Verifica inainte de depunere calendarul fiscal ANAF si eventualele exceptii sau zile nelucratoare.",
    obligations
  };
}

function buildFiscalMonthCheck(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(query.perioada || query.luna);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const declarations = buildDeclarationReadiness(db, { perioada });
  const d112 = buildD112Readiness(db, { perioada });
  const saft = buildSaftReadiness(db, { perioada });
  const activeStatuses = new Set(["validat", "partial", "achitat", "incasat", "creditata"]);
  const outgoing = accounting.invoicesOut.filter((item) => Number(item.an) === an && Number(item.luna) === luna && activeStatuses.has(String(item.status || "")));
  const eInvoices = Array.isArray(db.anaf?.invoices) ? db.anaf.invoices : [];
  const unlinked = outgoing.filter((invoice) => !eInvoices.some((item) => item.accounting_invoice_uuid === invoice.uuid));
  const rejected = eInvoices.filter((item) => String(item.data || "").startsWith(perioada) && item.status === "respinsa");
  const unclassifiedTreasury = accounting.treasury.filter((item) => Number(item.an) === an && Number(item.luna) === luna && item.status === "validat" && item.corelare_tip === "neclasificat");
  const officialValidation = (code) => [...accounting.declarationValidationRuns].reverse().find((item) => item.code === code && item.perioada === perioada && item.accepted);
  const payrollRun = [...(db.hr?.payrollRuns || [])].reverse().find((item) => item.luna === perioada && item.status === "validat" && !item.cancelled_at);
  const unpaidPayrollOrders = payrollRun ? (db.hr?.payrollPaymentOrders || []).filter((item) => item.run_id === payrollRun.id && !item.cancelled_at && item.status === "pregatit") : [];
  const checks = [
    { key: "d300", label: "D300", ok: declarations.declarations.find((item) => item.code === "D300")?.status === "pregatit", severity: "error", message: declarations.declarations.find((item) => item.code === "D300")?.description, to: "/contabilitate/tva-d300?tab=d300" },
    { key: "d394", label: "D394", ok: declarations.declarations.find((item) => item.code === "D394")?.status === "pregatit", severity: "error", message: declarations.declarations.find((item) => item.code === "D394")?.description, to: "/contabilitate/tva-d300?tab=d394" },
    { key: "d112", label: "D112", ok: d112.ready, severity: "error", message: d112.ready ? "Pontajul si statul salarial validat sunt pregatite." : d112.issues[0]?.message || "D112 necesita verificare.", to: "/contabilitate/tva-d300?tab=d112" },
    { key: "saft", label: "SAF-T", ok: saft.ready, severity: "warning", message: saft.ready ? `Acoperire tehnica ${saft.coverage}%.` : `Acoperire tehnica ${saft.coverage}%; completarile sunt inca necesare.`, to: "/contabilitate/tva-d300?tab=saft" },
    { key: "efactura_unlinked", label: "Facturi nelivrate in e-Factura", ok: unlinked.length === 0, severity: "error", message: unlinked.length ? `${unlinked.length} facturi de iesire validate nu sunt legate la e-Factura.` : "Toate facturile validate sunt legate la e-Factura.", to: "/contabilitate/anaf" },
    { key: "efactura_rejected", label: "e-Factura respinse", ok: rejected.length === 0, severity: "error", message: rejected.length ? `${rejected.length} documente sunt respinse si necesita corectie.` : "Nu exista documente respinse in perioada.", to: "/contabilitate/anaf" },
    { key: "treasury", label: "Trezorerie corelata", ok: unclassifiedTreasury.length === 0, severity: "error", message: unclassifiedTreasury.length ? `${unclassifiedTreasury.length} operatiuni validate sunt neclasificate.` : "Operatiunile validate sunt corelate.", to: "/contabilitate/trezorerie" }
    ,{ key: "payroll_obligations", label: "Obligatii salariale", ok: unpaidPayrollOrders.length === 0, severity: "warning", message: unpaidPayrollOrders.length ? `${unpaidPayrollOrders.length} ordine salariale sunt pregatite si neplatite.` : "Nu exista ordine salariale restante in aplicatie.", to: "/contabilitate/salarizare" }
    ,...['D300', 'D394', 'D112', 'D406'].map((code) => ({ key: `official_${code.toLowerCase()}`, label: `${code} validator oficial`, ok: Boolean(officialValidation(code)), severity: "warning", message: officialValidation(code) ? "Exista un XML acceptat de validator pentru perioada." : "Nu exista inca un XML acceptat de validatorul configurat.", to: code === "D406" ? `/contabilitate/audit-fiscal?luna=${perioada}` : `/contabilitate/tva-d300?tab=${code.toLowerCase()}` }))
  ];
  const blocking = checks.filter((item) => item.severity === "error" && !item.ok);
  return { perioada, ready: blocking.length === 0, status: blocking.length ? "needs_attention" : "ready", checks };
}

function declarationDueDate(reportYear, reportMonth, code, settings = {}) {
  const configured = Number(settings?.due_days?.[code]);
  const day = Number.isInteger(configured) && configured >= 1 && configured <= 31 ? configured : code === "D394" ? 30 : 25;
  const due = new Date(Date.UTC(reportYear, reportMonth, day));
  if (code === "D300" && due.getUTCMonth() === 11 && day === 25) due.setUTCDate(21);
  return due.toISOString().slice(0, 10);
}

function buildSaftReadiness(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(query.perioada || query.luna);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const issues = [];
  const companyCui = normalizeCui(db.settings?.general?.cif || db.settings?.companyCui || db.settings?.cui || "");
  if (!isValidRomanianCui(companyCui)) issues.push(issue("Companie", "CUI", "CUI-ul companiei lipseste sau este invalid.", "Completeaza CUI-ul in Setari > General."));

  const activeAccounts = accounting.chart.filter((item) => item.activ !== false);
  activeAccounts.forEach((account) => {
    if (!account.simbol || !account.denumire) issues.push(issue("Plan conturi", account.id || "-", "Cont fara simbol sau denumire.", "Completeaza contul in Plan de conturi."));
  });
  accounting.thirdParties.filter((item) => item.activ !== false).forEach((party) => {
    if (!party.denumire) issues.push(issue("Terti", party.id, "Tert fara denumire.", "Completeaza denumirea tertului."));
    if (String(party.tara || "RO").toUpperCase() === "RO" && !isValidRomanianCui(normalizeCui(party.cui))) issues.push(issue("Terti", party.cod || party.id, "Tert roman fara CUI valid.", "Completeaza CUI-ul in fisa tertului."));
  });
  const accepted = new Set(["validat", "partial", "achitat", "incasat", "creditata"]);
  const invoices = [...accounting.invoicesIn, ...accounting.invoicesOut].filter((item) => Number(item.an) === an && Number(item.luna) === luna && accepted.has(String(item.status || "")));
  invoices.forEach((invoice) => {
    if (!invoice.data) issues.push(issue("Facturi", invoice.id, "Factura fara data.", "Completeaza data documentului."));
    if (!(invoice.nr_document || invoice.numar)) issues.push(issue("Facturi", invoice.id, "Factura fara numar.", "Completeaza numarul documentului."));
  });
  const activeJournalIds = new Set(accounting.journals.filter((item) => engine.isActiveJournal(item) && Number(item.an) === an && Number(item.luna) === luna).map((item) => Number(item.id)));
  const accountSymbols = new Set(activeAccounts.map((item) => String(item.simbol)));
  const periodLines = accounting.journalLines.filter((item) => activeJournalIds.has(Number(item.journal_id)));
  periodLines.forEach((line) => {
    if (!accountSymbols.has(String(line.cont_simbol || ""))) issues.push(issue("Note contabile", line.id, `Contul ${line.cont_simbol || "-"} nu exista in plan.`, "Corecteaza linia notei sau adauga contul."));
  });
  const materials = Array.isArray(db.inventory?.materials) ? db.inventory.materials.filter((item) => item.active !== false && item.activ !== false) : [];
  materials.forEach((material) => {
    if (!(material.cod || material.code)) issues.push(issue("Produse", material.id, "Material fara cod intern.", "Completeaza codul materialului in Gestiune."));
  });
  const taxDocuments = invoices.filter((item) => Number.isFinite(Number(item.tva_procent)) && Number(item.tva_procent) >= 0);
  invoices.filter((item) => !Number.isFinite(Number(item.tva_procent)) || Number(item.tva_procent) < 0).forEach((item) => {
    issues.push(issue("Taxe", item.nr_document || item.numar || item.id, "Factura nu are cota TVA mapata.", "Completeaza cota TVA pe factura."));
  });
  const fixedAssets = accounting.fixedAssets.filter((item) => item.active !== false && item.status !== "casat");
  fixedAssets.forEach((item) => {
    if (!item.inventory_number && !item.nr_inventar) issues.push(issue("Mijloace fixe", item.id, "Mijloc fix fara numar de inventar.", "Completeaza fisa mijlocului fix."));
    if (!(Number(item.acquisition_value || item.valoare_intrare || 0) > 0)) issues.push(issue("Mijloace fixe", item.id, "Mijloc fix fara valoare de intrare.", "Completeaza valoarea de intrare."));
  });
  const treasury = accounting.treasury.filter((item) => Number(item.an) === an && Number(item.luna) === luna && item.status === "validat");
  treasury.forEach((item) => {
    if (!item.cont_trezorerie || !item.cont_corespondent) issues.push(issue("Trezorerie", item.nr_document || item.id, "Operatiune fara conturi complete.", "Completeaza contul de trezorerie si contul corespondent."));
  });
  const activeSaftSchema = accounting.anafSchemas.find((item) => item.code === "SAF-T" && item.active !== false);
  if (!activeSaftSchema) issues.push(issue("Schema", "SAF-T", "Schema oficiala SAF-T nu este incarcata.", "Incarca arhiva ZIP sau XSD din sectiunea Scheme oficiale ANAF."));

  const areas = [
    area("Companie", 1, isValidRomanianCui(companyCui) ? 1 : 0),
    area("Plan de conturi", activeAccounts.length, activeAccounts.filter((item) => item.simbol && item.denumire).length),
    area("Terti", accounting.thirdParties.filter((item) => item.activ !== false).length, accounting.thirdParties.filter((item) => item.activ !== false && item.denumire && (String(item.tara || "RO").toUpperCase() !== "RO" || isValidRomanianCui(normalizeCui(item.cui)))).length),
    area("Facturi perioada", invoices.length, invoices.filter((item) => item.data && (item.nr_document || item.numar)).length),
    area("Linii contabile", periodLines.length, periodLines.filter((item) => accountSymbols.has(String(item.cont_simbol || ""))).length),
    area("Produse/materiale", materials.length, materials.filter((item) => item.cod || item.code).length),
    area("Taxe", invoices.length, taxDocuments.length),
    area("Mijloace fixe", fixedAssets.length, fixedAssets.filter((item) => (item.inventory_number || item.nr_inventar) && Number(item.acquisition_value || item.valoare_intrare || 0) > 0).length),
    area("Trezorerie", treasury.length, treasury.filter((item) => item.cont_trezorerie && item.cont_corespondent).length),
    area("Schema SAF-T", 1, activeSaftSchema ? 1 : 0)
  ];
  const total = areas.reduce((sum, item) => sum + item.total, 0);
  const mapped = areas.reduce((sum, item) => sum + item.mapped, 0);
  return {
    perioada,
    ready: issues.length === 0 && total > 0,
    coverage: total ? Math.round(mapped * 10000 / total) / 100 : 0,
    areas,
    issues,
    active_schema: activeSaftSchema ? { original_name: activeSaftSchema.original_name, sha256: activeSaftSchema.sha256 } : null,
    note: "Diagnostic tehnic de mapare. Generarea si validarea XML D406 necesita schema ANAF aplicabila perioadei."
  };
}

function monthParts(value) {
  const current = new Date();
  const [year, month] = String(value || "").split("-").map(Number);
  return [year || current.getFullYear(), month || current.getMonth() + 1];
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeCui(value) {
  return String(value || "").trim().toUpperCase().replace(/^RO/, "").replace(/\s+/g, "");
}

function isValidRomanianCui(value) {
  return /^\d{2,10}$/.test(String(value || ""));
}

function issue(areaName, id, message, action) {
  return { area: areaName, id: String(id || "-"), message, action };
}

function area(label, total, mapped) {
  return { label, total, mapped, missing: Math.max(0, total - mapped), ok: total === mapped };
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

module.exports = registerDeclarationRoutes;
module.exports.buildD394Data = buildD394Data;
module.exports.buildDeclarationReadiness = buildDeclarationReadiness;
module.exports.buildSaftReadiness = buildSaftReadiness;
module.exports.buildD112Readiness = buildD112Readiness;
module.exports.buildFiscalCalendar = buildFiscalCalendar;
module.exports.buildFiscalMonthCheck = buildFiscalMonthCheck;
module.exports.declarationDueDate = declarationDueDate;

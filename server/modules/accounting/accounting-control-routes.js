const xlsx = require("xlsx");
const multer = require("multer");
const xml2js = require("xml2js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const engine = require("./accounting-engine");
const operations = require("./operations-routes");
const declarations = require("./declaration-routes");
const schemaProfiles = require("./schema-profiles");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

const xmlUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const schemaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function registerAccountingControlRoutes(router, middleware) {
  const { requireAccountingView, requireAccountingPost, requireAccountingManage, requireAccountingReports } = middleware;

  router.get("/accounting/inventory-invoice-reconciliation", requireAccountingView, (req, res) => {
    res.status(200).json(buildInventoryInvoiceReconciliation(req.auth.db, req.query.perioada));
  });

  router.get("/accounting/credit-notes", requireAccountingView, (req, res) => {
    const notes = engine.ensureAccounting(req.auth.db).creditNotes
      .filter((item) => !req.query.furnizor_id || String(item.furnizor_id) === String(req.query.furnizor_id))
      .filter((item) => !req.query.invoice_id || String(item.invoice_id) === String(req.query.invoice_id))
      .filter((item) => req.query.status ? item.status === req.query.status : item.status !== "anulat")
      .sort((a, b) => String(b.data || b.created_at || "").localeCompare(String(a.data || a.created_at || "")));
    res.status(200).json({ creditNotes: notes });
  });

  router.post("/accounting/inventory-invoice-reconciliation/:receiptId/confirm", requireAccountingPost, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const receipt = (req.auth.db.procurementReceipts || []).find((item) => String(item.id) === String(req.params.receiptId) && !item.canceled && !item.deleted);
      if (!receipt) throwHttp(404, "Receptia nu a fost gasita.");
      const invoice = accounting.invoicesIn.find((item) => String(item.id) === String(req.body?.invoice_id));
      if (!invoice || ["anulat", "stornat"].includes(invoice.status)) throwHttp(404, "Factura furnizor nu a fost gasita sau este anulata.");
      if (receipt.accounting_invoice_id && String(receipt.accounting_invoice_id) !== String(invoice.id)) throwHttp(409, "Receptia este deja legata de alta factura.");
      const alreadyLinked = (invoice.source_receipt_ids || []).some((id) => String(id) === String(receipt.id));
      receipt.accounting_invoice_id = invoice.id;
      receipt.accounting_invoice_uuid = invoice.uuid || "";
      receipt.accounting_linked_at = new Date().toISOString();
      receipt.accounting_linked_by = req.auth.user?.id || "";
      invoice.source_receipt_ids = alreadyLinked ? invoice.source_receipt_ids : [...(invoice.source_receipt_ids || []), receipt.id];
      invoice.updated_at = new Date().toISOString();
      addAudit(req.auth.db, req.auth.user, "accounting_inventory_invoice_link", `${receipt.orderNo || receipt.id} / ${invoice.nr_document || invoice.id}`);
      writeDb(req.auth.db);
      res.status(200).json({ receipt, invoice });
    } catch (error) { next(error); }
  });

  router.post("/accounting/inventory-invoice-reconciliation/:receiptId/create-invoice", requireAccountingPost, (req, res, next) => {
    try {
      const db = req.auth.db;
      const receipt = (db.procurementReceipts || []).find((item) => String(item.id) === String(req.params.receiptId) && !item.canceled && !item.deleted);
      if (!receipt) throwHttp(404, "Receptia nu a fost gasita.");
      if (receipt.accounting_invoice_id) throwHttp(409, "Receptia este deja legata de o factura.");
      const accounting = engine.ensureAccounting(db);
      const party = resolveSupplierParty(db, accounting, receipt.supplier || receipt.furnizor || "Furnizor neidentificat", req.body?.cui || "");
      const invoice = createInvoiceFromReceipt(accounting, receipt, party, req.auth.user);
      engine.checkPeriodOpen(db, invoice.an, invoice.luna);
      if (accounting.invoicesIn.some((item) => String(item.furnizor_id) === String(party.id) && normalizeText(item.nr_document) === normalizeText(invoice.nr_document) && !["anulat", "stornat"].includes(item.status))) throwHttp(409, "Factura exista deja pentru acest furnizor.");
      accounting.invoicesIn.push(invoice);
      linkReceiptInvoice(receipt, invoice, req.auth.user);
      addAudit(db, req.auth.user, "accounting_invoice_from_receipt", `${receipt.nr_nir || receipt.orderNo || receipt.id} / ${invoice.nr_document}`);
      writeDb(db);
      res.status(201).json({ invoice, receipt, party });
    } catch (error) { next(error); }
  });

  router.post("/accounting/inventory-invoice-reconciliation/create-invoice-batch", requireAccountingPost, (req, res, next) => {
    try {
      const db = req.auth.db;
      const ids = new Set((req.body?.receipt_ids || []).map(String));
      if (!ids.size) throwHttp(400, "Selecteaza cel putin un NIR.");
      const receipts = (db.procurementReceipts || []).filter((item) => ids.has(String(item.id)) && !item.canceled && !item.deleted);
      if (receipts.length !== ids.size) throwHttp(404, "Unul dintre NIR-urile selectate nu mai exista.");
      if (receipts.some((item) => item.accounting_invoice_id)) throwHttp(409, "Unul dintre NIR-uri este deja legat de o factura.");
      const supplierNames = [...new Set(receipts.map((item) => normalizeText(item.supplier || item.furnizor)).filter(Boolean))];
      if (supplierNames.length > 1) throwHttp(409, "Factura multipla poate grupa numai NIR-uri ale aceluiasi furnizor.");
      const accounting = engine.ensureAccounting(db);
      const party = resolveSupplierParty(db, accounting, receipts[0].supplier || receipts[0].furnizor || "Furnizor neidentificat", req.body?.cui || "");
      const document = String(req.body?.nr_document || "").trim();
      if (!document) throwHttp(400, "Numarul facturii furnizor este obligatoriu.");
      if (accounting.invoicesIn.some((item) => String(item.furnizor_id) === String(party.id) && normalizeText(item.nr_document) === normalizeText(document) && !["anulat", "stornat"].includes(item.status))) throwHttp(409, "Factura exista deja pentru acest furnizor.");
      const invoice = createInvoiceFromReceipts(accounting, receipts, party, req.auth.user, req.body);
      engine.checkPeriodOpen(db, invoice.an, invoice.luna);
      accounting.invoicesIn.push(invoice);
      receipts.forEach((receipt) => linkReceiptInvoice(receipt, invoice, req.auth.user));
      addAudit(db, req.auth.user, "accounting_invoice_from_receipts", `${document} / ${receipts.length} NIR-uri / ${invoice.total}`);
      writeDb(db);
      res.status(201).json({ invoice, receipts, party, variance: invoice.receipt_variance });
    } catch (error) { next(error); }
  });

  router.post("/accounting/inventory-returns/:returnId/storno-linked-invoice", requireAccountingPost, (req, res, next) => {
    try {
      const db = req.auth.db;
      const returnRecord = (db.procurementReturns || []).find((item) => String(item.id) === String(req.params.returnId));
      if (!returnRecord) throwHttp(404, "Returul nu a fost gasit.");
      if (!returnRecord.full_return) throwHttp(409, "Storno automat este permis doar pentru returul integral. Pentru retur partial inregistreaza nota de credit furnizor.");
      if (returnRecord.accounting_resolved_at) throwHttp(409, "Returul a fost deja rezolvat contabil.");
      const receipt = (db.procurementReceipts || []).find((item) => String(item.id) === String(returnRecord.receipt_id));
      const accounting = engine.ensureAccounting(db);
      const invoice = accounting.invoicesIn.find((item) => String(item.id) === String(receipt?.accounting_invoice_id));
      if (!invoice) throwHttp(404, "Factura legata de NIR nu a fost gasita.");
      if (Number(invoice.achitat || 0) > 0) throwHttp(409, "Factura are plati inregistrate. Corecteaza mai intai plata din Trezorerie, apoi reia storno.");
      let journal = null;
      if (invoice.status === "draft") {
        invoice.status = "anulat";
        invoice.cancelled_at = new Date().toISOString();
        invoice.cancelled_by = req.auth.user?.id || "";
        invoice.cancelled_reason = `Retur integral ${returnRecord.id}: ${returnRecord.reason}`;
      } else if (invoice.status === "validat" && invoice.journal_id) {
        journal = engine.stornoJournal(db, req.auth.user, invoice.journal_id);
        invoice.status = "stornat";
        invoice.storno_journal_id = journal.id;
        invoice.stornat_la = new Date().toISOString();
        invoice.stornat_de = req.auth.user?.id || "";
      } else {
        throwHttp(409, "Factura trebuie sa fie draft sau validata si neachitata pentru storno automat.");
      }
      returnRecord.accounting_resolved_at = new Date().toISOString();
      returnRecord.accounting_resolved_by = req.auth.user?.id || "";
      returnRecord.accounting_action = invoice.status === "anulat" ? "anulare_draft" : "storno";
      addAudit(db, req.auth.user, "accounting_inventory_return_storno", `${returnRecord.id} / ${invoice.nr_document}`);
      writeDb(db);
      res.status(200).json({ returnRecord, invoice, journal });
    } catch (error) { next(error); }
  });

  router.post("/accounting/inventory-returns/:returnId/credit-note", requireAccountingPost, (req, res, next) => {
    try {
      const note = createCreditNoteFromReturn(req.auth.db, req.auth.user, req.params.returnId, req.body || {});
      addAudit(req.auth.db, req.auth.user, "accounting_credit_note_create", `${note.nr_document} / ${note.total}`);
      writeDb(req.auth.db);
      res.status(201).json({ creditNote: note });
    } catch (error) { next(error); }
  });

  router.patch("/accounting/credit-notes/:uuid", requireAccountingPost, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const note = findCreditNote(accounting, req.params.uuid);
      if (!["draft", "devalidat"].includes(note.status)) throwHttp(409, "Doar nota de credit draft sau devalidata se poate edita.");
      const data = String(req.body?.data || note.data);
      const [an, luna] = dateParts(data);
      engine.checkPeriodOpen(req.auth.db, an, luna);
      note.nr_document = String(req.body?.nr_document || note.nr_document).trim();
      if (!note.nr_document) throwHttp(400, "Numarul notei de credit este obligatoriu.");
      note.data = data;
      note.an = an;
      note.luna = luna;
      note.observatii = String(req.body?.observatii ?? note.observatii ?? "").trim();
      note.updated_at = new Date().toISOString();
      addAudit(req.auth.db, req.auth.user, "accounting_credit_note_update", note.nr_document);
      writeDb(req.auth.db);
      res.status(200).json({ creditNote: note });
    } catch (error) { next(error); }
  });

  router.post("/accounting/credit-notes/:uuid/validate", requireAccountingPost, (req, res, next) => {
    try {
      const note = validateCreditNote(req.auth.db, req.auth.user, req.params.uuid);
      addAudit(req.auth.db, req.auth.user, "accounting_credit_note_validate", `${note.nr_document} / ${note.total}`);
      writeDb(req.auth.db);
      res.status(200).json({ creditNote: note });
    } catch (error) { next(error); }
  });

  router.post("/accounting/credit-notes/:uuid/devalidate", requireAccountingPost, (req, res, next) => {
    try {
      const note = devalidateCreditNote(req.auth.db, req.auth.user, req.params.uuid, req.body?.motiv);
      addAudit(req.auth.db, req.auth.user, "accounting_credit_note_devalidate", note.nr_document);
      writeDb(req.auth.db);
      res.status(200).json({ creditNote: note });
    } catch (error) { next(error); }
  });

  router.post("/accounting/credit-notes/:uuid/storno", requireAccountingPost, (req, res, next) => {
    try {
      const note = stornoCreditNote(req.auth.db, req.auth.user, req.params.uuid);
      addAudit(req.auth.db, req.auth.user, "accounting_credit_note_storno", note.nr_document);
      writeDb(req.auth.db);
      res.status(200).json({ creditNote: note });
    } catch (error) { next(error); }
  });

  router.delete("/accounting/credit-notes/:uuid", requireAccountingPost, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const note = findCreditNote(accounting, req.params.uuid);
      if (note.status !== "draft") throwHttp(409, "Doar nota de credit draft poate fi anulata direct.");
      note.status = "anulat";
      note.cancelled_at = new Date().toISOString();
      note.cancelled_by = req.auth.user?.id || "";
      note.cancelled_reason = String(req.body?.motiv || "Anulare nota de credit").trim();
      releaseCreditNoteReturn(req.auth.db, note);
      addAudit(req.auth.db, req.auth.user, "accounting_credit_note_cancel", note.nr_document);
      writeDb(req.auth.db);
      res.status(200).json({ creditNote: note });
    } catch (error) { next(error); }
  });

  router.post("/accounting/efactura/import", requireAccountingPost, xmlUpload.single("file"), async (req, res, next) => {
    try {
      if (!req.file?.buffer) throwHttp(400, "Selecteaza fisierul XML e-Factura primit.");
      const parsed = await parseUblInvoice(req.file.buffer);
      const accounting = engine.ensureAccounting(req.auth.db);
      const party = resolveSupplierParty(req.auth.db, accounting, parsed.supplier_name, parsed.supplier_cui);
      const duplicate = accounting.invoicesIn.find((item) => String(item.furnizor_id) === String(party.id) && String(item.nr_document || "").toLowerCase() === parsed.document.toLowerCase() && !["anulat", "stornat"].includes(item.status));
      if (duplicate) throwHttp(409, `Factura ${parsed.document} exista deja pentru acest furnizor.`);
      const [an, luna] = dateParts(parsed.date);
      engine.checkPeriodOpen(req.auth.db, an, luna);
      const invoice = {
        id: engine.nextNumericId(accounting.invoicesIn), uuid: crypto.randomUUID(), an, luna,
        nr_intern: accounting.invoicesIn.filter((item) => Number(item.an) === an).length + 1,
        nr_document: parsed.document, furnizor_id: party.id, data: parsed.date, data_scadenta: parsed.due_date || parsed.date,
        valoare: parsed.base, tva_procent: parsed.lines[0]?.tva_procent ?? 21, tva: parsed.vat, total: parsed.total,
        achitat: 0, neachitat: parsed.total, cont_cheltuiala: String(req.body?.cont_cheltuiala || "628"),
        explicatie: `Import e-Factura ${parsed.document}`, lines: parsed.lines, status: "draft", journal_id: null,
        source: "efactura_import", source_file: req.file.originalname, source_xml_hash: crypto.createHash("sha256").update(req.file.buffer).digest("hex"),
        created_by: req.auth.user?.id || "", created_at: new Date().toISOString()
      };
      accounting.invoicesIn.push(invoice);
      addAudit(req.auth.db, req.auth.user, "accounting_efactura_import", `${parsed.document} / ${party.denumire} / ${parsed.total}`);
      writeDb(req.auth.db);
      res.status(201).json({ invoice, party, parsed: { document: parsed.document, date: parsed.date, total: parsed.total, lines: parsed.lines.length } });
    } catch (error) { next(error); }
  });

  router.get("/accounting/fixed-assets/categories", requireAccountingView, (req, res) => {
    const accounting = engine.ensureAccounting(req.auth.db);
    res.status(200).json({ categories: accounting.fixedAssetCategories.filter((item) => item.active !== false) });
  });

  router.post("/accounting/fixed-assets/categories", requireAccountingManage, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const code = String(req.body?.code || "").trim();
      const name = String(req.body?.name || "").trim();
      const months = Number(req.body?.default_life_months || 0);
      if (!code || !name || months <= 0) throwHttp(400, "Completeaza codul, denumirea si durata categoriei.");
      if (accounting.fixedAssetCategories.some((item) => item.code === code && item.active !== false)) throwHttp(409, "Categoria exista deja.");
      const category = { id: engine.nextNumericId(accounting.fixedAssetCategories), code, name, default_life_months: months, active: true, system: false, created_at: new Date().toISOString() };
      accounting.fixedAssetCategories.push(category);
      addAudit(req.auth.db, req.auth.user, "accounting_fixed_asset_category_create", `${code} ${name}`);
      writeDb(req.auth.db);
      res.status(201).json({ category });
    } catch (error) { next(error); }
  });

  router.post("/accounting/fixed-assets/inventory", requireAccountingManage, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const assetIds = new Set((req.body?.asset_ids || []).map(String));
      const assets = accounting.fixedAssets.filter((item) => item.status === "activ" && (!assetIds.size || assetIds.has(String(item.uuid || item.id))));
      if (!assets.length) throwHttp(400, "Nu exista mijloace fixe active pentru inventariere.");
      const inventory = { id: engine.nextNumericId(accounting.fixedAssetInventories), uuid: crypto.randomUUID(), date: String(req.body?.date || engine.localDate(new Date())), commission: String(req.body?.commission || "").trim(), status: "finalizat", items: assets.map((item) => ({ asset_id: item.id, inventory_no: item.inventory_no, name: item.name, found: true, location: item.location || "", custodian: item.custodian || "" })), created_by: req.auth.user?.id || "", created_at: new Date().toISOString() };
      accounting.fixedAssetInventories.push(inventory);
      addAudit(req.auth.db, req.auth.user, "accounting_fixed_asset_inventory", `${inventory.date} / ${assets.length} pozitii`);
      writeDb(req.auth.db);
      res.status(201).json({ inventory });
    } catch (error) { next(error); }
  });

  router.get("/accounting/fixed-assets/:uuid/disposal-report", requireAccountingReports, (req, res, next) => {
    try {
      const asset = findAsset(req.auth.db, req.params.uuid);
      const events = engine.ensureAccounting(req.auth.db).fixedAssetEvents.filter((item) => String(item.asset_id) === String(asset.id));
      const last = events.slice().reverse().find((item) => ["casare", "vanzare", "scoatere_din_evidenta"].includes(item.action));
      res.type("html").send(renderDisposalReport(asset, last, req.auth.user));
    } catch (error) { next(error); }
  });

  router.get("/accounting/declarations/schemas", requireAccountingReports, (req, res) => {
    const schemas = [...schemaProfiles.bundled(), ...engine.ensureAccounting(req.auth.db).anafSchemas]
      .sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
    res.status(200).json({ schemas });
  });

  router.get("/accounting/declarations/schemas/resolve", requireAccountingReports, (req, res, next) => {
    try {
      const period = String(req.query.perioada || req.query.luna || "").slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
      const schema = schemaProfiles.select(engine.ensureAccounting(req.auth.db), req.query.code, period);
      res.json({ perioada: period, profile: schemaProfiles.profile(schema), ready: Boolean(schema) });
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/schemas", requireAccountingManage, schemaUpload.single("file"), (req, res, next) => {
    try {
      if (!req.file?.buffer) throwHttp(400, "Selecteaza schema ANAF in format XSD sau ZIP.");
      const extension = path.extname(req.file.originalname || "").toLowerCase();
      if (![".xsd", ".zip"].includes(extension)) throwHttp(422, "Sunt acceptate doar fisiere XSD sau ZIP.");
      const code = String(req.body?.code || "").trim().toUpperCase();
      if (!/^D\d{3}$/.test(code) && code !== "SAF-T") throwHttp(400, "Codul declaratiei trebuie sa fie D300, D394, D112 sau SAF-T.");
      const directory = path.resolve(__dirname, "../../../storage/anaf-schemas");
      fs.mkdirSync(directory, { recursive: true });
      const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
      const metadata = schemaProfiles.inspect(req.file.originalname, req.file.buffer);
      const validFrom = String(req.body?.valid_from || "").trim();
      const validTo = String(req.body?.valid_to || "").trim();
      if (validFrom && !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) throwHttp(400, "Valabil de la trebuie sa aiba formatul YYYY-MM-DD.");
      if (validTo && !/^\d{4}-\d{2}-\d{2}$/.test(validTo)) throwHttp(400, "Valabil pana la trebuie sa aiba formatul YYYY-MM-DD.");
      const fileName = `${code.replace(/[^A-Z0-9-]/g, "_")}-${Date.now()}${extension}`;
      fs.writeFileSync(path.join(directory, fileName), req.file.buffer);
      const accounting = engine.ensureAccounting(req.auth.db);
      const schema = {
        id: engine.nextNumericId(accounting.anafSchemas), uuid: crypto.randomUUID(), code,
        original_name: req.file.originalname, file_name: fileName, file_path: `storage/anaf-schemas/${fileName}`,
        sha256: hash, active: true, valid_from: validFrom, valid_to: validTo,
        order_reference: String(req.body?.order_reference || "").trim().slice(0, 200),
        source_url: String(req.body?.source_url || "").trim().slice(0, 1000),
        schema_metadata: metadata, schema_json: JSON.stringify(metadata),
        uploaded_by: req.auth.user?.id || "", uploaded_at: new Date().toISOString()
      };
      accounting.anafSchemas.push(schema);
      addAudit(req.auth.db, req.auth.user, "accounting_anaf_schema_upload", `${code} / ${req.file.originalname}`);
      writeDb(req.auth.db);
      res.status(201).json({ schema });
    } catch (error) { next(error); }
  });

  router.get("/accounting/integrity-audit", requireAccountingReports, (req, res) => {
    res.status(200).json(buildIntegrityAudit(req.auth.db, req.query.perioada));
  });

  router.get("/accounting/integrity-audit/export", requireAccountingReports, (req, res, next) => {
    try {
      const data = buildIntegrityAudit(req.auth.db, req.query.perioada);
      const workbook = xlsx.utils.book_new();
      const summary = xlsx.utils.aoa_to_sheet([
        ["Audit integritate contabila", data.perioada, data.status], [],
        ["Control", "Severitate", "Valoare", "Mesaj"],
        ...data.checks.map((row) => [row.label, row.severity, row.value, row.message])
      ]);
      summary["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 14 }, { wch: 90 }];
      xlsx.utils.book_append_sheet(workbook, summary, "Sumar");
      const details = xlsx.utils.aoa_to_sheet([
        ["Zona", "Identificator", "Problema", "Rezolvare"],
        ...data.issues.map((row) => [row.area, row.id, row.message, row.action])
      ]);
      details["!cols"] = [{ wch: 28 }, { wch: 24 }, { wch: 80 }, { wch: 80 }];
      xlsx.utils.book_append_sheet(workbook, details, "Probleme");
      sendWorkbook(res, workbook, `Audit_contabil_${data.perioada.replace("-", "_")}.xlsx`);
    } catch (error) { next(error); }
  });

  router.get("/accounting/fixed-assets/export", requireAccountingReports, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const workbook = xlsx.utils.book_new();
      const rows = [
        ["Registrul mijloacelor fixe"], [],
        ["Nr. inventar", "Denumire", "Data achizitie", "Inceput amortizare", "Valoare intrare", "Amortizare cumulata", "Valoare neta", "Durata luni", "Locatie", "Status"],
        ...accounting.fixedAssets.map((asset) => [asset.inventory_no, asset.name, asset.acquisition_date, asset.depreciation_start, asset.acquisition_value, asset.accumulated_depreciation, asset.net_value, asset.useful_life_months, asset.location || "", asset.status])
      ];
      const sheet = xlsx.utils.aoa_to_sheet(rows);
      sheet["!cols"] = [{ wch: 16 }, { wch: 42 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 28 }, { wch: 14 }];
      xlsx.utils.book_append_sheet(workbook, sheet, "Registru MF");
      sendWorkbook(res, workbook, `Registru_mijloace_fixe_${engine.localDate(new Date())}.xlsx`);
    } catch (error) { next(error); }
  });

  router.get("/accounting/fixed-assets/:uuid/schedule", requireAccountingReports, (req, res, next) => {
    try {
      const asset = findAsset(req.auth.db, req.params.uuid);
      res.status(200).json(buildDepreciationSchedule(asset));
    } catch (error) { next(error); }
  });

  router.get("/accounting/fixed-assets/:uuid/print", requireAccountingReports, (req, res, next) => {
    try {
      const asset = findAsset(req.auth.db, req.params.uuid);
      const schedule = buildDepreciationSchedule(asset);
      const events = engine.ensureAccounting(req.auth.db).fixedAssetEvents.filter((item) => String(item.asset_id) === String(asset.id));
      res.type("html").send(renderAssetSheet(asset, schedule, events));
    } catch (error) { next(error); }
  });

  router.get("/accounting/declarations/control-export", requireAccountingReports, (req, res, next) => {
    try {
      const readiness = declarations.buildDeclarationReadiness(req.auth.db, req.query);
      const accounting = engine.ensureAccounting(req.auth.db);
      const [an, luna] = monthParts(readiness.perioada);
      const history = accounting.declarationRuns.filter((item) => Number(item.an) === an && Number(item.luna) === luna);
      const workbook = xlsx.utils.book_new();
      const sheet = xlsx.utils.aoa_to_sheet([
        ["Control declaratii", readiness.perioada, readiness.status], [],
        ["Control", "Status", "Mesaj"],
        ...readiness.checks.map((row) => [row.label, row.ok ? "OK" : "Necesita verificare", row.message]), [],
        ["Declaratie", "Status", "Validata la", "Recipisa", "Depusa la"],
        ...history.map((row) => [row.code, row.status, row.validated_at || "", row.recipisa || "", row.submitted_at || ""])
      ]);
      sheet["!cols"] = [{ wch: 34 }, { wch: 24 }, { wch: 90 }, { wch: 28 }, { wch: 22 }];
      xlsx.utils.book_append_sheet(workbook, sheet, "Control declaratii");
      sendWorkbook(res, workbook, `Control_declaratii_${readiness.perioada.replace("-", "_")}.xlsx`);
    } catch (error) { next(error); }
  });
}

function findCreditNote(accounting, id) {
  const note = accounting.creditNotes.find((item) => String(item.id) === String(id) || String(item.uuid) === String(id));
  if (!note) throwHttp(404, "Nota de credit nu a fost gasita.");
  return note;
}

function createCreditNoteFromReturn(db, user, returnId, input = {}) {
  const accounting = engine.ensureAccounting(db);
  const returnRecord = (db.procurementReturns || []).find((item) => String(item.id) === String(returnId));
  if (!returnRecord) throwHttp(404, "Returul nu a fost gasit.");
  if (!returnRecord.requires_credit_note) throwHttp(409, "Returul nu are o factura furnizor legata.");
  if (returnRecord.accounting_resolved_at) throwHttp(409, "Returul este deja rezolvat contabil.");
  const existing = accounting.creditNotes.find((item) => String(item.return_id) === String(returnRecord.id) && !["anulat", "stornat"].includes(item.status));
  if (existing) throwHttp(409, `Returul are deja nota de credit ${existing.nr_document || existing.id}.`);
  const receipt = (db.procurementReceipts || []).find((item) => String(item.id) === String(returnRecord.receipt_id));
  const invoice = accounting.invoicesIn.find((item) => String(item.id) === String(receipt?.accounting_invoice_id));
  if (!invoice || ["anulat", "stornat"].includes(invoice.status)) throwHttp(404, "Factura activa legata de retur nu a fost gasita.");
  const data = String(input.data || engine.localDate(new Date()));
  const [an, luna] = dateParts(data);
  engine.checkPeriodOpen(db, an, luna);
  const document = String(input.nr_document || "").trim();
  if (!document) throwHttp(400, "Numarul notei de credit este obligatoriu.");
  const lines = (returnRecord.lines || []).map((line, index) => ({
    nr_crt: index + 1,
    denumire: line.materialName || line.denumire || "Material returnat",
    um: line.unit || "buc",
    cantitate: Number(line.cantitate || 0),
    pret_unitar: money(line.pret_unitar || 0),
    valoare: money(line.valoare || 0),
    tva_procent: Number(line.cota_tva ?? line.tva_procent ?? 21),
    tva: money(line.valoare_tva || 0),
    total: money(line.total || Number(line.valoare || 0) + Number(line.valoare_tva || 0)),
    cont: String(line.cont || line.cont_stoc || "3028"),
    material_id: line.material_id || null
  }));
  if (!lines.length || lines.some((line) => line.cantitate <= 0 || line.total <= 0)) throwHttp(422, "Returul nu contine linii valorice valide pentru nota de credit.");
  const note = {
    id: engine.nextNumericId(accounting.creditNotes), uuid: crypto.randomUUID(), nr_document: document, data, an, luna,
    furnizor_id: invoice.furnizor_id, invoice_id: invoice.id, invoice_uuid: invoice.uuid || "", return_id: returnRecord.id,
    receipt_id: receipt.id, valoare: money(lines.reduce((sum, line) => sum + line.valoare, 0)),
    tva: money(lines.reduce((sum, line) => sum + line.tva, 0)), total: money(lines.reduce((sum, line) => sum + line.total, 0)),
    lines, observatii: String(input.observatii || returnRecord.reason || "").trim(), status: "draft", journal_id: null,
    created_by: user?.id || "", created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  accounting.creditNotes.push(note);
  returnRecord.credit_note_id = note.id;
  returnRecord.credit_note_uuid = note.uuid;
  returnRecord.accounting_action = "nota_credit_draft";
  return note;
}

function validateCreditNote(db, user, id) {
  const accounting = engine.ensureAccounting(db);
  const note = findCreditNote(accounting, id);
  if (!["draft", "devalidat"].includes(note.status)) throwHttp(409, "Doar nota de credit draft sau devalidata se poate valida.");
  const invoice = accounting.invoicesIn.find((item) => String(item.id) === String(note.invoice_id));
  if (!invoice || !["validat", "partial", "achitat", "creditata"].includes(invoice.status)) throwHttp(409, "Valideaza mai intai factura furnizor legata.");
  engine.checkPeriodOpen(db, note.an, note.luna);
  const activeOtherCredits = accounting.creditNotes.filter((item) => String(item.invoice_id) === String(invoice.id) && String(item.id) !== String(note.id) && item.status === "validat");
  const existingCredit = money(activeOtherCredits.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const available = money(Number(invoice.total || 0) - Number(invoice.achitat || 0) - existingCredit);
  if (note.total > available + 0.01) throwHttp(409, `Nota de credit depaseste soldul disponibil al facturii (${available.toFixed(2)} RON). Corecteaza mai intai plata din Trezorerie.`);
  const party = accounting.thirdParties.find((item) => String(item.id) === String(note.furnizor_id));
  if (!party) throwHttp(404, "Furnizorul notei de credit nu a fost gasit.");
  const supplierAccount = party.cont_analitic_furnizor || engine.generateAnalyticAccount(db, party, "furnizor");
  party.cont_analitic_furnizor = supplierAccount;
  const journal = engine.createJournal(db, user, {
    an: note.an, luna: note.luna, data: note.data, nr_document: note.nr_document,
    tip_document: "nota_credit_furnizor", document_ref_id: note.id, document_ref_tip: "accounting_credit_notes",
    explicatie: `Nota de credit ${note.nr_document}`,
    lines: [
      { cont: supplierAccount, debit: note.total, tert_id: party.id, tert_tip: "furnizor", explicatie: `Reducere datorie ${party.denumire}` },
      ...note.lines.map((line) => ({ cont: line.cont || "3028", credit: line.valoare, tert_id: party.id, tert_tip: "furnizor", explicatie: line.denumire })),
      ...(note.tva > 0 ? [{ cont: "4426", credit: note.tva, tert_id: party.id, tert_tip: "furnizor", explicatie: "Corectie TVA deductibila" }] : [])
    ]
  });
  note.journal_id = journal.id;
  note.status = "validat";
  note.validated_at = new Date().toISOString();
  note.validated_by = user?.id || "";
  note.updated_at = note.validated_at;
  recalculateInvoiceCredits(accounting, invoice);
  const returnRecord = (db.procurementReturns || []).find((item) => String(item.id) === String(note.return_id));
  if (returnRecord) {
    returnRecord.accounting_resolved_at = note.validated_at;
    returnRecord.accounting_resolved_by = user?.id || "";
    returnRecord.accounting_action = "nota_credit_validata";
  }
  return note;
}

function devalidateCreditNote(db, user, id, reason = "") {
  const accounting = engine.ensureAccounting(db);
  const note = findCreditNote(accounting, id);
  if (note.status !== "validat" || !note.journal_id) throwHttp(409, "Doar nota de credit validata se poate devalida.");
  engine.devalidateJournal(db, user, note.journal_id, reason);
  note.status = "devalidat";
  note.devalidated_at = new Date().toISOString();
  note.devalidated_by = user?.id || "";
  note.devalidation_reason = String(reason || "").trim();
  const invoice = accounting.invoicesIn.find((item) => String(item.id) === String(note.invoice_id));
  if (invoice) recalculateInvoiceCredits(accounting, invoice);
  releaseCreditNoteReturn(db, note);
  return note;
}

function stornoCreditNote(db, user, id) {
  const accounting = engine.ensureAccounting(db);
  const note = findCreditNote(accounting, id);
  if (note.status !== "validat" || !note.journal_id) throwHttp(409, "Doar nota de credit validata se poate storna.");
  const journal = engine.stornoJournal(db, user, note.journal_id);
  note.status = "stornat";
  note.storno_journal_id = journal.id;
  note.stornat_at = new Date().toISOString();
  note.stornat_by = user?.id || "";
  const invoice = accounting.invoicesIn.find((item) => String(item.id) === String(note.invoice_id));
  if (invoice) recalculateInvoiceCredits(accounting, invoice);
  releaseCreditNoteReturn(db, note);
  return note;
}

function recalculateInvoiceCredits(accounting, invoice) {
  const credit = money(accounting.creditNotes.filter((item) => String(item.invoice_id) === String(invoice.id) && item.status === "validat").reduce((sum, item) => sum + Number(item.total || 0), 0));
  invoice.credit_total = credit;
  invoice.neachitat = Math.max(0, money(Number(invoice.total || 0) - Number(invoice.achitat || 0) - credit));
  if (!["anulat", "stornat", "draft"].includes(invoice.status)) {
    if (invoice.neachitat <= 0.01) invoice.status = credit > 0 ? "creditata" : "achitat";
    else if (Number(invoice.achitat || 0) > 0 || credit > 0) invoice.status = "partial";
    else invoice.status = "validat";
  }
  invoice.updated_at = new Date().toISOString();
  return invoice;
}

function releaseCreditNoteReturn(db, note) {
  const returnRecord = (db.procurementReturns || []).find((item) => String(item.id) === String(note.return_id));
  if (!returnRecord) return;
  returnRecord.accounting_resolved_at = null;
  returnRecord.accounting_resolved_by = null;
  returnRecord.accounting_action = note.status === "anulat" ? "nota_credit_anulata" : "nota_credit_nevalidata";
}

function buildInventoryInvoiceReconciliation(db, periodValue) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(periodValue);
  const month = `${an}-${String(luna).padStart(2, "0")}`;
  const receipts = (db.procurementReceipts || []).filter((item) => !item.canceled && !item.deleted && String(item.date || "").startsWith(month));
  const discrepancyInvoices = new Set();
  const rows = receipts.map((receipt) => {
    const linked = receipt.accounting_invoice_id ? accounting.invoicesIn.find((item) => String(item.id) === String(receipt.accounting_invoice_id)) : null;
    const suggestions = linked ? [] : receiptInvoiceSuggestions(accounting, receipt);
    let variance = null;
    if (linked) {
      const linkedIds = new Set((linked.source_receipt_ids || [receipt.id]).map(String));
      const linkedReceipts = (db.procurementReceipts || []).filter((item) => linkedIds.has(String(item.id)));
      const receiptTotal = money(linkedReceipts.reduce((sum, item) => sum + Number(item.total || 0), 0));
      const invoiceTotal = money(linked.declared_total ?? linked.total);
      const difference = money(invoiceTotal - receiptTotal);
      variance = { receipt_total: receiptTotal, invoice_total: invoiceTotal, difference, ok: Math.abs(difference) <= 0.01, receipt_count: linkedReceipts.length, primary: String(linkedReceipts[0]?.id) === String(receipt.id) };
      if (!variance.ok) discrepancyInvoices.add(String(linked.id));
    }
    const returns = (db.procurementReturns || []).filter((item) => String(item.receipt_id) === String(receipt.id));
    const pendingReturn = returns.find((item) => item.requires_credit_note && !item.accounting_resolved_at) || null;
    const creditNote = pendingReturn ? accounting.creditNotes.find((item) => String(item.return_id) === String(pendingReturn.id) && item.status !== "anulat") || null : null;
    return { ...receipt, linked_invoice: linked ? invoiceLabel(linked) : null, variance, returns, pending_return: pendingReturn, credit_note: creditNote, suggestions, best_suggestion: suggestions[0] || null };
  });
  return { perioada: month, rows, summary: { total: rows.length, linked: rows.filter((row) => row.linked_invoice).length, pending: rows.filter((row) => !row.linked_invoice).length, suggested: rows.filter((row) => row.best_suggestion).length, discrepancies: discrepancyInvoices.size, pending_returns: rows.filter((row) => row.pending_return).length } };
}

function receiptInvoiceSuggestions(accounting, receipt) {
  const documentText = `${receipt.document || ""} ${receipt.cmr || ""} ${receipt.orderNo || ""}`.toLowerCase();
  const supplierText = String(receipt.supplier || "").toLowerCase();
  return accounting.invoicesIn.filter((invoice) => !["anulat", "stornat"].includes(invoice.status)).map((invoice) => {
    const party = accounting.thirdParties.find((item) => String(item.id) === String(invoice.furnizor_id));
    const document = String(invoice.nr_document || "").toLowerCase();
    let score = document && documentText.includes(document) ? 55 : 0;
    if (party?.denumire && supplierText && (supplierText.includes(String(party.denumire).toLowerCase()) || String(party.denumire).toLowerCase().includes(supplierText))) score += 30;
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const receiptMaterials = Array.isArray(receipt.lines) ? receipt.lines.map((line) => String(line.materialName || line.denumire || "").toLowerCase()).filter(Boolean) : [String(receipt.materialName || "").toLowerCase()].filter(Boolean);
    if (receiptMaterials.some((material) => lines.some((line) => String(line.denumire || line.descriere || "").toLowerCase().includes(material)))) score += 15;
    return { invoice_id: invoice.id, document: invoice.nr_document || invoice.id, furnizor: party?.denumire || "Furnizor", total: Number(invoice.total || 0), score };
  }).filter((item) => item.score >= 30).sort((a, b) => b.score - a.score).slice(0, 5);
}

function createInvoiceFromReceipt(accounting, receipt, party, user) {
  return createInvoiceFromReceipts(accounting, [receipt], party, user, {
    nr_document: receipt.document || receipt.nr_aviz || receipt.nr_nir || receipt.orderNo || receipt.id,
    data: receipt.date,
    data_scadenta: receipt.date
  });
}

function createInvoiceFromReceipts(accounting, receipts, party, user, input = {}) {
  let lines = receipts.flatMap((receipt) => (receipt.lines || []).map((line) => ({ ...line, source_receipt_id: receipt.id, source_nir: receipt.nr_nir || receipt.document || receipt.id }))).map((line, index) => {
    const quantity = Number(line.cantitate_receptionata || line.cantitate || 0);
    const unitPrice = Number(line.pret_unitar || line.unitPrice || 0);
    const base = money(line.valoare ?? quantity * unitPrice);
    const rate = Number(line.cota_tva ?? line.tva_procent ?? 21);
    const vat = money(line.valoare_tva ?? base * rate / 100);
    return { nr_crt: index + 1, denumire: line.materialName || line.denumire || "Material receptionat", um: line.unit || "buc", cantitate: quantity, pret_unitar: unitPrice, valoare: base, tva_procent: rate, tva: vat, total: money(base + vat), cont: line.cont_stoc || "3028", material_id: line.material_id || null };
  });
  if (!lines.length || lines.some((line) => line.cantitate <= 0 || line.pret_unitar <= 0)) throwHttp(422, "Receptia trebuie sa aiba cantitati si preturi unitare pentru generarea facturii.");
  const date = String(input.data || receipts[0]?.date || engine.localDate(new Date()));
  const [an, luna] = dateParts(date);
  const receiptTotal = money(receipts.reduce((sum, receipt) => sum + Number(receipt.total || 0), 0));
  const calculatedTotal = money(lines.reduce((sum, line) => sum + line.total, 0));
  const declaredTotal = input.total_factura === undefined || input.total_factura === "" ? calculatedTotal : money(input.total_factura);
  if (input.distribute_difference && declaredTotal > 0 && Math.abs(declaredTotal - calculatedTotal) > 0.01) lines = distributeInvoiceDifference(lines, declaredTotal);
  const base = money(lines.reduce((sum, line) => sum + line.valoare, 0));
  const vat = money(lines.reduce((sum, line) => sum + line.tva, 0));
  return {
    id: engine.nextNumericId(accounting.invoicesIn), uuid: crypto.randomUUID(), an, luna,
    nr_intern: accounting.invoicesIn.filter((item) => Number(item.an) === an).length + 1,
    nr_document: String(input.nr_document || receipts[0]?.document || receipts[0]?.nr_aviz || receipts[0]?.nr_nir || receipts[0]?.orderNo || receipts[0]?.id),
    furnizor_id: party.id, data: date, data_scadenta: String(input.data_scadenta || date), valoare: base, tva_procent: lines[0]?.tva_procent ?? 21,
    tva: vat, total: money(base + vat), achitat: 0, neachitat: money(base + vat), cont_cheltuiala: "3028",
    explicatie: `Factura din ${receipts.length} receptii: ${receipts.map((receipt) => receipt.nr_nir || receipt.orderNo || receipt.id).join(", ")}`, lines, status: "draft", journal_id: null,
    source: "procurement_receipt", source_receipt_ids: receipts.map((receipt) => receipt.id), receipt_total: receiptTotal,
    declared_total: declaredTotal, receipt_variance: money(declaredTotal - receiptTotal), distribution_applied: Boolean(input.distribute_difference && Math.abs(declaredTotal - calculatedTotal) > 0.01),
    created_by: user?.id || "", created_at: new Date().toISOString()
  };
}

function distributeInvoiceDifference(lines, targetTotal) {
  const sourceTotal = money(lines.reduce((sum, line) => sum + Number(line.total || 0), 0));
  if (sourceTotal <= 0 || targetTotal <= 0) throwHttp(422, "Diferenta nu poate fi distribuita pe linii fara valori pozitive.");
  let allocatedGross = 0;
  return lines.map((line, index) => {
    const rate = Number(line.tva_procent || 0);
    const targetGross = index === lines.length - 1
      ? money(targetTotal - allocatedGross)
      : money(Number(line.total || 0) / sourceTotal * targetTotal);
    allocatedGross = money(allocatedGross + targetGross);
    const value = money(targetGross / (1 + rate / 100));
    const vat = money(targetGross - value);
    const quantity = Number(line.cantitate || 1);
    return { ...line, valoare: value, tva: vat, total: targetGross, pret_unitar: quantity > 0 ? money(value / quantity) : value, difference_distributed: true };
  });
}

function linkReceiptInvoice(receipt, invoice, user) {
  receipt.accounting_invoice_id = invoice.id;
  receipt.accounting_invoice_uuid = invoice.uuid;
  receipt.accounting_linked_at = new Date().toISOString();
  receipt.accounting_linked_by = user?.id || "";
}

function resolveSupplierParty(db, accounting, name, cui) {
  const normalizedCui = String(cui || "").replace(/^RO/i, "").replace(/\s+/g, "");
  const normalizedName = String(name || "Furnizor neidentificat").trim();
  let party = accounting.thirdParties.find((item) => normalizedCui && String(item.cui || "").replace(/^RO/i, "") === normalizedCui)
    || accounting.thirdParties.find((item) => String(item.denumire || "").trim().toLowerCase() === normalizedName.toLowerCase());
  if (party) return party;
  party = {
    id: engine.nextNumericId(accounting.thirdParties), cod: String(engine.nextNumericId(accounting.thirdParties)).padStart(5, "0"), tip: "furnizor",
    denumire: normalizedName, cui: normalizedCui ? `RO${normalizedCui}` : "", tara: "RO", cont_analitic_furnizor: "401", activ: true,
    created_at: new Date().toISOString()
  };
  accounting.thirdParties.push(party);
  return party;
}

async function parseUblInvoice(buffer) {
  const parsed = await xml2js.parseStringPromise(buffer.toString("utf8"), { explicitArray: false, tagNameProcessors: [xml2js.processors.stripPrefix], trim: true });
  const invoice = parsed.Invoice || parsed.CreditNote || parsed;
  const supplierParty = invoice.AccountingSupplierParty?.Party || {};
  const supplierName = scalar(supplierParty.PartyLegalEntity?.RegistrationName || supplierParty.PartyName?.Name || "Furnizor e-Factura");
  const supplierCui = scalar(supplierParty.PartyTaxScheme?.CompanyID || supplierParty.PartyIdentification?.ID || "");
  const rawLines = asArray(invoice.InvoiceLine || invoice.CreditNoteLine);
  const lines = rawLines.map((line, index) => {
    const quantity = Number(scalar(line.InvoicedQuantity || line.CreditedQuantity || 1));
    const unitPrice = Number(scalar(line.Price?.PriceAmount || 0));
    const base = money(Number(scalar(line.LineExtensionAmount || quantity * unitPrice)));
    const rate = Number(scalar(line.Item?.ClassifiedTaxCategory?.Percent || 0));
    const vat = money(base * rate / 100);
    const quantityNode = line.InvoicedQuantity || line.CreditedQuantity;
    return { nr_crt: index + 1, denumire: scalar(line.Item?.Name || line.Item?.Description || `Linia ${index + 1}`), um: scalar(quantityNode?.$?.unitCode || quantityNode?.unitCode || "buc"), cantitate: quantity, pret_unitar: unitPrice, valoare: base, tva_procent: rate, tva: vat, total: money(base + vat), cont: "628" };
  });
  const base = money(Number(scalar(invoice.LegalMonetaryTotal?.TaxExclusiveAmount || lines.reduce((sum, line) => sum + line.valoare, 0))));
  const vat = money(Number(scalar(invoice.TaxTotal?.TaxAmount || lines.reduce((sum, line) => sum + line.tva, 0))));
  const total = money(Number(scalar(invoice.LegalMonetaryTotal?.PayableAmount || invoice.LegalMonetaryTotal?.TaxInclusiveAmount || base + vat)));
  const document = scalar(invoice.ID || "").trim();
  const date = scalar(invoice.IssueDate || "").trim();
  if (!document || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !lines.length || total <= 0) throwHttp(422, "XML-ul nu contine numar, data, linii si total e-Factura valide.");
  return { document, date, due_date: scalar(invoice.DueDate || ""), supplier_name: supplierName, supplier_cui: supplierCui, lines, base, vat, total };
}

function scalar(value) { if (value === null || value === undefined) return ""; if (typeof value === "object") return value._ ?? value["#text"] ?? ""; return String(value); }
function asArray(value) { return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]; }
function dateParts(value) { return [Number(String(value).slice(0, 4)), Number(String(value).slice(5, 7))]; }
function normalizeText(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, " "); }

function buildIntegrityAudit(db, periodValue) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(periodValue);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const inMonth = (item) => Number(item.an) === an && Number(item.luna) === luna;
  const activeJournals = accounting.journals.filter((item) => inMonth(item) && engine.isActiveJournal(item));
  const journalIds = new Set(activeJournals.map((item) => Number(item.id)));
  const issues = [];
  [...accounting.invoicesIn, ...accounting.invoicesOut].filter((item) => inMonth(item) && ["validat", "partial", "achitat", "incasat"].includes(item.status) && !item.journal_id).forEach((item) => issues.push(issue("Documente", item.nr_document || item.numar || item.id, "Document validat fara nota contabila.", "Devalideaza si valideaza din nou documentul.")));
  activeJournals.filter((journal) => !accounting.journalLines.some((line) => Number(line.journal_id) === Number(journal.id))).forEach((journal) => issues.push(issue("Note contabile", journal.nr_document || journal.id, "Nota activa nu are linii.", "Devalideaza nota si regenereaz-o.")));
  accounting.journalLines.filter((line) => !accounting.journals.some((journal) => Number(journal.id) === Number(line.journal_id))).forEach((line) => issues.push(issue("Linii contabile", line.id, "Linie fara nota contabila parinte.", "Verifica migrarea datelor.")));
  duplicateInvoices(accounting.invoicesIn, "furnizor_id").forEach((key) => issues.push(issue("Facturi intrare", key, "Posibil document duplicat pentru acelasi furnizor.", "Compara documentele si anuleaza duplicatul.")));
  duplicateInvoices(accounting.invoicesOut, "client_id").forEach((key) => issues.push(issue("Facturi iesire", key, "Posibil document duplicat pentru acelasi client.", "Compara documentele si anuleaza duplicatul.")));
  activeJournals.filter((item) => Math.abs(Number(item.total_debit || 0) - Number(item.total_credit || 0)) > 0.01).forEach((item) => issues.push(issue("Note dezechilibrate", item.nr_document || item.id, "Debitul nu este egal cu creditul.", "Corecteaza liniile notei.")));
  const stock = operations.buildStockSyncStatus(db, perioada);
  stock.errors.forEach((message, index) => issues.push(issue("Stocuri", index + 1, message, "Completeaza materialul sau costul unitar.")));
  if (stock.pending.length) issues.push(issue("Stocuri", stock.pending.length, `${stock.pending.length} miscari nu sunt contabilizate.`, "Ruleaza Contabilizare stocuri."));
  const declaration = declarations.buildDeclarationReadiness(db, { perioada });
  declaration.checks.filter((check) => !check.ok && check.key !== "period").forEach((check) => issues.push(issue("Declaratii", check.key, check.message, "Rezolva verificarea din TVA / D300.")));
  const checks = summarizeIssues(issues, ["Documente", "Note contabile", "Linii contabile", "Facturi intrare", "Facturi iesire", "Note dezechilibrate", "Stocuri", "Declaratii"]);
  return { perioada, status: issues.length ? "needs_attention" : "ok", checks, issues };
}

function buildDepreciationSchedule(asset) {
  const start = new Date(`${asset.depreciation_start || asset.acquisition_date}T00:00:00`);
  const depreciable = Math.max(0, Number(asset.acquisition_value || 0) - Number(asset.residual_value || 0));
  const monthly = money(depreciable / Math.max(1, Number(asset.useful_life_months || 1)));
  let accumulated = 0;
  const rows = [];
  for (let index = 0; index < Number(asset.useful_life_months || 0); index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const amount = money(Math.min(monthly, depreciable - accumulated));
    accumulated = money(accumulated + amount);
    rows.push({ luna: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, amortizare: amount, cumulata: accumulated, valoare_neta: money(Number(asset.acquisition_value || 0) - accumulated) });
  }
  return { asset, monthly, rows };
}

function renderAssetSheet(asset, schedule, events) {
  const eventRows = events.map((event) => `<tr><td>${escapeHtml(event.data)}</td><td>${escapeHtml(event.action)}</td><td>${escapeHtml(event.details || "-")}</td></tr>`).join("");
  const scheduleRows = schedule.rows.map((row) => `<tr><td>${row.luna}</td><td class="num">${row.amortizare.toFixed(2)}</td><td class="num">${row.cumulata.toFixed(2)}</td><td class="num">${row.valoare_neta.toFixed(2)}</td></tr>`).join("");
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Fisa ${escapeHtml(asset.inventory_no)}</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#14213d}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;font-size:12px}.num{text-align:right}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Tipareste</button><h1>Fisa mijloc fix ${escapeHtml(asset.inventory_no)}</h1><p><strong>${escapeHtml(asset.name)}</strong></p><p>Valoare intrare: ${Number(asset.acquisition_value || 0).toFixed(2)} RON · Durata: ${asset.useful_life_months} luni · Status: ${escapeHtml(asset.status)}</p><h2>Istoric</h2><table><thead><tr><th>Data</th><th>Actiune</th><th>Detalii</th></tr></thead><tbody>${eventRows || "<tr><td colspan=\"3\">Fara evenimente.</td></tr>"}</tbody></table><h2>Plan amortizare</h2><table><thead><tr><th>Luna</th><th>Amortizare</th><th>Cumulata</th><th>Valoare neta</th></tr></thead><tbody>${scheduleRows}</tbody></table></body></html>`;
}

function renderDisposalReport(asset, event, user) {
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Proces verbal ${escapeHtml(asset.inventory_no)}</title><style>body{font-family:Arial,sans-serif;margin:42px;color:#172033}h1{text-align:center;font-size:22px}p{line-height:1.55}.line{margin-top:42px;border-top:1px solid #64748b;width:260px;padding-top:6px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Tipareste</button><h1>PROCES-VERBAL DE SCOATERE DIN EVIDENTA</h1><p>Astazi, <strong>${escapeHtml(event?.data || engine.localDate(new Date()))}</strong>, se propune scoaterea din evidenta a mijlocului fix cu numarul de inventar <strong>${escapeHtml(asset.inventory_no)}</strong>, denumit <strong>${escapeHtml(asset.name)}</strong>.</p><p>Valoare de intrare: <strong>${Number(asset.acquisition_value || 0).toFixed(2)} RON</strong><br>Amortizare cumulata: <strong>${Number(asset.accumulated_depreciation || 0).toFixed(2)} RON</strong><br>Valoare neta: <strong>${Number(asset.net_value || 0).toFixed(2)} RON</strong></p><p>Motiv / detalii: ${escapeHtml(event?.details || "Se completeaza de comisie.")}</p><div class="line">Comisia de inventariere</div><div class="line">Intocmit: ${escapeHtml(user?.name || "")}</div></body></html>`;
}

function duplicateInvoices(items, partyKey) { const seen = new Set(); const duplicates = new Set(); items.filter((item) => !["anulat", "stornat"].includes(item.status)).forEach((item) => { const key = `${item[partyKey] || "-"}|${String(item.nr_document || item.numar || "").toLowerCase()}`; if (key.endsWith("|")) return; if (seen.has(key)) duplicates.add(key); seen.add(key); }); return [...duplicates]; }
function summarizeIssues(issues, areas) { return areas.map((area) => { const count = issues.filter((item) => item.area === area).length; return { key: area.toLowerCase().replace(/\s+/g, "_"), label: area, severity: count ? "warning" : "ok", value: count, message: count ? `${count} probleme necesita verificare.` : "Fara probleme identificate." }; }); }
function invoiceLabel(invoice) { return { id: invoice.id, uuid: invoice.uuid || "", document: invoice.nr_document || invoice.id, total: Number(invoice.total || 0), status: invoice.status }; }
function issue(area, id, message, action) { return { area, id: String(id || "-"), message, action }; }
function findAsset(db, id) { const asset = engine.ensureAccounting(db).fixedAssets.find((item) => String(item.uuid || item.id) === String(id)); if (!asset) throwHttp(404, "Imobilizarea nu a fost gasita."); return asset; }
function monthParts(value) { const now = new Date(); const [an, luna] = String(value || "").split("-").map(Number); return [an || now.getFullYear(), luna || now.getMonth() + 1]; }
function money(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function sendWorkbook(res, workbook, filename) { const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", `attachment; filename="${filename}"`); res.end(buffer); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = registerAccountingControlRoutes;
module.exports.buildInventoryInvoiceReconciliation = buildInventoryInvoiceReconciliation;
module.exports.buildIntegrityAudit = buildIntegrityAudit;
module.exports.buildDepreciationSchedule = buildDepreciationSchedule;
module.exports.parseUblInvoice = parseUblInvoice;
module.exports.createInvoiceFromReceipt = createInvoiceFromReceipt;
module.exports.createInvoiceFromReceipts = createInvoiceFromReceipts;
module.exports.createCreditNoteFromReturn = createCreditNoteFromReturn;
module.exports.validateCreditNote = validateCreditNote;
module.exports.devalidateCreditNote = devalidateCreditNote;
module.exports.stornoCreditNote = stornoCreditNote;
module.exports.recalculateInvoiceCredits = recalculateInvoiceCredits;

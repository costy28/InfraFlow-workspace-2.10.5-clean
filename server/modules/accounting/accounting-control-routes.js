const xlsx = require("xlsx");
const engine = require("./accounting-engine");
const operations = require("./operations-routes");
const declarations = require("./declaration-routes");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

function registerAccountingControlRoutes(router, middleware) {
  const { requireAccountingView, requireAccountingPost, requireAccountingReports } = middleware;

  router.get("/accounting/inventory-invoice-reconciliation", requireAccountingView, (req, res) => {
    res.status(200).json(buildInventoryInvoiceReconciliation(req.auth.db, req.query.perioada));
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

function buildInventoryInvoiceReconciliation(db, periodValue) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(periodValue);
  const month = `${an}-${String(luna).padStart(2, "0")}`;
  const receipts = (db.procurementReceipts || []).filter((item) => !item.canceled && !item.deleted && String(item.date || "").startsWith(month));
  const rows = receipts.map((receipt) => {
    const linked = receipt.accounting_invoice_id ? accounting.invoicesIn.find((item) => String(item.id) === String(receipt.accounting_invoice_id)) : null;
    const suggestions = linked ? [] : receiptInvoiceSuggestions(accounting, receipt);
    return { ...receipt, linked_invoice: linked ? invoiceLabel(linked) : null, suggestions, best_suggestion: suggestions[0] || null };
  });
  return { perioada: month, rows, summary: { total: rows.length, linked: rows.filter((row) => row.linked_invoice).length, pending: rows.filter((row) => !row.linked_invoice).length, suggested: rows.filter((row) => row.best_suggestion).length } };
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
    if (lines.some((line) => String(line.denumire || line.descriere || "").toLowerCase().includes(String(receipt.materialName || "").toLowerCase()))) score += 15;
    return { invoice_id: invoice.id, document: invoice.nr_document || invoice.id, furnizor: party?.denumire || "Furnizor", total: Number(invoice.total || 0), score };
  }).filter((item) => item.score >= 30).sort((a, b) => b.score - a.score).slice(0, 5);
}

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

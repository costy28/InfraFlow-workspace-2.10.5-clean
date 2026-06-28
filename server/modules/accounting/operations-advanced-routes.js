const xlsx = require("xlsx");
const engine = require("./accounting-engine");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

function registerAdvancedOperationsRoutes(router, middleware) {
  const { requireAccountingView, requireAccountingPost, requireAccountingManage, requireAccountingClose, requireAccountingReports } = middleware;

  router.get("/accounting/bank-reconciliation", requireAccountingView, (req, res) => {
    res.status(200).json(buildBankReconciliation(req.auth.db, req.query.perioada));
  });

  router.post("/accounting/bank-reconciliation/:uuid/confirm", requireAccountingPost, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const operation = findRecord(accounting.treasury, req.params.uuid, "Operatia bancara nu a fost gasita.");
      confirmBankOperation(accounting, operation, req.body || {}, req.auth.user);
      addAudit(req.auth.db, req.auth.user, "accounting_bank_reconcile", `${operation.nr_document || operation.id} / ${operation.corelare_tip}`);
      writeDb(req.auth.db);
      res.status(200).json({ operation });
    } catch (error) { next(error); }
  });

  router.post("/accounting/bank-reconciliation/auto-confirm", requireAccountingPost, (req, res, next) => {
    try {
      const result = autoReconcileBank(req.auth.db, req.auth.user, req.body?.perioada, req.body?.min_score);
      addAudit(req.auth.db, req.auth.user, "accounting_bank_reconcile_batch", `${result.perioada} / ${result.confirmed} confirmate`);
      writeDb(req.auth.db);
      res.status(200).json(result);
    } catch (error) { next(error); }
  });

  router.post("/accounting/bank-imports/:id/finalize", requireAccountingPost, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const batch = findRecord(accounting.bankImports, req.params.id, "Importul bancar nu a fost gasit.");
      const operations = accounting.treasury.filter((item) => String(item.bank_import_id) === String(batch.id));
      const unresolved = operations.filter((item) => item.status === "draft" || item.corelare_tip === "neclasificat");
      if (unresolved.length) throwHttp(409, `Mai sunt ${unresolved.length} operatii draft sau neclasificate.`);
      batch.status = "procesat";
      batch.finalized_at = new Date().toISOString();
      batch.finalized_by = req.auth.user?.id || "";
      addAudit(req.auth.db, req.auth.user, "accounting_bank_import_finalize", `${batch.file_name} / ${operations.length} operatii`);
      writeDb(req.auth.db);
      res.status(200).json({ batch });
    } catch (error) { next(error); }
  });

  router.get("/accounting/stock-valuation", requireAccountingView, (req, res) => {
    res.status(200).json(buildStockValuation(req.auth.db, req.query.perioada));
  });

  router.post("/accounting/fixed-assets/:uuid/action", requireAccountingManage, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const asset = findRecord(accounting.fixedAssets, req.params.uuid, "Imobilizarea nu a fost gasita.");
      if (["anulat", "casat"].includes(asset.status)) throwHttp(409, "Imobilizarea este deja scoasa din evidenta.");
      const action = String(req.body?.action || "").trim().toLowerCase();
      const date = normalizeDate(req.body?.data || new Date());
      const [an, luna] = dateParts(date);
      let journal = null;
      if (action === "punere_in_functiune") {
        asset.status = "activ";
        asset.depreciation_start = date;
        asset.location = String(req.body?.location || asset.location || "");
      } else if (action === "transfer") {
        asset.location = String(req.body?.location || "").trim();
        asset.cost_center_id = emptyToNull(req.body?.cost_center_id);
        if (!asset.location && !asset.cost_center_id) throwHttp(400, "Completeaza noua locatie sau centrul de cost.");
      } else if (action === "reevaluare") {
        engine.checkPeriodOpen(req.auth.db, an, luna);
        const newValue = money(req.body?.new_value);
        if (newValue <= Number(asset.accumulated_depreciation || 0)) throwHttp(400, "Valoarea reevaluata trebuie sa depaseasca amortizarea cumulata.");
        const difference = money(newValue - Number(asset.acquisition_value || 0));
        if (difference) {
          ensureAccount(accounting, "105", "Rezerve din reevaluare", "P", "capital");
          journal = engine.createJournal(req.auth.db, req.auth.user, {
            an, luna, data: date, nr_document: `REEV-${asset.inventory_no}-${date}`, tip_document: "reevaluare", document_ref_id: asset.id, document_ref_tip: "fixed_asset",
            explicatie: `Reevaluare ${asset.name}`,
            lines: difference > 0
              ? [{ cont_simbol: asset.account_asset, debit: difference }, { cont_simbol: "105", credit: difference }]
              : [{ cont_simbol: "105", debit: Math.abs(difference) }, { cont_simbol: asset.account_asset, credit: Math.abs(difference) }]
          });
        }
        asset.acquisition_value = newValue;
        asset.net_value = money(newValue - Number(asset.accumulated_depreciation || 0));
      } else if (action === "casare") {
        engine.checkPeriodOpen(req.auth.db, an, luna);
        ensureAccount(accounting, "6583", "Cheltuieli privind activele cedate", "A", "cheltuieli");
        const accumulated = money(asset.accumulated_depreciation || 0);
        const net = money(Number(asset.acquisition_value || 0) - accumulated);
        const lines = [];
        if (accumulated) lines.push({ cont_simbol: asset.account_depreciation, debit: accumulated });
        if (net) lines.push({ cont_simbol: "6583", debit: net });
        lines.push({ cont_simbol: asset.account_asset, credit: money(asset.acquisition_value) });
        journal = engine.createJournal(req.auth.db, req.auth.user, { an, luna, data: date, nr_document: `CAS-${asset.inventory_no}-${date}`, tip_document: "casare", document_ref_id: asset.id, document_ref_tip: "fixed_asset", explicatie: `Casare ${asset.name}`, lines });
        asset.status = "casat";
        asset.disposal_date = date;
        asset.net_value = 0;
      } else {
        throwHttp(400, "Actiunea pentru imobilizare nu este recunoscuta.");
      }
      const event = {
        id: engine.nextNumericId(accounting.fixedAssetEvents), asset_id: asset.id, action, data: date,
        details: String(req.body?.details || req.body?.motiv || "").trim(), journal_id: journal?.id || null,
        created_by: req.auth.user?.id || "", created_at: new Date().toISOString()
      };
      accounting.fixedAssetEvents.push(event);
      asset.updated_at = new Date().toISOString();
      addAudit(req.auth.db, req.auth.user, "accounting_fixed_asset_action", `${asset.inventory_no} / ${action}`);
      writeDb(req.auth.db);
      res.status(200).json({ asset, event, journal });
    } catch (error) { next(error); }
  });

  router.get("/accounting/annual-close/:an/carryforward-check", requireAccountingView, (req, res) => {
    res.status(200).json(buildCarryforwardCheck(req.auth.db, Number(req.params.an)));
  });

  router.post("/accounting/annual-close/:an/carryforward", requireAccountingClose, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const check = buildCarryforwardCheck(req.auth.db, Number(req.params.an));
      if (!check.can_carryforward) throwHttp(409, check.blockers.join(" ") || "Soldurile nu pot fi reportate.");
      check.entries.forEach((entry) => accounting.openingBalances.push({
        id: engine.nextNumericId(accounting.openingBalances), an: check.next_year, cont_simbol: entry.cont_simbol,
        debit: entry.debit, credit: entry.credit, explicatie: `Report sold ${check.an}`,
        created_by: req.auth.user?.id || "", created_at: new Date().toISOString()
      }));
      const run = { id: engine.nextNumericId(accounting.carryforwardRuns), an: check.an, next_year: check.next_year, entries: check.entries.length, checksum: check.checksum, status: "generat", created_by: req.auth.user?.id || "", created_at: new Date().toISOString() };
      accounting.carryforwardRuns.push(run);
      addAudit(req.auth.db, req.auth.user, "accounting_carryforward", `${check.an} -> ${check.next_year} / ${check.entries.length} solduri`);
      writeDb(req.auth.db);
      res.status(201).json({ run, entries: check.entries });
    } catch (error) { next(error); }
  });

  router.get("/accounting/annual-close/:an/export", requireAccountingReports, (req, res, next) => {
    try {
      const data = buildCarryforwardCheck(req.auth.db, Number(req.params.an));
      const workbook = xlsx.utils.book_new();
      const sheet = xlsx.utils.aoa_to_sheet([
        ["Control inchidere anuala", data.an, `Report in ${data.next_year}`], [],
        ["Cont", "Denumire", "Debit reportat", "Credit reportat"],
        ...data.entries.map((row) => [row.cont_simbol, row.denumire, row.debit, row.credit]), [],
        ["TOTAL", "", data.totals.debit, data.totals.credit], [],
        ["Blocaje", data.blockers.join(" ") || "Fara blocaje"]
      ]);
      sheet["!cols"] = [{ wch: 18 }, { wch: 48 }, { wch: 18 }, { wch: 18 }];
      xlsx.utils.book_append_sheet(workbook, sheet, "Report solduri");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Inchidere_anuala_${data.an}.xlsx"`);
      res.end(buffer);
    } catch (error) { next(error); }
  });
}

function buildBankReconciliation(db, periodValue) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(periodValue);
  const rows = accounting.treasury.filter((item) => Number(item.an) === an && Number(item.luna) === luna && item.tip === "banca" && item.status !== "anulat");
  const operations = rows.map((operation) => {
    const suggestions = operation.invoice_in_id || operation.invoice_out_id ? [] : invoiceSuggestions(accounting, operation);
    const best = suggestions[0] || null;
    const spread = best ? best.score - Number(suggestions[1]?.score || 0) : 0;
    const autoEligible = operation.status === "draft" && operation.corelare_tip === "neclasificat" && best && best.score >= 85 && (!suggestions[1] || spread >= 15);
    return { ...operation, suggestions, best_suggestion: best, suggestion_spread: spread, auto_eligible: Boolean(autoEligible) };
  });
  return {
    perioada: `${an}-${String(luna).padStart(2, "0")}`,
    operations,
    summary: {
      total: operations.length,
      reconciled: operations.filter((item) => item.corelare_tip !== "neclasificat").length,
      pending: operations.filter((item) => item.corelare_tip === "neclasificat").length,
      suggested: operations.filter((item) => item.best_suggestion).length,
      auto_eligible: operations.filter((item) => item.auto_eligible).length,
      ambiguous: operations.filter((item) => item.best_suggestion && !item.auto_eligible && item.corelare_tip === "neclasificat").length
    }
  };
}

function autoReconcileBank(db, user, periodValue, minimumScore = 85) {
  const report = buildBankReconciliation(db, periodValue);
  const accounting = engine.ensureAccounting(db);
  const minScore = Math.max(60, Math.min(100, Number(minimumScore || 85)));
  const result = { perioada: report.perioada, minimum_score: minScore, confirmed: 0, ambiguous: 0, without_suggestion: 0, skipped: 0, operations: [] };
  report.operations.forEach((row) => {
    if (row.status !== "draft" || row.corelare_tip !== "neclasificat") { result.skipped += 1; return; }
    if (!row.best_suggestion) { result.without_suggestion += 1; return; }
    const uniqueEnough = !row.suggestions[1] || row.suggestion_spread >= 15;
    if (row.best_suggestion.score < minScore || !uniqueEnough) { result.ambiguous += 1; return; }
    const operation = accounting.treasury.find((item) => String(item.uuid || item.id) === String(row.uuid || row.id));
    confirmBankOperation(accounting, operation, {
      [row.best_suggestion.tip === "intrare" ? "invoice_in_id" : "invoice_out_id"]: row.best_suggestion.invoice_id,
      score: row.best_suggestion.score,
      observatii: `Reconciliere automata ${row.best_suggestion.score}%`
    }, user);
    result.confirmed += 1;
    result.operations.push({ operation_id: operation.id, operation_uuid: operation.uuid, invoice_id: row.best_suggestion.invoice_id, score: row.best_suggestion.score });
  });
  return result;
}

function confirmBankOperation(accounting, operation, body, user) {
  if (!operation) throwHttp(404, "Operatia bancara nu a fost gasita.");
  if (operation.status !== "draft") throwHttp(409, "Doar operatiile draft se pot reconcilia.");
  const invoiceInId = emptyToNull(body.invoice_in_id);
  const invoiceOutId = emptyToNull(body.invoice_out_id);
  if (invoiceInId && invoiceOutId) throwHttp(422, "Alege o singura factura.");
  if (invoiceInId || invoiceOutId) {
    const incoming = Boolean(invoiceOutId);
    if ((incoming && operation.tip_operatie !== "incasare") || (!incoming && operation.tip_operatie !== "plata")) throwHttp(422, "Sensul operatiei nu corespunde facturii selectate.");
    const invoice = incoming
      ? accounting.invoicesOut.find((item) => String(item.id) === String(invoiceOutId))
      : accounting.invoicesIn.find((item) => String(item.id) === String(invoiceInId));
    if (!invoice) throwHttp(404, "Factura selectata nu a fost gasita.");
    const partyId = incoming ? invoice.client_id : invoice.furnizor_id;
    const party = accounting.thirdParties.find((item) => String(item.id) === String(partyId));
    operation.invoice_in_id = incoming ? null : invoice.id;
    operation.invoice_out_id = incoming ? invoice.id : null;
    operation.tert_id = partyId;
    operation.cont_corespondent = incoming ? party?.cont_analitic_client || "4111" : party?.cont_analitic_furnizor || "401";
    operation.corelare_tip = "factura";
    operation.reconciliation_score = Number(body.score || 100);
  } else {
    operation.invoice_in_id = null;
    operation.invoice_out_id = null;
    operation.corelare_tip = normalizeCorrelation(body.corelare_tip);
    operation.cont_corespondent = String(body.cont_corespondent || operation.cont_corespondent || "473");
  }
  operation.corelare_observatii = String(body.observatii || "Reconciliere confirmata manual").trim();
  operation.corelare_de = user?.id || "";
  operation.corelare_la = new Date().toISOString();
  operation.updated_at = new Date().toISOString();
  return operation;
}

function invoiceSuggestions(accounting, operation) {
  const incoming = operation.tip_operatie === "incasare";
  const invoices = incoming ? accounting.invoicesOut : accounting.invoicesIn;
  const text = `${operation.nr_document || ""} ${operation.explicatie || ""} ${operation.counterparty_name || ""} ${operation.counterparty_cui || ""}`.toLowerCase();
  return invoices.filter((item) => ["validat", "partial"].includes(String(item.status || ""))).map((invoice) => {
    const remaining = incoming ? Number(invoice.neincasat ?? invoice.total - Number(invoice.incasat || 0)) : Number(invoice.neachitat ?? invoice.total - Number(invoice.achitat || 0));
    const partyId = incoming ? invoice.client_id : invoice.furnizor_id;
    const party = accounting.thirdParties.find((item) => String(item.id) === String(partyId));
    const document = String(invoice.numar || invoice.nr_document || "").toLowerCase();
    let score = Math.abs(remaining - Number(operation.suma || 0)) <= 0.01 ? 60 : 0;
    if (document && text.includes(document)) score += 25;
    const cui = String(party?.cui || "").replace(/^RO/i, "").toLowerCase();
    if (cui && text.includes(cui)) score += 15;
    else if (party?.denumire && text.includes(String(party.denumire).toLowerCase())) score += 10;
    return { invoice_id: invoice.id, invoice_uuid: invoice.uuid || "", tip: incoming ? "iesire" : "intrare", document: invoice.numar || invoice.nr_document || invoice.id, tert: party?.denumire || "Tert", remaining: money(remaining), score };
  }).filter((item) => item.score >= 60).sort((a, b) => b.score - a.score || a.remaining - b.remaining).slice(0, 5);
}

function buildStockValuation(db, periodValue) {
  const [an, luna] = monthParts(periodValue);
  const endDate = new Date(an, luna, 0).toISOString().slice(0, 10);
  const materials = Array.isArray(db.materials) ? db.materials : Array.isArray(db.inventory?.materials) ? db.inventory.materials : [];
  const states = new Map();
  const movementCosts = {};
  const errors = [];
  const movements = (db.stockMovements || []).filter((item) => !item.canceled && !["transfer_to_dept", "transfer_from_dept"].includes(item.type) && String(item.date || "") <= endDate).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  movements.forEach((movement) => {
    const key = String(movement.materialId || movement.material_id || "");
    const state = states.get(key) || { quantity: 0, value: 0 };
    const quantity = Number(movement.amount || movement.quantity || 0);
    const material = materials.find((item) => String(item.id) === key);
    if (!material) { errors.push(`${movement.id}: material inexistent.`); return; }
    if (quantity > 0) {
      const unitCost = Number(movement.unitPrice || movement.unit_price || movement.cost || material.averageCost || material.average_cost || material.price || 0);
      if (unitCost <= 0) { errors.push(`${movement.id}: intrare fara cost unitar.`); return; }
      state.quantity = money3(state.quantity + quantity);
      state.value = money(state.value + quantity * unitCost);
      movementCosts[String(movement.id)] = money(unitCost);
    } else if (quantity < 0) {
      const average = state.quantity > 0 ? state.value / state.quantity : 0;
      if (!average) errors.push(`${movement.id}: iesire fara stoc valoric disponibil.`);
      movementCosts[String(movement.id)] = money(average);
      state.quantity = money3(state.quantity + quantity);
      state.value = money(state.value - Math.abs(quantity) * average);
      if (state.quantity < -0.0001) errors.push(`${movement.id}: stoc negativ ${state.quantity}.`);
      if (Math.abs(state.quantity) < 0.0001) { state.quantity = 0; state.value = 0; }
    }
    states.set(key, state);
  });
  const rows = materials.map((material) => {
    const state = states.get(String(material.id)) || { quantity: 0, value: 0 };
    return { material_id: material.id, cod: material.cod || material.code || "", denumire: material.name || material.denumire || "Material", quantity: money3(state.quantity), average_cost: state.quantity ? money(state.value / state.quantity) : 0, value: money(state.value) };
  }).filter((row) => row.quantity || row.value);
  return { perioada: `${an}-${String(luna).padStart(2, "0")}`, method: "CMP", rows, movement_costs: movementCosts, errors, totals: { quantity: money3(rows.reduce((sum, row) => sum + row.quantity, 0)), value: money(rows.reduce((sum, row) => sum + row.value, 0)) } };
}

function buildCarryforwardCheck(db, an) {
  const accounting = engine.ensureAccounting(db);
  const closing = accounting.annualClosings.find((item) => Number(item.an) === an && item.status !== "anulat");
  const existing = accounting.carryforwardRuns.find((item) => Number(item.an) === an && item.status !== "anulat");
  const nextYear = an + 1;
  const existingOpening = accounting.openingBalances.filter((item) => Number(item.an) === nextYear);
  const balance = engine.buildBalance(db, an, 12, "analitica");
  const entries = balance.rows.filter((row) => !["6", "7"].includes(String(row.cont || "")[0])).map((row) => ({
    cont_simbol: row.cont,
    denumire: row.denumire || "",
    debit: money(row.sold_D || row.sold_final_D || row.sold_final_debit || 0),
    credit: money(row.sold_C || row.sold_final_C || row.sold_final_credit || 0)
  })).filter((row) => row.debit || row.credit);
  const blockers = [];
  if (!closing) blockers.push("Genereaza mai intai nota de inchidere anuala.");
  if (existing) blockers.push("Soldurile acestui an au fost deja reportate.");
  if (existingOpening.length) blockers.push(`Exista deja ${existingOpening.length} solduri initiale pentru ${nextYear}.`);
  const checksum = require("crypto").createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  return { an, next_year: nextYear, can_carryforward: blockers.length === 0 && entries.length > 0, blockers, entries, checksum, totals: { debit: money(entries.reduce((sum, row) => sum + row.debit, 0)), credit: money(entries.reduce((sum, row) => sum + row.credit, 0)) } };
}

function ensureAccount(accounting, simbol, denumire, tip, tipCont) {
  if (accounting.chart.some((item) => item.simbol === simbol)) return;
  accounting.chart.push({ id: engine.nextNumericId(accounting.chart), simbol, denumire, clasa: Number(simbol[0]), tip, nivel: simbol.length <= 3 ? 1 : 2, tip_cont: tipCont, activ: true, sistem: true });
}
function findRecord(items, id, message) { const item = items.find((row) => String(row.uuid || row.id) === String(id)); if (!item) throwHttp(404, message); return item; }
function emptyToNull(value) { return value === "" || value === undefined || value === null ? null : value; }
function normalizeCorrelation(value) { return ["avans", "corectie", "neclasificat"].includes(String(value)) ? String(value) : "neclasificat"; }
function normalizeDate(value) { const date = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(date.getTime()) ? engine.localDate(new Date()) : engine.localDate(date); }
function dateParts(value) { return [Number(String(value).slice(0, 4)), Number(String(value).slice(5, 7))]; }
function monthParts(value) { const now = new Date(); const [an, luna] = String(value || "").split("-").map(Number); return [an || now.getFullYear(), luna || now.getMonth() + 1]; }
function money(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function money3(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000; }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = registerAdvancedOperationsRoutes;
module.exports.buildBankReconciliation = buildBankReconciliation;
module.exports.autoReconcileBank = autoReconcileBank;
module.exports.confirmBankOperation = confirmBankOperation;
module.exports.buildStockValuation = buildStockValuation;
module.exports.buildCarryforwardCheck = buildCarryforwardCheck;

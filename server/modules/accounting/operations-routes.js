const crypto = require("crypto");
const multer = require("multer");
const xlsx = require("xlsx");
const engine = require("./accounting-engine");
const advancedOperations = require("./operations-advanced-routes");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function registerOperationsRoutes(router, middleware) {
  const { requireAccountingView, requireAccountingPost, requireAccountingManage, requireAccountingClose } = middleware;

  router.get("/accounting/operations/status", requireAccountingView, (req, res) => {
    const accounting = engine.ensureAccounting(req.auth.db);
    res.status(200).json({
      bank_imports: accounting.bankImports.slice(-10).reverse(),
      stock_postings: accounting.stockPostings.slice(-10).reverse(),
      fixed_assets: accounting.fixedAssets.filter((item) => item.status !== "anulat"),
      depreciation_runs: accounting.depreciationRuns.slice(-12).reverse(),
      annual_closings: accounting.annualClosings.slice().reverse(),
      fixed_asset_events: accounting.fixedAssetEvents.slice(-30).reverse(),
      carryforward_runs: accounting.carryforwardRuns.slice().reverse()
    });
  });

  router.post("/accounting/bank-statements/import", requireAccountingPost, upload.single("file"), (req, res, next) => {
    try {
      if (!req.file?.buffer) throwHttp(400, "Selecteaza un extras CSV sau Excel.");
      const accounting = engine.ensureAccounting(req.auth.db);
      const workbook = xlsx.read(req.file.buffer, { type: "buffer", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
      if (!rawRows.length) throwHttp(422, "Extrasul nu contine randuri de importat.");
      const rows = rawRows.map(normalizeBankRow).filter((row) => row.data && row.suma !== 0);
      const result = { total: rawRows.length, valide: rows.length, importate: 0, duplicate: 0, potrivite: 0, erori: [] };
      const imported = [];
      const batch = {
        id: engine.nextNumericId(accounting.bankImports),
        file_name: req.file.originalname,
        profile: detectBankProfile(rawRows),
        status: "in_lucru",
        imported_at: new Date().toISOString(),
        imported_by: req.auth.user?.id || "",
        treasury_ids: [],
        result
      };
      rows.forEach((row, index) => {
        try {
          const hash = bankRowHash(row);
          if (accounting.bankImportHashes.some((item) => item.hash === hash)) {
            result.duplicate += 1;
            return;
          }
          const [an, luna] = dateParts(row.data);
          engine.checkPeriodOpen(req.auth.db, an, luna);
          const match = findInvoiceMatch(accounting, row);
          const operation = {
            id: engine.nextNumericId(accounting.treasury),
            uuid: randomId(),
            an,
            luna,
            tip: "banca",
            cont_trezorerie: String(req.body?.cont_trezorerie || "5121"),
            data: row.data,
            nr_document: row.referinta || `EXTRAS-${index + 1}`,
            tip_operatie: row.suma > 0 ? "incasare" : "plata",
            suma: money(Math.abs(row.suma)),
            cont_corespondent: match?.cont || (row.suma > 0 ? "4111" : "401"),
            tert_id: match?.tert_id || null,
            invoice_in_id: match?.tip === "intrare" ? match.invoice.id : null,
            invoice_out_id: match?.tip === "iesire" ? match.invoice.id : null,
            corelare_tip: match ? "factura" : "neclasificat",
            explicatie: row.explicatie || "Import extras bancar",
            status: "draft",
            import_hash: hash,
            bank_import_id: batch.id,
            counterparty_name: row.counterparty_name,
            counterparty_iban: row.counterparty_iban,
            counterparty_cui: row.counterparty_cui,
            import_source: req.file.originalname,
            created_by: req.auth.user?.id || "",
            created_at: new Date().toISOString()
          };
          accounting.treasury.push(operation);
          accounting.bankImportHashes.push({ hash, data: row.data, suma: row.suma, created_at: new Date().toISOString() });
          imported.push(operation);
          batch.treasury_ids.push(operation.id);
          result.importate += 1;
          if (match) result.potrivite += 1;
        } catch (error) {
          result.erori.push(`Rand ${index + 2}: ${error.message}`);
        }
      });
      accounting.bankImports.push(batch);
      addAudit(req.auth.db, req.auth.user, "accounting_bank_statement_import", `${req.file.originalname} / ${result.importate} operatii`);
      writeDb(req.auth.db);
      res.status(201).json({ batch, treasury: imported, result });
    } catch (error) { next(error); }
  });

  router.get("/accounting/stock-sync/status", requireAccountingView, (req, res) => {
    res.status(200).json(buildStockSyncStatus(req.auth.db, req.query.perioada));
  });

  router.post("/accounting/stock-sync", requireAccountingPost, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const [an, luna] = monthParts(req.body?.perioada);
      engine.checkPeriodOpen(req.auth.db, an, luna);
      ensureStockAccounts(accounting);
      const status = buildStockSyncStatus(req.auth.db, `${an}-${String(luna).padStart(2, "0")}`);
      const result = { create: 0, skipped: status.skipped, errors: [...status.errors] };
      status.pending.forEach((item) => {
        try {
          const journal = engine.createJournal(req.auth.db, req.auth.user, {
            an,
            luna,
            data: item.data,
            nr_document: item.document,
            tip_document: "miscare_stoc",
            document_ref_id: item.movement_id,
            document_ref_tip: "stock_movement",
            explicatie: item.explicatie,
            lines: item.lines
          });
          accounting.stockPostings.push({ id: engine.nextNumericId(accounting.stockPostings), movement_id: item.movement_id, journal_id: journal.id, an, luna, created_at: new Date().toISOString() });
          result.create += 1;
        } catch (error) {
          result.errors.push(`${item.document}: ${error.message}`);
        }
      });
      addAudit(req.auth.db, req.auth.user, "accounting_stock_sync", `${luna}/${an} / ${result.create} note`);
      writeDb(req.auth.db);
      res.status(200).json({ result, status: buildStockSyncStatus(req.auth.db, `${an}-${String(luna).padStart(2, "0")}`) });
    } catch (error) { next(error); }
  });

  router.post("/accounting/fixed-assets", requireAccountingManage, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const asset = normalizeFixedAsset(req.body || {}, accounting);
      accounting.fixedAssets.push(asset);
      addAudit(req.auth.db, req.auth.user, "accounting_fixed_asset_create", `${asset.inventory_no} ${asset.name}`);
      writeDb(req.auth.db);
      res.status(201).json({ asset });
    } catch (error) { next(error); }
  });

  router.patch("/accounting/fixed-assets/:uuid", requireAccountingManage, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const asset = accounting.fixedAssets.find((item) => item.uuid === req.params.uuid || String(item.id) === String(req.params.uuid));
      if (!asset || asset.status === "anulat") throwHttp(404, "Imobilizarea nu a fost gasita.");
      Object.assign(asset, normalizeFixedAsset({ ...asset, ...req.body }, accounting, asset), { updated_at: new Date().toISOString() });
      addAudit(req.auth.db, req.auth.user, "accounting_fixed_asset_update", `${asset.inventory_no} ${asset.name}`);
      writeDb(req.auth.db);
      res.status(200).json({ asset });
    } catch (error) { next(error); }
  });

  router.delete("/accounting/fixed-assets/:uuid", requireAccountingManage, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const asset = accounting.fixedAssets.find((item) => item.uuid === req.params.uuid || String(item.id) === String(req.params.uuid));
      if (!asset || asset.status === "anulat") throwHttp(404, "Imobilizarea nu a fost gasita.");
      asset.status = "anulat";
      asset.cancelled_at = new Date().toISOString();
      asset.cancelled_by = req.auth.user?.id || "";
      asset.cancelled_reason = String(req.body?.motiv || req.query?.motiv || "Scoatere din evidenta");
      addAudit(req.auth.db, req.auth.user, "accounting_fixed_asset_cancel", `${asset.inventory_no} ${asset.name}`);
      writeDb(req.auth.db);
      res.status(200).json({ asset });
    } catch (error) { next(error); }
  });

  router.post("/accounting/depreciation/run", requireAccountingPost, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const [an, luna] = monthParts(req.body?.perioada);
      engine.checkPeriodOpen(req.auth.db, an, luna);
      if (accounting.depreciationRuns.some((item) => Number(item.an) === an && Number(item.luna) === luna && item.status !== "anulat")) throwHttp(409, "Amortizarea lunii a fost deja calculata.");
      ensureFixedAssetAccounts(accounting);
      const items = [];
      accounting.fixedAssets.filter((item) => item.status === "activ").forEach((asset) => {
        const amount = monthlyDepreciation(asset, an, luna);
        if (amount <= 0) return;
        const journal = engine.createJournal(req.auth.db, req.auth.user, {
          an,
          luna,
          data: monthEnd(an, luna),
          nr_document: `AMORT-${asset.inventory_no}-${an}${String(luna).padStart(2, "0")}`,
          tip_document: "amortizare",
          document_ref_id: asset.id,
          document_ref_tip: "fixed_asset",
          explicatie: `Amortizare ${asset.name}`,
          lines: [
            { cont_simbol: asset.account_expense, debit: amount, credit: 0, explicatie: asset.name },
            { cont_simbol: asset.account_depreciation, debit: 0, credit: amount, explicatie: asset.name }
          ]
        });
        asset.accumulated_depreciation = money(Number(asset.accumulated_depreciation || 0) + amount);
        asset.net_value = money(Number(asset.acquisition_value || 0) - asset.accumulated_depreciation);
        items.push({ asset_id: asset.id, amount, journal_id: journal.id });
      });
      const run = { id: engine.nextNumericId(accounting.depreciationRuns), an, luna, status: "calculat", total: money(items.reduce((sum, item) => sum + item.amount, 0)), items, created_by: req.auth.user?.id || "", created_at: new Date().toISOString() };
      accounting.depreciationRuns.push(run);
      addAudit(req.auth.db, req.auth.user, "accounting_depreciation_run", `${luna}/${an} / ${run.total}`);
      writeDb(req.auth.db);
      res.status(201).json({ run });
    } catch (error) { next(error); }
  });

  router.get("/accounting/annual-close/:an/check", requireAccountingView, (req, res) => {
    res.status(200).json(buildAnnualCloseCheck(req.auth.db, Number(req.params.an)));
  });

  router.post("/accounting/annual-close/:an", requireAccountingClose, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const an = Number(req.params.an);
      const check = buildAnnualCloseCheck(req.auth.db, an);
      if (!check.can_close) throwHttp(409, check.blockers.join(" ") || "Anul nu poate fi inchis.");
      ensureResultAccount(accounting);
      const lines = [];
      check.expense_accounts.forEach((row) => {
        lines.push({ cont_simbol: "121", debit: row.balance, credit: 0, explicatie: `Inchidere ${row.cont}` });
        lines.push({ cont_simbol: row.cont, debit: 0, credit: row.balance, explicatie: "Inchidere cheltuieli" });
      });
      check.revenue_accounts.forEach((row) => {
        lines.push({ cont_simbol: row.cont, debit: row.balance, credit: 0, explicatie: "Inchidere venituri" });
        lines.push({ cont_simbol: "121", debit: 0, credit: row.balance, explicatie: `Inchidere ${row.cont}` });
      });
      if (!lines.length) throwHttp(409, "Nu exista rulaje de venituri sau cheltuieli pentru inchidere.");
      const journal = engine.createJournal(req.auth.db, req.auth.user, { an, luna: 12, data: `${an}-12-31`, nr_document: `INCH-AN-${an}`, tip_document: "inchidere_anuala", explicatie: `Inchidere conturi 6/7 pentru ${an}`, lines });
      const closing = { id: engine.nextNumericId(accounting.annualClosings), an, journal_id: journal.id, result: check.result, status: "generat", created_by: req.auth.user?.id || "", created_at: new Date().toISOString() };
      accounting.annualClosings.push(closing);
      addAudit(req.auth.db, req.auth.user, "accounting_annual_close", `${an} / rezultat ${check.result}`);
      writeDb(req.auth.db);
      res.status(201).json({ closing, journal });
    } catch (error) { next(error); }
  });
}

function normalizeBankRow(raw) {
  const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeKey(key), value]));
  const debit = parseAmount(pick(row, ["debit", "suma_debit", "plata", "iesire"]));
  const credit = parseAmount(pick(row, ["credit", "suma_credit", "incasare", "intrare"]));
  let amount = parseAmount(pick(row, ["suma", "valoare", "amount"]));
  if (!amount) amount = credit ? Math.abs(credit) : debit ? -Math.abs(debit) : 0;
  const type = String(pick(row, ["tip", "sens", "operatie"]) || "").toLowerCase();
  if (amount > 0 && /plata|debit|iesire/.test(type)) amount = -amount;
  return {
    data: normalizeDate(pick(row, ["data", "data_operatie", "data_tranzactie", "date"])),
    suma: money(amount),
    referinta: String(pick(row, ["referinta", "nr_document", "document", "id_tranzactie", "reference"]) || "").trim(),
    explicatie: String(pick(row, ["explicatie", "descriere", "detalii", "beneficiar", "description", "detalii_tranzactie"]) || "").trim(),
    counterparty_name: String(pick(row, ["beneficiar", "ordonator", "partener", "nume_partener", "contraparte"]) || "").trim(),
    counterparty_iban: String(pick(row, ["iban_beneficiar", "iban_ordonator", "iban_partener", "cont_partener", "iban"]) || "").replace(/\s+/g, "").toUpperCase(),
    counterparty_cui: String(pick(row, ["cui", "cif", "cui_partener", "cod_fiscal"]) || "").replace(/^RO/i, "").replace(/\s+/g, "")
  };
}

function detectBankProfile(rows) {
  const keys = Object.keys(rows?.[0] || {}).map(normalizeKey);
  const joined = keys.join("|");
  if (/data_operatiunii|detalii_tranzactie|cont_contraparte/.test(joined)) return "Banca Transilvania";
  if (/booking_date|value_date|transaction_description/.test(joined)) return "ING";
  if (/data_tranzactie|ordonator|beneficiar|referinta_platii/.test(joined)) return "CEC/BRD";
  return "Generic CSV/Excel";
}

function findInvoiceMatch(accounting, row) {
  const text = `${row.referinta} ${row.explicatie}`.toLowerCase();
  const amount = Math.abs(row.suma);
  const source = row.suma > 0 ? accounting.invoicesOut : accounting.invoicesIn;
  const matches = source.filter((invoice) => {
    if (!["validat", "partial"].includes(String(invoice.status || ""))) return false;
    const document = String(invoice.numar || invoice.nr_document || "").toLowerCase();
    const remaining = row.suma > 0 ? Number(invoice.neincasat ?? invoice.total - Number(invoice.incasat || 0)) : Number(invoice.neachitat ?? invoice.total - Number(invoice.achitat || 0));
    return document && text.includes(document) && amount <= remaining + 0.01;
  });
  if (matches.length !== 1) return null;
  const invoice = matches[0];
  const partyId = row.suma > 0 ? invoice.client_id : invoice.furnizor_id;
  const party = accounting.thirdParties.find((item) => String(item.id) === String(partyId));
  return { tip: row.suma > 0 ? "iesire" : "intrare", invoice, tert_id: partyId, cont: row.suma > 0 ? party?.cont_analitic_client || "4111" : party?.cont_analitic_furnizor || "401" };
}

function buildStockSyncStatus(db, periodValue) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(periodValue);
  const valuation = advancedOperations.buildStockValuation(db, `${an}-${String(luna).padStart(2, "0")}`);
  const materials = Array.isArray(db.materials) ? db.materials : Array.isArray(db.inventory?.materials) ? db.inventory.materials : [];
  const posted = new Set(accounting.stockPostings.map((item) => String(item.movement_id)));
  const pending = [];
  const errors = [];
  let skipped = 0;
  (db.stockMovements || []).filter((movement) => {
    const [year, month] = dateParts(movement.date);
    return year === an && month === luna && !movement.canceled;
  }).forEach((movement) => {
    if (posted.has(String(movement.id))) return;
    if (["opening_stock", "transfer_to_dept", "transfer_from_dept"].includes(movement.type)) { skipped += 1; return; }
    const material = materials.find((item) => String(item.id) === String(movement.materialId));
    const quantity = Math.abs(Number(movement.amount || 0));
    const unitCost = Number(movement.unitPrice || movement.unit_price || movement.cost || valuation.movement_costs[String(movement.id)] || material?.averageCost || material?.average_cost || material?.price || 0);
    const value = money(quantity * unitCost);
    if (!material || value <= 0) {
      errors.push(`${movement.id}: lipseste materialul sau costul unitar.`);
      return;
    }
    const incoming = Number(movement.amount || 0) > 0;
    const stockAccount = material.cont_stoc || material.accounting_stock_account || "3028";
    const expenseAccount = material.cont_consum || material.accounting_expense_account || "6028";
    const sourceAccount = movement.type === "delivery" ? "408" : "473";
    pending.push({
      movement_id: movement.id,
      data: movement.date,
      document: movement.transportDoc || movement.document || `STOC-${movement.id}`,
      explicatie: `${movement.type} ${material.name || material.denumire || material.id}`,
      lines: incoming
        ? [{ cont_simbol: stockAccount, debit: value }, { cont_simbol: sourceAccount, credit: value }]
        : [{ cont_simbol: expenseAccount, debit: value }, { cont_simbol: stockAccount, credit: value }]
    });
  });
  return { perioada: `${an}-${String(luna).padStart(2, "0")}`, pending, errors, skipped, posted: accounting.stockPostings.filter((item) => Number(item.an) === an && Number(item.luna) === luna).length };
}

function normalizeFixedAsset(body, accounting, existing = {}) {
  const value = money(body.acquisition_value ?? existing.acquisition_value);
  const residual = money(body.residual_value ?? existing.residual_value);
  const life = Number(body.useful_life_months ?? existing.useful_life_months);
  if (!String(body.name || existing.name || "").trim()) throwHttp(400, "Denumirea imobilizarii este obligatorie.");
  if (value <= 0 || life <= 0 || residual < 0 || residual >= value) throwHttp(400, "Valoarea, durata sau valoarea reziduala sunt invalide.");
  const inventoryNo = String(body.inventory_no || existing.inventory_no || `MF-${engine.nextNumericId(accounting.fixedAssets)}`).trim();
  if (accounting.fixedAssets.some((item) => item !== existing && item.inventory_no === inventoryNo)) throwHttp(409, "Numarul de inventar exista deja, inclusiv in istoricul elementelor scoase din evidenta.");
  return {
    ...existing,
    id: existing.id || engine.nextNumericId(accounting.fixedAssets),
    uuid: existing.uuid || randomId(),
    inventory_no: inventoryNo,
    name: String(body.name || existing.name).trim(),
    acquisition_date: normalizeDate(body.acquisition_date || existing.acquisition_date),
    depreciation_start: normalizeDate(body.depreciation_start || existing.depreciation_start || body.acquisition_date),
    acquisition_value: value,
    residual_value: residual,
    useful_life_months: life,
    accumulated_depreciation: money(existing.accumulated_depreciation || 0),
    net_value: money(value - Number(existing.accumulated_depreciation || 0)),
    account_asset: String(body.account_asset || existing.account_asset || "2131"),
    account_depreciation: String(body.account_depreciation || existing.account_depreciation || "2813"),
    account_expense: String(body.account_expense || existing.account_expense || "6811"),
    status: existing.status || "activ",
    created_at: existing.created_at || new Date().toISOString()
  };
}

function monthlyDepreciation(asset, an, luna) {
  const month = `${an}-${String(luna).padStart(2, "0")}`;
  if (!asset.depreciation_start || asset.depreciation_start.slice(0, 7) > month) return 0;
  const depreciable = money(Number(asset.acquisition_value || 0) - Number(asset.residual_value || 0));
  const remaining = money(depreciable - Number(asset.accumulated_depreciation || 0));
  return money(Math.min(remaining, depreciable / Number(asset.useful_life_months || 1)));
}

function buildAnnualCloseCheck(db, an) {
  const accounting = engine.ensureAccounting(db);
  const existing = accounting.annualClosings.find((item) => Number(item.an) === Number(an) && item.status !== "anulat");
  const december = accounting.periods.find((item) => Number(item.an) === Number(an) && Number(item.luna) === 12);
  const previousOpen = Array.from({ length: 11 }, (_, index) => index + 1).filter((month) => {
    const period = accounting.periods.find((item) => Number(item.an) === Number(an) && Number(item.luna) === month);
    return period && !["inchisa", "depusa"].includes(period.status);
  });
  const balance = engine.buildBalance(db, Number(an), 12, "analitica");
  const expenseAccounts = balance.rows.filter((row) => String(row.cont).startsWith("6")).map((row) => ({ cont: row.cont, balance: money(Number(row.rulaje_D || 0) - Number(row.rulaje_C || 0)) })).filter((row) => row.balance > 0.009);
  const revenueAccounts = balance.rows.filter((row) => String(row.cont).startsWith("7")).map((row) => ({ cont: row.cont, balance: money(Number(row.rulaje_C || 0) - Number(row.rulaje_D || 0)) })).filter((row) => row.balance > 0.009);
  const expenses = money(expenseAccounts.reduce((sum, row) => sum + row.balance, 0));
  const revenues = money(revenueAccounts.reduce((sum, row) => sum + row.balance, 0));
  const blockers = [];
  if (existing) blockers.push("Inchiderea anuala a fost deja generata.");
  if (["inchisa", "depusa"].includes(december?.status)) blockers.push("Decembrie este inchisa; redeschide perioada pentru generarea notei anuale.");
  if (previousOpen.length) blockers.push(`Lunile ${previousOpen.join(", ")} nu sunt inchise.`);
  return { an, can_close: blockers.length === 0, blockers, expense_accounts: expenseAccounts, revenue_accounts: revenueAccounts, expenses, revenues, result: money(revenues - expenses), existing: existing || null };
}

function ensureStockAccounts(accounting) {
  ensureAccount(accounting, "3028", "Alte materiale consumabile", "A", "stocuri");
  ensureAccount(accounting, "6028", "Cheltuieli privind alte materiale consumabile", "A", "cheltuieli");
  ensureAccount(accounting, "408", "Furnizori - facturi nesosite", "P", "terti");
  ensureAccount(accounting, "473", "Decontari din operatiuni in curs de clarificare", "B", "terti");
}

function ensureFixedAssetAccounts(accounting) {
  ensureAccount(accounting, "2131", "Echipamente tehnologice", "A", "imobilizari");
  ensureAccount(accounting, "2813", "Amortizarea instalatiilor si mijloacelor de transport", "P", "imobilizari");
  ensureAccount(accounting, "6811", "Cheltuieli de exploatare privind amortizarea", "A", "cheltuieli");
}

function ensureResultAccount(accounting) {
  ensureAccount(accounting, "121", "Profit sau pierdere", "B", "capital");
}

function ensureAccount(accounting, simbol, denumire, tip, tipCont) {
  if (accounting.chart.some((item) => item.simbol === simbol)) return;
  accounting.chart.push({ id: engine.nextNumericId(accounting.chart), simbol, denumire, clasa: Number(simbol[0]), tip, nivel: simbol.length <= 3 ? 1 : 2, tip_cont: tipCont, activ: true, sistem: true });
}

function pick(row, keys) { for (const key of keys) if (row[key] !== undefined && row[key] !== "") return row[key]; return ""; }
function normalizeKey(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function parseAmount(value) { return Number(String(value || "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")) || 0; }
function normalizeDate(value) { const date = value instanceof Date ? value : new Date(String(value || "").replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, "$3-$2-$1")); return Number.isNaN(date.getTime()) ? "" : engine.localDate(date); }
function dateParts(value) { const text = String(value || ""); return [Number(text.slice(0, 4)), Number(text.slice(5, 7))]; }
function monthParts(value) { const current = new Date(); const [an, luna] = String(value || "").split("-").map(Number); return [an || current.getFullYear(), luna || current.getMonth() + 1]; }
function monthEnd(an, luna) { return engine.localDate(new Date(Number(an), Number(luna), 0)); }
function money(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function randomId() { return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"); }
function bankRowHash(row) { return crypto.createHash("sha256").update(`${row.data}|${row.suma}|${row.referinta}|${row.explicatie}`).digest("hex"); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = registerOperationsRoutes;
module.exports.normalizeBankRow = normalizeBankRow;
module.exports.detectBankProfile = detectBankProfile;
module.exports.buildStockSyncStatus = buildStockSyncStatus;
module.exports.monthlyDepreciation = monthlyDepreciation;
module.exports.buildAnnualCloseCheck = buildAnnualCloseCheck;

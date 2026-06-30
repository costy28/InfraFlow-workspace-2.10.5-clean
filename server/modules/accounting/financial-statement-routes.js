const xlsx = require("xlsx");
const engine = require("./accounting-engine");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

const DEFAULT_MAPPINGS = [
  ["BILANT", "A01", "Active imobilizate", "asset", ["2"], 10],
  ["BILANT", "A02", "Stocuri", "asset", ["3"], 20],
  ["BILANT", "A03", "Creante", "asset", ["41", "46"], 30],
  ["BILANT", "A04", "Casa si conturi la banci", "asset", ["5"], 40],
  ["BILANT", "P01", "Capitaluri si rezerve", "liability", ["10", "11", "12", "13"], 50],
  ["BILANT", "P02", "Rezultatul exercitiului si reportat", "liability", ["117", "121"], 60],
  ["BILANT", "P03", "Datorii comerciale si fiscale", "liability", ["40", "42", "43", "44", "45", "46"], 70],
  ["BILANT", "P04", "Imprumuturi si datorii financiare", "liability", ["16", "51"], 80],
  ["CPP", "V01", "Cifra de afaceri", "revenue", ["70"], 10],
  ["CPP", "V02", "Alte venituri din exploatare", "revenue", ["71", "72", "74", "75", "78"], 20],
  ["CPP", "V03", "Venituri financiare", "revenue", ["76"], 30],
  ["CPP", "C01", "Materii prime, materiale si marfuri", "expense", ["60", "61"], 40],
  ["CPP", "C02", "Cheltuieli cu personalul", "expense", ["64"], 50],
  ["CPP", "C03", "Amortizari si ajustari", "expense", ["68"], 60],
  ["CPP", "C04", "Alte cheltuieli de exploatare", "expense", ["62", "63", "65"], 70],
  ["CPP", "C05", "Cheltuieli financiare", "expense", ["66"], 80],
  ["CPP", "C06", "Impozit pe profit si alte impozite", "expense", ["69"], 90]
];

function registerFinancialStatementRoutes(router, middleware) {
  const { requireAccountingReports, requireAccountingManage } = middleware;

  router.get("/accounting/financial-statements/mappings", requireAccountingReports, (req, res) => {
    const mappings = ensureMappings(req.auth.db).filter((item) => !item.cancelled_at).sort((a, b) => a.statement_type.localeCompare(b.statement_type) || Number(a.order) - Number(b.order));
    res.json({ mappings });
  });

  router.post("/accounting/financial-statements/mappings", requireAccountingManage, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db); ensureMappings(req.auth.db);
      const body = req.body || {};
      const statementType = String(body.statement_type || "").toUpperCase();
      if (!["BILANT", "CPP"].includes(statementType)) throwHttp(400, "Tipul situatiei trebuie sa fie BILANT sau CPP.");
      const code = String(body.code || "").trim().toUpperCase();
      if (!code) throwHttp(400, "Codul randului este obligatoriu.");
      const duplicate = accounting.financialStatementMappings.find((item) => item.statement_type === statementType && item.code === code && !item.cancelled_at && String(item.id) !== String(body.id || ""));
      if (duplicate) throwHttp(409, `Randul ${code} exista deja.`);
      let item = accounting.financialStatementMappings.find((row) => String(row.id) === String(body.id || "") && !row.cancelled_at);
      const values = {
        statement_type: statementType, code, label: String(body.label || "").trim().slice(0, 250),
        calculation: String(body.calculation || "asset").trim(), prefixes: normalizePrefixes(body.prefixes),
        order: Number(body.order || 0), active: body.active !== false, updated_at: new Date().toISOString(), updated_by: req.auth.user?.id || ""
      };
      if (!item) { item = { id: engine.nextNumericId(accounting.financialStatementMappings), uuid: `financial-map-${Date.now()}`, created_at: values.updated_at, created_by: values.updated_by }; accounting.financialStatementMappings.push(item); }
      Object.assign(item, values);
      addAudit(req.auth.db, req.auth.user, "accounting_financial_mapping_save", `${statementType} / ${code}`);
      writeDb(req.auth.db); res.status(201).json({ item });
    } catch (error) { next(error); }
  });

  router.delete("/accounting/financial-statements/mappings/:id", requireAccountingManage, (req, res, next) => {
    try {
      const item = ensureMappings(req.auth.db).find((row) => String(row.id) === String(req.params.id) && !row.cancelled_at);
      if (!item) throwHttp(404, "Maparea nu a fost gasita.");
      item.cancelled_at = new Date().toISOString(); item.cancelled_by = req.auth.user?.id || ""; item.cancelled_reason = String(req.body?.motiv || "Anulare mapare");
      addAudit(req.auth.db, req.auth.user, "accounting_financial_mapping_cancel", `${item.statement_type} / ${item.code}`);
      writeDb(req.auth.db); res.status(204).end();
    } catch (error) { next(error); }
  });

  router.get("/accounting/financial-statements", requireAccountingReports, (req, res, next) => {
    try { res.json(buildReport(req.auth.db, req.query)); } catch (error) { next(error); }
  });

  router.get("/accounting/financial-statements/export", requireAccountingReports, (req, res, next) => {
    try {
      const report = buildReport(req.auth.db, req.query);
      const workbook = xlsx.utils.book_new();
      const sheet = xlsx.utils.aoa_to_sheet([
        [report.title, `La ${report.period_end}`, `Comparativ ${report.previous_period_end}`], [],
        ["Cod", "Indicator", "Prefixe conturi", "An curent", "An precedent", "Diferenta", "Variatie %"],
        ...report.rows.map((row) => [row.code, row.label, row.prefixes.join(", "), row.current, row.previous, row.difference, row.variation_percent]),
        [], ["Control", report.control.message, "", report.control.current, report.control.previous]
      ]);
      sheet["!cols"] = [{ wch: 12 }, { wch: 48 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
      sheet["!autofilter"] = { ref: `A3:G${Math.max(3, report.rows.length + 3)}` };
      xlsx.utils.book_append_sheet(workbook, sheet, report.statement_type === "BILANT" ? "Bilant" : "Profit si pierdere");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Situatie_${report.statement_type}_${report.an}_${String(report.luna).padStart(2, "0")}.xlsx"`);
      res.end(buffer);
    } catch (error) { next(error); }
  });

  router.get("/accounting/financial-statements/print", requireAccountingReports, (req, res, next) => {
    try { res.type("html").send(renderHtml(req.auth.db, buildReport(req.auth.db, req.query))); } catch (error) { next(error); }
  });
}

function ensureMappings(db) {
  const accounting = engine.ensureAccounting(db);
  if (!accounting.financialStatementMappings.length) DEFAULT_MAPPINGS.forEach(([statementType, code, label, calculation, prefixes, order], index) => accounting.financialStatementMappings.push({ id: index + 1, uuid: `financial-map-system-${index + 1}`, statement_type: statementType, code, label, calculation, prefixes, order, active: true, system: true }));
  return accounting.financialStatementMappings;
}

function buildReport(db, query = {}) {
  const an = Number(query.an || new Date().getFullYear()); const luna = Number(query.luna || 12);
  const statementType = String(query.tip || query.statement_type || "BILANT").toUpperCase();
  if (!["BILANT", "CPP"].includes(statementType)) throwHttp(400, "Tip situatie financiara invalid.");
  const mappings = ensureMappings(db).filter((item) => item.statement_type === statementType && item.active !== false && !item.cancelled_at).sort((a, b) => Number(a.order) - Number(b.order));
  const currentBalance = engine.buildBalance(db, an, luna, "analitica");
  const previousBalance = engine.buildBalance(db, an - 1, luna, "analitica");
  const rows = mappings.map((mapping) => {
    const current = mappingValue(currentBalance.rows, mapping);
    const previous = mappingValue(previousBalance.rows, mapping);
    return { ...mapping, current, previous, difference: money(current - previous), variation_percent: previous ? money((current - previous) / Math.abs(previous) * 100) : null };
  });
  const control = statementType === "BILANT" ? balanceControl(rows) : profitControl(rows);
  return {
    statement_type: statementType, title: statementType === "BILANT" ? "Situatia pozitiei financiare" : "Contul de profit si pierdere",
    an, luna, period_end: endDate(an, luna), previous_period_end: endDate(an - 1, luna), rows, control,
    note: "Raport managerial configurabil. Depunerea oficiala necesita formularul si programul de asistenta aplicabile entitatii."
  };
}

function mappingValue(rows, mapping) {
  const selected = rows.filter((row) => mapping.prefixes.some((prefix) => String(row.cont).startsWith(prefix)));
  if (mapping.calculation === "asset") return money(selected.reduce((sum, row) => sum + Math.max(0, Number(row.sold_D || 0) - Number(row.sold_C || 0)), 0));
  if (mapping.calculation === "liability") return money(selected.reduce((sum, row) => sum + Math.max(0, Number(row.sold_C || 0) - Number(row.sold_D || 0)), 0));
  if (mapping.calculation === "revenue") return money(selected.reduce((sum, row) => sum + Number(row.rulaje_C || 0) - Number(row.rulaje_D || 0), 0));
  return money(selected.reduce((sum, row) => sum + Number(row.rulaje_D || 0) - Number(row.rulaje_C || 0), 0));
}

function balanceControl(rows) {
  const assets = money(rows.filter((row) => row.code.startsWith("A")).reduce((sum, row) => sum + row.current, 0));
  const liabilities = money(rows.filter((row) => row.code.startsWith("P")).reduce((sum, row) => sum + row.current, 0));
  const previousAssets = money(rows.filter((row) => row.code.startsWith("A")).reduce((sum, row) => sum + row.previous, 0));
  const previousLiabilities = money(rows.filter((row) => row.code.startsWith("P")).reduce((sum, row) => sum + row.previous, 0));
  const difference = money(assets - liabilities);
  return { ok: Math.abs(difference) <= 0.01, current: difference, previous: money(previousAssets - previousLiabilities), assets, liabilities, message: Math.abs(difference) <= 0.01 ? "Activul este egal cu pasivul." : "Maparea necesita revizuire: activul nu este egal cu pasivul." };
}
function profitControl(rows) {
  const revenues = money(rows.filter((row) => row.code.startsWith("V")).reduce((sum, row) => sum + row.current, 0));
  const expenses = money(rows.filter((row) => row.code.startsWith("C")).reduce((sum, row) => sum + row.current, 0));
  const prevRevenues = money(rows.filter((row) => row.code.startsWith("V")).reduce((sum, row) => sum + row.previous, 0));
  const prevExpenses = money(rows.filter((row) => row.code.startsWith("C")).reduce((sum, row) => sum + row.previous, 0));
  return { ok: true, current: money(revenues - expenses), previous: money(prevRevenues - prevExpenses), revenues, expenses, message: revenues >= expenses ? "Rezultat: profit." : "Rezultat: pierdere." };
}

function renderHtml(db, report) {
  const company = db.company || db.settings?.company || db.settings?.general || {};
  const rows = report.rows.map((row) => `<tr><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.label)}</td><td class="num">${format(row.current)}</td><td class="num">${format(row.previous)}</td><td class="num">${format(row.difference)}</td></tr>`).join("");
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>@page{size:A4 landscape;margin:14mm}body{font-family:Arial;color:#172033}h1{color:#075b49}.meta{padding:10px;background:#f2f7f5}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccd5df;padding:7px}th{background:#e7f1ee}.num{text-align:right}.warn{padding:10px;background:#fff4d6}.no-print{margin-bottom:10px}@media print{.no-print{display:none}}</style></head><body><button class="no-print" onclick="window.print()">Tipareste / Salveaza PDF</button><h1>${escapeHtml(report.title)}</h1><div class="meta"><strong>${escapeHtml(company.name || company.companyName || company.denumire || "Societate")}</strong><br>Perioada ${report.period_end} · comparativ ${report.previous_period_end}</div><table><thead><tr><th>Cod</th><th>Indicator</th><th>An curent</th><th>An precedent</th><th>Diferenta</th></tr></thead><tbody>${rows}</tbody></table><p class="${report.control.ok ? "meta" : "warn"}">${escapeHtml(report.control.message)} Diferenta curenta: ${format(report.control.current)} RON.</p><p>${escapeHtml(report.note)}</p></body></html>`;
}

function normalizePrefixes(value) { const items = Array.isArray(value) ? value : String(value || "").split(/[,;\s]+/); return [...new Set(items.map((item) => String(item).trim()).filter((item) => /^\d[\d.]*$/.test(item)))]; }
function endDate(an, luna) { return engine.localDate(new Date(an, luna, 0)); }
function money(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function format(value) { return Number(value || 0).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

registerFinancialStatementRoutes.ensureMappings = ensureMappings;
registerFinancialStatementRoutes.buildReport = buildReport;
module.exports = registerFinancialStatementRoutes;

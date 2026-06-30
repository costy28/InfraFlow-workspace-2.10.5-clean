const { Router } = require("express");
const xlsx = require("xlsx");
const payrollRoutes = require("./payroll-routes");
const accountingEngine = require("../accounting/accounting-engine");
const { requireAuth } = require("../../core/auth");
const { requirePermission } = require("../../core/permissions");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

const router = Router();
const TYPES = new Set(["bonus", "beneficiu_impozabil", "retinere", "indemnizatie_medicala", "concediu_fara_plata", "avans", "poprire", "tichete_masa"]);

router.get("/hr/payroll/adjustments", salaryView, (req, res) => {
  const hr = payrollRoutes.ensurePayroll(req.auth.db);
  const month = payrollRoutes.validMonth(req.query.luna || new Date().toISOString().slice(0, 7));
  const items = hr.payrollAdjustments.filter((item) => !item.cancelled_at && appliesToMonth(item, month));
  res.json({ luna: month, items });
});

router.post("/hr/payroll/adjustments", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const body = req.body || {};
    if (!TYPES.has(body.tip)) throwHttp(400, "Tipul ajustarii salariale este invalid.");
    if (!hr.employees.some((item) => String(item.id) === String(body.employee_id))) throwHttp(404, "Angajatul nu a fost gasit.");
    const amount = payrollRoutes.money(body.amount);
    if (body.tip === "concediu_fara_plata" && !(payrollRoutes.money(body.quantity) > 0)) throwHttp(400, "Numarul zilelor de concediu fara plata este obligatoriu.");
    if (body.tip !== "concediu_fara_plata" && !(amount > 0)) throwHttp(400, "Suma ajustarii trebuie sa fie mai mare decat zero.");
    const item = {
      id: payrollRoutes.nextId(hr.payrollAdjustments),
      uuid: `payroll-adjustment-${Date.now()}`,
      employee_id: body.employee_id,
      tip: body.tip,
      cod: String(body.cod || "").trim().slice(0, 50),
      descriere: String(body.descriere || "").trim().slice(0, 250),
      amount,
      quantity: payrollRoutes.money(body.quantity),
      unit_value: payrollRoutes.money(body.unit_value),
      certificate_code: String(body.certificate_code || "").trim().slice(0, 50),
      medical_employer_amount: payrollRoutes.money(body.medical_employer_amount),
      medical_fund_amount: payrollRoutes.money(body.medical_fund_amount),
      medical_diagnostic_code: String(body.medical_diagnostic_code || "").trim().slice(0, 30),
      operator_confirmed: Boolean(body.operator_confirmed),
      data_start: validDate(body.data_start || `${payrollRoutes.validMonth(body.luna)}-01`),
      data_sfarsit: body.recurent ? validDate(body.data_sfarsit || "2099-12-31") : validDate(body.data_sfarsit || body.data_start || `${payrollRoutes.validMonth(body.luna)}-01`),
      recurent: Boolean(body.recurent),
      active: true,
      created_by: req.auth.user?.id || "",
      created_at: new Date().toISOString()
    };
    hr.payrollAdjustments.push(item);
    addAudit(db, req.auth.user, "hr_payroll_adjustment_create", `${item.tip} / ${item.employee_id} / ${item.amount}`);
    writeDb(db);
    res.status(201).json({ item });
  } catch (error) { next(error); }
});

router.patch("/hr/payroll/adjustments/:id", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const item = hr.payrollAdjustments.find((row) => String(row.id) === String(req.params.id) && !row.cancelled_at);
    if (!item) throwHttp(404, "Ajustarea salariala nu a fost gasita.");
    if (req.body.tip !== undefined && !TYPES.has(req.body.tip)) throwHttp(400, "Tipul ajustarii salariale este invalid.");
    if (req.body.amount !== undefined && !(payrollRoutes.money(req.body.amount) > 0)) throwHttp(400, "Suma ajustarii trebuie sa fie mai mare decat zero.");
    ["tip", "cod", "descriere", "data_start", "data_sfarsit", "recurent", "active", "certificate_code", "medical_diagnostic_code", "operator_confirmed"].forEach((key) => {
      if (req.body[key] !== undefined) item[key] = req.body[key];
    });
    if (req.body.amount !== undefined) item.amount = payrollRoutes.money(req.body.amount);
    if (req.body.quantity !== undefined) item.quantity = payrollRoutes.money(req.body.quantity);
    if (req.body.unit_value !== undefined) item.unit_value = payrollRoutes.money(req.body.unit_value);
    if (req.body.medical_employer_amount !== undefined) item.medical_employer_amount = payrollRoutes.money(req.body.medical_employer_amount);
    if (req.body.medical_fund_amount !== undefined) item.medical_fund_amount = payrollRoutes.money(req.body.medical_fund_amount);
    item.updated_at = new Date().toISOString();
    item.updated_by = req.auth.user?.id || "";
    addAudit(db, req.auth.user, "hr_payroll_adjustment_update", `${item.id} / ${item.tip}`);
    writeDb(db);
    res.json({ item });
  } catch (error) { next(error); }
});

router.delete("/hr/payroll/adjustments/:id", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const item = hr.payrollAdjustments.find((row) => String(row.id) === String(req.params.id) && !row.cancelled_at);
    if (!item) throwHttp(404, "Ajustarea salariala nu a fost gasita.");
    const reason = String(req.body?.motiv || "Anulare ajustare salariala").trim();
    item.cancelled_at = new Date().toISOString();
    item.cancelled_by = req.auth.user?.id || "";
    item.cancelled_reason = reason;
    addAudit(db, req.auth.user, "hr_payroll_adjustment_cancel", `${item.id} / ${reason}`);
    writeDb(db);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/hr/payroll/:runId/lines/:lineId/payslip", salaryView, (req, res, next) => {
  try {
    const hr = payrollRoutes.ensurePayroll(req.auth.db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    const line = hr.payrollLines.find((item) => String(item.id) === String(req.params.lineId) && item.run_id === run.id && !item.cancelled_at);
    if (!line) throwHttp(404, "Linia salariala nu a fost gasita.");
    res.type("html").send(payslipHtml(req.auth.db, run, line));
  } catch (error) { next(error); }
});

router.get("/hr/payroll/:runId/payslips", salaryView, (req, res, next) => {
  try {
    const hr = payrollRoutes.ensurePayroll(req.auth.db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    const lines = hr.payrollLines.filter((item) => item.run_id === run.id && !item.cancelled_at);
    if (!lines.length) throwHttp(404, "Statul salarial nu contine angajati.");
    res.type("html").send(payslipsHtml(req.auth.db, run, lines));
  } catch (error) { next(error); }
});

router.get("/hr/payroll/:runId/payment-register", salaryView, (req, res, next) => {
  try {
    const hr = payrollRoutes.ensurePayroll(req.auth.db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    const payments = hr.payrollPayments.filter((item) => item.run_id === run.id && !item.cancelled_at);
    const paymentStatus = payments.some((item) => item.status === "platit") ? "platit" : "neplatit";
    const lines = hr.payrollLines.filter((item) => item.run_id === run.id && !item.cancelled_at);
    const sheet = xlsx.utils.aoa_to_sheet([
      ["Registru plata salarii", run.luna, run.status, paymentStatus], [],
      ["Nr.", "Marca", "Angajat", "Brut", "CAS", "CASS", "Impozit", "Retineri", "Net", "Status plata"],
      ...lines.map((line, index) => [index + 1, line.marca, line.employee_name, line.gross, line.cas, line.cass, line.income_tax, line.other_deductions, line.net, paymentStatus]),
      [], ["TOTAL", "", "", run.total_gross, run.total_cas, run.total_cass, run.total_income_tax, run.total_other_deductions, run.total_net, paymentStatus]
    ]);
    sheet["!cols"] = [{ wch: 7 }, { wch: 12 }, { wch: 34 }, ...Array(6).fill({ wch: 16 }), { wch: 16 }];
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, "Registru plata");
    sendWorkbook(res, workbook, `Registru_plata_salarii_${run.luna.replace("-", "_")}.xlsx`);
  } catch (error) { next(error); }
});

router.get("/hr/payroll/:runId/bank-export", salaryView, (req, res, next) => {
  try {
    const hr = payrollRoutes.ensurePayroll(req.auth.db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    if (run.status !== "validat") throwHttp(409, "Valideaza statul salarial inainte de exportul bancar.");
    const profile = hr.payrollBankProfiles.find((item) => String(item.id) === String(req.query.profile_id) && item.active !== false)
      || hr.payrollBankProfiles.find((item) => item.active !== false);
    if (!profile) throwHttp(422, "Configureaza un profil bancar activ.");
    const employees = new Map(hr.employees.map((item) => [String(item.id), item]));
    const lines = hr.payrollLines.filter((item) => item.run_id === run.id && !item.cancelled_at);
    const missing = lines.filter((item) => !String(employees.get(String(item.employee_id))?.iban || "").trim());
    if (missing.length) throwHttp(422, `${missing.length} angajati nu au IBAN completat. Completeaza IBAN-ul in Resurse Umane.`);
    const rows = lines.map((line, index) => {
      const employee = employees.get(String(line.employee_id)) || {};
      return [index + 1, line.employee_name, String(employee.iban || "").replace(/\s/g, "").toUpperCase(), line.net, `SALARIU ${run.luna} ${line.marca || ""}`.trim()];
    });
    if (profile.format === "csv_semicolon") {
      const csv = [["Beneficiar", "IBAN", "Suma", "Moneda", "Explicatie"], ...rows.map((row) => [row[1], row[2], Number(row[3]).toFixed(2), "RON", row[4]])]
        .map((row) => row.map(csvValue).join(";")).join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Plati_salarii_${run.luna.replace("-", "_")}.csv"`);
      return res.send(`\uFEFF${csv}`);
    }
    const sheet = xlsx.utils.aoa_to_sheet([["Plati salarii", run.luna, `Total ${run.total_net} RON`, profile.name], [], ["Nr.", "Beneficiar", "IBAN", "Suma RON", "Explicatie"], ...rows]);
    sheet["!cols"] = [{ wch: 7 }, { wch: 34 }, { wch: 28 }, { wch: 16 }, { wch: 36 }];
    sheet["!autofilter"] = { ref: `A3:E${Math.max(3, rows.length + 3)}` };
    rows.forEach((_, index) => { const cell = sheet[`D${index + 4}`]; if (cell) cell.z = "#,##0.00"; });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, "Plati salarii");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Plati_salarii_${run.luna.replace("-", "_")}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.post("/hr/payroll/:runId/reverse-accounting", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    const reason = String(req.body?.motiv || "").trim();
    if (reason.length < 5) throwHttp(400, "Completeaza motivul stornarii notei salariale.");
    if (!run.accounting_journal_id || run.accounting_reversed_at) throwHttp(409, "Statul nu are o nota contabila activa.");
    if (hr.payrollPayments.some((item) => item.run_id === run.id && !item.cancelled_at && item.status !== "stornat")) {
      throwHttp(409, "Storneaza mai intai plata salariala.");
    }
    const journal = accountingEngine.stornoJournal(db, req.auth.user, run.accounting_journal_id);
    run.accounting_storno_journal_id = journal.id;
    run.accounting_reversed_at = new Date().toISOString();
    run.accounting_reversed_by = req.auth.user?.id || "";
    run.accounting_reversal_reason = reason;
    addAudit(db, req.auth.user, "hr_payroll_accounting_reverse", `${run.luna} / ${reason}`);
    writeDb(db);
    res.status(201).json({ run, journal });
  } catch (error) { next(error); }
});

router.post("/hr/payroll/:runId/post-accounting", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    if (run.status !== "validat") throwHttp(409, "Valideaza statul salarial inainte de inregistrarea contabila.");
    if (run.accounting_journal_id && !run.accounting_reversed_at) throwHttp(409, "Statul salarial are deja nota contabila generata.");
    const [an, luna] = run.luna.split("-").map(Number);
    const lines = [
      { cont: "641", debit: run.total_gross, explicatie: `Cheltuieli salariale ${run.luna}` },
      { cont: "421", credit: run.total_net, explicatie: `Salarii nete ${run.luna}` },
      { cont: "4315", credit: run.total_cas, explicatie: `CAS ${run.luna}` },
      { cont: "4316", credit: run.total_cass, explicatie: `CASS ${run.luna}` },
      { cont: "444", credit: run.total_income_tax, explicatie: `Impozit salarii ${run.luna}` },
      ...(run.total_advances > 0 ? [{ cont: "425", credit: run.total_advances, explicatie: `Avansuri salarii ${run.luna}` }] : []),
      ...(run.total_garnishments > 0 ? [{ cont: "427", credit: run.total_garnishments, explicatie: `Popriri salarii ${run.luna}` }] : []),
      ...(run.total_other_deductions - run.total_advances - run.total_garnishments > 0 ? [{ cont: "4282", credit: payrollRoutes.money(run.total_other_deductions - run.total_advances - run.total_garnishments), explicatie: `Alte retineri salarii ${run.luna}` }] : []),
      { cont: "646", debit: run.total_cam, explicatie: `CAM ${run.luna}` },
      { cont: "436", credit: run.total_cam, explicatie: `CAM datorata ${run.luna}` }
    ].filter((item) => Number(item.debit || item.credit || 0) > 0);
    const journal = accountingEngine.createJournal(db, req.auth.user, {
      an, luna, data: `${run.luna}-${String(new Date(an, luna, 0).getDate()).padStart(2, "0")}`,
      nr_document: `SAL-${run.luna}`,
      tip_document: "stat_salarii",
      document_ref_id: run.id,
      document_ref_tip: "hr_payroll_runs",
      explicatie: `Stat salarii ${run.luna}`,
      lines
    });
    run.accounting_journal_id = journal.id;
    run.accounting_reversed_at = null;
    run.accounting_storno_journal_id = null;
    run.accounting_posted_at = new Date().toISOString();
    run.accounting_posted_by = req.auth.user?.id || "";
    addAudit(db, req.auth.user, "hr_payroll_accounting_post", `${run.luna} / nota ${journal.id}`);
    writeDb(db);
    res.status(201).json({ run, journal });
  } catch (error) { next(error); }
});

function payslipHtml(db, run, line) {
  const company = db.company || db.settings?.company || {};
  const value = (label, amount) => `<tr><td>${escapeHtml(label)}</td><td class="number">${Number(amount || 0).toFixed(2)} RON</td></tr>`;
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Fluturas ${escapeHtml(line.employee_name)}</title><style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#172033;max-width:760px;margin:auto}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:18px}td{padding:8px;border-bottom:1px solid #d9e0e8}.number{text-align:right;font-weight:700}.total{background:#eef7f3;font-size:17px}small{color:#64748b}@media print{button{display:none}}</style></head><body><button onclick="print()">Tipareste</button><h1>Fluturas de salariu</h1><p><strong>${escapeHtml(company.name || company.denumire || "InfraFlow ERP")}</strong><br><small>Perioada ${escapeHtml(run.luna)} | Stat ${escapeHtml(run.status)}</small></p><h2>${escapeHtml(line.employee_name)}</h2><p>Marca: ${escapeHtml(line.marca || "-")}</p><table>${value("Salariu de baza", line.salary_base)}${value("Brut realizat", line.gross)}${value("CAS", line.cas)}${value("CASS", line.cass)}${value("Impozit", line.income_tax)}${value("Alte retineri", line.other_deductions)}<tr class="total"><td>Net de plata</td><td class="number">${Number(line.net || 0).toFixed(2)} RON</td></tr></table><p><small>Document generat din statul salarial validat in InfraFlow ERP.</small></p></body></html>`;
}

function payslipsHtml(db, run, lines) {
  const pages = lines.map((line) => payslipHtml(db, run, line).match(/<body>([\s\S]*)<\/body>/i)?.[1] || "").join('<div class="page-break"></div>');
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Fluturasi ${escapeHtml(run.luna)}</title><style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#172033;max-width:760px;margin:auto}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:18px}td{padding:8px;border-bottom:1px solid #d9e0e8}.number{text-align:right;font-weight:700}.total{background:#eef7f3;font-size:17px}.page-break{break-after:page;page-break-after:always}small{color:#64748b}@media print{button{display:none}}</style></head><body>${pages}</body></html>`;
}

function sendWorkbook(res, workbook, filename) {
  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(buffer);
}
function csvValue(value) { const text = String(value ?? ""); return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

function appliesToMonth(item, month) {
  return String(item.data_start || "").slice(0, 7) <= month && String(item.data_sfarsit || "9999-12").slice(0, 7) >= month;
}
function validDate(value) { const date = String(value || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throwHttp(400, "Data ajustarii este invalida."); return date; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function salaryView(req, res, next) { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, "hr:salary_view")) return; req.auth = auth; next(); }
function salaryManage(req, res, next) { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, "hr:manage")) return; req.auth = auth; next(); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = router;

const { Router } = require("express");
const crypto = require("crypto");
const xlsx = require("xlsx");
const payrollRoutes = require("./payroll-routes");
const accountingEngine = require("../accounting/accounting-engine");
const { requireAuth } = require("../../core/auth");
const { requirePermission } = require("../../core/permissions");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

const router = Router();

router.get("/hr/payroll/:runId/obligations", salaryView, (req, res, next) => {
  try {
    const hr = payrollRoutes.ensurePayroll(req.auth.db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    res.json(buildObligations(hr, run));
  } catch (error) { next(error); }
});

router.post("/hr/payroll/:runId/obligations/generate", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    if (run.status !== "validat") throwHttp(409, "Valideaza statul salarial inainte de generarea ordinelor de plata.");
    if (!run.accounting_journal_id || run.accounting_reversed_at) throwHttp(409, "Genereaza nota contabila salariala inaintea ordinelor de plata.");
    const existing = hr.payrollPaymentOrders.filter((item) => item.run_id === run.id && !item.cancelled_at);
    if (existing.length) throwHttp(409, "Ordinele de plata pentru acest stat sunt deja generate.");
    const dueDate = contributionDueDate(run.luna);
    const definitions = obligationDefinitions(run);
    definitions.forEach((definition) => hr.payrollPaymentOrders.push({
      id: payrollRoutes.nextId(hr.payrollPaymentOrders),
      uuid: crypto.randomUUID(),
      run_id: run.id,
      luna: run.luna,
      code: definition.code,
      label: definition.label,
      beneficiary: definition.beneficiary,
      budget_account: definition.budget_account,
      accounting_account: definition.accounting_account,
      amount: payrollRoutes.money(definition.amount),
      due_date: dueDate,
      status: "pregatit",
      created_by: req.auth.user?.id || "",
      created_at: new Date().toISOString()
    }));
    addAudit(db, req.auth.user, "hr_payroll_obligations_generate", `${run.luna} / ${definitions.length} ordine`);
    writeDb(db);
    res.status(201).json(buildObligations(hr, run));
  } catch (error) { next(error); }
});

router.post("/hr/payroll/:runId/obligations/:orderId/pay", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    const order = hr.payrollPaymentOrders.find((item) => String(item.id) === String(req.params.orderId) && item.run_id === run.id && !item.cancelled_at);
    if (!order) throwHttp(404, "Ordinul de plata nu a fost gasit.");
    if (order.status !== "pregatit") throwHttp(409, "Doar un ordin pregatit poate fi inregistrat ca platit.");
    const profile = hr.payrollBankProfiles.find((item) => String(item.id) === String(req.body?.profile_id) && item.active !== false)
      || hr.payrollBankProfiles.find((item) => item.active !== false);
    if (!profile) throwHttp(422, "Configureaza un profil bancar activ.");
    ensureAccount(db, profile.treasury_account);
    ensureAccount(db, order.accounting_account);
    const accounting = accountingEngine.ensureAccounting(db);
    const [an, luna] = run.luna.split("-").map(Number);
    const date = validDate(req.body?.data || new Date().toISOString().slice(0, 10));
    const treasury = {
      id: accountingEngine.nextNumericId(accounting.treasury), uuid: crypto.randomUUID(), an, luna,
      tip: "banca", data, nr_document: String(req.body?.nr_document || `OP-${order.code}-${run.luna}`).trim(),
      tip_operatie: "plata", suma: order.amount, cont_trezorerie: profile.treasury_account,
      cont_corespondent: order.accounting_account, corelare_tip: "salarii",
      explicatie: `${order.label} ${run.luna}`, status: "validat",
      created_by: req.auth.user?.id || "", created_at: new Date().toISOString(),
      validated_by: req.auth.user?.id || "", validated_at: new Date().toISOString()
    };
    const journal = accountingEngine.generateJournalFromTreasury(db, req.auth.user, treasury);
    treasury.journal_id = journal.id;
    accounting.treasury.push(treasury);
    Object.assign(order, { status: "platit", payment_date: date, treasury_uuid: treasury.uuid, accounting_journal_id: journal.id, paid_by: req.auth.user?.id || "", paid_at: new Date().toISOString() });
    addAudit(db, req.auth.user, "hr_payroll_obligation_pay", `${order.code} / ${order.amount}`);
    writeDb(db);
    res.status(201).json({ order, treasury, journal });
  } catch (error) { next(error); }
});

router.post("/hr/payroll/:runId/obligations/:orderId/reverse", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    const order = hr.payrollPaymentOrders.find((item) => String(item.id) === String(req.params.orderId) && item.run_id === run.id && !item.cancelled_at);
    const reason = String(req.body?.motiv || "").trim();
    if (!order || order.status !== "platit") throwHttp(409, "Ordinul nu are o plata activa.");
    if (reason.length < 5) throwHttp(400, "Completeaza motivul stornarii.");
    const journal = accountingEngine.stornoJournal(db, req.auth.user, order.accounting_journal_id);
    const accounting = accountingEngine.ensureAccounting(db);
    const treasury = accounting.treasury.find((item) => item.uuid === order.treasury_uuid);
    if (treasury) Object.assign(treasury, { status: "stornat", storno_journal_id: journal.id, cancelled_at: new Date().toISOString(), cancelled_by: req.auth.user?.id || "", cancelled_reason: reason });
    Object.assign(order, { status: "stornat", storno_journal_id: journal.id, cancelled_at: new Date().toISOString(), cancelled_by: req.auth.user?.id || "", cancelled_reason: reason });
    addAudit(db, req.auth.user, "hr_payroll_obligation_reverse", `${order.code} / ${reason}`);
    writeDb(db);
    res.status(201).json({ order, treasury, journal });
  } catch (error) { next(error); }
});

router.get("/hr/payroll/:runId/obligations/export", salaryView, (req, res, next) => {
  try {
    const hr = payrollRoutes.ensurePayroll(req.auth.db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    const report = buildObligations(hr, run);
    const rows = report.items.map((item, index) => [index + 1, item.code, item.label, item.beneficiary, item.budget_account, item.accounting_account, item.amount, item.due_date, item.status]);
    const sheet = xlsx.utils.aoa_to_sheet([["Centralizator obligatii salariale", run.luna, `Total ${report.total} RON`], [], ["Nr.", "Cod", "Obligatie", "Beneficiar", "Cont bugetar", "Cont contabil", "Suma", "Scadenta", "Status"], ...rows]);
    sheet["!cols"] = [{ wch: 7 }, { wch: 12 }, { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    const workbook = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(workbook, sheet, "Obligatii");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Obligatii_salariale_${run.luna.replace("-", "_")}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

function buildObligations(hr, run) {
  const items = hr.payrollPaymentOrders.filter((item) => item.run_id === run.id && !item.cancelled_at);
  return { run_id: run.id, luna: run.luna, items, total: payrollRoutes.money(items.reduce((sum, item) => sum + Number(item.amount || 0), 0)), due_date: contributionDueDate(run.luna) };
}
function obligationDefinitions(run) { return [
  { code: "CAS", label: "Contributia de asigurari sociale", beneficiary: "Bugetul asigurarilor sociale", budget_account: "conform IBAN ANAF", accounting_account: "4315", amount: run.total_cas },
  { code: "CASS", label: "Contributia de asigurari sociale de sanatate", beneficiary: "Bugetul FNUASS", budget_account: "conform IBAN ANAF", accounting_account: "4316", amount: run.total_cass },
  { code: "IMPOZIT", label: "Impozit pe veniturile din salarii", beneficiary: "Bugetul de stat", budget_account: "conform IBAN ANAF", accounting_account: "444", amount: run.total_income_tax },
  { code: "CAM", label: "Contributia asiguratorie pentru munca", beneficiary: "Bugetul asigurarilor pentru munca", budget_account: "conform IBAN ANAF", accounting_account: "436", amount: run.total_cam }
].filter((item) => Number(item.amount || 0) > 0); }
function contributionDueDate(month) { const [year, value] = month.split("-").map(Number); return new Date(Date.UTC(year, value, 25)).toISOString().slice(0, 10); }
function ensureAccount(db, account) { if (!accountingEngine.ensureAccounting(db).chart.some((item) => item.activ !== false && item.simbol === String(account))) throwHttp(422, `Contul ${account} nu exista in planul de conturi.`); }
function validDate(value) { const date = String(value || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throwHttp(400, "Data platii este invalida."); return date; }
function salaryView(req, res, next) { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, "hr:salary_view")) return; req.auth = auth; next(); }
function salaryManage(req, res, next) { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, "hr:manage")) return; req.auth = auth; next(); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

router.buildObligations = buildObligations;
router.obligationDefinitions = obligationDefinitions;
router.contributionDueDate = contributionDueDate;
module.exports = router;

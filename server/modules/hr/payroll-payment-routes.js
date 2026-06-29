const { Router } = require("express");
const crypto = require("crypto");
const payrollRoutes = require("./payroll-routes");
const accountingEngine = require("../accounting/accounting-engine");
const { requireAuth } = require("../../core/auth");
const { requirePermission } = require("../../core/permissions");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

const router = Router();
const FORMATS = new Set(["xlsx", "csv_semicolon"]);

router.get("/hr/payroll/bank-profiles", salaryView, (req, res) => {
  const hr = payrollRoutes.ensurePayroll(req.auth.db);
  res.json({ items: hr.payrollBankProfiles.filter((item) => !item.cancelled_at) });
});

router.post("/hr/payroll/bank-profiles", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const body = req.body || {};
    if (!FORMATS.has(body.format)) throwHttp(400, "Formatul profilului bancar este invalid.");
    const item = {
      id: `bank-profile-${Date.now()}`,
      name: required(body.name, "Denumirea profilului bancar"),
      format: body.format,
      treasury_account: String(body.treasury_account || "5121").trim(),
      bank_name: String(body.bank_name || "").trim(),
      active: body.active !== false,
      system: false,
      created_by: req.auth.user?.id || "",
      created_at: new Date().toISOString()
    };
    ensureAccount(db, item.treasury_account);
    hr.payrollBankProfiles.push(item);
    addAudit(db, req.auth.user, "hr_payroll_bank_profile_create", `${item.name} / ${item.format}`);
    writeDb(db);
    res.status(201).json({ item });
  } catch (error) { next(error); }
});

router.patch("/hr/payroll/bank-profiles/:id", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const item = hr.payrollBankProfiles.find((row) => String(row.id) === String(req.params.id) && !row.cancelled_at);
    if (!item) throwHttp(404, "Profilul bancar nu a fost gasit.");
    if (item.system) throwHttp(409, "Profilul de sistem nu poate fi modificat; creeaza un profil propriu.");
    if (req.body.format !== undefined && !FORMATS.has(req.body.format)) throwHttp(400, "Formatul profilului bancar este invalid.");
    ["name", "format", "treasury_account", "bank_name", "active"].forEach((key) => {
      if (req.body[key] !== undefined) item[key] = req.body[key];
    });
    ensureAccount(db, item.treasury_account);
    item.updated_by = req.auth.user?.id || "";
    item.updated_at = new Date().toISOString();
    addAudit(db, req.auth.user, "hr_payroll_bank_profile_update", item.name);
    writeDb(db);
    res.json({ item });
  } catch (error) { next(error); }
});

router.post("/hr/payroll/:runId/pay", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    if (run.status !== "validat") throwHttp(409, "Valideaza statul salarial inainte de plata.");
    if (!run.accounting_journal_id || run.accounting_reversed_at) throwHttp(409, "Genereaza nota contabila salariala inainte de plata.");
    if (hr.payrollPayments.some((item) => item.run_id === run.id && !item.cancelled_at && item.status !== "stornat")) {
      throwHttp(409, "Plata statului salarial este deja inregistrata.");
    }
    const profile = hr.payrollBankProfiles.find((item) => String(item.id) === String(req.body?.profile_id) && item.active !== false)
      || hr.payrollBankProfiles.find((item) => item.active !== false);
    if (!profile) throwHttp(422, "Configureaza un profil bancar activ.");
    ensureAccount(db, profile.treasury_account);
    const accounting = accountingEngine.ensureAccounting(db);
    const [an, luna] = run.luna.split("-").map(Number);
    const date = validDate(req.body?.data || new Date().toISOString().slice(0, 10));
    const treasury = {
      id: accountingEngine.nextNumericId(accounting.treasury),
      uuid: crypto.randomUUID(),
      an,
      luna,
      tip: "banca",
      data: date,
      nr_document: String(req.body?.nr_document || `SAL-${run.luna}`).trim(),
      tip_operatie: "plata",
      suma: payrollRoutes.money(run.total_net),
      cont_trezorerie: profile.treasury_account || "5121",
      cont_corespondent: "421",
      corelare_tip: "salarii",
      explicatie: `Plata salarii ${run.luna}`,
      status: "validat",
      created_by: req.auth.user?.id || "",
      created_at: new Date().toISOString(),
      validated_by: req.auth.user?.id || "",
      validated_at: new Date().toISOString()
    };
    const journal = accountingEngine.generateJournalFromTreasury(db, req.auth.user, treasury);
    treasury.journal_id = journal.id;
    accounting.treasury.push(treasury);
    const payment = {
      id: payrollRoutes.nextId(hr.payrollPayments),
      uuid: `payroll-payment-${Date.now()}`,
      run_id: run.id,
      status: "platit",
      amount: treasury.suma,
      profile_id: profile.id,
      treasury_uuid: treasury.uuid,
      accounting_journal_id: journal.id,
      payment_date: date,
      created_by: req.auth.user?.id || "",
      created_at: new Date().toISOString()
    };
    hr.payrollPayments.push(payment);
    run.payment_status = "platit";
    run.paid_at = payment.created_at;
    addAudit(db, req.auth.user, "hr_payroll_payment_create", `${run.luna} / ${payment.amount}`);
    writeDb(db);
    res.status(201).json({ payment, treasury, journal });
  } catch (error) { next(error); }
});

router.post("/hr/payroll/:runId/reverse-payment", salaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = payrollRoutes.ensurePayroll(db);
    const run = payrollRoutes.findRun(hr, req.params.runId);
    const reason = String(req.body?.motiv || "").trim();
    if (reason.length < 5) throwHttp(400, "Completeaza motivul stornarii platii.");
    const payment = [...hr.payrollPayments].reverse().find((item) => item.run_id === run.id && !item.cancelled_at && item.status === "platit");
    if (!payment) throwHttp(409, "Statul nu are o plata activa.");
    const storno = accountingEngine.stornoJournal(db, req.auth.user, payment.accounting_journal_id);
    const accounting = accountingEngine.ensureAccounting(db);
    const treasury = accounting.treasury.find((item) => item.uuid === payment.treasury_uuid);
    if (treasury) {
      treasury.status = "stornat";
      treasury.storno_journal_id = storno.id;
      treasury.cancelled_at = new Date().toISOString();
      treasury.cancelled_by = req.auth.user?.id || "";
      treasury.cancelled_reason = reason;
    }
    payment.status = "stornat";
    payment.storno_journal_id = storno.id;
    payment.cancelled_at = new Date().toISOString();
    payment.cancelled_by = req.auth.user?.id || "";
    payment.cancelled_reason = reason;
    run.payment_status = "stornat";
    run.payment_reversed_at = payment.cancelled_at;
    addAudit(db, req.auth.user, "hr_payroll_payment_reverse", `${run.luna} / ${reason}`);
    writeDb(db);
    res.status(201).json({ payment, treasury, journal: storno });
  } catch (error) { next(error); }
});

function ensureAccount(db, account) {
  const accounting = accountingEngine.ensureAccounting(db);
  if (!accounting.chart.some((item) => item.activ !== false && item.simbol === String(account || ""))) {
    throwHttp(422, `Contul bancar ${account || "-"} nu exista in planul de conturi.`);
  }
}
function required(value, label) { const text = String(value || "").trim(); if (!text) throwHttp(400, `${label} este obligatorie.`); return text; }
function validDate(value) { const date = String(value || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throwHttp(400, "Data platii este invalida."); return date; }
function salaryView(req, res, next) { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, "hr:salary_view")) return; req.auth = auth; next(); }
function salaryManage(req, res, next) { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, "hr:manage")) return; req.auth = auth; next(); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = router;

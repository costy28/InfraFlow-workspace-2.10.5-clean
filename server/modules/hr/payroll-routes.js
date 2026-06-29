const { Router } = require("express");
const xlsx = require("xlsx");
const { requireAuth } = require("../../core/auth");
const { requirePermission } = require("../../core/permissions");
const { readDb, writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

const router = Router();

const DEFAULT_PROFILE = {
  id: "ro-standard-2026",
  name: "Romania - contract standard",
  effective_from: "2026-01-01",
  cas_rate: 25,
  cass_rate: 10,
  income_tax_rate: 10,
  cam_rate: 2.25,
  overtime_rate_1: 75,
  overtime_rate_2: 100,
  night_rate: 25,
  meal_tickets_taxable: false,
  meal_tickets_cass: false,
  active: true,
  system: true,
  source: "Codul fiscal si formularul D112; procentele trebuie confirmate la schimbarea legislatiei."
};

function ensurePayroll(db) {
  db.hr = db.hr || {};
  db.hr.employees = Array.isArray(db.hr.employees) ? db.hr.employees : [];
  db.hr.contracts = Array.isArray(db.hr.contracts) ? db.hr.contracts : [];
  db.hr.timeSheets = Array.isArray(db.hr.timeSheets) ? db.hr.timeSheets : [];
  db.hr.payrollProfiles = Array.isArray(db.hr.payrollProfiles) ? db.hr.payrollProfiles : [];
  db.hr.payrollRuns = Array.isArray(db.hr.payrollRuns) ? db.hr.payrollRuns : [];
  db.hr.payrollLines = Array.isArray(db.hr.payrollLines) ? db.hr.payrollLines : [];
  db.hr.payrollAdjustments = Array.isArray(db.hr.payrollAdjustments) ? db.hr.payrollAdjustments : [];
  db.hr.payrollPayments = Array.isArray(db.hr.payrollPayments) ? db.hr.payrollPayments : [];
  db.hr.payrollBankProfiles = Array.isArray(db.hr.payrollBankProfiles) ? db.hr.payrollBankProfiles : [];
  if (!db.hr.payrollProfiles.length) db.hr.payrollProfiles.push({ ...DEFAULT_PROFILE });
  if (!db.hr.payrollBankProfiles.length) {
    db.hr.payrollBankProfiles.push({
      id: "bank-generic-xlsx",
      name: "Excel bancar generic",
      format: "xlsx",
      treasury_account: "5121",
      active: true,
      system: true
    });
  }
  return db.hr;
}

function requireSalaryView(req, res, next) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  if (!requirePermission(auth, res, "hr:salary_view")) return;
  req.auth = auth;
  next();
}

function requireSalaryManage(req, res, next) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  if (!requirePermission(auth, res, "hr:manage")) return;
  req.auth = auth;
  next();
}

router.get("/hr/payroll/settings", requireSalaryView, (req, res) => {
  const hr = ensurePayroll(req.auth.db);
  res.json({ profiles: hr.payrollProfiles, current: currentProfile(hr, req.query.luna || monthNow()) });
});

router.post("/hr/payroll/settings", requireSalaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = ensurePayroll(db);
    const body = req.body || {};
    const effectiveFrom = String(body.effective_from || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throwHttp(400, "Data de intrare in vigoare este obligatorie.");
    const profile = {
      id: `payroll-profile-${Date.now()}`,
      name: String(body.name || "Profil fiscal").trim(),
      effective_from: effectiveFrom,
      cas_rate: rate(body.cas_rate, "CAS"),
      cass_rate: rate(body.cass_rate, "CASS"),
      income_tax_rate: rate(body.income_tax_rate, "impozit"),
      cam_rate: rate(body.cam_rate, "CAM"),
      overtime_rate_1: rate(body.overtime_rate_1 ?? 75, "spor suplimentar 1"),
      overtime_rate_2: rate(body.overtime_rate_2 ?? 100, "spor suplimentar 2"),
      night_rate: rate(body.night_rate ?? 25, "spor noapte"),
      meal_tickets_taxable: Boolean(body.meal_tickets_taxable),
      meal_tickets_cass: Boolean(body.meal_tickets_cass),
      active: true,
      system: false,
      source: String(body.source || "Configurat de utilizator").trim(),
      created_by: req.auth.user?.id || "",
      created_at: new Date().toISOString()
    };
    hr.payrollProfiles.push(profile);
    addAudit(db, req.auth.user, "hr_payroll_profile_create", `${profile.name} / ${profile.effective_from}`);
    writeDb(db);
    res.status(201).json({ profile });
  } catch (error) { next(error); }
});

router.get("/hr/payroll", requireSalaryView, (req, res) => {
  const hr = ensurePayroll(req.auth.db);
  const month = validMonth(req.query.luna || monthNow());
  const run = [...hr.payrollRuns].reverse().find((item) => item.luna === month && !item.cancelled_at) || null;
  const lines = run ? hr.payrollLines.filter((item) => item.run_id === run.id && !item.cancelled_at) : [];
  const payments = run ? hr.payrollPayments.filter((item) => item.run_id === run.id && !item.cancelled_at) : [];
  res.json({ luna: month, run, lines, payments, profile: run?.profile || currentProfile(hr, month) });
});

router.post("/hr/payroll/generate", requireSalaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = ensurePayroll(db);
    const month = validMonth(req.body?.luna || monthNow());
    const previous = [...hr.payrollRuns].reverse().find((item) => item.luna === month && !item.cancelled_at);
    if (previous?.status === "validat") throwHttp(409, "Statul salarial este validat. Devalideaza-l inainte de regenerare.");
    if (previous) {
      previous.cancelled_at = new Date().toISOString();
      previous.cancelled_by = req.auth.user?.id || "";
      previous.cancelled_reason = "Regenerare stat salarial";
      hr.payrollLines.filter((item) => item.run_id === previous.id && !item.cancelled_at).forEach((item) => {
        item.cancelled_at = previous.cancelled_at;
        item.cancelled_by = previous.cancelled_by;
      });
    }
    const profile = currentProfile(hr, month);
    const overrides = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    const run = {
      id: nextId(hr.payrollRuns),
      uuid: `payroll-${Date.now()}`,
      luna: month,
      status: "draft",
      profile: { ...profile },
      created_by: req.auth.user?.id || "",
      created_at: new Date().toISOString()
    };
    const lines = hr.employees
      .filter((employee) => employee.activ !== false && employee.status !== "incetat")
      .map((employee) => calculatePayrollLine(hr, employee, month, profile, overrides.find((item) => String(item.employee_id) === String(employee.id)) || {}))
      .map((line) => ({ ...line, id: nextId(hr.payrollLines), run_id: run.id, created_at: run.created_at }));
    summarizeRun(run, lines);
    hr.payrollRuns.push(run);
    hr.payrollLines.push(...lines);
    addAudit(db, req.auth.user, "hr_payroll_generate", `${month} / ${lines.length} angajati`);
    writeDb(db);
    res.status(201).json({ run, lines });
  } catch (error) { next(error); }
});

router.patch("/hr/payroll/:runId/lines/:lineId", requireSalaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = ensurePayroll(db);
    const run = findRun(hr, req.params.runId);
    if (run.status !== "draft") throwHttp(409, "Doar statul draft poate fi corectat.");
    const oldLine = hr.payrollLines.find((item) => String(item.id) === String(req.params.lineId) && item.run_id === run.id && !item.cancelled_at);
    if (!oldLine) throwHttp(404, "Linia salariala nu a fost gasita.");
    const employee = hr.employees.find((item) => String(item.id) === String(oldLine.employee_id));
    const line = calculatePayrollLine(hr, employee, run.luna, run.profile, req.body || {});
    Object.assign(oldLine, line, { id: oldLine.id, run_id: run.id, updated_at: new Date().toISOString(), updated_by: req.auth.user?.id || "" });
    summarizeRun(run, hr.payrollLines.filter((item) => item.run_id === run.id && !item.cancelled_at));
    addAudit(db, req.auth.user, "hr_payroll_line_update", `${run.luna} / ${oldLine.employee_name}`);
    writeDb(db);
    res.json({ run, line: oldLine });
  } catch (error) { next(error); }
});

router.post("/hr/payroll/:runId/validate", requireSalaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = ensurePayroll(db);
    const run = findRun(hr, req.params.runId);
    if (run.status !== "draft") throwHttp(409, "Doar statul draft poate fi validat.");
    const lines = hr.payrollLines.filter((item) => item.run_id === run.id && !item.cancelled_at);
    const errors = lines.flatMap((item) => item.errors || []);
    if (!lines.length || errors.length) throwHttp(422, errors[0] || "Statul salarial nu contine angajati.");
    run.status = "validat";
    run.validated_at = new Date().toISOString();
    run.validated_by = req.auth.user?.id || "";
    run.updated_at = run.validated_at;
    addAudit(db, req.auth.user, "hr_payroll_validate", `${run.luna} / net ${run.total_net}`);
    writeDb(db);
    res.json({ run, lines });
  } catch (error) { next(error); }
});

router.post("/hr/payroll/:runId/devalidate", requireSalaryManage, (req, res, next) => {
  try {
    const db = req.auth.db;
    const hr = ensurePayroll(db);
    const run = findRun(hr, req.params.runId);
    if (run.status !== "validat") throwHttp(409, "Statul salarial nu este validat.");
    const activePayment = hr.payrollPayments.find((item) => item.run_id === run.id && !item.cancelled_at && item.status !== "stornat");
    if (activePayment) throwHttp(409, "Storneaza plata salariala din trezorerie inainte de devalidarea statului.");
    if (run.accounting_journal_id && !run.accounting_reversed_at) throwHttp(409, "Storneaza nota contabila a statului inainte de devalidare.");
    const reason = String(req.body?.motiv || "").trim();
    if (reason.length < 5) throwHttp(400, "Motivul devalidarii trebuie completat.");
    run.status = "draft";
    run.devalidated_at = new Date().toISOString();
    run.devalidated_by = req.auth.user?.id || "";
    run.devalidation_reason = reason;
    run.updated_at = run.devalidated_at;
    addAudit(db, req.auth.user, "hr_payroll_devalidate", `${run.luna} / ${reason}`);
    writeDb(db);
    res.json({ run });
  } catch (error) { next(error); }
});

router.get("/hr/payroll/:runId/export", requireSalaryView, (req, res, next) => {
  try {
    const hr = ensurePayroll(req.auth.db);
    const run = findRun(hr, req.params.runId);
    const lines = hr.payrollLines.filter((item) => item.run_id === run.id && !item.cancelled_at);
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ["Stat salarial", run.luna, run.status, `Profil: ${run.profile?.name || "-"}`],
      [],
      ["Marca", "Nume", "Salariu baza", "Ore norma", "Ore platite", "Sporuri", "Brut", "CAS", "CASS", "Deducere", "Impozit", "Retineri", "Net", "CAM", "Cost angajator", "Observatii"],
      ...lines.map((line) => [line.marca, line.employee_name, line.salary_base, line.norm_hours, line.paid_hours, line.total_bonuses, line.gross, line.cas, line.cass, line.personal_deduction, line.income_tax, line.other_deductions, line.net, line.cam, line.employer_cost, [...(line.errors || []), ...(line.warnings || [])].join("; ")]),
      [],
      ["TOTAL", "", "", "", "", run.total_bonuses, run.total_gross, run.total_cas, run.total_cass, "", run.total_income_tax, run.total_other_deductions, run.total_net, run.total_cam, run.total_employer_cost]
    ]);
    sheet["!cols"] = [{ wch: 10 }, { wch: 32 }, ...Array(13).fill({ wch: 15 }), { wch: 60 }];
    sheet["!autofilter"] = { ref: `A3:P${Math.max(3, lines.length + 3)}` };
    xlsx.utils.book_append_sheet(workbook, sheet, "Stat salarial");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Stat_salarial_${run.luna.replace("-", "_")}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

function calculatePayrollLine(hr, employee, month, profile, override = {}) {
  const contract = activeContract(hr, employee.id, month);
  const sheets = hr.timeSheets.filter((item) => String(item.employee_id) === String(employee.id) && String(item.data || "").startsWith(month));
  const normHours = workdaysInMonth(month) * Number(contract?.norma_ore || 8);
  const workedHours = sum(sheets, "ore_lucrate");
  const leaveDays = sheets.filter((item) => ["co", "concediu_odihna"].includes(String(item.tip || "").toLowerCase())).length;
  const medicalDays = sheets.filter((item) => ["cm", "concediu_medical"].includes(String(item.tip || "").toLowerCase())).length;
  const paidHours = Math.min(normHours, workedHours + leaveDays * Number(contract?.norma_ore || 8));
  const salaryBase = num(override.salary_base ?? contract?.salariu_baza ?? employee.salariu_baza);
  const hourly = normHours > 0 ? salaryBase / normHours : 0;
  const baseGross = money(override.base_gross ?? salaryBase * paidHours / Math.max(1, normHours));
  const overtime1 = money(sum(sheets, "ore_suplimentare_s1") * hourly * profile.overtime_rate_1 / 100);
  const overtime2 = money(sum(sheets, "ore_suplimentare_s2") * hourly * profile.overtime_rate_2 / 100);
  const nightBonus = money(sum(sheets, "ore_noapte") * hourly * profile.night_rate / 100);
  const adjustments = hr.payrollAdjustments.filter((item) => adjustmentApplies(item, employee.id, month));
  const adjustmentTotal = (type) => money(adjustments.filter((item) => item.tip === type).reduce((total, item) => total + num(item.amount), 0));
  const manualBonus = money(override.manual_bonus !== undefined ? override.manual_bonus : adjustmentTotal("bonus"));
  const taxableBenefits = money(override.taxable_benefits !== undefined ? override.taxable_benefits : adjustmentTotal("beneficiu_impozabil"));
  const medicalIndemnity = money(override.medical_indemnity !== undefined ? override.medical_indemnity : adjustmentTotal("indemnizatie_medicala"));
  const mealTickets = money(override.meal_tickets !== undefined ? override.meal_tickets : adjustmentTotal("tichete_masa"));
  const taxableMealTickets = profile.meal_tickets_taxable ? mealTickets : 0;
  const totalBonuses = money(overtime1 + overtime2 + nightBonus + manualBonus + taxableBenefits + medicalIndemnity);
  const gross = money(baseGross + totalBonuses);
  const cas = money(gross * profile.cas_rate / 100);
  const cass = money((gross + (profile.meal_tickets_cass ? mealTickets : 0)) * profile.cass_rate / 100);
  const personalDeduction = money(override.personal_deduction);
  const taxBase = money(Math.max(0, gross + taxableMealTickets - cas - cass - personalDeduction));
  const incomeTax = money(taxBase * profile.income_tax_rate / 100);
  const advances = money(override.advances !== undefined ? override.advances : adjustmentTotal("avans"));
  const garnishments = money(override.garnishments !== undefined ? override.garnishments : adjustmentTotal("poprire"));
  const otherDeductionsBase = money(override.other_deductions !== undefined ? override.other_deductions : adjustmentTotal("retinere"));
  const otherDeductions = money(otherDeductionsBase + advances + garnishments);
  const net = money(Math.max(0, gross - cas - cass - incomeTax - otherDeductions));
  const cam = money(gross * profile.cam_rate / 100);
  const errors = [];
  const warnings = [];
  if (!/^\d{13}$/.test(String(employee.cnp || "").replace(/\D/g, ""))) errors.push("CNP lipsa sau invalid");
  if (!contract) errors.push("Contract activ lipsa");
  if (!(salaryBase > 0)) errors.push("Salariu de baza lipsa");
  if (!sheets.length) errors.push("Pontaj lipsa");
  if (sheets.length && !sheets.every((item) => item.validat === true || item.validat === 1)) errors.push("Pontaj nevalidat");
  if (medicalDays > 0 && medicalIndemnity <= 0) errors.push("Concediul medical necesita indemnizatie aprobata");
  const medicalAdjustments = adjustments.filter((item) => item.tip === "indemnizatie_medicala");
  if (medicalDays > 0 && medicalAdjustments.some((item) => !item.operator_confirmed)) errors.push("Confirma certificatul si indemnizatia de concediu medical");
  if (mealTickets > 0 && !profile.meal_tickets_taxable && !profile.meal_tickets_cass) warnings.push("Regimul fiscal al tichetelor este neactivat in profil; verificati configurarea aplicabila perioadei");
  if (personalDeduction === 0) warnings.push("Deducerea personala este zero; verificati daca angajatul are dreptul la deducere");
  return {
    employee_id: employee.id,
    marca: employee.marca || "",
    employee_name: `${employee.nume || ""} ${employee.prenume || ""}`.trim(),
    cnp: String(employee.cnp || ""),
    contract_id: contract?.id || null,
    salary_base: money(salaryBase),
    norm_hours: normHours,
    worked_hours: money(workedHours),
    paid_hours: money(paidHours),
    leave_days: leaveDays,
    medical_days: medicalDays,
    base_gross: baseGross,
    overtime_1: overtime1,
    overtime_2: overtime2,
    night_bonus: nightBonus,
    manual_bonus: manualBonus,
    taxable_benefits: taxableBenefits,
    medical_indemnity: medicalIndemnity,
    meal_tickets: mealTickets,
    total_bonuses: totalBonuses,
    gross,
    cas,
    cass,
    personal_deduction: personalDeduction,
    tax_base: taxBase,
    income_tax: incomeTax,
    advances,
    garnishments,
    other_deductions_base: otherDeductionsBase,
    other_deductions: otherDeductions,
    net,
    cam,
    employer_cost: money(gross + cam),
    errors,
    warnings
  };
}

function adjustmentApplies(item, employeeId, month) {
  if (item.cancelled_at || item.active === false || String(item.employee_id) !== String(employeeId)) return false;
  const start = String(item.data_start || item.luna || "").slice(0, 7);
  const end = String(item.data_sfarsit || item.luna || "9999-12").slice(0, 7);
  return (!start || start <= month) && (!end || end >= month);
}

function currentProfile(hr, month) {
  const date = `${validMonth(month)}-01`;
  return [...hr.payrollProfiles]
    .filter((item) => item.active !== false && String(item.effective_from || "") <= date)
    .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0] || { ...DEFAULT_PROFILE };
}

function activeContract(hr, employeeId, month) {
  const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toISOString().slice(0, 10);
  return hr.contracts
    .filter((item) => String(item.employee_id) === String(employeeId) && item.status !== "incetat" && (!item.data_start || item.data_start <= end))
    .sort((a, b) => String(b.data_start || b.created_at || "").localeCompare(String(a.data_start || a.created_at || "")))[0] || null;
}

function summarizeRun(run, lines) {
  ["total_bonuses", "total_meal_tickets", "total_advances", "total_garnishments", "total_gross", "total_cas", "total_cass", "total_income_tax", "total_other_deductions", "total_net", "total_cam", "total_employer_cost"].forEach((key) => { run[key] = 0; });
  lines.forEach((line) => {
    run.total_bonuses += line.total_bonuses;
    run.total_meal_tickets += line.meal_tickets || 0;
    run.total_advances += line.advances || 0;
    run.total_garnishments += line.garnishments || 0;
    run.total_gross += line.gross;
    run.total_cas += line.cas;
    run.total_cass += line.cass;
    run.total_income_tax += line.income_tax;
    run.total_other_deductions += line.other_deductions;
    run.total_net += line.net;
    run.total_cam += line.cam;
    run.total_employer_cost += line.employer_cost;
  });
  Object.keys(run).filter((key) => key.startsWith("total_")).forEach((key) => { run[key] = money(run[key]); });
  run.employee_count = lines.length;
  run.error_count = lines.reduce((total, line) => total + (line.errors || []).length, 0);
  run.warning_count = lines.reduce((total, line) => total + (line.warnings || []).length, 0);
  run.updated_at = new Date().toISOString();
}

function workdaysInMonth(month) {
  const [year, value] = month.split("-").map(Number);
  const days = new Date(year, value, 0).getDate();
  let count = 0;
  for (let day = 1; day <= days; day += 1) {
    const weekDay = new Date(year, value - 1, day).getDay();
    if (weekDay !== 0 && weekDay !== 6) count += 1;
  }
  return count;
}

function findRun(hr, value) {
  const run = hr.payrollRuns.find((item) => String(item.id) === String(value) || item.uuid === value);
  if (!run || run.cancelled_at) throwHttp(404, "Statul salarial nu a fost gasit.");
  return run;
}

function validMonth(value) {
  const month = String(value || "").slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throwHttp(400, "Luna trebuie sa aiba formatul YYYY-MM.");
  return month;
}

function monthNow() { return new Date().toISOString().slice(0, 7); }
function nextId(items) { return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1; }
function rate(value, label) { const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 100) throwHttp(400, `Cota ${label} este invalida.`); return number; }
function sum(items, key) { return items.reduce((total, item) => total + num(item[key]), 0); }
function num(value) { return Number(value || 0); }
function money(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

router.ensurePayroll = ensurePayroll;
router.calculatePayrollLine = calculatePayrollLine;
router.workdaysInMonth = workdaysInMonth;
router.findRun = findRun;
router.summarizeRun = summarizeRun;
router.money = money;
router.validMonth = validMonth;
router.nextId = nextId;

module.exports = router;

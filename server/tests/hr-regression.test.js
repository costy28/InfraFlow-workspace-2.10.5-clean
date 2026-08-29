const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeEmployee } = require("../modules/hr/data-policy");
const { assertTimesheetOpen, findTimesheetLock } = require("../modules/hr/timesheet-locks");
const { analyzeRegesWorkRegister, assertRegesWorkRegisterExportable, buildRegesWorkRow, buildRegesDiagnosticWorkbook, buildInternalXml } = require("../modules/hr/reges-work-register");
const { getEmployeeRegistryProfile } = require("../shared/countryRules");
const { dailyOvertime, overtimePaymentStatus } = require("../modules/hr/overtime-policy");
const { weeklyControls, mondayOf } = require("../modules/hr/working-time-policy");
const { calendarDays, missingMedicalField } = require("../modules/hr/medical-leave-policy");
const { indemnityPercent, payerSplit, buildMedicalRegister } = require("../modules/hr/medical-leave-register");
const { applyCompensatedHours } = require("../modules/hr/timesheet-compensation");
const payrollRouter = require("../modules/hr/payroll-routes");

test("datele personale si medicale sunt ascunse fara permisiuni", () => {
  const value = sanitizeEmployee({ id: 1, nume: "Popescu", cnp: "123", iban: "RO00", email: "a@b.ro", apt_medical_expira: "2026-01-01", salariu_baza: 5000 });
  assert.equal(value.nume, "Popescu");
  assert.equal(value.cnp, undefined);
  assert.equal(value.iban, undefined);
  assert.equal(value.email, undefined);
  assert.equal(value.apt_medical_expira, undefined);
  assert.equal(value.salariu_baza, undefined);
});

test("angajatul isi poate vedea propriile date", () => {
  const value = sanitizeEmployee({ cnp: "123", iban: "RO00", apt_medical_expira: "2026-01-01", salariu_baza: 5000 }, { own: true });
  assert.equal(value.cnp, "123");
  assert.equal(value.salariu_baza, 5000);
});

test("luna de pontaj blocata refuza modificari", () => {
  const db = { hr: { timesheetLocks: [{ id: 1, luna: "2026-07", locked_at: "2026-08-01" }] } };
  assert.ok(findTimesheetLock(db, "2026-07"));
  assert.throws(() => assertTimesheetOpen(db, "2026-07"), (error) => error.status === 409 && error.code === "HR_TIMESHEET_MONTH_LOCKED");
  assert.doesNotThrow(() => assertTimesheetOpen(db, "2026-08"));
});

test("exportul REGES este marcat explicit ca fisier intern", () => {
  const row = buildRegesWorkRow({ cnp: "123", nume: "Popescu" }, { numar_contract: "10", data_start: "2026-01-01" }, { cui: "RO1" });
  assert.equal(row.Data_incepere, "2026-01-01");
  const xml = buildInternalXml(row);
  assert.match(xml, /official="false"/);
  assert.match(xml, /Nu este fisier oficial/);
  assert.doesNotMatch(xml, /<ReviSal/);
});

test("diagnosticul registrului intern semnaleaza lipsurile obligatorii", () => {
  const diagnostic = analyzeRegesWorkRegister(
    [{ id: 1, cnp: "", nume: "Popescu", prenume: "Ion", marca: "10" }],
    [{ id: 7, employee_id: 1, status: "activ", numar_contract: "", data_start: "2026-01-01" }],
    { cui: "RO1" }
  );

  assert.equal(diagnostic.summary.total, 1);
  assert.equal(diagnostic.summary.blocker, 1);
  assert.deepEqual(diagnostic.rows[0].missing, ["CNP", "număr contract", "dată contract"]);
});

test("exportul registrului intern este blocat cand exista lipsuri obligatorii", () => {
  const blocked = analyzeRegesWorkRegister(
    [{ id: 1, cnp: "", nume: "Popescu", prenume: "Ion" }],
    [{ id: 7, employee_id: 1, status: "activ", numar_contract: "", data_contract: "", data_start: "2026-01-01" }],
    { cui: "RO1" }
  );
  assert.throws(
    () => assertRegesWorkRegisterExportable(blocked),
    (error) => error.status === 422 && error.code === "HR_REGES_WORK_REGISTER_BLOCKED" && /Popescu Ion/.test(error.message)
  );

  const warningOnly = analyzeRegesWorkRegister(
    [{ id: 2, cnp: "1800101010011", nume: "Ionescu", prenume: "Ana" }],
    [{ id: 8, employee_id: 2, status: "activ", numar_contract: "12", data_contract: "2026-01-01", data_start: "2026-01-02" }],
    { cui: "RO1" }
  );
  assert.equal(assertRegesWorkRegisterExportable(warningOnly), true);
});

test("diagnosticul registrului intern se poate exporta in workbook cu sumar si probleme", () => {
  const diagnostic = analyzeRegesWorkRegister(
    [{ id: 1, cnp: "", nume: "Popescu", prenume: "Ion", marca: "10" }],
    [{ id: 7, employee_id: 1, status: "activ", numar_contract: "", data_start: "2026-01-01" }],
    { cui: "RO1" }
  );
  const workbook = buildRegesDiagnosticWorkbook(diagnostic);

  assert.deepEqual(workbook.SheetNames, ["Sumar", "Diagnostic"]);
  const rows = require("xlsx").utils.sheet_to_json(workbook.Sheets.Diagnostic);
  assert.equal(rows[0].Status, "Blocat");
  assert.match(rows[0]["Lipsuri obligatorii"], /CNP/);
  assert.match(rows[0]["Acțiune recomandată"], /Completează/);
});

test("registrul oficial al salariatilor este adaptor pe tara, nu regula globala", () => {
  const roRegistry = getEmployeeRegistryProfile("RO");
  const gbRegistry = getEmployeeRegistryProfile("GB");

  assert.equal(roRegistry.enabled, true);
  assert.equal(roRegistry.adapter_key, "reges_online_ro");
  assert.equal(roRegistry.label, "REGES-Online");
  assert.equal(gbRegistry.enabled, false);
  assert.equal(gbRegistry.status, "generic");
});

test("12 ore lucrate la norma de 8 genereaza 4 ore suplimentare", () => {
  assert.equal(dailyOvertime(12, 8), 4);
  assert.equal(dailyOvertime(12, 12), 0);
  assert.equal(dailyOvertime(8, 8, 2, 0), 2);
});

test("orele necompensate devin scadente dupa 90 de zile", () => {
  const status = overtimePaymentStatus("2026-01-01", 4, new Date("2026-04-15T12:00:00"));
  assert.equal(status.overdue, true);
  assert.equal(status.minimumBonusPercent, 75);
});

test("controlul saptamanal semnaleaza depasirea pragului operational", () => {
  const rows = weeklyControls([
    { employee_id: 1, data: "2026-07-06", ore_lucrate: 10 },
    { employee_id: 1, data: "2026-07-07", ore_lucrate: 10 },
    { employee_id: 1, data: "2026-07-08", ore_lucrate: 10 },
    { employee_id: 1, data: "2026-07-09", ore_lucrate: 10 },
    { employee_id: 1, data: "2026-07-10", ore_lucrate: 10 },
  ]);
  assert.equal(mondayOf("2026-07-08"), "2026-07-06");
  assert.equal(rows[0].total_hours, 50);
  assert.equal(rows[0].status, "warning");
});

test("certificatul medical calculeaza inclusiv zilele calendaristice", () => {
  assert.equal(calendarDays("2026-07-08", "2026-07-10"), 3);
  assert.equal(calendarDays("2026-07-10", "2026-07-08"), 0);
});

test("certificatul medical cere datele de identificare si emitent", () => {
  const complete = { serie: "CCMAA", numar: "123", data_acordarii: "2026-07-08", data_start: "2026-07-08", data_sfarsit: "2026-07-10", cod_indemnizatie: "01", medic_nume: "Dr. Test", cod_parafa: "P123", unitate_emitenta: "CMI Test" };
  assert.equal(missingMedicalField(complete), null);
  assert.equal(missingMedicalField({ ...complete, cod_parafa: "" }), "cod_parafa");
});

test("codul 01 foloseste procentele episodului aplicabile din august 2025", () => {
  assert.equal(indemnityPercent("01", 7), 55);
  assert.equal(indemnityPercent("01", 10), 65);
  assert.equal(indemnityPercent("01", 16), 75);
});

test("regula temporara 2026 separa prima zi angajatorul si FNUASS", () => {
  assert.deepEqual(payerSplit("2026-07-06", "2026-07-14", "01"), { workdays: 7, unpaid_days: 1, employer_days: 4, fund_days: 2 });
});

test("certificatul in continuare pastreaza episodul initial", () => {
  const rows = buildMedicalRegister([
    { employee_id: 1, data_start: "2026-07-01", data_sfarsit: "2026-07-07", tip_certificat: "initial", cod_indemnizatie: "01" },
    { employee_id: 1, data_start: "2026-07-08", data_sfarsit: "2026-07-14", tip_certificat: "continuare", cod_indemnizatie: "01" },
  ]);
  assert.equal(rows[1].episode_start, "2026-07-01");
  assert.equal(rows[1].episode_days, 14);
  assert.equal(rows[1].indemnity_percent, 65);
});

test("validarea impartirii CM se face pe fiecare indemnizatie, fara a amesteca ajustarile vechi", () => {
  assert.equal(payrollRouter.hasInvalidMedicalSplit({ amount: 564 }), false);
  assert.equal(payrollRouter.hasInvalidMedicalSplit({ amount: 107.25, medical_employer_amount: 107.25, medical_fund_amount: 0 }), false);
  assert.equal(payrollRouter.hasInvalidMedicalSplit({ amount: 107.25, medical_employer_amount: 50, medical_fund_amount: 10 }), true);
});

test("diagnosticul salarizarii explica lipsa contractului si pontajul nevalidat", () => {
  const hr = {
    contracts: [{ id: 7, employee_id: 1, status: "incetat", data_start: "2026-01-01", created_at: "2026-01-01T00:00:00.000Z" }],
    timeSheets: [{ id: 11, employee_id: 1, data: "2026-07-06", ore_lucrate: 8, tip: "lucru", validat: false, updated_at: "2026-07-08T10:00:00.000Z" }],
    payrollAdjustments: []
  };
  const details = payrollRouter.buildPayrollSourceDiagnostics(hr, { id: 1, nume: "Giza", prenume: "Nadia", marca: "356" }, "2026-07", null, hr.timeSheets, [], { name: "Profil" }, { created_at: "2026-07-07T10:00:00.000Z" });
  assert.equal(details.contract.found, false);
  assert.equal(details.contract.candidates.length, 1);
  assert.equal(details.timesheet.found, true);
  assert.equal(details.timesheet.invalid_entries, 1);
  assert.equal(details.source_changed_after_run, true);
  assert.ok(details.warnings.some((item) => item.includes("niciunul nu este eligibil")));
});

test("timpul liber compensatoriu actualizeaza automat pontajul", () => {
  const partial = applyCompensatedHours({ ore_lucrate: 8, ore_compensate: 0, tip: "lucru" }, 2);
  assert.equal(partial.ore_lucrate, 6);
  assert.equal(partial.ore_compensate, 2);
  const full = applyCompensatedHours({ ore_lucrate: 8, tip: "lucru" }, 8);
  assert.equal(full.ore_lucrate, 0);
  assert.equal(full.tip, "liber");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeEmployee } = require("../modules/hr/data-policy");
const { assertTimesheetOpen, findTimesheetLock } = require("../modules/hr/timesheet-locks");
const { buildRegesWorkRow, buildInternalXml } = require("../modules/hr/reges-work-register");
const { dailyOvertime, overtimePaymentStatus } = require("../modules/hr/overtime-policy");
const { weeklyControls, mondayOf } = require("../modules/hr/working-time-policy");
const { calendarDays, missingMedicalField } = require("../modules/hr/medical-leave-policy");

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
  const row = buildRegesWorkRow({ cnp: "123", nume: "Popescu" }, { numar_contract: "10" }, { cui: "RO1" });
  const xml = buildInternalXml(row);
  assert.match(xml, /official="false"/);
  assert.match(xml, /Nu este fisier oficial/);
  assert.doesNotMatch(xml, /<ReviSal/);
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

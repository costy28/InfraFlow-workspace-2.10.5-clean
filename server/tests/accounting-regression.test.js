const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../modules/accounting/accounting-engine");
const declarations = require("../modules/accounting/declaration-routes");
const snapshots = require("../modules/accounting/period-snapshots");
const operations = require("../modules/accounting/operations-routes");

function fixture() {
  const db = { settings: { general: { cif: "RO9126534", companyName: "Companie Test" } } };
  const accounting = engine.ensureAccounting(db);
  accounting.thirdParties.push({ id: 1, cod: "00001", denumire: "Tert Test", cui: "RO12345678", tara: "RO", activ: true });
  return { db, accounting, user: { id: 1, name: "Tester" } };
}

test("nota contabila echilibrata alimenteaza fisa de cont", () => {
  const { db, user } = fixture();
  engine.createJournal(db, user, {
    an: 2026,
    luna: 6,
    data: "2026-06-10",
    nr_document: "NC-1",
    lines: [
      { cont_simbol: "628", debit: 100, credit: 0 },
      { cont_simbol: "401", debit: 0, credit: 100 }
    ]
  });
  const ledger = engine.ledger(db, "628", "2026-06-01", "2026-06-30");
  assert.equal(ledger.total_debit, 100);
  assert.equal(ledger.sold_final, 100);
  assert.deepEqual(ledger.movements[0].conturi_corespondente, ["401"]);
  assert.equal(ledger.monthly_summary[0].luna, "2026-06");
});

test("perioada inchisa blocheaza note noi", () => {
  const { db, accounting, user } = fixture();
  accounting.periods.push({ id: 1, an: 2026, luna: 6, status: "inchisa" });
  assert.throws(() => engine.createJournal(db, user, {
    an: 2026,
    luna: 6,
    data: "2026-06-10",
    lines: [{ cont_simbol: "628", debit: 10 }, { cont_simbol: "401", credit: 10 }]
  }), /este inchisa/);
});

test("D394 grupeaza documentele romanesti si pastreaza detaliul", () => {
  const { db, accounting } = fixture();
  accounting.invoicesOut.push({ id: 1, an: 2026, luna: 6, data: "2026-06-12", numar: "F-1", status: "validat", client_id: 1, valoare: 100, tva_procent: 21, tva: 21, total: 121 });
  const report = declarations.buildD394Data(db, { perioada: "2026-06" });
  assert.equal(report.ready, true);
  assert.equal(report.terti.length, 1);
  assert.deepEqual(report.terti[0].cote, [21]);
  assert.equal(report.detalii[0].document, "F-1");
  assert.equal(report.totaluri.total, 121);
});

test("diagnosticul SAF-T semnaleaza maparile lipsa", () => {
  const { db, accounting } = fixture();
  accounting.thirdParties.push({ id: 2, cod: "00002", denumire: "Tert fara CUI", tara: "RO", activ: true });
  const report = declarations.buildSaftReadiness(db, { perioada: "2026-06" });
  assert.equal(report.ready, false);
  assert.ok(report.issues.some((item) => item.area === "Terti"));
  assert.ok(report.coverage < 100);
});

test("snapshotul perioadei are versiune si checksum stabil", () => {
  const { db, accounting, user } = fixture();
  engine.createJournal(db, user, {
    an: 2026,
    luna: 6,
    data: "2026-06-10",
    nr_document: "NC-2",
    lines: [{ cont_simbol: "628", debit: 50 }, { cont_simbol: "401", credit: 50 }]
  });
  const snapshot = snapshots.createPeriodSnapshot(db, user, 2026, 6, { checks: { balance_ok: true }, vat: {} });
  snapshots.addPeriodEvent(db, user, 2026, 6, "inchidere", { snapshot_id: snapshot.id });
  const history = snapshots.periodHistory(db, 2026, 6);
  assert.equal(snapshot.versiune, 1);
  assert.match(snapshot.checksum, /^[a-f0-9]{64}$/);
  assert.equal(history.events.length, 1);
  assert.equal(history.latest_snapshot.id, snapshot.id);
  assert.equal(accounting.periodSnapshots.length, 1);
});

test("extrasul bancar normalizeaza debitul ca plata", () => {
  const row = operations.normalizeBankRow({ Data: "15.06.2026", Debit: "1.234,50", Referinta: "OP-10", Detalii: "Plata furnizor" });
  assert.equal(row.data, "2026-06-15");
  assert.equal(row.suma, -1234.5);
  assert.equal(row.referinta, "OP-10");
});

test("sincronizarea stocului identifica miscarile cu valoare", () => {
  const { db } = fixture();
  db.materials = [{ id: "m1", name: "Material", averageCost: 10 }];
  db.stockMovements = [{ id: "s1", type: "manual_out", materialId: "m1", date: "2026-06-20", amount: -5 }];
  const status = operations.buildStockSyncStatus(db, "2026-06");
  assert.equal(status.pending.length, 1);
  assert.equal(status.pending[0].lines[0].debit, 50);
});

test("amortizarea lunara respecta valoarea reziduala", () => {
  const amount = operations.monthlyDepreciation({ acquisition_value: 1200, residual_value: 0, useful_life_months: 12, accumulated_depreciation: 1100, depreciation_start: "2026-01-01" }, 2026, 12);
  assert.equal(amount, 100);
});

test("verificarea inchiderii anuale calculeaza rezultatul", () => {
  const { db, user } = fixture();
  engine.createJournal(db, user, {
    an: 2026, luna: 12, data: "2026-12-20", nr_document: "NC-AN",
    lines: [{ cont_simbol: "628", debit: 100 }, { cont_simbol: "704", credit: 100 }]
  });
  const check = operations.buildAnnualCloseCheck(db, 2026);
  assert.equal(check.can_close, true);
  assert.equal(check.expenses, 100);
  assert.equal(check.revenues, 100);
  assert.equal(check.result, 0);
});

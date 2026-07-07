const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../modules/accounting/accounting-engine");
const declarations = require("../modules/accounting/declaration-routes");
const fiscal = require("../modules/accounting/fiscal-register");
const snapshots = require("../modules/accounting/period-snapshots");
const operations = require("../modules/accounting/operations-routes");
const advancedOperations = require("../modules/accounting/operations-advanced-routes");
const controls = require("../modules/accounting/accounting-control-routes");
const settlements = require("../modules/accounting/settlement-routes");
const accountingRoutes = require("../modules/accounting/accounting-routes");
const procurement = require("../modules/procurement/routes");
const anafRoutes = require("../modules/anaf/routes");
const payrollRoutes = require("../modules/hr/payroll-routes");
const d112Generator = require("../modules/accounting/d112-generator");
const payrollObligations = require("../modules/hr/payroll-obligation-routes");
const officialValidator = require("../modules/accounting/official-validator");
const endToEndAudit = require("../modules/accounting/end-to-end-audit-routes");
const declarationCandidates = require("../modules/accounting/declaration-candidates");
const schemaProfiles = require("../modules/accounting/schema-profiles");
const financialStatements = require("../modules/accounting/financial-statement-routes");
const declarationAdapters = require("../modules/accounting/declaration-adapters");
const saftGenerator = require("../modules/accounting/saft-generator");
const xsdValidator = require("../modules/accounting/xsd-validator");
const d205Validator = require("../modules/accounting/d205-validator");
const spvClient = require("../modules/anaf/spv-client");
const saftGuidance = require("../modules/accounting/saft-guidance");
const fiscalWorkspace = require("../modules/accounting/fiscal-workspace-routes");
const saftIntegrity = require("../modules/accounting/saft-integrity");
const fiscalDossier = require("../modules/accounting/fiscal-dossier");
const AdmZip = require("adm-zip");
const fiscalSubmission = require("../modules/accounting/fiscal-submission");
const fiscalExtras = require("../modules/accounting/fiscal-extras");

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

test("pregatirea D112 verifica angajatii contractele si pontajul", () => {
  const { db } = fixture();
  db.hr = {
    employees: [{ id: 1, marca: "150", nume: "Popescu", prenume: "Ion", cnp: "1800101223344", activ: true }],
    contracts: [{ id: 1, employee_id: 1, nr_contract: "CIM-1", data_start: "2026-01-01", salariu_baza: 5000, status: "activ" }],
    timeSheets: [{ id: 1, employee_id: 1, data: "2026-06-02", ore_lucrate: 8, validat: true }],
    payrollRuns: [{ id: 1, uuid: "payroll-1", luna: "2026-06", status: "validat", employee_count: 1, error_count: 0, total_gross: 5000, total_net: 2925 }],
    payrollLines: [{ id: 1, run_id: 1, employee_id: 1, gross: 5000, net: 2925 }]
  };
  const report = declarations.buildD112Readiness(db, { perioada: "2026-06" });
  assert.equal(report.ready, true);
  assert.equal(report.final_export_available, false);
  assert.equal(report.totals.employees, 1);
  assert.equal(report.employees[0].hours, 8);
  assert.equal(report.payroll.employee_count, 1);
});

test("D112 asteapta statul salarial validat", () => {
  const { db } = fixture();
  db.hr = {
    employees: [{ id: 1, nume: "Popescu", cnp: "1800101223344", activ: true }],
    contracts: [{ id: 1, employee_id: 1, data_start: "2026-01-01", salariu_baza: 5000, status: "activ" }],
    timeSheets: [{ id: 1, employee_id: 1, data: "2026-06-02", ore_lucrate: 8, validat: true }]
  };
  const report = declarations.buildD112Readiness(db, { perioada: "2026-06" });
  assert.equal(report.ready_inputs, true);
  assert.equal(report.ready, false);
  assert.equal(report.status, "asteapta_stat_salarial");
});

test("calculul salarial standard determina contributiile si netul", () => {
  const hr = payrollRoutes.ensurePayroll({ hr: {} });
  hr.contracts.push({ id: 1, employee_id: 1, data_start: "2026-01-01", salariu_baza: 5000, norma_ore: 8, status: "activ" });
  const days = payrollRoutes.workdaysInMonth("2026-06");
  for (let day = 1, added = 0; added < days; day += 1) {
    const date = new Date(2026, 5, day);
    if (![0, 6].includes(date.getDay())) {
      hr.timeSheets.push({ employee_id: 1, data: `2026-06-${String(day).padStart(2, "0")}`, ore_lucrate: 8, validat: true });
      added += 1;
    }
  }
  const line = payrollRoutes.calculatePayrollLine(hr, { id: 1, nume: "Popescu", prenume: "Ion", cnp: "1800101223344" }, "2026-06", hr.payrollProfiles[0], {});
  assert.equal(line.gross, 5000);
  assert.equal(line.cas, 1250);
  assert.equal(line.cass, 500);
  assert.equal(line.income_tax, 325);
  assert.equal(line.net, 2925);
  assert.equal(line.cam, 112.5);
  assert.equal(line.employer_cost, 5112.5);
  assert.deepEqual(line.errors, []);
});

test("checklistul fiscal semnaleaza lipsa salarizarii si e-Factura", () => {
  const { db, accounting } = fixture();
  db.hr = {
    employees: [{ id: 1, nume: "Popescu", cnp: "1800101223344", activ: true }],
    contracts: [{ id: 1, employee_id: 1, data_start: "2026-01-01", salariu_baza: 5000, status: "activ" }],
    timeSheets: [{ id: 1, employee_id: 1, data: "2026-06-02", ore_lucrate: 8, validat: true }]
  };
  accounting.invoicesOut.push({ id: 1, uuid: "out-1", an: 2026, luna: 6, status: "validat" });
  const report = declarations.buildFiscalMonthCheck(db, { perioada: "2026-06" });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.key === "d112").ok, false);
  assert.equal(report.checks.find((item) => item.key === "efactura_unlinked").ok, false);
});

test("pregatirea D112 explica datele lipsa fara a calcula contributii", () => {
  const { db } = fixture();
  db.hr = { employees: [{ id: 2, marca: "151", nume: "Ionescu", activ: true }], contracts: [], timeSheets: [] };
  const report = declarations.buildD112Readiness(db, { perioada: "2026-06" });
  assert.equal(report.ready, false);
  assert.ok(report.issues.some((item) => item.message.includes("CNP")));
  assert.ok(report.issues.some((item) => item.message.includes("contract")));
  assert.ok(report.issues.some((item) => item.message.includes("pontaj")));
});

test("statusul e-Factura se propaga inapoi in factura contabila", () => {
  const { db, accounting } = fixture();
  accounting.invoicesOut.push({ id: 7, uuid: "invoice-7", status: "validat" });
  const linked = anafRoutes.syncAccountingInvoiceStatus(db, { id: 70, accounting_invoice_uuid: "invoice-7", status: "acceptata", updated_at: "2026-06-28T10:00:00Z" });
  assert.equal(linked.efactura_id, 70);
  assert.equal(linked.efactura_status, "acceptata");
  assert.equal(accounting.invoicesOut[0].status, "validat");
});

test("validarea e-Factura respinge documentul incomplet", () => {
  const errors = anafRoutes.validateEInvoice({
    numar_factura: '', data_factura: '2026-06-28', emitent: {}, partener: {}, linii: [],
    totalFaraTVA: 0, totalTVA: 0, totalCuTVA: 0
  });
  assert.ok(errors.some((item) => item.includes("Numarul")));
  assert.ok(errors.some((item) => item.includes("emitentului")));
  assert.ok(errors.some((item) => item.includes("cel putin o linie")));
});

test("validarea e-Factura compara totalul cu factura contabila", () => {
  const db = { accounting: { invoicesOut: [{ uuid: "out-1", total: 121, tva: 21 }] } };
  const errors = anafRoutes.validateEInvoice({
    numar_factura: 'IF-1', data_factura: '2026-06-28',
    emitent: { cif: 'RO9126534', denumire: 'Emitent' }, partener: { cif: '12345678', denumire: 'Client' },
    linii: [{ descriere: 'Servicii', cantitate: 1, pretUnitar: 90, cotaTVA: 21, valoareFaraTVA: 90, valoareTVA: 18.9 }],
    totalFaraTVA: 90, totalTVA: 18.9, totalCuTVA: 108.9, accounting_invoice_uuid: 'out-1'
  }, db);
  assert.ok(errors.some((item) => item.includes("Totalul difera")));
  assert.ok(errors.some((item) => item.includes("TVA-ul difera")));
});

test("fluxul e-Factura blocheaza sarirea etapelor", () => {
  assert.doesNotThrow(() => anafRoutes.assertStatusTransition('draft', 'validata', false));
  assert.throws(() => anafRoutes.assertStatusTransition('draft', 'acceptata', true), /nu este permisa/);
  assert.throws(() => anafRoutes.assertStatusTransition('acceptata', 'draft', true), /nu este permisa/);
});

test("diagnosticul SAF-T include schema taxe mijloace fixe si trezorerie", () => {
  const { db, accounting } = fixture();
  accounting.anafSchemas.push({ id: 1, code: "SAF-T", active: true, original_name: "saft.zip", sha256: "abc" });
  accounting.fixedAssets.push({ id: 1, inventory_number: "MF-1", acquisition_value: 1000, active: true });
  accounting.treasury.push({ id: 1, an: 2026, luna: 6, status: "validat", cont_trezorerie: "5121", cont_corespondent: "401" });
  const report = declarations.buildSaftReadiness(db, { perioada: "2026-06" });
  assert.ok(report.areas.some((item) => item.label === "Schema SAF-T" && item.ok));
  assert.ok(report.areas.some((item) => item.label === "Mijloace fixe" && item.ok));
  assert.ok(report.areas.some((item) => item.label === "Trezorerie" && item.ok));
});

test("registrul fiscal grupeaza istoricul si pastreaza ultima stare", () => {
  const runs = [
    { id: 1, code: "D300", an: 2026, luna: 6, status: "validat_intern", validated_at: "2026-06-20T10:00:00Z" },
    { id: 2, code: "D300", an: 2026, luna: 6, status: "exportat", updated_at: "2026-06-20T11:00:00Z" },
    { id: 3, code: "D394", an: 2026, luna: 6, status: "cu_erori", updated_at: "2026-06-20T09:00:00Z" }
  ];
  const report = fiscal.buildRegister(runs, fiscal.declarationPeriod("2026-06"));
  assert.equal(report.declarations[0].latest.id, 2);
  assert.equal(report.declarations[1].latest.status, "cu_erori");
});

test("registrul fiscal valideaza tranzitiile si extensiile recipisei", () => {
  assert.equal(fiscal.canExport({ status: "validat_intern" }), true);
  assert.equal(fiscal.canExport({ status: "cu_erori" }), false);
  assert.equal(fiscal.runStatusFromReceipt("acceptata"), "acceptat");
  assert.equal(fiscal.runStatusFromReceipt("respinsa"), "respins");
  assert.match(fiscal.safeStoredName("recipisa.pdf", "D300_2026-06"), /\.pdf$/);
  assert.equal(fiscal.safeStoredName("script.exe", "D300"), null);
});

test("controlul TVA confirma documente, jurnale si balanta", () => {
  const { db, accounting, user } = fixture();
  accounting.invoicesOut.push({ id: 11, an: 2026, luna: 6, data: "2026-06-12", numar: "F-11", status: "validat", client_id: 1, valoare: 100, tva: 21, total: 121 });
  engine.createJournal(db, user, { an: 2026, luna: 6, data: "2026-06-12", nr_document: "F-11", lines: [{ cont_simbol: "4111", debit: 121 }, { cont_simbol: "704", credit: 100 }, { cont_simbol: "4427", credit: 21 }] });
  accounting.periods.push({ id: 1, an: 2026, luna: 6, status: "inchisa", tva_verificat_la: new Date().toISOString() });
  const report = declarations.buildDeclarationReadiness(db, { perioada: "2026-06" });
  assert.equal(report.vat_control.documents_consistent, true);
  assert.equal(report.vat_control.balance_consistent, true);
  assert.equal(report.vat_control.balance_balanced, true);
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

test("profilul extrasului bancar este detectat din antete", () => {
  assert.equal(operations.detectBankProfile([{ "Data operatiunii": "", "Detalii tranzactie": "" }]), "Banca Transilvania");
  assert.equal(operations.detectBankProfile([{ Booking_Date: "", Transaction_Description: "" }]), "ING");
});

test("reconcilierea bancara sugereaza factura dupa suma si document", () => {
  const { db, accounting } = fixture();
  accounting.invoicesOut.push({ id: 7, uuid: "f7", an: 2026, luna: 6, numar: "IF-77", client_id: 1, total: 121, incasat: 0, neincasat: 121, status: "validat" });
  accounting.treasury.push({ id: 3, uuid: "t3", an: 2026, luna: 6, tip: "banca", tip_operatie: "incasare", suma: 121, nr_document: "IF-77", explicatie: "Incasare IF-77", status: "draft", corelare_tip: "neclasificat" });
  const report = advancedOperations.buildBankReconciliation(db, "2026-06");
  assert.equal(report.summary.suggested, 1);
  assert.equal(report.operations[0].best_suggestion.invoice_id, 7);
  assert.equal(report.operations[0].best_suggestion.score, 85);
});

test("evaluarea CMP recalculeaza costul iesirilor cronologic", () => {
  const { db } = fixture();
  db.materials = [{ id: "m1", cod: "MAT", name: "Material" }];
  db.stockMovements = [
    { id: "i1", materialId: "m1", date: "2026-06-01", amount: 10, unitPrice: 10 },
    { id: "i2", materialId: "m1", date: "2026-06-02", amount: 10, unitPrice: 20 },
    { id: "o1", materialId: "m1", date: "2026-06-03", amount: -4 }
  ];
  const report = advancedOperations.buildStockValuation(db, "2026-06");
  assert.equal(report.movement_costs.o1, 15);
  assert.equal(report.rows[0].quantity, 16);
  assert.equal(report.rows[0].value, 240);
});

test("reportarea soldurilor exclude conturile de venituri si cheltuieli", () => {
  const { db, accounting, user } = fixture();
  engine.createJournal(db, user, {
    an: 2026, luna: 12, data: "2026-12-31", nr_document: "CAPITAL",
    lines: [{ cont_simbol: "5121", debit: 500 }, { cont_simbol: "1012", credit: 500 }]
  });
  accounting.annualClosings.push({ id: 1, an: 2026, status: "generat" });
  const check = advancedOperations.buildCarryforwardCheck(db, 2026);
  assert.equal(check.can_carryforward, true);
  assert.ok(check.entries.some((item) => item.cont_simbol === "5121" && item.debit === 500));
  assert.ok(check.entries.every((item) => !["6", "7"].includes(item.cont_simbol[0])));
});

test("D300 ramane in lucru cand TVA-ul nu corespunde conturilor", () => {
  const { db, accounting } = fixture();
  accounting.invoicesOut.push({ id: 9, an: 2026, luna: 6, data: "2026-06-10", numar: "F9", status: "validat", client_id: 1, valoare: 100, tva: 21, total: 121 });
  accounting.periods.push({ id: 1, an: 2026, luna: 6, status: "deschisa", tva_verificat_la: new Date().toISOString() });
  const readiness = declarations.buildDeclarationReadiness(db, { perioada: "2026-06" });
  assert.equal(readiness.vat_control.consistent, false);
  assert.equal(readiness.declarations.find((item) => item.code === "D300").status, "in_lucru");
});

test("receptia propune factura dupa document si furnizor", () => {
  const { db, accounting } = fixture();
  db.procurementReceipts = [{ id: "r1", date: "2026-06-11", document: "NIR-44", orderNo: "PO-1", supplier: "Tert Test", materialName: "Bitum", amount: 10 }];
  accounting.invoicesIn.push({ id: 4, uuid: "fi4", an: 2026, luna: 6, nr_document: "NIR-44", furnizor_id: 1, total: 500, status: "validat", lines: [{ denumire: "Bitum rutier" }] });
  const report = controls.buildInventoryInvoiceReconciliation(db, "2026-06");
  assert.equal(report.summary.suggested, 1);
  assert.equal(report.rows[0].best_suggestion.score, 100);
});

test("auditul detecteaza documentele validate fara nota", () => {
  const { db, accounting } = fixture();
  accounting.invoicesIn.push({ id: 5, an: 2026, luna: 6, nr_document: "F-5", furnizor_id: 1, status: "validat", journal_id: null });
  const report = controls.buildIntegrityAudit(db, "2026-06");
  assert.equal(report.status, "needs_attention");
  assert.ok(report.issues.some((item) => item.area === "Documente"));
});

test("planul de amortizare inchide valoarea amortizabila", () => {
  const schedule = controls.buildDepreciationSchedule({ acquisition_date: "2026-01-01", depreciation_start: "2026-02-01", acquisition_value: 1200, residual_value: 120, useful_life_months: 12 });
  assert.equal(schedule.rows.length, 12);
  assert.equal(schedule.rows[11].cumulata, 1080);
  assert.equal(schedule.rows[11].valoare_neta, 120);
});

test("receptia valorizata actualizeaza CMP si totalul NIR", () => {
  const db = {
    materials: [{ id: "m1", name: "Bitum", stock: 10, stoc_curent: 10, averageCost: 10, unit: "kg" }],
    procurementOrders: [{ id: "o1", uuid: "order-1", orderNo: "PO-1", supplier: "Furnizor", status: "sent", lines: [{ material_id: "m1", cantitate: 10, pret: 20, unit: "kg" }] }],
    procurementReceipts: [], stockMovements: [], deliveries: []
  };
  const result = procurement.receiveProcurementOrderV2(db, { id: 1, name: "Tester" }, "order-1", { nr_aviz: "AV-1", date: "2026-06-20", linii: [{ material_id: "m1", cantitate_receptionata: 10, pret_unitar: 20, cota_tva: 21 }] });
  assert.equal(result.receipt.valoare, 200);
  assert.equal(result.receipt.total, 242);
  assert.equal(db.materials[0].averageCost, 15);
  assert.equal(db.stockMovements[0].unitPrice, 20);
});

test("factura draft se genereaza din liniile NIR", () => {
  const { accounting, user } = fixture();
  const invoice = controls.createInvoiceFromReceipt(accounting, { id: "r1", nr_nir: "NIR-1", date: "2026-06-20", lines: [{ material_id: "m1", materialName: "Bitum", cantitate: 2, pret_unitar: 100, cota_tva: 21, valoare: 200, valoare_tva: 42 }] }, accounting.thirdParties[0], user);
  assert.equal(invoice.status, "draft");
  assert.equal(invoice.total, 242);
  assert.equal(invoice.lines[0].cont, "3028");
});

test("factura furnizor reuneste mai multe NIR-uri si calculeaza diferenta", () => {
  const { accounting, user } = fixture();
  const receipts = [
    { id: "r1", nr_nir: "NIR-1", date: "2026-06-20", total: 121, lines: [{ material_id: "m1", materialName: "Bitum", cantitate: 1, pret_unitar: 100, cota_tva: 21 }] },
    { id: "r2", nr_nir: "NIR-2", date: "2026-06-21", total: 242, lines: [{ material_id: "m2", materialName: "Motorina", cantitate: 2, pret_unitar: 100, cota_tva: 21 }] }
  ];
  const invoice = controls.createInvoiceFromReceipts(accounting, receipts, accounting.thirdParties[0], user, { nr_document: "F-200", total_factura: 365 });
  assert.equal(invoice.lines.length, 2);
  assert.deepEqual(invoice.source_receipt_ids, ["r1", "r2"]);
  assert.equal(invoice.total, 363);
  assert.equal(invoice.receipt_variance, 2);
});

test("diferenta facturii multi-NIR se distribuie proportional pe linii", () => {
  const { accounting, user } = fixture();
  const receipts = [
    { id: "r1", nr_nir: "NIR-1", date: "2026-06-20", total: 121, lines: [{ material_id: "m1", materialName: "Bitum", cantitate: 1, pret_unitar: 100, cota_tva: 21 }] },
    { id: "r2", nr_nir: "NIR-2", date: "2026-06-21", total: 242, lines: [{ material_id: "m2", materialName: "Motorina", cantitate: 2, pret_unitar: 100, cota_tva: 21 }] }
  ];
  const invoice = controls.createInvoiceFromReceipts(accounting, receipts, accounting.thirdParties[0], user, { nr_document: "F-201", total_factura: 365, distribute_difference: true });
  assert.equal(invoice.total, 365);
  assert.equal(invoice.distribution_applied, true);
  assert.equal(invoice.lines.reduce((sum, line) => sum + line.total, 0), 365);
});

test("returul NIR scade stocul si redeschide comanda", () => {
  const db = {
    materials: [{ id: "m1", name: "Bitum", stock: 10, stoc_curent: 10, averageCost: 20, unit: "kg" }],
    procurementOrders: [{ id: "o1", uuid: "order-1", status: "received", receivedAmount: 10, remainingAmount: 0, lines: [{ material_id: "m1", cantitate: 10, cantitate_receptionata: 10, cantitate_ramasa: 0 }] }],
    procurementReceipts: [{ id: "r1", orderId: "o1", orderUuid: "order-1", nr_nir: "NIR-1", supplier: "Furnizor", lines: [{ material_id: "m1", materialName: "Bitum", cantitate_receptionata: 10, pret_unitar: 20, cota_tva: 21 }] }],
    procurementReturns: [], stockMovements: [], deliveries: []
  };
  const result = procurement.returnProcurementReceipt(db, { id: 1, name: "Tester" }, "r1", { motiv: "Necorespunzator", data: "2026-06-22", linii: [{ material_id: "m1", cantitate: 2 }] });
  assert.equal(result.returnRecord.total, 48.4);
  assert.equal(result.returnRecord.full_return, false);
  assert.equal(db.materials[0].stock, 8);
  assert.equal(db.procurementOrders[0].remainingAmount, 2);
  assert.equal(db.stockMovements[0].amount, -2);
});

test("returul peste cantitatea receptionata este blocat", () => {
  const db = {
    materials: [{ id: "m1", name: "Bitum", stock: 20, averageCost: 20 }],
    procurementOrders: [],
    procurementReceipts: [{ id: "r1", lines: [{ material_id: "m1", materialName: "Bitum", cantitate_receptionata: 10, pret_unitar: 20 }] }],
    procurementReturns: [], stockMovements: [], deliveries: []
  };
  assert.throws(() => procurement.returnProcurementReceipt(db, { id: 1, name: "Tester" }, "r1", { motiv: "Test", linii: [{ material_id: "m1", cantitate: 11 }] }), /depaseste cantitatea receptionata/);
});

test("reconcilierea semnaleaza returul contabil nerezolvat", () => {
  const { db, accounting } = fixture();
  accounting.invoicesIn.push({ id: 10, nr_document: "F-10", total: 121, declared_total: 121, status: "validat", source_receipt_ids: ["r1"] });
  db.procurementReceipts = [{ id: "r1", date: "2026-06-20", nr_nir: "NIR-1", total: 121, accounting_invoice_id: 10 }];
  db.procurementReturns = [{ id: "ret1", receipt_id: "r1", total: 121, full_return: true, requires_credit_note: true }];
  const report = controls.buildInventoryInvoiceReconciliation(db, "2026-06");
  assert.equal(report.summary.pending_returns, 1);
  assert.equal(report.rows[0].pending_return.id, "ret1");
});

test("nota de credit validata reduce soldul facturii si poate fi devalidata", () => {
  const { db, accounting, user } = fixture();
  accounting.invoicesIn.push({ id: 10, uuid: "fi10", an: 2026, luna: 6, data: "2026-06-10", nr_document: "F-10", furnizor_id: 1, valoare: 100, tva: 21, total: 121, achitat: 0, neachitat: 121, status: "validat", lines: [{ denumire: "Bitum", cont: "3028", valoare: 100, tva: 21 }] });
  accounting.invoicesIn[0].journal_id = engine.generateJournalFromInvoiceIn(db, user, accounting.invoicesIn[0]).id;
  db.procurementReceipts = [{ id: "r1", accounting_invoice_id: 10 }];
  db.procurementReturns = [{ id: "ret1", receipt_id: "r1", requires_credit_note: true, reason: "Retur partial", lines: [{ material_id: "m1", materialName: "Bitum", cantitate: 0.5, pret_unitar: 100, cota_tva: 21, valoare: 50, valoare_tva: 10.5, total: 60.5 }] }];
  const note = controls.createCreditNoteFromReturn(db, user, "ret1", { nr_document: "NC-1", data: "2026-06-22" });
  controls.validateCreditNote(db, user, note.uuid);
  assert.equal(note.status, "validat");
  assert.equal(accounting.invoicesIn[0].credit_total, 60.5);
  assert.equal(accounting.invoicesIn[0].neachitat, 60.5);
  assert.equal(db.procurementReturns[0].accounting_action, "nota_credit_validata");
  const d394 = declarations.buildD394Data(db, { perioada: "2026-06" });
  assert.equal(d394.totaluri.total, 60.5);
  assert.equal(d394.detalii.some((item) => item.document === "NC-1" && item.total === -60.5), true);
  controls.devalidateCreditNote(db, user, note.uuid, "Corectie test");
  assert.equal(note.status, "devalidat");
  assert.equal(accounting.invoicesIn[0].credit_total, 0);
  assert.equal(accounting.invoicesIn[0].neachitat, 121);
  assert.equal(db.procurementReturns[0].accounting_resolved_at, null);
});

test("storno notei de credit reface soldul facturii", () => {
  const { db, accounting, user } = fixture();
  accounting.invoicesIn.push({ id: 11, uuid: "fi11", an: 2026, luna: 6, data: "2026-06-10", nr_document: "F-11", furnizor_id: 1, valoare: 100, tva: 21, total: 121, achitat: 0, neachitat: 121, status: "validat", lines: [{ denumire: "Bitum", cont: "3028", valoare: 100, tva: 21 }] });
  accounting.invoicesIn[0].journal_id = engine.generateJournalFromInvoiceIn(db, user, accounting.invoicesIn[0]).id;
  db.procurementReceipts = [{ id: "r2", accounting_invoice_id: 11 }];
  db.procurementReturns = [{ id: "ret2", receipt_id: "r2", requires_credit_note: true, reason: "Retur", lines: [{ material_id: "m1", materialName: "Bitum", cantitate: 1, pret_unitar: 100, cota_tva: 21, valoare: 100, valoare_tva: 21, total: 121 }] }];
  const note = controls.createCreditNoteFromReturn(db, user, "ret2", { nr_document: "NC-2", data: "2026-06-22" });
  controls.validateCreditNote(db, user, note.uuid);
  assert.equal(accounting.invoicesIn[0].status, "creditata");
  assert.equal(declarations.buildD394Data(db, { perioada: "2026-06" }).totaluri.total, 0);
  controls.stornoCreditNote(db, user, note.uuid);
  assert.equal(note.status, "stornat");
  assert.equal(accounting.invoicesIn[0].status, "validat");
  assert.equal(accounting.invoicesIn[0].neachitat, 121);
});

test("nota de credit nu poate depasi soldul dupa plati", () => {
  const { db, accounting, user } = fixture();
  accounting.invoicesIn.push({ id: 12, uuid: "fi12", an: 2026, luna: 6, data: "2026-06-10", nr_document: "F-12", furnizor_id: 1, total: 121, achitat: 100, neachitat: 21, status: "partial" });
  db.procurementReceipts = [{ id: "r3", accounting_invoice_id: 12 }];
  db.procurementReturns = [{ id: "ret3", receipt_id: "r3", requires_credit_note: true, reason: "Retur", lines: [{ material_id: "m1", materialName: "Bitum", cantitate: 1, pret_unitar: 100, cota_tva: 21, valoare: 100, valoare_tva: 21, total: 121 }] }];
  const note = controls.createCreditNoteFromReturn(db, user, "ret3", { nr_document: "NC-3", data: "2026-06-22" });
  assert.throws(() => controls.validateCreditNote(db, user, note.uuid), /depaseste soldul disponibil/);
});

test("o plata furnizor se aloca pe mai multe facturi", () => {
  const { db, accounting, user } = fixture();
  accounting.invoicesIn.push(
    { id: 21, uuid: "fi21", an: 2026, luna: 6, data: "2026-06-01", nr_document: "F-21", furnizor_id: 1, total: 121, achitat: 0, neachitat: 121, status: "validat" },
    { id: 22, uuid: "fi22", an: 2026, luna: 6, data: "2026-06-02", nr_document: "F-22", furnizor_id: 1, total: 242, achitat: 0, neachitat: 242, status: "validat" }
  );
  accounting.treasury.push({ id: 31, uuid: "tr31", an: 2026, luna: 6, data: "2026-06-20", nr_document: "OP-31", tip_operatie: "plata", suma: 300, tert_id: 1, cont_corespondent: "401", status: "validat", corelare_tip: "neclasificat" });
  const result = settlements.allocateTreasury(db, user, "tr31", { allocations: [{ invoice_id: 21, suma: 121 }, { invoice_id: 22, suma: 179 }] });
  assert.equal(result.total, 300);
  assert.equal(result.settlements.length, 2);
  assert.equal(result.available, 0);
  assert.equal(accounting.invoicesIn[0].status, "achitat");
  assert.equal(accounting.invoicesIn[1].status, "partial");
  assert.equal(accounting.invoicesIn[1].neachitat, 63);
  assert.equal(accounting.treasury[0].corelare_tip, "factura");
});

test("plata respecta soldul ramas dupa nota de credit", () => {
  const { db, accounting, user } = fixture();
  accounting.invoicesIn.push({ id: 23, uuid: "fi23", an: 2026, luna: 6, data: "2026-06-01", nr_document: "F-23", furnizor_id: 1, total: 121, credit_total: 60.5, achitat: 0, neachitat: 60.5, status: "partial" });
  accounting.treasury.push({ id: 32, uuid: "tr32", an: 2026, luna: 6, data: "2026-06-20", nr_document: "OP-32", tip_operatie: "plata", suma: 60.5, tert_id: 1, cont_corespondent: "401", status: "validat", corelare_tip: "neclasificat" });
  settlements.allocateTreasury(db, user, "tr32", { allocations: [{ invoice_id: 23, suma: 60.5 }] });
  assert.equal(accounting.invoicesIn[0].achitat, 60.5);
  assert.equal(accounting.invoicesIn[0].neachitat, 0);
  assert.equal(accounting.invoicesIn[0].status, "achitat");
  assert.throws(() => settlements.allocateTreasury(db, user, "tr32", { allocations: [{ invoice_id: 23, suma: 1 }] }), /suma disponibila|disponibila pentru stingere/);
});

test("stingerea unui avans genereaza nota si poate fi anulata", () => {
  const { db, accounting, user } = fixture();
  accounting.thirdParties[0].cont_analitic_furnizor = "401";
  accounting.invoicesIn.push({ id: 24, uuid: "fi24", an: 2026, luna: 6, data: "2026-06-01", nr_document: "F-24", furnizor_id: 1, total: 121, achitat: 0, neachitat: 121, status: "validat" });
  const advance = { id: 33, uuid: "tr33", an: 2026, luna: 6, data: "2026-06-20", nr_document: "OP-33", tip_operatie: "plata", suma: 121, tert_id: 1, cont_trezorerie: "5121", cont_corespondent: "409", status: "validat", corelare_tip: "avans" };
  advance.journal_id = engine.generateJournalFromTreasury(db, user, advance).id;
  accounting.treasury.push(advance);
  const result = settlements.allocateTreasury(db, user, "tr33", { allocations: [{ invoice_id: 24, suma: 121 }] });
  assert.ok(result.journal?.id);
  assert.equal(accounting.invoicesIn[0].status, "achitat");
  const reversed = settlements.reverseSettlementGroup(db, user, result.group_uuid, "Test anulare");
  assert.ok(reversed.journal?.id);
  assert.equal(accounting.invoicesIn[0].status, "validat");
  assert.equal(accounting.invoicesIn[0].neachitat, 121);
  assert.equal(accounting.settlements[0].status, "anulat");
  assert.equal(accounting.treasury[0].corelare_tip, "avans");
});

test("jurnalul de cumparari separa notele de credit", () => {
  const { db, accounting } = fixture();
  accounting.invoicesIn.push({ id: 41, uuid: "fi41", an: 2026, luna: 6, data: "2026-06-01", nr_document: "F-41", furnizor_id: 1, valoare: 100, tva: 21, total: 121, status: "validat" });
  accounting.creditNotes.push({ id: 42, uuid: "nc42", an: 2026, luna: 6, data: "2026-06-10", nr_document: "NC-42", furnizor_id: 1, valoare: 20, tva: 4.2, total: 24.2, status: "validat" });
  const report = accountingRoutes.buildClassicJournalsData(db, { perioada: "2026-06" });
  assert.equal(report.jurnal_cumparari.rows.length, 2);
  assert.equal(report.jurnal_cumparari.totals.credit_notes, 1);
  assert.equal(report.jurnal_cumparari.totals.credit_total, 24.2);
  assert.equal(report.jurnal_cumparari.totals.total, 96.8);
});

test("nota de credit draft blocheaza inchiderea lunii", () => {
  const { db, accounting } = fixture();
  accounting.creditNotes.push({ id: 51, uuid: "nc51", an: 2026, luna: 6, data: "2026-06-10", nr_document: "NC-51", furnizor_id: 1, total: 24.2, status: "draft" });
  accounting.periods.push({ id: 1, an: 2026, luna: 6, status: "deschisa", tva_verificat_la: new Date().toISOString() });
  const report = accountingRoutes.periodCheck(db, 2026, 6);
  assert.equal(report.checks.can_close, false);
  assert.ok(report.drafts.some((item) => item.categorie === "Nota de credit"));
  assert.equal(report.counts.credit_notes, 1);
});

test("reconcilierea bancara automata confirma doar sugestia sigura", () => {
  const { db, accounting, user } = fixture();
  accounting.thirdParties[0].cont_analitic_furnizor = "401.00001";
  accounting.invoicesIn.push(
    { id: 61, uuid: "fi61", an: 2026, luna: 6, nr_document: "F-61", furnizor_id: 1, total: 121, neachitat: 121, status: "validat" },
    { id: 62, uuid: "fi62", an: 2026, luna: 6, nr_document: "F-62", furnizor_id: 1, total: 242, neachitat: 242, status: "validat" }
  );
  accounting.treasury.push({ id: 71, uuid: "tr71", an: 2026, luna: 6, data: "2026-06-20", nr_document: "OP-71", tip: "banca", tip_operatie: "plata", suma: 121, explicatie: "Plata F-61 RO12345678", status: "draft", corelare_tip: "neclasificat" });
  const result = advancedOperations.autoReconcileBank(db, user, "2026-06", 85);
  assert.equal(result.confirmed, 1);
  assert.equal(accounting.treasury[0].invoice_in_id, 61);
  assert.equal(accounting.treasury[0].corelare_tip, "factura");
  assert.ok(accounting.treasury[0].reconciliation_score >= 85);
});

test("reconcilierea automata lasa potrivirile ambigue pentru operator", () => {
  const { db, accounting, user } = fixture();
  accounting.invoicesIn.push(
    { id: 63, nr_document: "F-63", furnizor_id: 1, total: 121, neachitat: 121, status: "validat" },
    { id: 64, nr_document: "F-64", furnizor_id: 1, total: 121, neachitat: 121, status: "validat" }
  );
  accounting.treasury.push({ id: 72, uuid: "tr72", an: 2026, luna: 6, data: "2026-06-20", nr_document: "OP-72", tip: "banca", tip_operatie: "plata", suma: 121, explicatie: "Plata furnizor", status: "draft", corelare_tip: "neclasificat" });
  const result = advancedOperations.autoReconcileBank(db, user, "2026-06", 60);
  assert.equal(result.confirmed, 0);
  assert.equal(result.ambiguous, 1);
  assert.equal(accounting.treasury[0].corelare_tip, "neclasificat");
});

test("registrele casa calculeaza soldurile zilnice cronologic", () => {
  const { db, accounting } = fixture();
  accounting.treasury.push(
    { id: 80, an: 2026, luna: 5, data: "2026-05-31", tip: "casa", tip_operatie: "incasare", suma: 100, status: "validat" },
    { id: 81, an: 2026, luna: 6, data: "2026-06-01", tip: "casa", tip_operatie: "incasare", suma: 50, status: "validat" },
    { id: 82, an: 2026, luna: 6, data: "2026-06-01", tip: "casa", tip_operatie: "plata", suma: 20, status: "validat" },
    { id: 83, an: 2026, luna: 6, data: "2026-06-02", tip: "casa", tip_operatie: "plata", suma: 10, status: "validat" }
  );
  const report = accountingRoutes.buildClassicJournalsData(db, { perioada: "2026-06" });
  assert.deepEqual(report.registru_casa.daily, [
    { data: "2026-06-01", sold_initial: 100, incasari: 50, plati: 20, sold_final: 130, operatiuni: 2 },
    { data: "2026-06-02", sold_initial: 130, incasari: 0, plati: 10, sold_final: 120, operatiuni: 1 }
  ]);
});

test("inchiderea lunii detecteaza banca nereconciliata si TVA invechit", () => {
  const { db, accounting } = fixture();
  accounting.periods.push({ id: 1, an: 2026, luna: 6, status: "deschisa", tva_verificat_la: new Date().toISOString(), tva_verificat_total_4426: 0, tva_verificat_total_4427: 0 });
  accounting.invoicesIn.push({ id: 91, an: 2026, luna: 6, data: "2026-06-10", nr_document: "F-91", furnizor_id: 1, valoare: 100, tva: 21, total: 121, status: "validat" });
  accounting.bankImports.push({ id: 1, file_name: "extras.xlsx", status: "in_lucru" });
  accounting.treasury.push({ id: 92, uuid: "tr92", bank_import_id: 1, an: 2026, luna: 6, data: "2026-06-11", tip: "banca", tip_operatie: "plata", suma: 121, status: "validat", corelare_tip: "neclasificat" });
  const report = accountingRoutes.periodCheck(db, 2026, 6);
  assert.equal(report.checks.tva_current, false);
  assert.equal(report.checks.bank_unclassified, 1);
  assert.equal(report.checks.bank_imports_unfinished, 1);
  assert.equal(report.checks.bank_reconciliation_ok, false);
  assert.equal(report.checks.can_close, false);
});

test("parserul UBL extrage furnizorul, liniile si totalul", async () => {
  const xml = `<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>F-100</ID><IssueDate>2026-06-20</IssueDate><AccountingSupplierParty><Party><PartyLegalEntity><RegistrationName>Furnizor XML</RegistrationName></PartyLegalEntity><PartyTaxScheme><CompanyID>RO12345678</CompanyID></PartyTaxScheme></Party></AccountingSupplierParty><InvoiceLine><ID>1</ID><InvoicedQuantity unitCode="KGM">2</InvoicedQuantity><LineExtensionAmount>200</LineExtensionAmount><Item><Name>Bitum</Name><ClassifiedTaxCategory><Percent>21</Percent></ClassifiedTaxCategory></Item><Price><PriceAmount>100</PriceAmount></Price></InvoiceLine><TaxTotal><TaxAmount>42</TaxAmount></TaxTotal><LegalMonetaryTotal><TaxExclusiveAmount>200</TaxExclusiveAmount><PayableAmount>242</PayableAmount></LegalMonetaryTotal></Invoice>`;
  const parsed = await controls.parseUblInvoice(Buffer.from(xml));
  assert.equal(parsed.document, "F-100");
  assert.equal(parsed.supplier_name, "Furnizor XML");
  assert.equal(parsed.lines[0].um, "KGM");
  assert.equal(parsed.total, 242);
});

test("ajustarile salariale recurente intra in brut si retineri", () => {
  const hr = {
    contracts: [{ id: 1, employee_id: 1, data_start: "2026-01-01", salariu_baza: 4000, norma_ore: 8, status: "activ" }],
    timeSheets: Array.from({ length: 22 }, (_, index) => ({ employee_id: 1, data: `2026-06-${String(index + 1).padStart(2, "0")}`, ore_lucrate: 8, validat: true })),
    payrollAdjustments: [
      { employee_id: 1, tip: "bonus", amount: 500, data_start: "2026-01-01", data_sfarsit: "2026-12-31", active: true },
      { employee_id: 1, tip: "retinere", amount: 100, data_start: "2026-06-01", data_sfarsit: "2026-06-30", active: true }
    ]
  };
  const employee = { id: 1, cnp: "1800101223344", nume: "Popescu", prenume: "Ion" };
  const line = payrollRoutes.calculatePayrollLine(hr, employee, "2026-06", { cas_rate: 25, cass_rate: 10, income_tax_rate: 10, cam_rate: 2.25, overtime_rate_1: 75, overtime_rate_2: 100, night_rate: 25 });
  assert.equal(line.manual_bonus, 500);
  assert.equal(line.other_deductions, 100);
  assert.equal(line.gross, 4500);
});

test("sursa D112 se genereaza numai din stat validat si ramane marcata tehnic", () => {
  const { db } = fixture();
  db.hr = {
    employees: [{ id: 1, cnp: "1800101223344", nume: "Popescu", prenume: "Ion" }],
    payrollRuns: [{ id: 1, luna: "2026-06", status: "validat", total_gross: 5000, total_cas: 1250, total_cass: 500, total_income_tax: 325, total_cam: 112.5, total_net: 2925 }],
    payrollLines: [{ id: 1, run_id: 1, employee_id: 1, cnp: "1800101223344", employee_name: "Popescu Ion", gross: 5000, cas: 1250, cass: 500, income_tax: 325, cam: 112.5, net: 2925 }]
  };
  const generated = d112Generator.toWorkingXml(d112Generator.buildSource(db, "2026-06"));
  assert.match(generated.content, /urn:infraflow:d112:source:1/);
  assert.match(generated.content, /Necesita transformare si validare/);
  assert.equal(generated.sha256.length, 64);
});

test("avansul poprirea si tichetele raman distincte in stat", () => {
  const hr = {
    contracts: [{ id: 1, employee_id: 1, data_start: "2026-01-01", salariu_baza: 5000, norma_ore: 8, status: "activ" }],
    timeSheets: Array.from({ length: 22 }, (_, index) => ({ employee_id: 1, data: `2026-06-${String(index + 1).padStart(2, "0")}`, ore_lucrate: 8, validat: true })),
    payrollAdjustments: [
      { employee_id: 1, tip: "avans", amount: 500, data_start: "2026-06-01", data_sfarsit: "2026-06-30" },
      { employee_id: 1, tip: "poprire", amount: 200, data_start: "2026-06-01", data_sfarsit: "2026-06-30" },
      { employee_id: 1, tip: "tichete_masa", amount: 400, data_start: "2026-06-01", data_sfarsit: "2026-06-30" }
    ]
  };
  const line = payrollRoutes.calculatePayrollLine(hr, { id: 1, cnp: "1800101223344", nume: "Popescu", prenume: "Ion" }, "2026-06", {
    cas_rate: 25, cass_rate: 10, income_tax_rate: 10, cam_rate: 2.25,
    overtime_rate_1: 75, overtime_rate_2: 100, night_rate: 25,
    meal_tickets_taxable: false, meal_tickets_cass: false
  });
  assert.equal(line.advances, 500);
  assert.equal(line.garnishments, 200);
  assert.equal(line.meal_tickets, 400);
  assert.equal(line.other_deductions, 700);
});

test("plata salariala stinge contul 421 prin banca", () => {
  const { db, accounting, user } = fixture();
  const treasury = {
    id: 101, an: 2026, luna: 6, data: "2026-06-30", nr_document: "SAL-2026-06",
    tip: "banca", tip_operatie: "plata", suma: 2925, cont_trezorerie: "5121",
    cont_corespondent: "421", explicatie: "Plata salarii 2026-06"
  };
  const journal = engine.generateJournalFromTreasury(db, user, treasury);
  const lines = accounting.journalLines.filter((item) => item.journal_id === journal.id);
  assert.equal(lines.find((item) => item.cont_simbol === "421").debit, 2925);
  assert.equal(lines.find((item) => item.cont_simbol === "5121").credit, 2925);
});

test("obligatiile salariale separa contributiile si termenul", () => {
  const items = payrollObligations.obligationDefinitions({ total_cas: 1000, total_cass: 400, total_income_tax: 300, total_cam: 90 });
  assert.deepEqual(items.map((item) => item.accounting_account), ["4315", "4316", "444", "436"]);
  assert.equal(items.reduce((sum, item) => sum + item.amount, 0), 1790);
  assert.equal(payrollObligations.contributionDueDate("2026-06"), "2026-07-25");
});

test("calendarul fiscal foloseste termene distincte", () => {
  assert.equal(declarations.declarationDueDate(2026, 6, "D112"), "2026-07-25");
  assert.equal(declarations.declarationDueDate(2026, 6, "D394"), "2026-07-30");
  assert.equal(declarations.declarationDueDate(2026, 11, "D300"), "2026-12-21");
});

test("configurarea validatorului cere parametrul de fisier", () => {
  const db = {};
  assert.throws(() => officialValidator.saveConfig(db, "D112", { command: "java", args: "[]" }, { id: 1 }), /\{file\}/);
  const saved = officialValidator.saveConfig(db, "D112", { path: "C:\\DUK", command: "java", args: '["-jar","validator.jar","{file}"]', schema_version: "01/2026" }, { id: 1 });
  assert.equal(saved.schema_version, "01/2026");
  assert.equal(officialValidator.diagnostic(db, "D112").execution_enabled, true);
  const d406 = officialValidator.saveConfig(db, "D406", { command: "java", args: '["-jar","DUKIntegrator.jar","{file}"]', schema_version: "2.4.9" }, { id: 1 });
  assert.equal(d406.code, "D406");
});

test("maparea D112 raporteaza campul lipsa pe angajat", () => {
  const { db } = fixture();
  db.company = { name: "Companie Test", cif: "RO9126534" };
  db.hr = {
    employees: [{ id: 1, cnp: "", nume: "Popescu", prenume: "Ion" }],
    contracts: [{ id: 1, employee_id: 1, data_start: "2026-01-01", status: "activ" }],
    payrollRuns: [{ id: 1, luna: "2026-06", status: "validat", total_gross: 5000 }],
    payrollLines: [{ id: 1, run_id: 1, employee_id: 1, gross: 5000, cas: 1250, cass: 500, income_tax: 325 }]
  };
  const report = d112Generator.buildMappingReport(db, "2026-06");
  assert.equal(report.ready, false);
  assert.match(report.rows[0].errors.join(" "), /cnpAsig/);
});

test("auditul end-to-end detecteaza factura fara nota", () => {
  const { db, accounting } = fixture();
  accounting.invoicesIn.push({ id: 500, an: 2026, luna: 6, status: "validat" });
  const report = endToEndAudit.buildAudit(db, "2026-06");
  assert.equal(report.checks.find((item) => item.area === "Facturi validate fara nota").count, 1);
  assert.equal(report.ready, false);
});

test("XML-ul candidat D300 foloseste profilul fiscal si ramane marcat pentru validare", () => {
  const { db, accounting } = fixture();
  accounting.invoicesIn.push({ id: 1, an: 2026, luna: 6, status: "validat", valoare: 100, tva: 21, total: 121 });
  accounting.invoicesOut.push({ id: 2, an: 2026, luna: 6, status: "validat", valoare: 200, tva: 42, total: 242 });
  const result = declarationCandidates.generate(db, "D300", "2026-06", "schema-test");
  assert.match(result.content, /<declaratie300/);
  assert.match(result.content, /urn:infraflow:adapter:1/);
  assert.match(result.warning, /validator/);
  assert.equal(result.sha256.length, 64);
});

test("detectia validatorului returneaza diagnostic fara configurare", () => {
  const result = officialValidator.discover({}, "D300");
  assert.equal(result.code, "D300");
  assert.ok(Array.isArray(result.java));
  assert.ok(Array.isArray(result.validators));
});

test("concediul fara plata ramane distinct in linia salariala", () => {
  const hr = {
    contracts: [{ id: 1, employee_id: 1, data_start: "2026-01-01", salariu_baza: 4000, norma_ore: 8, status: "activ" }],
    timeSheets: [{ employee_id: 1, data: "2026-06-01", tip: "cfp", ore_lucrate: 0, validat: true }],
    payrollAdjustments: []
  };
  const line = payrollRoutes.calculatePayrollLine(hr, { id: 1, cnp: "1800101223344", nume: "Popescu", prenume: "Ion" }, "2026-06", {
    cas_rate: 25, cass_rate: 10, income_tax_rate: 10, cam_rate: 2.25, overtime_rate_1: 75, overtime_rate_2: 100, night_rate: 25
  });
  assert.equal(line.unpaid_leave_days, 1);
  assert.equal(line.paid_hours, 0);
});

test("profilul XSD extrage namespace radacina si campurile obligatorii", () => {
  const xsd = Buffer.from('<?xml version="1.0"?><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test:d300" version="10"><xs:element name="declaratie300"/><xs:attribute name="cui" type="xs:string" use="required"/></xs:schema>');
  const result = schemaProfiles.inspect("d300.xsd", xsd);
  assert.equal(result.target_namespace, "urn:test:d300");
  assert.equal(result.root_element, "declaratie300");
  assert.deepEqual(result.required_attributes, ["cui"]);
});

test("schema SAF-T oficiala inclusa este verificata prin hash si selectata pentru D406", () => {
  const profiles = schemaProfiles.bundled();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].sha256, "80AD7EAAF2AAFD656A6E3C0E69E3A8FCDB23262640287EBBA6383FF3014DCCC2");
  assert.equal(profiles[0].actual_sha256, profiles[0].sha256);
  assert.equal(profiles[0].hash_valid, true);
  const selected = schemaProfiles.select({ anafSchemas: [] }, "D406", "2026-06");
  assert.equal(selected.schema_metadata.schema_version, "2.4.9");
  assert.equal(schemaProfiles.profile(selected).target_namespace, "mfp:anaf:dgti:d406t:declaratie:v1");
});

test("schema ANAF este selectata dupa perioada de valabilitate", () => {
  const accounting = { anafSchemas: [
    { id: 1, code: "D300", active: true, valid_from: "2025-01-01", valid_to: "2025-12-31" },
    { id: 2, code: "D300", active: true, valid_from: "2026-01-01", valid_to: "" }
  ] };
  assert.equal(schemaProfiles.select(accounting, "D300", "2026-06").id, 2);
  assert.equal(schemaProfiles.select(accounting, "D300", "2025-06").id, 1);
});

test("situatia financiara compara anul curent cu precedentul", () => {
  const { db, accounting, user } = fixture();
  engine.createJournal(db, user, { an: 2025, luna: 6, data: "2025-06-30", lines: [{ cont_simbol: "5121", debit: 100 }, { cont_simbol: "1012", credit: 100 }] });
  engine.createJournal(db, user, { an: 2026, luna: 6, data: "2026-06-30", lines: [{ cont_simbol: "5121", debit: 150 }, { cont_simbol: "1012", credit: 150 }] });
  const report = financialStatements.buildReport(db, { an: 2026, luna: 6, tip: "BILANT" });
  const cash = report.rows.find((item) => item.code === "A04");
  assert.equal(cash.current, 150);
  assert.equal(cash.previous, 100);
  assert.equal(report.control.ok, true);
  assert.ok(accounting.financialStatementMappings.length > 0);
});

test("adaptorul D394 foloseste radacina si namespace-ul profilului incarcat", () => {
  const { db, accounting } = fixture();
  accounting.invoicesOut.push({ id: 1, an: 2026, luna: 6, status: "validat", client_id: 1, nr_document: "FV-1", data: "2026-06-10", valoare: 100, tva: 21, total: 121 });
  const result = declarationAdapters.generate(db, "D394", "2026-06", { root_element: "declaratie394", target_namespace: "urn:test:d394", schema_version: "2026" });
  assert.match(result.content, /<declaratie394 xmlns="urn:test:d394"/);
  assert.match(result.content, /nrFact="FV-1"/);
});

test("generatorul SAF-T include fisiere master registru si documente sursa", () => {
  const { db, accounting, user } = fixture();
  accounting.thirdParties[0].tip = "client";
  accounting.invoicesOut.push({ id: 1, an: 2026, luna: 6, status: "validat", client_id: 1, nr_document: "FV-1", data: "2026-06-10", valoare: 100, tva: 21, total: 121 });
  engine.createJournal(db, user, { an: 2026, luna: 6, data: "2026-06-10", lines: [{ cont_simbol: "4111", debit: 121 }, { cont_simbol: "704", credit: 100 }, { cont_simbol: "4427", credit: 21 }] });
  const result = saftGenerator.generate(db, "2026-06", { target_namespace: "urn:test:saft", schema_version: "2.00" });
  assert.match(result.content, /<AuditFile xmlns="urn:test:saft">/);
  assert.match(result.content, /<MasterFiles>/);
  assert.match(result.content, /<GeneralLedgerEntries>/);
  assert.match(result.content, /<SourceDocuments>/);
  assert.match(result.content, /<InvoiceType>380<\/InvoiceType>/);
  assert.match(result.content, /<TaxCode>310344<\/TaxCode>/);
});

test("ghidul SAF-T trimite erorile validatorului spre zona de remediere", () => {
  assert.equal(saftGuidance.guide("CustomerID lipseste").to, "/contabilitate/clienti");
  assert.equal(saftGuidance.guide("TaxCode invalid").to, "/contabilitate/tva-declaratii?tab=saft");
  assert.equal(saftGuidance.guide("AccountID invalid").to, "/contabilitate/plan-conturi");
});

test("sursa SAF-T ofera legatura directa pentru tertul incomplet", () => {
  const { db, accounting } = fixture();
  accounting.thirdParties[0].tip = "client";
  const source = saftGenerator.buildSource(db, "2026-06");
  const issue = source.issueDetails.find((item) => item.entity_type === "client");
  assert.ok(issue);
  assert.match(issue.to, /\/contabilitate\/clienti\?client=1&edit=1/);
});

test("generatorul SAF-T separa versiunea XSD de versiunea AuditFile", () => {
  const { db } = fixture();
  const result = saftGenerator.generate(db, "2026-06", { schema_version: "2.4.9", audit_file_version: "2.00", target_namespace: "mfp:anaf:dgti:d406t:declaratie:v1" });
  assert.equal(result.schema_version, "2.4.9");
  assert.equal(result.audit_file_version, "2.00");
  assert.match(result.content, /<AuditFileVersion>2\.00<\/AuditFileVersion>/);
});

test("candidatul SAF-T complet respecta structural schema XSD ANAF", { skip: process.platform !== "win32" }, () => {
  const { db, accounting, user } = fixture();
  db.settings.general = { companyName: "Companie Test", cif: "RO9126534", address: "Strada Test 1", city: "Piatra Neamt", phone: "0233000000", iban: "RO49AAAA1B31007593840000" };
  db.materials = [{ id: "mat-1", cod: "MAT1", name: "Bitum", unit: "KG", nc_code: "27132000", active: true }];
  db.stockMovements = [{ id: "mov-1", type: "consumption", materialId: "mat-1", date: "2026-06-11", amount: -2, unit: "KG", note: "Consum" }];
  accounting.thirdParties[0].tip = "client";
  accounting.thirdParties[0].cont_analitic_client = "4111.00001";
  accounting.invoicesOut.push({ id: 1, uuid: "fv-1", an: 2026, luna: 6, status: "validat", client_id: 1, nr_document: "FV-1", data: "2026-06-10", valoare: 100, tva: 21, total: 121, tva_procent: 21, lines: [{ denumire: "Servicii", cantitate: 1, valoare: 100, tva: 21, tva_procent: 21, cont: "704", um: "BUC" }] });
  engine.createJournal(db, user, { an: 2026, luna: 6, data: "2026-06-10", nr_document: "FV-1", lines: [{ cont_simbol: "4111", debit: 121 }, { cont_simbol: "704", credit: 100 }, { cont_simbol: "4427", credit: 21 }] });
  accounting.treasury.push({ id: 1, uuid: "pay-1", an: 2026, luna: 6, status: "validat", tert_id: 1, data: "2026-06-20", suma: 121, tip: "banca", tip_operatie: "incasare", nr_document: "EX-1" });
  const schema = schemaProfiles.select(accounting, "D406", "2026-06");
  const generated = saftGenerator.generate(db, "2026-06", schemaProfiles.profile(schema));
  const validation = xsdValidator.validate(Buffer.from(generated.content), schema);
  assert.equal(validation.accepted, true, validation.errors.join("\n"));
  assert.equal(validation.error_count, 0);
  assert.match(generated.content, /<MovementOfGoods><\/MovementOfGoods>/);
  assert.doesNotMatch(generated.content, /<MovementType>70<\/MovementType>/);
  assert.match(generated.content, /<CustomerID>0012345678<\/CustomerID>/);
  assert.match(generated.content, /<PaymentMethod>03<\/PaymentMethod>/);
  assert.match(generated.content, /<Payments><NumberOfEntries>1<\/NumberOfEntries><TotalDebit>121\.00<\/TotalDebit>/);
  assert.doesNotMatch(generated.content, /<InvoiceType>FT<\/InvoiceType>/);
});

test("profilurile financiare izoleaza maparile pe formular", () => {
  const { db } = fixture();
  financialStatements.ensureProfiles(db).push({ id: 2, code: "CLIENT_TEST", label: "Client test", valid_from: "2026-01-01", active: true });
  financialStatements.ensureMappings(db).push({ id: 100, profile_code: "CLIENT_TEST", statement_type: "BILANT", code: "A99", label: "Test", calculation: "asset", prefixes: ["5"], order: 1, active: true });
  const report = financialStatements.buildReport(db, { an: 2026, luna: 6, tip: "BILANT", profile_code: "CLIENT_TEST" });
  assert.equal(report.profile.code, "CLIENT_TEST");
  assert.deepEqual(report.rows.map((item) => item.code), ["A99"]);
});

test("acceptanta fiscala ofera pas urmator pentru fiecare blocaj", () => {
  const { db } = fixture();
  const report = fiscalWorkspace.buildAcceptance(db, "2026-06");
  assert.equal(report.perioada, "2026-06");
  assert.ok(report.checks.some((item) => !item.ok && item.next_action && item.to));
});

test("integritatea SAF-T detecteaza factura fara nota si trezoreria necorelata", () => {
  const { db, accounting } = fixture();
  db.settings.general = { companyName: "Companie Test", cif: "RO9126534", address: "Strada Test 1", city: "Piatra Neamt", phone: "0233000000", iban: "RO49AAAA1B31007593840000" };
  accounting.thirdParties[0] = { ...accounting.thirdParties[0], tip: "client", cui: "RO9126534", iban: "RO49AAAA1B31007593840000", cont_analitic_client: "4111.00001" };
  accounting.invoicesOut.push({ id: 10, an: 2026, luna: 6, status: "validat", client_id: 1, nr_document: "FV-10", data: "2026-06-10", valoare: 100, tva: 21, total: 121, lines: [{ denumire: "Servicii", cont: "704", valoare: 100 }] });
  accounting.treasury.push({ id: 20, an: 2026, luna: 6, status: "validat", tert_id: 1, nr_document: "EX-20", data: "2026-06-20", suma: 121 });
  const result = saftIntegrity.inspect(db, "2026-06");
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((item) => item.entity_type === "invoice_iesire"));
  assert.ok(result.issues.some((item) => item.entity_type === "treasury"));
});

test("fluxul contabil corelat trece controlul de integritate SAF-T", () => {
  const { db, accounting, user } = fixture();
  db.settings.general = { companyName: "Companie Test", cif: "RO9126534", address: "Strada Test 1", city: "Piatra Neamt", phone: "0233000000", iban: "RO49AAAA1B31007593840000" };
  accounting.thirdParties[0] = { ...accounting.thirdParties[0], tip: "client", cui: "RO9126534", iban: "RO49AAAA1B31007593840000", cont_analitic_client: "4111.00001" };
  const invoiceJournal = engine.createJournal(db, user, { an: 2026, luna: 6, data: "2026-06-10", nr_document: "FV-11", lines: [{ cont_simbol: "4111", debit: 121 }, { cont_simbol: "704", credit: 100 }, { cont_simbol: "4427", credit: 21 }] });
  accounting.invoicesOut.push({ id: 11, an: 2026, luna: 6, status: "validat", client_id: 1, journal_id: invoiceJournal.id, nr_document: "FV-11", data: "2026-06-10", valoare: 100, tva: 21, total: 121, lines: [{ denumire: "Servicii", cont: "704", valoare: 100 }] });
  const paymentJournal = engine.createJournal(db, user, { an: 2026, luna: 6, data: "2026-06-20", nr_document: "EX-21", lines: [{ cont_simbol: "5121", debit: 121 }, { cont_simbol: "4111", credit: 121 }] });
  accounting.treasury.push({ id: 21, an: 2026, luna: 6, status: "validat", tert_id: 1, journal_id: paymentJournal.id, nr_document: "EX-21", data: "2026-06-20", suma: 121, tip_operatie: "incasare" });
  const result = saftIntegrity.inspect(db, "2026-06");
  assert.equal(result.ready, true, result.issues.map((item) => item.message).join("\n"));
});

test("dosarul fiscal contine sumar acceptanta diagnostic si instructiuni", () => {
  const report = { perioada: "2026-06", summary: { total: 1, ok: 1 }, checks: [{ label: "Balanta", ok: true, severity: "error", message: "OK", next_action: "-" }] };
  const buffer = fiscalDossier.build({ period: "2026-06", acceptance: report, integrity: { ready: true, issues: [] }, runs: [] });
  const names = new AdmZip(buffer).getEntries().map((entry) => entry.entryName);
  assert.deepEqual(names.sort(), ["00_SUMAR.json", "01_ACCEPTANTA.xlsx", "02_DIAGNOSTIC_SAFT.json", "03_INSTRUCTIUNI.txt"].sort());
});

test("depunerea fiscala cere recipise acceptate pentru toate declaratiile", () => {
  const { accounting } = fixture();
  accounting.declarationRuns.push(
    { id: 1, code: "D300", an: 2026, luna: 6, status: "acceptat", receipt_status: "acceptata", recipisa: "R300" },
    { id: 2, code: "D394", an: 2026, luna: 6, status: "acceptat", receipt_status: "acceptata", recipisa: "R394" },
    { id: 3, code: "D112", an: 2026, luna: 6, status: "acceptat", receipt_status: "acceptata", recipisa: "R112" }
  );
  let check = fiscalSubmission.submissionCheck(accounting, 2026, 6);
  assert.equal(check.ready, false);
  assert.deepEqual(check.missing, ["D406"]);
  accounting.saftRuns.push({ id: 4, perioada: "2026-06", status: "acceptat_validator", receipt_status: "acceptata", recipisa: "R406" });
  check = fiscalSubmission.submissionCheck(accounting, 2026, 6);
  assert.equal(check.ready, true);
  assert.deepEqual(check.missing, []);
});

test("D205 centralizeaza venitul si impozitul retinut", () => {
  const { db, accounting } = fixture();
  accounting.withholdingTaxEntries.push({ id: 1, an: 2026, cnp_cui: "1234567890123", nume: "Beneficiar Test", tip_venit: "dividende", venit_brut: 1000, impozit_retinut: 100 });
  const report = fiscalExtras.d205Report(db, 2026);
  assert.equal(report.ready, true);
  assert.equal(report.totals.venit_brut, 1000);
  assert.equal(report.totals.impozit_retinut, 100);
  const d205Xml = fiscalExtras.d205CandidateXml(report, { cif: "RO9126534", companyName: "Companie Test", address: "Piatra Neamt" });
  assert.match(d205Xml, /<declaratie205 xmlns="mfp:anaf:dgti:d205:declaratie:v2"/);
  const d205Validation = d205Validator.validate(d205Xml);
  assert.equal(d205Validation.accepted, true, d205Validation.errors?.join(" "));
});

test("Intrastat verifica tara si codul NC", () => {
  const { db, accounting } = fixture();
  accounting.intrastatEntries.push({ id: 1, an: 2026, luna: 6, flux: "introduceri", tara_partenera: "DE", cod_nc: "27132000", natura_tranzactie: "11", masa_neta: 250.5, valoare_facturata: 5000 });
  const report = fiscalExtras.intrastatReport(db, "2026-06");
  assert.equal(report.ready, true);
  assert.equal(report.totals.masa_neta, 250.5);
  assert.match(fiscalExtras.intrastatCandidateXml(report, { cif: "RO9126534" }), /codNC="27132000"/);
});

test("harta fiscala reuneste declaratiile lunare D205 si Intrastat", () => {
  const { db, accounting } = fixture();
  accounting.declarationRuns.push({ id: 1, code: "D300", an: 2026, luna: 6, status: "acceptat", receipt_status: "acceptata" });
  accounting.withholdingTaxEntries.push({ id: 1, an: 2026, cnp_cui: "1234567890123", nume: "Beneficiar", tip_venit: "dividende", venit_brut: 100, impozit_retinut: 10 });
  const report = fiscalExtras.completionMap(db, "2026-06");
  assert.equal(report.declarations.find((item) => item.code === "D300").receipt_status, "acceptata");
  assert.equal(report.d205.ready, true);
  assert.equal(report.intrastat.ready, false);
});

test("configurarea SPV nu expune secretul si genereaza stare OAuth", () => {
  const db = {};
  const saved = spvClient.saveConfig(db, { client_id: "client-test", client_secret: "secret-test", redirect_uri: "https://erp.test/anaf/callback" });
  assert.equal(saved.configured, true);
  assert.equal(saved.client_secret, undefined);
  assert.notEqual(db.anaf.spv.client_secret_enc, "secret-test");
  const authorization = spvClient.authorizationUrl(db);
  assert.match(authorization.url, /client_id=client-test/);
  assert.equal(authorization.state.length, 48);
});

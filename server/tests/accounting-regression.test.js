const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../modules/accounting/accounting-engine");
const declarations = require("../modules/accounting/declaration-routes");
const snapshots = require("../modules/accounting/period-snapshots");
const operations = require("../modules/accounting/operations-routes");
const advancedOperations = require("../modules/accounting/operations-advanced-routes");
const controls = require("../modules/accounting/accounting-control-routes");
const procurement = require("../modules/procurement/routes");

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

test("parserul UBL extrage furnizorul, liniile si totalul", async () => {
  const xml = `<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>F-100</ID><IssueDate>2026-06-20</IssueDate><AccountingSupplierParty><Party><PartyLegalEntity><RegistrationName>Furnizor XML</RegistrationName></PartyLegalEntity><PartyTaxScheme><CompanyID>RO12345678</CompanyID></PartyTaxScheme></Party></AccountingSupplierParty><InvoiceLine><ID>1</ID><InvoicedQuantity unitCode="KGM">2</InvoicedQuantity><LineExtensionAmount>200</LineExtensionAmount><Item><Name>Bitum</Name><ClassifiedTaxCategory><Percent>21</Percent></ClassifiedTaxCategory></Item><Price><PriceAmount>100</PriceAmount></Price></InvoiceLine><TaxTotal><TaxAmount>42</TaxAmount></TaxTotal><LegalMonetaryTotal><TaxExclusiveAmount>200</TaxExclusiveAmount><PayableAmount>242</PayableAmount></LegalMonetaryTotal></Invoice>`;
  const parsed = await controls.parseUblInvoice(Buffer.from(xml));
  assert.equal(parsed.document, "F-100");
  assert.equal(parsed.supplier_name, "Furnizor XML");
  assert.equal(parsed.lines[0].um, "KGM");
  assert.equal(parsed.total, 242);
});

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../../..");
const CHART_SEED_FILES = [
  path.join(ROOT, "db", "seeds", "accounting-chart-ro.json"),
  path.join(ROOT, "data", "accounting-chart-saga.json")
];
const REQUIRED_CHART_ACCOUNTS = [
  { simbol: "401", denumire: "Furnizori", clasa: 4, tip: "P", nivel: 1, tip_cont: "terti" },
  { simbol: "4111", denumire: "Clienti", clasa: 4, tip: "A", nivel: 2, tip_cont: "terti" },
  { simbol: "4426", denumire: "TVA deductibila", clasa: 4, tip: "A", nivel: 2, tip_cont: "tva", tva_deductibil: true },
  { simbol: "4427", denumire: "TVA colectata", clasa: 4, tip: "P", nivel: 2, tip_cont: "tva", tva_colectat: true },
  { simbol: "5211", denumire: "Conturi la banci in lei", clasa: 5, tip: "A", nivel: 2, tip_cont: "trezorerie" },
  { simbol: "5311", denumire: "Casa in lei", clasa: 5, tip: "A", nivel: 2, tip_cont: "trezorerie" },
  { simbol: "628", denumire: "Alte cheltuieli cu serviciile executate de terti", clasa: 6, tip: "A", nivel: 1, tip_cont: "cheltuieli" },
  { simbol: "704", denumire: "Venituri din servicii prestate", clasa: 7, tip: "P", nivel: 1, tip_cont: "venituri" }
];

function ensureAccounting(db) {
  if (!db.accounting || typeof db.accounting !== "object") db.accounting = {};
  const keys = ["periods", "chart", "journals", "journalLines", "thirdParties", "invoicesIn", "invoicesOut", "creditNotes", "treasury", "settlements", "lawAlerts", "journalTemplates", "openingBalances", "balanceConfirmations", "periodSnapshots", "periodEvents", "bankImports", "bankImportHashes", "stockPostings", "fixedAssets", "fixedAssetEvents", "fixedAssetCategories", "fixedAssetInventories", "depreciationRuns", "annualClosings", "declarationRuns", "declarationValidationRuns", "declarationCandidates", "periodDossiers", "anafSchemas", "carryforwardRuns"];
  keys.forEach((key) => {
    if (!Array.isArray(db.accounting[key])) db.accounting[key] = [];
  });
  seedChart(db);
  seedFixedAssetCategories(db.accounting);
  return db.accounting;
}

function seedFixedAssetCategories(accounting) {
  if (accounting.fixedAssetCategories.length) return;
  [
    ["1", "Constructii", 480],
    ["2.1", "Echipamente tehnologice", 96],
    ["2.3", "Mijloace de transport", 72],
    ["3.1", "Mobilier si aparatura birotica", 60]
  ].forEach(([code, name, months], index) => accounting.fixedAssetCategories.push({ id: index + 1, code, name, default_life_months: months, active: true, system: true }));
}

function seedChart(db) {
  const accounting = db.accounting || {};
  const existingChart = Array.isArray(accounting.chart) ? accounting.chart : [];
  const seedFile = CHART_SEED_FILES.find((file) => fs.existsSync(file));
  const chart = seedFile ? JSON.parse(fs.readFileSync(seedFile, "utf8")) : REQUIRED_CHART_ACCOUNTS;
  const existingSymbols = new Set(existingChart.map((item) => String(item.simbol || "").trim()).filter(Boolean));
  const seededChart = [...chart, ...REQUIRED_CHART_ACCOUNTS].map((item, index) => ({
    id: item.id || index + 1,
    simbol: String(item.simbol || "").trim(),
    denumire: String(item.denumire || "").trim(),
    clasa: Number(item.clasa || String(item.simbol || "0")[0] || 0),
    tip: ["A", "P", "B"].includes(item.tip) ? item.tip : "B",
    nivel: Number(item.nivel || inferLevel(item.simbol)),
    parinte_simbol: item.parinte_simbol || "",
    tip_cont: item.tip_cont || inferAccountCategory(item.simbol),
    tva_deductibil: Boolean(item.tva_deductibil || item.simbol === "4426"),
    tva_colectat: Boolean(item.tva_colectat || item.simbol === "4427"),
    activ: item.activ !== false,
    sistem: item.sistem !== false,
    sursa: String(item.sursa || "").toLowerCase().includes("saga") ? "Plan contabil RO" : item.sursa || "Plan contabil RO"
  })).filter((item) => item.simbol && item.denumire);
  const nextId = () => nextNumericId(accounting.chart);
  accounting.chart = existingChart;
  seededChart.forEach((account) => {
    if (existingSymbols.has(account.simbol)) return;
    accounting.chart.push({ ...account, id: nextId() });
    existingSymbols.add(account.simbol);
  });
}

function validateJournal(db, lines) {
  const accounting = ensureAccounting(db);
  const errors = [];
  const safeLines = Array.isArray(lines) ? lines : [];
  if (safeLines.length < 2) errors.push("Nota contabila trebuie sa aiba minim 2 linii.");
  safeLines.forEach((line, index) => {
    const debit = money(line.debit);
    const credit = money(line.credit);
    const cont = String(line.cont_simbol || line.cont || "").trim();
    if (!cont) errors.push(`Linia ${index + 1}: cont lipsa.`);
    if (!accounting.chart.some((item) => item.activ !== false && item.simbol === cont)) {
      errors.push(`Linia ${index + 1}: contul ${cont || "-"} nu exista in planul de conturi.`);
    }
    if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) {
      errors.push(`Linia ${index + 1}: completeaza debit sau credit, nu ambele.`);
    }
  });
  const totalDebit = money(safeLines.reduce((sum, line) => sum + money(line.debit), 0));
  const totalCredit = money(safeLines.reduce((sum, line) => sum + money(line.credit), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    errors.push(`Nota contabila este dezechilibrata: debit ${totalDebit.toFixed(2)} / credit ${totalCredit.toFixed(2)}.`);
  }
  const pendingByAccount = new Map();
  safeLines.forEach((line) => {
    const cont = String(line.cont_simbol || line.cont || "").trim();
    pendingByAccount.set(cont, money((pendingByAccount.get(cont) || 0) + money(line.debit) - money(line.credit)));
  });
  pendingByAccount.forEach((pending, cont) => {
    const account = accounting.chart.find((item) => item.simbol === cont);
    if (account?.tip === "A" && money(accountBalance(db, cont) + pending) < -0.01) {
      errors.push(`Contul de activ ${cont} nu poate ajunge pe sold creditor negativ.`);
    }
  });
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 422;
    error.errors = errors;
    throw error;
  }
  return { valid: true, totalDebit, totalCredit };
}

function accountBalance(db, cont) {
  const accounting = ensureAccounting(db);
  const activeJournalIds = new Set(accounting.journals
    .filter(isActiveJournal)
    .map((journal) => Number(journal.id)));
  const opening = accounting.openingBalances
    .filter((row) => row.cont_simbol === cont && row.activ !== false)
    .reduce((sum, row) => sum + money(row.debit) - money(row.credit), 0);
  return money(opening + accounting.journalLines
    .filter((line) => line.cont_simbol === cont && activeJournalIds.has(Number(line.journal_id)))
    .reduce((sum, line) => sum + money(line.debit) - money(line.credit), 0));
}

function checkPeriodOpen(db, an, luna) {
  const accounting = ensureAccounting(db);
  const period = accounting.periods.find((item) => Number(item.an) === Number(an) && Number(item.luna) === Number(luna));
  if (["inchisa", "depusa"].includes(period?.status)) {
    const error = new Error(`Perioada ${String(luna).padStart(2, "0")}/${an} este ${period.status}.`);
    error.status = 409;
    throw error;
  }
  if (!period) {
    accounting.periods.push({
      id: nextNumericId(accounting.periods),
      an: Number(an),
      luna: Number(luna),
      status: "deschisa",
      created_at: new Date().toISOString()
    });
  }
}

function generateAnalyticAccount(db, tert, tip) {
  const accounting = ensureAccounting(db);
  const code = String(tert?.cod || tert?.id || "").replace(/\D/g, "").padStart(5, "0").slice(-5);
  const base = tip === "client" ? "4111" : "401";
  const simbol = `${base}.${code}`;
  if (!accounting.chart.some((item) => item.simbol === simbol)) {
    accounting.chart.push({
      id: nextNumericId(accounting.chart),
      simbol,
      denumire: `${base === "401" ? "Furnizor" : "Client"} ${tert?.denumire || code}`,
      clasa: 4,
      tip: "B",
      nivel: 3,
      parinte_simbol: base,
      tip_cont: "terti",
      tva_deductibil: false,
      tva_colectat: false,
      activ: true,
      sistem: false,
      tert_id: tert?.id || null
    });
  }
  return simbol;
}

function createJournal(db, user, input) {
  const accounting = ensureAccounting(db);
  const lines = normalizeLines(db, input.lines || []);
  const totals = validateJournal(db, lines);
  checkPeriodOpen(db, input.an, input.luna);
  const journal = {
    id: nextNumericId(accounting.journals),
    uuid: input.uuid || uuid(),
    an: Number(input.an),
    luna: Number(input.luna),
    data: input.data,
    nr_document: input.nr_document || "",
    tip_document: input.tip_document || "nota_manuala",
    document_ref_id: input.document_ref_id || null,
    document_ref_tip: input.document_ref_tip || "",
    cost_center_id: input.cost_center_id || null,
    subcentru_id: input.subcentru_id || null,
    explicatie: input.explicatie || "",
    total_debit: totals.totalDebit,
    total_credit: totals.totalCredit,
    status: input.status || "activ",
    stornat_de_id: input.stornat_de_id || null,
    storneaza_id: input.storneaza_id || null,
    created_by: user?.id || "",
    created_by_name: user?.name || "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  accounting.journals.push(journal);
  lines.forEach((line, index) => {
    accounting.journalLines.push({
      id: nextNumericId(accounting.journalLines),
      journal_id: journal.id,
      linie_nr: index + 1,
      cont_simbol: line.cont_simbol,
      denumire_cont: line.denumire_cont,
      debit: money(line.debit),
      credit: money(line.credit),
      tert_id: line.tert_id || null,
      tert_tip: line.tert_tip || "",
      cost_center_id: line.cost_center_id || journal.cost_center_id || null,
      subcentru_id: line.subcentru_id || journal.subcentru_id || null,
      explicatie: line.explicatie || journal.explicatie
    });
  });
  return journal;
}

function updateJournal(db, user, journalIdOrUuid, input) {
  const accounting = ensureAccounting(db);
  const journal = accounting.journals.find((item) => String(item.id) === String(journalIdOrUuid) || item.uuid === journalIdOrUuid);
  if (!journal) throwHttp(404, "Nota contabila nu a fost gasita.");
  if (!["draft", "devalidat"].includes(String(journal.status || ""))) throwHttp(409, "Doar notele draft sau devalidate se pot edita.");
  if (journal.document_ref_tip && journal.tip_document !== "nota_manuala") throwHttp(409, "Notele generate automat se modifica din documentul sursa.");
  const data = input.data || journal.data || localDate(new Date());
  const date = new Date(data);
  const an = Number(input.an || date.getFullYear());
  const luna = Number(input.luna || date.getMonth() + 1);
  const lines = normalizeLines(db, input.lines || []);
  const totals = validateJournal(db, lines);
  checkPeriodOpen(db, an, luna);
  journal.an = an;
  journal.luna = luna;
  journal.data = data;
  journal.nr_document = input.nr_document || "";
  journal.tip_document = input.tip_document || "nota_manuala";
  journal.explicatie = input.explicatie || "";
  journal.total_debit = totals.totalDebit;
  journal.total_credit = totals.totalCredit;
  journal.updated_by = user?.id || "";
  journal.updated_by_name = user?.name || "";
  journal.updated_at = new Date().toISOString();
  accounting.journalLines = accounting.journalLines.filter((line) => Number(line.journal_id) !== Number(journal.id));
  lines.forEach((line, index) => {
    accounting.journalLines.push({
      id: nextNumericId(accounting.journalLines),
      journal_id: journal.id,
      linie_nr: index + 1,
      cont_simbol: line.cont_simbol,
      denumire_cont: line.denumire_cont,
      debit: money(line.debit),
      credit: money(line.credit),
      tert_id: line.tert_id || null,
      tert_tip: line.tert_tip || "",
      cost_center_id: line.cost_center_id || journal.cost_center_id || null,
      subcentru_id: line.subcentru_id || journal.subcentru_id || null,
      explicatie: line.explicatie || journal.explicatie
    });
  });
  return journal;
}

function validateManualJournal(db, user, journalIdOrUuid) {
  const accounting = ensureAccounting(db);
  const journal = accounting.journals.find((item) => String(item.id) === String(journalIdOrUuid) || item.uuid === journalIdOrUuid);
  if (!journal) throwHttp(404, "Nota contabila nu a fost gasita.");
  if (!["draft", "devalidat"].includes(String(journal.status || ""))) throwHttp(409, "Doar notele draft sau devalidate se pot valida.");
  if (journal.document_ref_tip && journal.tip_document !== "nota_manuala") throwHttp(409, "Notele generate automat se valideaza din documentul sursa.");
  const lines = accounting.journalLines.filter((line) => Number(line.journal_id) === Number(journal.id));
  validateJournal(db, lines);
  checkPeriodOpen(db, journal.an, journal.luna);
  journal.status = "activ";
  journal.validat_de = user?.id || "";
  journal.validat_de_name = user?.name || "";
  journal.validat_la = new Date().toISOString();
  journal.updated_at = new Date().toISOString();
  return journal;
}

function cancelManualJournal(db, user, journalIdOrUuid, reason = "") {
  const accounting = ensureAccounting(db);
  const journal = accounting.journals.find((item) => String(item.id) === String(journalIdOrUuid) || item.uuid === journalIdOrUuid);
  if (!journal) throwHttp(404, "Nota contabila nu a fost gasita.");
  if (journal.status !== "draft") throwHttp(409, "Doar notele draft se pot anula direct.");
  if (journal.document_ref_tip && journal.tip_document !== "nota_manuala") throwHttp(409, "Notele generate automat se anuleaza din documentul sursa.");
  checkPeriodOpen(db, journal.an, journal.luna);
  journal.status = "anulat";
  journal.anulat_de = user?.id || "";
  journal.anulat_de_name = user?.name || "";
  journal.anulat_la = new Date().toISOString();
  journal.anulare_motiv = String(reason || "").trim();
  journal.updated_at = new Date().toISOString();
  return journal;
}

function generateJournalFromInvoiceIn(db, user, invoice) {
  const tert = findThirdParty(db, invoice.furnizor_id);
  const contFurnizor = tert.cont_analitic_furnizor || generateAnalyticAccount(db, tert, "furnizor");
  tert.cont_analitic_furnizor = contFurnizor;
  const invoiceLines = Array.isArray(invoice.lines) && invoice.lines.length
    ? invoice.lines
    : [{ cont: invoice.cont_cheltuiala || "628", valoare: invoice.valoare, tva: invoice.tva, denumire: invoice.explicatie || "" }];
  const expenseLines = invoiceLines.map((line) => ({
    cont: line.cont || invoice.cont_cheltuiala || "628",
    debit: line.valoare,
    tert_id: tert.id,
    tert_tip: "furnizor",
    cost_center_id: line.cost_center_id || invoice.cost_center_id || null,
    subcentru_id: line.subcentru_id || invoice.subcentru_id || null,
    explicatie: line.denumire || invoice.explicatie || `Factura intrare ${invoice.nr_document}`
  }));
  const tva = money(invoiceLines.reduce((sum, line) => sum + money(line.tva), 0));
  return createJournal(db, user, {
    an: invoice.an,
    luna: invoice.luna,
    data: invoice.data,
    nr_document: invoice.nr_document,
    tip_document: "factura_intrare",
    document_ref_id: invoice.id,
    document_ref_tip: "accounting_invoices_in",
    cost_center_id: invoice.cost_center_id || null,
    subcentru_id: invoice.subcentru_id || null,
    explicatie: invoice.explicatie || `Factura intrare ${invoice.nr_document}`,
    lines: [
      ...expenseLines,
      ...(tva > 0 ? [{ cont: "4426", debit: tva, tert_id: tert.id, tert_tip: "furnizor", explicatie: `TVA ${invoice.tva_procent || ""} ${tert.denumire || ""}`.trim() }] : []),
      { cont: contFurnizor, credit: invoice.total, tert_id: tert.id, tert_tip: "furnizor" }
    ]
  });
}

function generateJournalFromInvoiceOut(db, user, invoice) {
  const tert = findThirdParty(db, invoice.client_id);
  const contClient = tert.cont_analitic_client || generateAnalyticAccount(db, tert, "client");
  tert.cont_analitic_client = contClient;
  const invoiceLines = Array.isArray(invoice.lines) && invoice.lines.length
    ? invoice.lines
    : [{ cont: invoice.cont_venit || "704", valoare: invoice.valoare, tva: invoice.tva, denumire: invoice.explicatie || "" }];
  const revenueLines = invoiceLines.map((line) => ({
    cont: line.cont || invoice.cont_venit || "704",
    credit: line.valoare,
    tert_id: tert.id,
    tert_tip: "client",
    cost_center_id: line.cost_center_id || invoice.cost_center_id || null,
    subcentru_id: line.subcentru_id || invoice.subcentru_id || null,
    explicatie: line.denumire || invoice.explicatie || `Factura iesire ${invoice.numar || ""}`.trim()
  }));
  const tva = money(invoiceLines.reduce((sum, line) => sum + money(line.tva), 0));
  return createJournal(db, user, {
    an: invoice.an,
    luna: invoice.luna,
    data: invoice.data,
    nr_document: [invoice.serie, invoice.numar].filter(Boolean).join(" "),
    tip_document: "factura_iesire",
    document_ref_id: invoice.id,
    document_ref_tip: "accounting_invoices_out",
    cost_center_id: invoice.cost_center_id || null,
    subcentru_id: invoice.subcentru_id || null,
    explicatie: invoice.explicatie || `Factura iesire ${invoice.numar || ""}`.trim(),
    lines: [
      { cont: contClient, debit: invoice.total, tert_id: tert.id, tert_tip: "client" },
      ...revenueLines,
      ...(tva > 0 ? [{ cont: "4427", credit: tva, tert_id: tert.id, tert_tip: "client", explicatie: `TVA ${invoice.tva_procent || ""} ${tert.denumire || ""}`.trim() }] : [])
    ]
  });
}

function generateJournalFromTreasury(db, user, treasury) {
  const tert = treasury.tert_id ? findThirdParty(db, treasury.tert_id) : null;
  const isIncasare = treasury.tip_operatie === "incasare";
  const corespondent = treasury.cont_corespondent || (tert
    ? (isIncasare ? tert.cont_analitic_client || generateAnalyticAccount(db, tert, "client") : tert.cont_analitic_furnizor || generateAnalyticAccount(db, tert, "furnizor"))
    : "461");
  return createJournal(db, user, {
    an: treasury.an,
    luna: treasury.luna,
    data: treasury.data,
    nr_document: treasury.nr_document,
    tip_document: treasury.tip || "banca",
    document_ref_id: treasury.id,
    document_ref_tip: "accounting_treasury",
    explicatie: treasury.explicatie || (isIncasare ? "Incasare" : "Plata"),
    lines: isIncasare
      ? [
        { cont: treasury.cont_trezorerie || "5121", debit: treasury.suma, tert_id: tert?.id, tert_tip: tert ? "client" : "" },
        { cont: corespondent, credit: treasury.suma, tert_id: tert?.id, tert_tip: tert ? "client" : "" }
      ]
      : [
        { cont: corespondent, debit: treasury.suma, tert_id: tert?.id, tert_tip: tert ? "furnizor" : "" },
        { cont: treasury.cont_trezorerie || "5121", credit: treasury.suma, tert_id: tert?.id, tert_tip: tert ? "furnizor" : "" }
      ]
  });
}

function stornoJournal(db, user, journalIdOrUuid) {
  const accounting = ensureAccounting(db);
  const original = accounting.journals.find((item) => String(item.id) === String(journalIdOrUuid) || item.uuid === journalIdOrUuid);
  if (!original) throwHttp(404, "Nota contabila nu a fost gasita.");
  if (!isActiveJournal(original)) throwHttp(409, "Doar notele active pot fi stornate.");
  checkPeriodOpen(db, original.an, original.luna);
  const originalLines = accounting.journalLines.filter((line) => Number(line.journal_id) === Number(original.id));
  const storno = createJournal(db, user, {
    an: original.an,
    luna: original.luna,
    data: localDate(new Date()),
    nr_document: `STORNO ${original.nr_document || original.id}`,
    tip_document: "storno",
    document_ref_id: original.document_ref_id,
    document_ref_tip: original.document_ref_tip,
    explicatie: `Storno: ${original.explicatie || original.nr_document || original.id}`,
    storneaza_id: original.id,
    lines: originalLines.map((line) => ({
      cont: line.cont_simbol,
      debit: line.credit,
      credit: line.debit,
      tert_id: line.tert_id,
      tert_tip: line.tert_tip,
      explicatie: `Storno ${line.explicatie || ""}`.trim()
    }))
  });
  original.status = "stornat";
  original.stornat_de_id = storno.id;
  original.updated_at = new Date().toISOString();
  return storno;
}

function devalidateJournal(db, user, journalIdOrUuid, reason = "") {
  const accounting = ensureAccounting(db);
  const journal = accounting.journals.find((item) => String(item.id) === String(journalIdOrUuid) || item.uuid === journalIdOrUuid);
  if (!journal) throwHttp(404, "Nota contabila nu a fost gasita.");
  if (!isActiveJournal(journal)) throwHttp(409, "Nota contabila nu este activa.");
  checkPeriodOpen(db, journal.an, journal.luna);
  journal.status = "devalidat";
  journal.devalidat_de = user?.id || "";
  journal.devalidat_de_name = user?.name || "";
  journal.devalidat_la = new Date().toISOString();
  journal.devalidare_motiv = String(reason || "").trim();
  journal.updated_at = new Date().toISOString();
  return journal;
}

function buildBalance(db, an, luna, tip = "sintetica") {
  const accounting = ensureAccounting(db);
  const journals = accounting.journals.filter((item) =>
    isActiveJournal(item) && Number(item.an) === Number(an) && (!luna || Number(item.luna) <= Number(luna))
  );
  const journalIds = new Set(journals.map((item) => Number(item.id)));
  const rowsByCont = new Map();
  const ensureRow = (cont) => {
    const simbol = tip === "sintetica" ? String(cont).split(".")[0] : cont;
    const account = accounting.chart.find((item) => item.simbol === simbol) || accounting.chart.find((item) => item.simbol === cont);
    const row = rowsByCont.get(simbol) || {
      cont: simbol,
      denumire: account?.denumire || "",
      tip: account?.tip || "B",
      sume_precedente_D: 0,
      sume_precedente_C: 0,
      rulaje_D: 0,
      rulaje_C: 0,
      sume_totale_D: 0,
      sume_totale_C: 0,
      sold_D: 0,
      sold_C: 0
    };
    rowsByCont.set(simbol, row);
    return row;
  };
  accounting.openingBalances
    .filter((row) => Number(row.an) === Number(an) && row.activ !== false)
    .forEach((opening) => {
      const row = ensureRow(opening.cont_simbol);
      row.sume_precedente_D = money(row.sume_precedente_D + money(opening.debit));
      row.sume_precedente_C = money(row.sume_precedente_C + money(opening.credit));
    });
  accounting.journalLines.filter((line) => journalIds.has(Number(line.journal_id))).forEach((line) => {
    const row = ensureRow(line.cont_simbol);
    if (!row.denumire) row.denumire = line.denumire_cont || "";
    row.rulaje_D = money(row.rulaje_D + line.debit);
    row.rulaje_C = money(row.rulaje_C + line.credit);
  });
  rowsByCont.forEach((row) => {
    row.sume_totale_D = money(row.sume_precedente_D + row.rulaje_D);
    row.sume_totale_C = money(row.sume_precedente_C + row.rulaje_C);
    const sold = money(row.sume_totale_D - row.sume_totale_C);
    row.sold_D = sold > 0 ? sold : 0;
    row.sold_C = sold < 0 ? Math.abs(sold) : 0;
  });
  const rows = Array.from(rowsByCont.values()).sort((a, b) => a.cont.localeCompare(b.cont, "ro"));
  const totals = rows.reduce((acc, row) => {
    ["sume_precedente_D", "sume_precedente_C", "rulaje_D", "rulaje_C", "sume_totale_D", "sume_totale_C", "sold_D", "sold_C"].forEach((key) => {
      acc[key] = money((acc[key] || 0) + row[key]);
    });
    return acc;
  }, {});
  return { rows, totals, balanced: Math.abs((totals.sume_totale_D || 0) - (totals.sume_totale_C || 0)) <= 0.01 };
}

function ledger(db, simbol, from = "", to = "") {
  const accounting = ensureAccounting(db);
  const journalsById = new Map(accounting.journals.map((item) => [Number(item.id), item]));
  const account = accounting.chart.find((item) => item.simbol === simbol) || {};
  const fromYear = Number(String(from || "").slice(0, 4)) || new Date().getFullYear();
  const opening = money(accounting.openingBalances
    .filter((row) => row.cont_simbol === simbol && row.activ !== false)
    .filter((row) => Number(row.an) === fromYear)
    .reduce((sum, row) => sum + money(row.debit) - money(row.credit), 0));
  const allMovements = accounting.journalLines
    .filter((line) => line.cont_simbol === simbol)
    .map((line) => ({ line, journal: journalsById.get(Number(line.journal_id)) }))
    .filter(({ journal }) => journal && isActiveJournal(journal))
    .sort((a, b) => String(a.journal.data).localeCompare(String(b.journal.data)) || Number(a.line.linie_nr) - Number(b.line.linie_nr));
  const soldInitial = money(opening + allMovements
    .filter(({ journal }) => from && journal.data < from)
    .reduce((sum, { line }) => sum + money(line.debit) - money(line.credit), 0));
  let sold = soldInitial;
  const movements = allMovements
    .filter(({ journal }) => (!from || journal.data >= from) && (!to || journal.data <= to))
    .map(({ line, journal }) => {
      sold = money(sold + money(line.debit) - money(line.credit));
      const corespondente = accounting.journalLines
        .filter((candidate) => Number(candidate.journal_id) === Number(journal.id) && Number(candidate.id) !== Number(line.id) && candidate.cont_simbol !== simbol)
        .map((candidate) => candidate.cont_simbol)
        .filter(Boolean);
      return { ...line, data: journal.data, nr_document: journal.nr_document, tip_document: journal.tip_document, journal_uuid: journal.uuid, journal_id: journal.id, conturi_corespondente: [...new Set(corespondente)], sold };
    });
  const totalDebit = money(movements.reduce((sum, row) => sum + money(row.debit), 0));
  const totalCredit = money(movements.reduce((sum, row) => sum + money(row.credit), 0));
  let monthlyOpening = soldInitial;
  const monthlySummary = [];
  const monthGroups = new Map();
  movements.forEach((row) => {
    const month = String(row.data || "").slice(0, 7) || "fara-data";
    const summary = monthGroups.get(month) || { luna: month, sold_initial: 0, debit: 0, credit: 0, sold_final: 0, miscari: 0 };
    summary.debit = money(summary.debit + money(row.debit));
    summary.credit = money(summary.credit + money(row.credit));
    summary.miscari += 1;
    monthGroups.set(month, summary);
  });
  [...monthGroups.values()].sort((a, b) => a.luna.localeCompare(b.luna)).forEach((summary) => {
    summary.sold_initial = monthlyOpening;
    summary.sold_final = money(monthlyOpening + summary.debit - summary.credit);
    monthlyOpening = summary.sold_final;
    monthlySummary.push(summary);
  });
  return { simbol, denumire: account.denumire || "", tip: account.tip || "", sold_initial: soldInitial, total_debit: totalDebit, total_credit: totalCredit, miscari_nete: money(totalDebit - totalCredit), movements, monthly_summary: monthlySummary, sold_final: sold };
}

function normalizeLines(db, lines) {
  const accounting = ensureAccounting(db);
  return lines.map((line) => {
    const cont = String(line.cont_simbol || line.cont || "").trim();
    const account = accounting.chart.find((item) => item.simbol === cont);
    return {
      cont_simbol: cont,
      denumire_cont: line.denumire_cont || account?.denumire || "",
      debit: money(line.debit),
      credit: money(line.credit),
      tert_id: line.tert_id || null,
      tert_tip: line.tert_tip || "",
      explicatie: line.explicatie || ""
    };
  });
}

function findThirdParty(db, idValue) {
  const accounting = ensureAccounting(db);
  const tert = accounting.thirdParties.find((item) => String(item.id) === String(idValue));
  if (!tert) throwHttp(404, "Tertul contabil nu a fost gasit.");
  return tert;
}

function money(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function nextNumericId(items) {
  return Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function inferLevel(simbol) {
  const value = String(simbol || "");
  return value.includes(".") ? 3 : (value.length <= 3 ? 1 : 2);
}

function inferAccountCategory(simbol) {
  const c = String(simbol || "");
  if (/^(20|21|22|23|26|28|29)/.test(c)) return "imobilizari";
  if (/^3/.test(c)) return "stocuri";
  if (/^4/.test(c)) return "terti";
  if (/^5/.test(c)) return "trezorerie";
  if (/^6/.test(c)) return "cheltuieli";
  if (/^7/.test(c)) return "venituri";
  if (/^1/.test(c)) return "capital";
  return "general";
}

function isActiveJournal(journal) {
  return String(journal?.status || "activ") === "activ";
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

module.exports = {
  ensureAccounting,
  validateJournal,
  checkPeriodOpen,
  generateAnalyticAccount,
  generateJournalFromInvoiceIn,
  generateJournalFromInvoiceOut,
  generateJournalFromTreasury,
  stornoJournal,
  devalidateJournal,
  updateJournal,
  validateManualJournal,
  cancelManualJournal,
  createJournal,
  isActiveJournal,
  buildBalance,
  ledger,
  accountBalance,
  money,
  nextNumericId,
  localDate
};

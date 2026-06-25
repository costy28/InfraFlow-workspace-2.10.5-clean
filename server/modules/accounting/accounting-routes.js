const { Router } = require("express");
const { requireAuth } = require("../../core/auth");
const { requireAnyPermission, requirePermission, userHasRole } = require("../../core/permissions");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");
const engine = require("./accounting-engine");
const { insertCostEntry } = require("../controlling/auto-register");
const xlsx = require("xlsx");
const multer = require("multer");

const router = Router();
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const JOURNAL_TEMPLATES = [
  {
    key: "in_servicii",
    source: "intrare",
    label: "Servicii terti",
    description: "Factura furnizor pentru servicii generale.",
    main_account: "628",
    line_account: "628",
    vat_account: "4426",
    party_account: "401.x",
    preview: "628 + 4426 = 401.x"
  },
  {
    key: "in_marfa_materiale",
    source: "intrare",
    label: "Marfuri / materiale",
    description: "Factura furnizor pentru materiale sau marfa.",
    main_account: "371",
    line_account: "371",
    vat_account: "4426",
    party_account: "401.x",
    preview: "371 + 4426 = 401.x"
  },
  {
    key: "in_combustibil",
    source: "intrare",
    label: "Combustibil",
    description: "Factura furnizor pentru motorina, benzina sau carburanti.",
    main_account: "6022",
    line_account: "6022",
    vat_account: "4426",
    party_account: "401.x",
    preview: "6022 + 4426 = 401.x"
  },
  {
    key: "in_reparatii",
    source: "intrare",
    label: "Reparatii / intretinere",
    description: "Factura furnizor pentru reparatii si mentenanta.",
    main_account: "611",
    line_account: "611",
    vat_account: "4426",
    party_account: "401.x",
    preview: "611 + 4426 = 401.x"
  },
  {
    key: "out_servicii",
    source: "iesire",
    label: "Servicii prestate",
    description: "Factura client pentru servicii.",
    main_account: "704",
    line_account: "704",
    vat_account: "4427",
    party_account: "4111.x",
    preview: "4111.x = 704 + 4427"
  },
  {
    key: "out_marfa",
    source: "iesire",
    label: "Vanzare marfuri",
    description: "Factura client pentru marfuri.",
    main_account: "707",
    line_account: "707",
    vat_account: "4427",
    party_account: "4111.x",
    preview: "4111.x = 707 + 4427"
  },
  {
    key: "out_productie",
    source: "iesire",
    label: "Productie / asfalt",
    description: "Factura client pentru produse finite sau asfalt.",
    main_account: "701",
    line_account: "701",
    vat_account: "4427",
    party_account: "4111.x",
    preview: "4111.x = 701 + 4427"
  }
];

router.get("/accounting/summary", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  const [an, luna] = monthParts(req.query.luna || currentMonth());
  const invoicesIn = accounting.invoicesIn.filter((item) => item.status !== "anulat" && Number(item.an) === an && Number(item.luna) === luna);
  const invoicesOut = accounting.invoicesOut.filter((item) => item.status !== "anulat" && Number(item.an) === an && Number(item.luna) === luna);
  const vatIn = invoicesIn.reduce((sum, item) => sum + Number(item.tva || 0), 0);
  const vatOut = invoicesOut.reduce((sum, item) => sum + Number(item.tva || 0), 0);
  const period = accounting.periods.find((item) => Number(item.an) === an && Number(item.luna) === luna) || { an, luna, status: "deschisa" };
  sendJson(res, 200, {
    period,
    chartCount: accounting.chart.length,
    journalsCount: accounting.journals.length,
    invoicesIn: { count: invoicesIn.length, total: sum(invoicesIn, "total") },
    invoicesOut: { count: invoicesOut.length, total: sum(invoicesOut, "total") },
    vat: { deductibil: round(vatIn), colectat: round(vatOut), diferenta: round(vatOut - vatIn) },
    overdueSuppliers: accounting.invoicesIn.filter((item) => item.status !== "anulat" && Number(item.neachitat ?? item.total - item.achitat) > 0 && item.data_scadenta < today()).length,
    overdueClients: accounting.invoicesOut.filter((item) => item.status !== "anulat" && Number(item.neincasat ?? item.total - item.incasat) > 0 && item.data_scadenta < today()).length,
    alertsNew: accounting.lawAlerts.filter((item) => item.status === "nou").length
  });
});

router.get("/accounting/health", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  const [an, luna] = monthParts(req.query.luna || currentMonth());
  const period = accounting.periods.find((item) => Number(item.an) === an && Number(item.luna) === luna) || { an, luna, status: "deschisa" };
  const requiredAccounts = [
    ["401", "Furnizori"],
    ["4111", "Clienti"],
    ["4426", "TVA deductibila"],
    ["4427", "TVA colectata"],
    ["5121", "Banca in lei"],
    ["5311", "Casa in lei"],
    ["628", "Cheltuieli servicii"],
    ["704", "Venituri servicii"]
  ].map(([simbol, label]) => {
    const account = accounting.chart.find((item) => item.simbol === simbol);
    return {
      simbol,
      label,
      exists: Boolean(account),
      active: account ? account.activ !== false : false
    };
  });
  const supplierCount = accounting.thirdParties.filter((item) => item.tip === "furnizor" || item.tip === "ambele").length;
  const clientCount = accounting.thirdParties.filter((item) => item.tip === "client" || item.tip === "ambele").length;
  const missingAccounts = requiredAccounts.filter((item) => !item.exists || !item.active);
  const checks = [
    {
      key: "chart",
      label: "Plan de conturi",
      ok: accounting.chart.length >= requiredAccounts.length && missingAccounts.length === 0,
      value: `${accounting.chart.length} conturi`,
      message: missingAccounts.length ? `Lipsesc: ${missingAccounts.map((item) => item.simbol).join(", ")}.` : "Conturile obligatorii sunt disponibile."
    },
    {
      key: "third_parties",
      label: "Terti contabili",
      ok: supplierCount > 0 && clientCount > 0,
      value: `${supplierCount} furnizori / ${clientCount} clienti`,
      message: supplierCount > 0 && clientCount > 0 ? "Ai terti pentru facturi intrare si iesire." : "Adauga cel putin un furnizor si un client."
    },
    {
      key: "period",
      label: "Perioada curenta",
      ok: !["inchisa", "depusa"].includes(period.status),
      value: `${String(luna).padStart(2, "0")}/${an} - ${period.status}`,
      message: ["inchisa", "depusa"].includes(period.status) ? "Perioada este inchisa; documentele noi trebuie introduse intr-o luna deschisa." : "Perioada este deschisa pentru operare."
    },
    {
      key: "journals",
      label: "Registru jurnal",
      ok: true,
      value: `${accounting.journals.filter(engine.isActiveJournal).length} note active`,
      message: "Notele validate vor aparea aici automat."
    }
  ];
  sendJson(res, 200, {
    status: checks.every((item) => item.ok) ? "ok" : "needs_attention",
    month: `${an}-${String(luna).padStart(2, "0")}`,
    checks,
    requiredAccounts,
    counts: {
      chart: accounting.chart.length,
      suppliers: supplierCount,
      clients: clientCount,
      journals: accounting.journals.filter(engine.isActiveJournal).length,
      invoices_in: accounting.invoicesIn.length,
      invoices_out: accounting.invoicesOut.length,
      treasury: accounting.treasury.length
    }
  });
});

router.get("/accounting/journal-templates", requireAccountingView, (req, res) => {
  const templates = getJournalTemplates(req.auth.db, req.query);
  sendJson(res, 200, { templates });
});

router.post("/accounting/journal-templates", requireAccountingManage, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const template = normalizeJournalTemplate(req.body || {});
    template.id = engine.nextNumericId(accounting.journalTemplates);
    template.key = template.key || `custom_${template.id}`;
    if (JOURNAL_TEMPLATES.some((item) => item.key === template.key) || accounting.journalTemplates.some((item) => item.key === template.key)) {
      throwHttp(409, "Cheia sablonului exista deja.");
    }
    template.system = false;
    template.created_at = new Date().toISOString();
    accounting.journalTemplates.push(template);
    addAudit(req.auth.db, req.auth.user, "accounting_journal_template_create", template.label);
    writeDb(req.auth.db);
    sendJson(res, 201, { template });
  } catch (error) { next(error); }
});

router.patch("/accounting/journal-templates/:key", requireAccountingManage, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const template = accounting.journalTemplates.find((item) => item.key === req.params.key);
    if (!template) throwHttp(404, "Sablonul nu a fost gasit sau este sablon de sistem.");
    const nextTemplate = normalizeJournalTemplate({ ...template, ...(req.body || {}), key: template.key });
    Object.assign(template, nextTemplate, { system: false, updated_at: new Date().toISOString() });
    addAudit(req.auth.db, req.auth.user, "accounting_journal_template_update", template.label);
    writeDb(req.auth.db);
    sendJson(res, 200, { template });
  } catch (error) { next(error); }
});

router.get("/accounting/opening-balances", requireAccountingReports, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  const an = Number(req.query.an || new Date().getFullYear());
  const rows = accounting.openingBalances
    .filter((row) => Number(row.an) === an && row.activ !== false)
    .map((row) => decorateOpeningBalance(row, accounting))
    .sort((a, b) => String(a.cont_simbol).localeCompare(String(b.cont_simbol), "ro"));
  sendJson(res, 200, { an, rows, totals: openingBalanceTotals(rows) });
});

router.put("/accounting/opening-balances/:an", requireAccountingPost, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const an = Number(req.params.an || new Date().getFullYear());
    if (!Number.isFinite(an) || an < 2000 || an > 2100) throwHttp(400, "Anul soldurilor initiale este invalid.");
    const rows = normalizeOpeningBalances(req.auth.db, req.body?.rows || [], an);
    accounting.openingBalances = accounting.openingBalances.filter((row) => Number(row.an) !== an);
    rows.forEach((row) => accounting.openingBalances.push({
      id: engine.nextNumericId(accounting.openingBalances),
      ...row,
      activ: true,
      updated_by: req.auth.user?.id || "",
      updated_at: new Date().toISOString()
    }));
    addAudit(req.auth.db, req.auth.user, "accounting_opening_balances_update", `${an} / ${rows.length} conturi`);
    writeDb(req.auth.db);
    const decorated = rows
      .map((row) => decorateOpeningBalance(row, accounting))
      .sort((a, b) => String(a.cont_simbol).localeCompare(String(b.cont_simbol), "ro"));
    sendJson(res, 200, { an, rows: decorated, totals: openingBalanceTotals(decorated) });
  } catch (error) { next(error); }
});

router.get("/accounting/reconciliation", requireAccountingView, (req, res) => {
  const [an, luna] = monthParts(req.query.luna || currentMonth());
  sendJson(res, 200, buildReconciliation(req.auth.db, an, luna));
});

router.get("/accounting/reconciliation/export", requireAccountingReports, (req, res, next) => {
  try {
    const [an, luna] = monthParts(req.query.luna || currentMonth());
    const reconciliation = buildReconciliation(req.auth.db, an, luna, { issueLimit: 10000 });
    const issueRows = flattenReconciliationIssues(reconciliation);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const summaryRows = [
      ["Reconciliere contabila", reconciliation.month],
      ["Status general", reconciliationStatusLabel(reconciliation.status)],
      [],
      ["Zona", "Status", "Valoare", "Mesaj", "Link"],
      ...reconciliation.checks.map((check) => [check.label, reconciliationStatusLabel(check.severity), check.value, check.message, absoluteAppLink(baseUrl, check.link)])
    ];
    const problemRows = [
      ["Probleme de rezolvat", reconciliation.month],
      ["Total probleme", issueRows.length],
      [],
      ["Grupa", "Data", "Document", "Status", "Suma / Rest / Diferenta", "Actiune recomandata", "Link"],
      ...(issueRows.length ? issueRows.map((issue) => [
        issue.group,
        issue.data || "",
        issue.document || issue.id || "",
        issue.status || "",
        issue.amount || "",
        issue.action || "",
        absoluteAppLink(baseUrl, issue.link)
      ]) : [["Fara probleme", "", "", "", "", "Nu sunt probleme contabile evidente pentru luna selectata.", ""]])
    ];
    const workbook = xlsx.utils.book_new();
    const summarySheet = xlsx.utils.aoa_to_sheet(summaryRows);
    summarySheet["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 22 }, { wch: 74 }, { wch: 58 }];
    summarySheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    summarySheet["!autofilter"] = { ref: `A4:E${summaryRows.length}` };
    addHyperlinks(summarySheet, summaryRows, 4);
    xlsx.utils.book_append_sheet(workbook, summarySheet, "Sumar");
    const problemsSheet = xlsx.utils.aoa_to_sheet(problemRows);
    problemsSheet["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 76 }, { wch: 58 }];
    problemsSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    problemsSheet["!autofilter"] = { ref: `A4:G${problemRows.length}` };
    addHyperlinks(problemsSheet, problemRows, 6);
    xlsx.utils.book_append_sheet(workbook, problemsSheet, "Probleme");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Reconciliere_contabila_${reconciliation.month}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.get("/accounting/chart", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  const query = String(req.query.q || "").toLowerCase();
  const rows = accounting.chart.filter((item) =>
    (!req.query.clasa || Number(item.clasa) === Number(req.query.clasa)) &&
    (!req.query.tip || item.tip === req.query.tip) &&
    (!req.query.nivel || Number(item.nivel) === Number(req.query.nivel)) &&
    (!query || `${item.simbol} ${item.denumire}`.toLowerCase().includes(query))
  ).sort((a, b) => a.simbol.localeCompare(b.simbol, "ro", { numeric: true }));
  sendJson(res, 200, { accounts: rows });
});

router.get("/accounting/chart/:simbol", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  const account = accounting.chart.find((item) => item.simbol === req.params.simbol);
  if (!account) return sendJson(res, 404, { error: "Contul nu a fost gasit." });
  sendJson(res, 200, { account });
});

router.get("/accounting/cost-centers", requireAccountingView, (req, res) => {
  const controlling = req.auth.db.controlling || {};
  const centers = Array.isArray(controlling.costCenters) ? controlling.costCenters : [];
  sendJson(res, 200, {
    costCenters: centers
      .filter((item) => item.activ !== false && item.activ !== 0)
      .sort((a, b) => Number(a.nivel || 1) - Number(b.nivel || 1) || String(a.denumire || a.name || "").localeCompare(String(b.denumire || b.name || ""), "ro", { numeric: true }))
  });
});

router.post("/accounting/chart", requireAccountingManage, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const body = req.body || {};
    const simbol = String(body.simbol || "").trim();
    if (!/^\d[\d.]{1,18}$/.test(simbol)) throwHttp(400, "Simbol cont invalid.");
    if (accounting.chart.some((item) => item.simbol === simbol)) throwHttp(409, "Contul exista deja.");
    const account = {
      id: engine.nextNumericId(accounting.chart),
      simbol,
      denumire: String(body.denumire || "").trim(),
      clasa: Number(body.clasa || simbol[0]),
      tip: ["A", "P", "B"].includes(body.tip) ? body.tip : "B",
      nivel: Number(body.nivel || (simbol.includes(".") ? 3 : 2)),
      parinte_simbol: String(body.parinte_simbol || "").trim(),
      tip_cont: String(body.tip_cont || "general").trim(),
      tva_deductibil: Boolean(body.tva_deductibil),
      tva_colectat: Boolean(body.tva_colectat),
      activ: true,
      sistem: false
    };
    if (!account.denumire) throwHttp(400, "Denumirea contului este obligatorie.");
    accounting.chart.push(account);
    addAudit(req.auth.db, req.auth.user, "accounting_chart_create", `${account.simbol} ${account.denumire}`);
    writeDb(req.auth.db);
    sendJson(res, 201, { account });
  } catch (error) { next(error); }
});

router.patch("/accounting/chart/:simbol", requireAccountingManage, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const account = accounting.chart.find((item) => item.simbol === req.params.simbol);
    if (!account) return sendJson(res, 404, { error: "Contul nu a fost gasit." });

    const body = req.body || {};
    const denumire = String(body.denumire ?? account.denumire ?? "").trim();
    if (!denumire) throwHttp(400, "Denumirea contului este obligatorie.");

    const tip = body.tip === undefined ? account.tip : String(body.tip || "").trim();
    if (!["A", "P", "B"].includes(tip)) throwHttp(400, "Tipul contului trebuie sa fie A, P sau B.");

    const activ = body.activ === undefined ? account.activ !== false : body.activ !== false;
    if (activ === false && ["401", "4111", "4426", "4427", "5121", "5211", "5311"].includes(account.simbol)) {
      throwHttp(409, "Contul este obligatoriu pentru validarile contabile si nu poate fi dezactivat.");
    }

    account.denumire = denumire;
    account.tip = tip;
    account.tip_cont = String(body.tip_cont ?? account.tip_cont ?? "general").trim() || "general";
    account.parinte_simbol = String(body.parinte_simbol ?? account.parinte_simbol ?? "").trim();
    account.tva_deductibil = Boolean(body.tva_deductibil ?? account.tva_deductibil);
    account.tva_colectat = Boolean(body.tva_colectat ?? account.tva_colectat);
    account.activ = activ;
    account.updated_at = new Date().toISOString();

    addAudit(req.auth.db, req.auth.user, "accounting_chart_update", `${account.simbol} ${account.denumire}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { account });
  } catch (error) { next(error); }
});

router.get("/accounting/third-parties", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  const tip = String(req.query.tip || "");
  sendJson(res, 200, { thirdParties: accounting.thirdParties.filter((item) => !tip || item.tip === tip || item.tip === "ambele") });
});

router.post("/accounting/third-parties", requireAccountingManage, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const tert = normalizeThirdParty(req.auth.db, req.body || {});
    accounting.thirdParties.push(tert);
    if (tert.tip === "furnizor" || tert.tip === "ambele") tert.cont_analitic_furnizor = engine.generateAnalyticAccount(req.auth.db, tert, "furnizor");
    if (tert.tip === "client" || tert.tip === "ambele") tert.cont_analitic_client = engine.generateAnalyticAccount(req.auth.db, tert, "client");
    addAudit(req.auth.db, req.auth.user, "accounting_third_party_create", `${tert.cod} ${tert.denumire}`);
    writeDb(req.auth.db);
    sendJson(res, 201, { thirdParty: tert });
  } catch (error) { next(error); }
});

router.patch("/accounting/third-parties/:id", requireAccountingManage, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const tert = accounting.thirdParties.find((item) => String(item.id) === String(req.params.id));
    if (!tert) return sendJson(res, 404, { error: "Tertul nu a fost gasit." });
    Object.assign(tert, normalizeThirdParty(req.auth.db, { ...tert, ...(req.body || {}) }, tert));
    addAudit(req.auth.db, req.auth.user, "accounting_third_party_update", `${tert.cod} ${tert.denumire}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { thirdParty: tert });
  } catch (error) { next(error); }
});

router.get("/accounting/periods", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  sendJson(res, 200, { periods: accounting.periods.sort((a, b) => Number(b.an) - Number(a.an) || Number(b.luna) - Number(a.luna)) });
});

router.get("/accounting/invoices-in", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  sendJson(res, 200, { invoices: filterDocuments(accounting.invoicesIn, req.query).map((row) => decorateInvoice(row, accounting)) });
});

router.post("/accounting/invoices-in", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = createInvoiceIn(req.auth.db, req.auth.user, req.body || {});
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_in_create", invoice.nr_document);
    writeDb(req.auth.db);
    sendJson(res, 201, { invoice });
  } catch (error) { next(error); }
});

router.patch("/accounting/invoices-in/:uuid", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesIn, req.params.uuid, "Factura nu a fost gasita.");
    if (invoice.status !== "draft") throwHttp(409, "Doar facturile draft se pot modifica.");
    engine.checkPeriodOpen(req.auth.db, invoice.an, invoice.luna);
    Object.assign(invoice, normalizeInvoiceIn(req.auth.db, req.body || {}, invoice));
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_in_update", invoice.nr_document);
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice });
  } catch (error) { next(error); }
});

router.post("/accounting/invoices-in/:uuid/validate", requireAccountingPost, async (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesIn, req.params.uuid, "Factura nu a fost gasita.");
    if (invoice.status !== "draft") throwHttp(409, "Factura nu este in draft.");
    engine.checkPeriodOpen(req.auth.db, invoice.an, invoice.luna);
    const journal = engine.generateJournalFromInvoiceIn(req.auth.db, req.auth.user, invoice);
    invoice.journal_id = journal.id;
    invoice.status = "validat";
    await registerInvoiceInCostEntry(req.auth.db, req.auth.user, invoice);
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_in_validate", `${invoice.nr_document} / nota ${journal.id}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice: decorateInvoice(invoice, engine.ensureAccounting(req.auth.db)), journal });
  } catch (error) { next(error); }
});

router.post("/accounting/invoices-in/:uuid/devalidate", requireAccountingPost, async (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesIn, req.params.uuid, "Factura nu a fost gasita.");
    devalidateInvoice(req.auth.db, req.auth.user, invoice, "accounting_invoice_in_devalidate", req.body?.motiv);
    await reverseInvoiceInCostEntry(req.auth.db, req.auth.user, invoice, req.body?.motiv);
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice: decorateInvoice(invoice, engine.ensureAccounting(req.auth.db)) });
  } catch (error) { next(error); }
});

router.delete("/accounting/invoices-in/:uuid", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesIn, req.params.uuid, "Factura nu a fost gasita.");
    cancelDraftInvoice(req.auth.db, req.auth.user, invoice, req.body?.motiv || req.query.motiv || "");
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_in_cancel", invoice.nr_document);
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice: decorateInvoice(invoice, engine.ensureAccounting(req.auth.db)) });
  } catch (error) { next(error); }
});

router.post("/accounting/invoices-in/:uuid/storno", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesIn, req.params.uuid, "Factura nu a fost gasita.");
    const journal = engine.stornoJournal(req.auth.db, req.auth.user, invoice.journal_id);
    invoice.status = "stornat";
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_in_storno", invoice.nr_document);
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice: decorateInvoice(invoice, engine.ensureAccounting(req.auth.db)), journal });
  } catch (error) { next(error); }
});

router.post("/accounting/invoices-in/:uuid/pay", requireAccountingPost, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const invoice = findByUuid(accounting.invoicesIn, req.params.uuid, "Factura nu a fost gasita.");
    const remaining = round(invoice.neachitat ?? invoice.total - Number(invoice.achitat || 0));
    if (!["validat", "partial"].includes(String(invoice.status || ""))) throwHttp(409, "Doar facturile validate sau partial platite se pot plati.");
    if (remaining <= 0) throwHttp(409, "Factura este deja achitata.");
    const amount = round(req.body?.suma || remaining);
    if (amount <= 0) throwHttp(400, "Suma platita trebuie sa fie pozitiva.");
    if (amount > remaining + 0.01) throwHttp(422, `Suma platita depaseste restul facturii: ${remaining.toFixed(2)}.`);
    const treasury = createTreasury(req.auth.db, req.auth.user, {
      ...(req.body || {}),
      tip: "banca",
      tip_operatie: "plata",
      tert_id: invoice.furnizor_id,
      cont_corespondent: thirdParty(req.auth.db, invoice.furnizor_id).cont_analitic_furnizor,
      suma: amount,
      data: req.body?.data || today(),
      explicatie: `Plata factura ${invoice.nr_document}`,
      invoice_in_id: invoice.id
    });
    const journal = engine.generateJournalFromTreasury(req.auth.db, req.auth.user, treasury);
    treasury.journal_id = journal.id;
    treasury.status = "validat";
    invoice.achitat = round(Number(invoice.achitat || 0) + Number(treasury.suma || 0));
    invoice.neachitat = round(invoice.total - invoice.achitat);
    invoice.status = invoice.neachitat <= 0 ? "achitat" : "partial";
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_in_pay", `${invoice.nr_document} / ${treasury.suma}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice, treasury, journal });
  } catch (error) { next(error); }
});

router.get("/accounting/invoices-out", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  sendJson(res, 200, { invoices: filterDocuments(accounting.invoicesOut, req.query).map((row) => decorateInvoice(row, accounting)) });
});

router.post("/accounting/invoices-out", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = createInvoiceOut(req.auth.db, req.auth.user, req.body || {});
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_out_create", String(invoice.numar || ""));
    writeDb(req.auth.db);
    sendJson(res, 201, { invoice });
  } catch (error) { next(error); }
});

router.patch("/accounting/invoices-out/:uuid", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesOut, req.params.uuid, "Factura nu a fost gasita.");
    if (invoice.status !== "draft") throwHttp(409, "Doar facturile draft se pot modifica.");
    engine.checkPeriodOpen(req.auth.db, invoice.an, invoice.luna);
    Object.assign(invoice, normalizeInvoiceOut(req.auth.db, req.body || {}, invoice));
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_out_update", String(invoice.numar || ""));
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice });
  } catch (error) { next(error); }
});

router.post("/accounting/invoices-out/:uuid/validate", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesOut, req.params.uuid, "Factura nu a fost gasita.");
    if (invoice.status !== "draft") throwHttp(409, "Factura nu este in draft.");
    engine.checkPeriodOpen(req.auth.db, invoice.an, invoice.luna);
    const journal = engine.generateJournalFromInvoiceOut(req.auth.db, req.auth.user, invoice);
    invoice.journal_id = journal.id;
    invoice.status = "validat";
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_out_validate", `${invoice.numar || ""} / nota ${journal.id}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice: decorateInvoice(invoice, engine.ensureAccounting(req.auth.db)), journal });
  } catch (error) { next(error); }
});

router.post("/accounting/invoices-out/:uuid/devalidate", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesOut, req.params.uuid, "Factura nu a fost gasita.");
    devalidateInvoice(req.auth.db, req.auth.user, invoice, "accounting_invoice_out_devalidate", req.body?.motiv);
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice: decorateInvoice(invoice, engine.ensureAccounting(req.auth.db)) });
  } catch (error) { next(error); }
});

router.delete("/accounting/invoices-out/:uuid", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesOut, req.params.uuid, "Factura nu a fost gasita.");
    cancelDraftInvoice(req.auth.db, req.auth.user, invoice, req.body?.motiv || req.query.motiv || "");
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_out_cancel", String(invoice.numar || ""));
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice: decorateInvoice(invoice, engine.ensureAccounting(req.auth.db)) });
  } catch (error) { next(error); }
});

router.post("/accounting/invoices-out/:uuid/storno", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesOut, req.params.uuid, "Factura nu a fost gasita.");
    const journal = engine.stornoJournal(req.auth.db, req.auth.user, invoice.journal_id);
    invoice.status = "stornat";
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_out_storno", String(invoice.numar || ""));
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice: decorateInvoice(invoice, engine.ensureAccounting(req.auth.db)), journal });
  } catch (error) { next(error); }
});

router.post("/accounting/invoices-out/:uuid/collect", requireAccountingPost, (req, res, next) => {
  try {
    const invoice = findByUuid(engine.ensureAccounting(req.auth.db).invoicesOut, req.params.uuid, "Factura nu a fost gasita.");
    const remaining = round(invoice.neincasat ?? invoice.total - Number(invoice.incasat || 0));
    if (!["validat", "partial"].includes(String(invoice.status || ""))) throwHttp(409, "Doar facturile validate sau partial incasate se pot incasa.");
    if (remaining <= 0) throwHttp(409, "Factura este deja incasata.");
    const amount = round(req.body?.suma || remaining);
    if (amount <= 0) throwHttp(400, "Suma incasata trebuie sa fie pozitiva.");
    if (amount > remaining + 0.01) throwHttp(422, `Suma incasata depaseste restul facturii: ${remaining.toFixed(2)}.`);
    const treasury = createTreasury(req.auth.db, req.auth.user, {
      ...(req.body || {}),
      tip: "banca",
      tip_operatie: "incasare",
      tert_id: invoice.client_id,
      cont_corespondent: thirdParty(req.auth.db, invoice.client_id).cont_analitic_client,
      suma: amount,
      data: req.body?.data || today(),
      explicatie: `Incasare factura ${invoice.numar || ""}`.trim(),
      invoice_out_id: invoice.id
    });
    const journal = engine.generateJournalFromTreasury(req.auth.db, req.auth.user, treasury);
    treasury.journal_id = journal.id;
    treasury.status = "validat";
    invoice.incasat = round(Number(invoice.incasat || 0) + Number(treasury.suma || 0));
    invoice.neincasat = round(invoice.total - invoice.incasat);
    invoice.status = invoice.neincasat <= 0 ? "incasat" : "partial";
    addAudit(req.auth.db, req.auth.user, "accounting_invoice_out_collect", `${invoice.numar || ""} / ${treasury.suma}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { invoice, treasury, journal });
  } catch (error) { next(error); }
});

router.get("/accounting/treasury", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  sendJson(res, 200, { treasury: filterDocuments(accounting.treasury, req.query).map((row) => decorateTreasury(row, accounting)) });
});

router.get("/accounting/treasury/export", requireAccountingReports, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const rows = filterDocuments(accounting.treasury, req.query).map((row) => decorateTreasury(row, accounting));
    const totalIncasari = round(rows.filter((row) => row.tip_operatie === "incasare").reduce((acc, row) => acc + Number(row.suma || 0), 0));
    const totalPlati = round(rows.filter((row) => row.tip_operatie === "plata").reduce((acc, row) => acc + Number(row.suma || 0), 0));
    const exportRows = [
      ["Registru trezorerie", req.query.an || "", req.query.luna ? String(req.query.luna).padStart(2, "0") : "", req.query.status || "toate fara anulate"],
      [],
      ["Data", "Tip", "Operatie", "Document", "Tert", "CUI", "Cont trezorerie", "Cont corespondent", "Suma", "Status", "Nota contabila", "Explicatie"],
      ...rows.map((row) => {
        const tert = row.tert_id ? accounting.thirdParties.find((item) => String(item.id) === String(row.tert_id)) : null;
        return [
          row.data || "",
          row.tip || "",
          row.tip_operatie || "",
          row.nr_document || "",
          tert?.denumire || "",
          tert?.cui || "",
          row.cont_trezorerie || "",
          row.cont_corespondent || "",
          row.suma || 0,
          row.status || "",
          row.journal_id ? `NC ${row.journal_id}` : "",
          row.explicatie || ""
        ];
      }),
      [],
      ["TOTAL INCASARI", "", "", "", "", "", "", "", totalIncasari, "", "", ""],
      ["TOTAL PLATI", "", "", "", "", "", "", "", totalPlati, "", "", ""],
      ["DIFERENTA", "", "", "", "", "", "", "", round(totalIncasari - totalPlati), "", "", ""]
    ];
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet(exportRows);
    sheet["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 42 }];
    xlsx.utils.book_append_sheet(workbook, sheet, "Trezorerie");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    const suffix = req.query.an && req.query.luna ? `${req.query.an}_${String(req.query.luna).padStart(2, "0")}` : today();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Trezorerie_${suffix}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.post("/accounting/treasury", requireAccountingPost, (req, res, next) => {
  try {
    const treasury = createTreasury(req.auth.db, req.auth.user, req.body || {});
    addAudit(req.auth.db, req.auth.user, "accounting_treasury_create", `${treasury.tip_operatie} ${treasury.suma}`);
    writeDb(req.auth.db);
    sendJson(res, 201, { treasury });
  } catch (error) { next(error); }
});

router.patch("/accounting/treasury/:uuid", requireAccountingPost, (req, res, next) => {
  try {
    const treasury = findByUuid(engine.ensureAccounting(req.auth.db).treasury, req.params.uuid, "Operatia nu a fost gasita.");
    if (treasury.status !== "draft") throwHttp(409, "Doar operatiile draft se pot modifica.");
    engine.checkPeriodOpen(req.auth.db, treasury.an, treasury.luna);
    Object.assign(treasury, normalizeTreasury(req.body || {}, treasury));
    prepareTreasuryInvoiceLink(req.auth.db, treasury);
    engine.checkPeriodOpen(req.auth.db, treasury.an, treasury.luna);
    addAudit(req.auth.db, req.auth.user, "accounting_treasury_update", `${treasury.tip_operatie} ${treasury.suma}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { treasury: decorateTreasury(treasury, engine.ensureAccounting(req.auth.db)) });
  } catch (error) { next(error); }
});

router.post("/accounting/treasury/:uuid/validate", requireAccountingPost, (req, res, next) => {
  try {
    const treasury = findByUuid(engine.ensureAccounting(req.auth.db).treasury, req.params.uuid, "Operatia nu a fost gasita.");
    if (treasury.status !== "draft") throwHttp(409, "Operatia nu este in draft.");
    engine.checkPeriodOpen(req.auth.db, treasury.an, treasury.luna);
    prepareTreasuryInvoiceLink(req.auth.db, treasury);
    assertTreasuryInvoiceCanApply(req.auth.db, treasury);
    const journal = engine.generateJournalFromTreasury(req.auth.db, req.auth.user, treasury);
    applyTreasuryInvoiceEffect(req.auth.db, treasury);
    treasury.journal_id = journal.id;
    treasury.status = "validat";
    addAudit(req.auth.db, req.auth.user, "accounting_treasury_validate", `${treasury.tip_operatie} ${treasury.suma}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { treasury: decorateTreasury(treasury, engine.ensureAccounting(req.auth.db)), journal });
  } catch (error) { next(error); }
});

router.post("/accounting/treasury/:uuid/devalidate", requireAccountingPost, (req, res, next) => {
  try {
    const treasury = findByUuid(engine.ensureAccounting(req.auth.db).treasury, req.params.uuid, "Operatia nu a fost gasita.");
    devalidateTreasury(req.auth.db, req.auth.user, treasury, req.body?.motiv);
    writeDb(req.auth.db);
    sendJson(res, 200, { treasury: decorateTreasury(treasury, engine.ensureAccounting(req.auth.db)) });
  } catch (error) { next(error); }
});

router.delete("/accounting/treasury/:uuid", requireAccountingPost, (req, res, next) => {
  try {
    const treasury = findByUuid(engine.ensureAccounting(req.auth.db).treasury, req.params.uuid, "Operatia nu a fost gasita.");
    cancelDraftDocument(req.auth.db, req.auth.user, treasury, req.body?.motiv || req.query.motiv || "");
    addAudit(req.auth.db, req.auth.user, "accounting_treasury_cancel", `${treasury.tip_operatie} ${treasury.suma}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { treasury: decorateTreasury(treasury, engine.ensureAccounting(req.auth.db)) });
  } catch (error) { next(error); }
});

router.get("/accounting/journals", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  const journals = filterDocuments(accounting.journals, req.query).map((journal) => ({
    ...journal,
    lines: accounting.journalLines.filter((line) => Number(line.journal_id) === Number(journal.id))
  }));
  sendJson(res, 200, { journals });
});

router.get("/accounting/journals/export", requireAccountingReports, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const journals = filterDocuments(accounting.journals, req.query).map((journal) => ({
      ...journal,
      lines: accounting.journalLines.filter((line) => Number(line.journal_id) === Number(journal.id))
    }));
    const rows = [
      ["Registru jurnal", req.query.an || "", req.query.luna ? String(req.query.luna).padStart(2, "0") : "", req.query.status || "toate fara anulate"],
      [],
      ["Data", "Document", "Tip document", "Explicatie nota", "Status", "Linie", "Cont", "Denumire cont", "Debit", "Credit", "Explicatie linie"],
      ...journals.flatMap((journal) => (journal.lines || []).map((line) => [
        journal.data || "",
        journal.nr_document || `NC ${journal.id}`,
        journal.tip_document || "",
        journal.explicatie || "",
        journal.status || "",
        line.linie_nr || "",
        line.cont_simbol || "",
        line.denumire_cont || "",
        line.debit || 0,
        line.credit || 0,
        line.explicatie || ""
      ])),
      [],
      ["TOTAL", "", "", "", "", "", "", "", sum(journals, "total_debit"), sum(journals, "total_credit"), ""]
    ];
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 42 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 42 }];
    xlsx.utils.book_append_sheet(workbook, sheet, "Registru jurnal");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    const suffix = req.query.an && req.query.luna ? `${req.query.an}_${String(req.query.luna).padStart(2, "0")}` : today();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Registru_jurnal_${suffix}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.get("/accounting/journals/:uuid", requireAccountingView, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  const journal = findByUuid(accounting.journals, req.params.uuid, "Nota contabila nu a fost gasita.");
  const lines = accounting.journalLines.filter((line) => Number(line.journal_id) === Number(journal.id));
  sendJson(res, 200, { journal: { ...journal, lines } });
});

router.post("/accounting/journals", requireAccountingPost, (req, res, next) => {
  try {
    const body = req.body || {};
    const [an, luna] = dateParts(body.data || today());
    const journal = engine.createJournal(req.auth.db, req.auth.user, {
      an: body.an || an,
      luna: body.luna || luna,
      data: body.data || today(),
      nr_document: body.nr_document || "",
      tip_document: body.tip_document || "nota_manuala",
      explicatie: body.explicatie || "",
      lines: body.lines || [],
      status: body.status || "draft"
    });
    addAudit(req.auth.db, req.auth.user, "accounting_journal_create", `${journal.id} / ${journal.explicatie}`);
    writeDb(req.auth.db);
    sendJson(res, 201, { journal });
  } catch (error) { next(error); }
});

router.patch("/accounting/journals/:uuid", requireAccountingPost, (req, res, next) => {
  try {
    const body = req.body || {};
    const [an, luna] = dateParts(body.data || today());
    const journal = engine.updateJournal(req.auth.db, req.auth.user, req.params.uuid, {
      an: body.an || an,
      luna: body.luna || luna,
      data: body.data || today(),
      nr_document: body.nr_document || "",
      tip_document: body.tip_document || "nota_manuala",
      explicatie: body.explicatie || "",
      lines: body.lines || []
    });
    addAudit(req.auth.db, req.auth.user, "accounting_journal_update", `${journal.id} / ${journal.explicatie}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { journal: { ...journal, lines: engine.ensureAccounting(req.auth.db).journalLines.filter((line) => Number(line.journal_id) === Number(journal.id)) } });
  } catch (error) { next(error); }
});

router.post("/accounting/journals/:uuid/validate", requireAccountingPost, (req, res, next) => {
  try {
    const journal = engine.validateManualJournal(req.auth.db, req.auth.user, req.params.uuid);
    addAudit(req.auth.db, req.auth.user, "accounting_journal_validate", `${journal.id} / ${journal.explicatie}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { journal: { ...journal, lines: engine.ensureAccounting(req.auth.db).journalLines.filter((line) => Number(line.journal_id) === Number(journal.id)) } });
  } catch (error) { next(error); }
});

router.post("/accounting/journals/:uuid/devalidate", requireAccountingPost, (req, res, next) => {
  try {
    const journal = engine.devalidateJournal(req.auth.db, req.auth.user, req.params.uuid, req.body?.motiv || "");
    addAudit(req.auth.db, req.auth.user, "accounting_journal_devalidate", `${journal.id} / ${journal.explicatie}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { journal: { ...journal, lines: engine.ensureAccounting(req.auth.db).journalLines.filter((line) => Number(line.journal_id) === Number(journal.id)) } });
  } catch (error) { next(error); }
});

router.delete("/accounting/journals/:uuid", requireAccountingPost, (req, res, next) => {
  try {
    const journal = engine.cancelManualJournal(req.auth.db, req.auth.user, req.params.uuid, req.body?.motiv || req.query.motiv || "");
    addAudit(req.auth.db, req.auth.user, "accounting_journal_cancel", `${journal.id} / ${journal.explicatie}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { journal });
  } catch (error) { next(error); }
});

router.post("/accounting/journals/:uuid/storno", requireAccountingPost, (req, res, next) => {
  try {
    const journal = engine.stornoJournal(req.auth.db, req.auth.user, req.params.uuid);
    addAudit(req.auth.db, req.auth.user, "accounting_journal_storno", String(req.params.uuid));
    writeDb(req.auth.db);
    sendJson(res, 200, { journal });
  } catch (error) { next(error); }
});

router.post("/accounting/journals/import-xls/preview", requireAccountingPost, importUpload.single("file"), (req, res, next) => {
  try {
    const preview = previewJournalXls(req.auth.db, req.file);
    sendJson(res, 200, preview);
  } catch (error) { next(error); }
});

router.post("/accounting/journals/import-xls", requireAccountingPost, importUpload.single("file"), (req, res, next) => {
  try {
    const parsed = previewJournalXls(req.auth.db, req.file);
    if (parsed.errors.length) throwHttp(422, `Importul are erori: ${parsed.errors.slice(0, 3).join(" ")}`);
    if (parsed.missing_accounts.length) throwHttp(422, `Exista conturi lipsa in plan: ${parsed.missing_accounts.slice(0, 8).join(", ")}.`);
    if (parsed.unbalanced_notes > 0) throwHttp(422, "Importul contine note dezechilibrate.");
    const accounting = engine.ensureAccounting(req.auth.db);
    const imported = [];
    const skipped = [];
    parsed.notes.forEach((note) => {
      if (note.duplicate) {
        skipped.push(note.import_key);
        return;
      }
      const [an, luna] = dateParts(note.data);
      const journal = engine.createJournal(req.auth.db, req.auth.user, {
        an,
        luna,
        data: note.data,
        nr_document: note.nr_document,
        tip_document: note.tip_document || "import_xls",
        explicatie: note.explicatie || "Import note contabile XLS",
        lines: note.lines
      });
      journal.import_source = "external_xls";
      journal.import_key = note.import_key;
      journal.import_filename = req.file.originalname || "";
      journal.updated_at = new Date().toISOString();
      imported.push(journal);
    });
    addAudit(req.auth.db, req.auth.user, "accounting_journals_import_xls", `${imported.length} note / ${parsed.total_lines} linii`);
    writeDb(req.auth.db);
    sendJson(res, 201, {
      ok: true,
      imported_notes: imported.length,
      skipped_duplicates: skipped.length,
      total_lines: parsed.total_lines,
      journals: imported.map((journal) => ({ id: journal.id, uuid: journal.uuid, nr_document: journal.nr_document, total_debit: journal.total_debit, total_credit: journal.total_credit }))
    });
  } catch (error) { next(error); }
});

router.get("/accounting/balance-sheet", requireAccountingReports, (req, res) => {
  const [an, luna] = monthParts(req.query.luna || `${req.query.an || new Date().getFullYear()}-${String(req.query.luna || new Date().getMonth() + 1).padStart(2, "0")}`);
  sendJson(res, 200, engine.buildBalance(req.auth.db, Number(req.query.an || an), Number(req.query.luna || luna), req.query.tip || "sintetica"));
});

router.get("/accounting/balance-sheet/export", requireAccountingReports, (req, res, next) => {
  try {
    const [an, luna] = monthParts(req.query.luna || `${req.query.an || new Date().getFullYear()}-${String(req.query.luna || new Date().getMonth() + 1).padStart(2, "0")}`);
    const tip = req.query.tip || "sintetica";
    const balance = engine.buildBalance(req.auth.db, Number(req.query.an || an), Number(req.query.luna || luna), tip);
    const rows = [
      ["Balanta de verificare", `${String(luna).padStart(2, "0")}/${an}`, tip],
      [],
      ["Cont", "Denumire", "Tip", "Rulaj debit", "Rulaj credit", "Sume totale debit", "Sume totale credit", "Sold debit", "Sold credit"],
      ...balance.rows.map((row) => [
        row.cont,
        row.denumire,
        row.tip,
        row.rulaje_D,
        row.rulaje_C,
        row.sume_totale_D,
        row.sume_totale_C,
        row.sold_D,
        row.sold_C
      ]),
      [],
      ["TOTAL", "", "", balance.totals.rulaje_D || 0, balance.totals.rulaje_C || 0, balance.totals.sume_totale_D || 0, balance.totals.sume_totale_C || 0, balance.totals.sold_D || 0, balance.totals.sold_C || 0]
    ];
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 16 }, { wch: 46 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
    xlsx.utils.book_append_sheet(workbook, sheet, "Balanta");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Balanta_${tip}_${an}_${String(luna).padStart(2, "0")}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.get("/accounting/general-ledger", requireAccountingReports, (req, res) => {
  sendJson(res, 200, buildGeneralLedger(req.auth.db, req.query));
});

router.get("/accounting/general-ledger/export", requireAccountingReports, (req, res, next) => {
  try {
    const data = buildGeneralLedger(req.auth.db, req.query);
    const rows = [
      ["Cartea Mare", `${data.perioada.de_la || "inceput"} - ${data.perioada.pana_la || "sfarsit"}`],
      [],
      ["Cont", "Denumire", "Tip", "Sold initial", "Rulaj debit", "Rulaj credit", "Sold final", "Nr. miscari"],
      ...data.accounts.map((row) => [
        row.simbol,
        row.denumire,
        row.tip,
        row.sold_initial,
        row.total_debit,
        row.total_credit,
        row.sold_final,
        row.movements_count
      ]),
      [],
      ["TOTAL", "", "", data.totals.sold_initial, data.totals.total_debit, data.totals.total_credit, data.totals.sold_final, data.totals.movements_count],
      [],
      ["Miscari detaliate"],
      ["Cont", "Data", "Document", "Tip document", "Explicatie", "Debit", "Credit", "Sold"],
      ...data.accounts.flatMap((account) => account.movements.map((row) => [
        account.simbol,
        row.data,
        row.nr_document,
        row.tip_document,
        row.explicatie,
        row.debit,
        row.credit,
        row.sold
      ]))
    ];
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 16 }, { wch: 42 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    xlsx.utils.book_append_sheet(workbook, sheet, "Cartea Mare");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    const suffix = `${data.perioada.de_la || "start"}_${data.perioada.pana_la || "final"}`.replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Cartea_Mare_${suffix}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.get("/accounting/profit-loss", requireAccountingReports, (req, res) => {
  sendJson(res, 200, buildProfitLoss(req.auth.db, req.query));
});

router.get("/accounting/profit-loss/export", requireAccountingReports, (req, res, next) => {
  try {
    const data = buildProfitLoss(req.auth.db, req.query);
    const rows = [
      ["Cont profit si pierdere", `${String(data.perioada.luna).padStart(2, "0")}/${data.perioada.an}`, data.tip],
      [],
      ["Indicator", "Valoare"],
      ["Venituri", data.totals.venituri],
      ["Cheltuieli", data.totals.cheltuieli],
      ["Rezultat", data.totals.rezultat],
      [],
      ["Venituri pe conturi"],
      ["Cont", "Denumire", "Credit", "Debit", "Valoare"],
      ...data.venituri.map((row) => [row.cont, row.denumire, row.credit, row.debit, row.valoare]),
      [],
      ["Cheltuieli pe conturi"],
      ["Cont", "Denumire", "Debit", "Credit", "Valoare"],
      ...data.cheltuieli.map((row) => [row.cont, row.denumire, row.debit, row.credit, row.valoare])
    ];
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 16 }, { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    xlsx.utils.book_append_sheet(workbook, sheet, "Profit si pierdere");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Profit_si_pierdere_${data.perioada.an}_${String(data.perioada.luna).padStart(2, "0")}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.get("/accounting/ledger/:simbol", requireAccountingReports, (req, res) => {
  sendJson(res, 200, engine.ledger(req.auth.db, req.params.simbol, req.query.de_la || "", req.query.pana_la || ""));
});

router.get("/accounting/ledger/:simbol/export", requireAccountingReports, (req, res, next) => {
  try {
    const ledger = engine.ledger(req.auth.db, req.params.simbol, req.query.de_la || "", req.query.pana_la || "");
    const rows = [
      ["Fisa cont", ledger.simbol, ledger.denumire || "", `${req.query.de_la || "inceput"} - ${req.query.pana_la || "sfarsit"}`],
      [],
      ["Sold initial", ledger.sold_initial || 0],
      ["Total debit", ledger.total_debit || 0],
      ["Total credit", ledger.total_credit || 0],
      ["Sold final", ledger.sold_final || 0],
      [],
      ["Data", "Document", "Tip document", "Explicatie", "Debit", "Credit", "Sold"],
      ...ledger.movements.map((row) => [row.data, row.nr_document, row.tip_document, row.explicatie, row.debit, row.credit, row.sold])
    ];
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    xlsx.utils.book_append_sheet(workbook, sheet, "Fisa cont");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    const safe = String(req.params.simbol || "cont").replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Fisa_cont_${safe}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.get("/accounting/journal-book", requireAccountingReports, (req, res) => {
  const accounting = engine.ensureAccounting(req.auth.db);
  sendJson(res, 200, { rows: filterDocuments(accounting.journals, req.query).filter(engine.isActiveJournal) });
});

router.get("/accounting/suppliers-status", requireAccountingView, (req, res) => {
  sendJson(res, 200, thirdPartyStatus(req.auth.db, "furnizor"));
});

router.get("/accounting/suppliers-status/export", requireAccountingReports, (req, res, next) => {
  try {
    exportThirdPartyStatus(res, req.auth.db, "furnizor");
  } catch (error) { next(error); }
});

router.get("/accounting/suppliers-status/confirmations/export", requireAccountingReports, (req, res, next) => {
  try {
    exportThirdPartyBalanceConfirmationRegister(res, req.auth.db, "furnizor");
  } catch (error) { next(error); }
});

router.get("/accounting/suppliers-status/:id/export", requireAccountingReports, (req, res, next) => {
  try {
    exportThirdPartyDetail(res, req.auth.db, "furnizor", req.params.id);
  } catch (error) { next(error); }
});

router.get("/accounting/suppliers-status/:id/confirmation", requireAccountingReports, (req, res, next) => {
  try {
    exportThirdPartyBalanceConfirmation(res, req.auth.db, "furnizor", req.params.id);
  } catch (error) { next(error); }
});

router.get("/accounting/suppliers-status/:id/confirmation/print", requireAccountingReports, (req, res, next) => {
  try {
    sendThirdPartyBalanceConfirmationHtml(res, req.auth.db, "furnizor", req.params.id);
  } catch (error) { next(error); }
});

router.post("/accounting/suppliers-status/:id/confirmation/sent", requireAccountingPost, (req, res, next) => {
  try {
    const confirmation = markThirdPartyBalanceConfirmation(req.auth.db, req.auth.user, "furnizor", req.params.id, "trimisa", req.body || {});
    addAudit(req.auth.db, req.auth.user, "accounting_balance_confirmation_sent", confirmation.tert_denumire || confirmation.tert_id);
    writeDb(req.auth.db);
    sendJson(res, 200, { confirmation, detail: thirdPartyDetail(req.auth.db, "furnizor", req.params.id) });
  } catch (error) { next(error); }
});

router.post("/accounting/suppliers-status/:id/confirmation/received", requireAccountingPost, (req, res, next) => {
  try {
    const confirmation = markThirdPartyBalanceConfirmation(req.auth.db, req.auth.user, "furnizor", req.params.id, "confirmata", req.body || {});
    addAudit(req.auth.db, req.auth.user, "accounting_balance_confirmation_received", confirmation.tert_denumire || confirmation.tert_id);
    writeDb(req.auth.db);
    sendJson(res, 200, { confirmation, detail: thirdPartyDetail(req.auth.db, "furnizor", req.params.id) });
  } catch (error) { next(error); }
});

router.post("/accounting/suppliers-status/:id/confirmation/cancel", requireAccountingPost, (req, res, next) => {
  try {
    const confirmation = cancelThirdPartyBalanceConfirmation(req.auth.db, req.auth.user, "furnizor", req.params.id, req.body || {});
    addAudit(req.auth.db, req.auth.user, "accounting_balance_confirmation_cancelled", confirmation.tert_denumire || confirmation.tert_id);
    writeDb(req.auth.db);
    sendJson(res, 200, { confirmation, detail: thirdPartyDetail(req.auth.db, "furnizor", req.params.id) });
  } catch (error) { next(error); }
});

router.get("/accounting/suppliers-status/:id", requireAccountingView, (req, res) => {
  sendJson(res, 200, thirdPartyDetail(req.auth.db, "furnizor", req.params.id));
});

router.get("/accounting/clients-status", requireAccountingView, (req, res) => {
  sendJson(res, 200, thirdPartyStatus(req.auth.db, "client"));
});

router.get("/accounting/clients-status/export", requireAccountingReports, (req, res, next) => {
  try {
    exportThirdPartyStatus(res, req.auth.db, "client");
  } catch (error) { next(error); }
});

router.get("/accounting/clients-status/confirmations/export", requireAccountingReports, (req, res, next) => {
  try {
    exportThirdPartyBalanceConfirmationRegister(res, req.auth.db, "client");
  } catch (error) { next(error); }
});

router.get("/accounting/clients-status/:id/export", requireAccountingReports, (req, res, next) => {
  try {
    exportThirdPartyDetail(res, req.auth.db, "client", req.params.id);
  } catch (error) { next(error); }
});

router.get("/accounting/clients-status/:id/confirmation", requireAccountingReports, (req, res, next) => {
  try {
    exportThirdPartyBalanceConfirmation(res, req.auth.db, "client", req.params.id);
  } catch (error) { next(error); }
});

router.get("/accounting/clients-status/:id/confirmation/print", requireAccountingReports, (req, res, next) => {
  try {
    sendThirdPartyBalanceConfirmationHtml(res, req.auth.db, "client", req.params.id);
  } catch (error) { next(error); }
});

router.post("/accounting/clients-status/:id/confirmation/sent", requireAccountingPost, (req, res, next) => {
  try {
    const confirmation = markThirdPartyBalanceConfirmation(req.auth.db, req.auth.user, "client", req.params.id, "trimisa", req.body || {});
    addAudit(req.auth.db, req.auth.user, "accounting_balance_confirmation_sent", confirmation.tert_denumire || confirmation.tert_id);
    writeDb(req.auth.db);
    sendJson(res, 200, { confirmation, detail: thirdPartyDetail(req.auth.db, "client", req.params.id) });
  } catch (error) { next(error); }
});

router.post("/accounting/clients-status/:id/confirmation/received", requireAccountingPost, (req, res, next) => {
  try {
    const confirmation = markThirdPartyBalanceConfirmation(req.auth.db, req.auth.user, "client", req.params.id, "confirmata", req.body || {});
    addAudit(req.auth.db, req.auth.user, "accounting_balance_confirmation_received", confirmation.tert_denumire || confirmation.tert_id);
    writeDb(req.auth.db);
    sendJson(res, 200, { confirmation, detail: thirdPartyDetail(req.auth.db, "client", req.params.id) });
  } catch (error) { next(error); }
});

router.post("/accounting/clients-status/:id/confirmation/cancel", requireAccountingPost, (req, res, next) => {
  try {
    const confirmation = cancelThirdPartyBalanceConfirmation(req.auth.db, req.auth.user, "client", req.params.id, req.body || {});
    addAudit(req.auth.db, req.auth.user, "accounting_balance_confirmation_cancelled", confirmation.tert_denumire || confirmation.tert_id);
    writeDb(req.auth.db);
    sendJson(res, 200, { confirmation, detail: thirdPartyDetail(req.auth.db, "client", req.params.id) });
  } catch (error) { next(error); }
});

router.get("/accounting/clients-status/:id", requireAccountingView, (req, res) => {
  sendJson(res, 200, thirdPartyDetail(req.auth.db, "client", req.params.id));
});

router.get("/accounting/vat-journal", requireAccountingReports, (req, res) => {
  const data = buildVatData(req.auth.db, req.query);
  sendJson(res, 200, {
    jurnal_cumparari: data.jurnal_cumparari,
    jurnal_vanzari: data.jurnal_vanzari,
    total_4426: data.total_4426,
    total_4427: data.total_4427,
    diferenta: data.diferenta,
    perioada: data.perioada,
    cote: data.cote,
    sumar_d300: data.sumar_d300,
    period_status: data.period_status
  });
});

router.get("/accounting/classic-journals", requireAccountingReports, (req, res) => {
  sendJson(res, 200, buildClassicJournalsData(req.auth.db, req.query));
});

router.get("/accounting/classic-journals/export", requireAccountingReports, (req, res, next) => {
  try {
    const data = buildClassicJournalsData(req.auth.db, req.query);
    const workbook = xlsx.utils.book_new();
    appendClassicJournalSheet(workbook, "Jurnal cumparari", [
      ["Data", "Document", "Furnizor", "CUI", "Baza", "TVA", "Total", "Cota TVA", "Status"],
      ...data.jurnal_cumparari.rows.map((row) => [
        row.data || "",
        row.nr_document || row.numar || row.id || "",
        row.tert || "",
        row.cui || "",
        row.valoare || 0,
        row.tva || 0,
        row.total || 0,
        `${row.tva_procent || 0}%`,
        row.status || ""
      ])
    ], data.perioada, data.jurnal_cumparari.totals);
    appendClassicJournalSheet(workbook, "Jurnal vanzari", [
      ["Data", "Document", "Client", "CUI", "Baza", "TVA", "Total", "Cota TVA", "Status"],
      ...data.jurnal_vanzari.rows.map((row) => [
        row.data || "",
        row.nr_document || row.numar || row.id || "",
        row.tert || "",
        row.cui || "",
        row.valoare || 0,
        row.tva || 0,
        row.total || 0,
        `${row.tva_procent || 0}%`,
        row.status || ""
      ])
    ], data.perioada, data.jurnal_vanzari.totals);
    appendClassicJournalSheet(workbook, "Registru casa", treasuryExportRows(data.registru_casa.rows), data.perioada, data.registru_casa.totals);
    appendClassicJournalSheet(workbook, "Jurnal banca", treasuryExportRows(data.jurnal_banca.rows), data.perioada, data.jurnal_banca.totals);
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Jurnale_contabile_${data.perioada.an}_${String(data.perioada.luna).padStart(2, "0")}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.get("/accounting/vat-journal/export", requireAccountingReports, (req, res, next) => {
  try {
    const data = buildVatData(req.auth.db, req.query);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([
      ["Jurnal TVA cumparari", `${String(data.perioada.luna).padStart(2, "0")}/${data.perioada.an}`],
      [],
      ["Data", "Document", "Furnizor", "CUI", "Baza", "TVA", "Total", "Cota TVA", "Status"],
      ...data.jurnal_cumparari.map((row) => [
        row.data,
        row.nr_document || row.numar || row.id,
        row.tert || "",
        row.cui || "",
        row.valoare || 0,
        row.tva || 0,
        row.total || 0,
        `${row.tva_procent || 0}%`,
        row.status || ""
      ])
    ]), "Jurnal cumparari");
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([
      ["Jurnal TVA vanzari", `${String(data.perioada.luna).padStart(2, "0")}/${data.perioada.an}`],
      [],
      ["Data", "Document", "Client", "CUI", "Baza", "TVA", "Total", "Cota TVA", "Status"],
      ...data.jurnal_vanzari.map((row) => [
        row.data,
        row.nr_document || row.numar || row.id,
        row.tert || "",
        row.cui || "",
        row.valoare || 0,
        row.tva || 0,
        row.total || 0,
        `${row.tva_procent || 0}%`,
        row.status || ""
      ])
    ]), "Jurnal vanzari");
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([
      ["Pregatire D300", `${String(data.perioada.luna).padStart(2, "0")}/${data.perioada.an}`, "document intern de lucru"],
      [],
      ["Cod", "Descriere", "Baza", "TVA"],
      ...data.sumar_d300.randuri.map((row) => [row.cod, row.descriere, row.baza, row.tva]),
      [],
      ["TVA colectata", data.sumar_d300.total_tva_colectata],
      ["TVA deductibila", data.sumar_d300.total_tva_deductibila],
      ["TVA de plata", data.sumar_d300.tva_de_plata],
      ["TVA de recuperat", data.sumar_d300.tva_de_recuperat]
    ]), "Pregatire D300");
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Jurnal_TVA_${data.perioada.an}_${String(data.perioada.luna).padStart(2, "0")}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

router.get("/accounting/d300", requireAccountingReports, (req, res) => {
  const data = buildVatData(req.auth.db, req.query);
  sendJson(res, 200, {
    perioada: data.perioada,
    decont: data.sumar_d300,
    period_status: data.period_status,
    status: {
      can_prepare: true,
      warnings: [
        "Pregatirea D300 este calculata din facturile contabile validate/draft neanulate.",
        "XML-ul generat este document intern de lucru, nu declaratie ANAF finala."
      ]
    }
  });
});

router.get("/accounting/d300/export-xml", requireAccountingReports, (req, res) => {
  const data = buildVatData(req.auth.db, req.query);
  const rows = data.sumar_d300.randuri.map((row) =>
    `    <rand cod="${xmlEscape(row.cod)}"><descriere>${xmlEscape(row.descriere)}</descriere><baza>${row.baza}</baza><tva>${row.tva}</tva></rand>`
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<infraflow_d300_lucru versiune="1">\n  <perioada an="${data.perioada.an}" luna="${String(data.perioada.luna).padStart(2, "0")}" />\n  <atentie>Document intern de lucru pentru verificare TVA. Nu este declaratie ANAF finala.</atentie>\n  <randuri>\n${rows}\n  </randuri>\n  <totaluri>\n    <tva_colectata>${data.sumar_d300.total_tva_colectata}</tva_colectata>\n    <tva_deductibila>${data.sumar_d300.total_tva_deductibila}</tva_deductibila>\n    <tva_de_plata>${data.sumar_d300.tva_de_plata}</tva_de_plata>\n    <tva_de_recuperat>${data.sumar_d300.tva_de_recuperat}</tva_de_recuperat>\n  </totaluri>\n</infraflow_d300_lucru>\n`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="D300_lucru_${data.perioada.an}_${String(data.perioada.luna).padStart(2, "0")}.xml"`);
  res.end(xml);
});

router.get("/accounting/periods/:an/:luna/check", requireAccountingReports, (req, res) => {
  const an = Number(req.params.an);
  const luna = Number(req.params.luna);
  sendJson(res, 200, periodCheck(req.auth.db, an, luna));
});

router.post("/accounting/periods/:an/:luna/close", requireAccountingClose, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const an = Number(req.params.an);
    const luna = Number(req.params.luna);
    const check = periodCheck(req.auth.db, an, luna);
    if (check.checks.draft_count) throwHttp(409, `Exista ${check.checks.draft_count} documente draft in luna.`);
    if (check.checks.unbalanced_journals) throwHttp(409, `Exista ${check.checks.unbalanced_journals} note contabile dezechilibrate.`);
    if (!check.checks.balance_ok) throwHttp(409, "Balanta lunii nu este echilibrata.");
    if (!check.checks.tva_checked) throwHttp(409, "TVA-ul lunii trebuie verificat inainte de inchidere.");
    engine.checkPeriodOpen(req.auth.db, an, luna);
    const period = accounting.periods.find((item) => Number(item.an) === an && Number(item.luna) === luna);
    period.status = "inchisa";
    period.inchisa_de = req.auth.user.id;
    period.inchisa_la = new Date().toISOString();
    addAudit(req.auth.db, req.auth.user, "accounting_period_close", `${luna}/${an}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { period });
  } catch (error) { next(error); }
});

router.post("/accounting/periods/:an/:luna/mark-vat-checked", requireAccountingClose, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const an = Number(req.params.an);
    const luna = Number(req.params.luna);
    let period = accounting.periods.find((item) => Number(item.an) === an && Number(item.luna) === luna);
    if (!period) {
      period = {
        id: engine.nextNumericId(accounting.periods),
        an,
        luna,
        status: "deschisa",
        created_at: new Date().toISOString()
      };
      accounting.periods.push(period);
    }
    if (["inchisa", "depusa"].includes(period.status)) throwHttp(409, "TVA-ul nu poate fi remarcat dupa inchiderea/depunerea lunii.");
    const data = buildVatData(req.auth.db, { an, luna });
    period.tva_verificat_de = req.auth.user.id;
    period.tva_verificat_de_name = req.auth.user.name || "";
    period.tva_verificat_la = new Date().toISOString();
    period.tva_verificat_total_4426 = data.total_4426;
    period.tva_verificat_total_4427 = data.total_4427;
    period.tva_verificat_diferenta = data.diferenta;
    period.updated_at = new Date().toISOString();
    addAudit(req.auth.db, req.auth.user, "accounting_period_vat_checked", `${luna}/${an}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { period, sumar_d300: data.sumar_d300 });
  } catch (error) { next(error); }
});

router.post("/accounting/periods/:an/:luna/reopen", requireAccountingClose, (req, res, next) => {
  try {
    if (!userHasRole(req.auth.user, "superadmin") && !userHasRole(req.auth.user, "admin")) throwHttp(403, "Doar administratorul poate redeschide luna.");
    const accounting = engine.ensureAccounting(req.auth.db);
    const period = accounting.periods.find((item) => Number(item.an) === Number(req.params.an) && Number(item.luna) === Number(req.params.luna));
    if (!period) throwHttp(404, "Perioada nu a fost gasita.");
    if (period.status === "depusa" && !userHasRole(req.auth.user, "superadmin")) throwHttp(409, "Perioada are declaratii depuse. Redeschiderea este permisa doar superadmin.");
    period.status = "deschisa";
    period.redeschisa_de = req.auth.user.id;
    period.redeschisa_la = new Date().toISOString();
    addAudit(req.auth.db, req.auth.user, "accounting_period_reopen", `${req.params.luna}/${req.params.an}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { period });
  } catch (error) { next(error); }
});

router.post("/accounting/periods/:an/:luna/mark-submitted", requireAccountingClose, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const an = Number(req.params.an);
    const luna = Number(req.params.luna);
    let period = accounting.periods.find((item) => Number(item.an) === an && Number(item.luna) === luna);
    if (!period) {
      period = {
        id: engine.nextNumericId(accounting.periods),
        an,
        luna,
        status: "deschisa",
        created_at: new Date().toISOString()
      };
      accounting.periods.push(period);
    }
    if (period.status === "depusa") throwHttp(409, "Perioada are deja declaratii depuse.");
    if (period.status !== "inchisa") throwHttp(409, "Luna trebuie inchisa inainte de marcarea declaratiilor depuse.");
    period.status = "depusa";
    period.depusa_de = req.auth.user.id;
    period.depusa_la = new Date().toISOString();
    period.depunere_ref = String(req.body?.depunere_ref || "").trim();
    addAudit(req.auth.db, req.auth.user, "accounting_period_submitted", `${luna}/${an}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { period });
  } catch (error) { next(error); }
});

router.get("/accounting/alerts", requireAccountingView, (req, res) => {
  const alerts = engine.ensureAccounting(req.auth.db).lawAlerts.filter((item) => !req.query.status || item.status === req.query.status);
  sendJson(res, 200, { alerts });
});

router.post("/accounting/alerts", requireAccountingManage, (req, res, next) => {
  try {
    const accounting = engine.ensureAccounting(req.auth.db);
    const alert = {
      id: engine.nextNumericId(accounting.lawAlerts),
      titlu: String(req.body?.titlu || "").trim(),
      descriere: String(req.body?.descriere || "").trim(),
      sursa_url: String(req.body?.sursa_url || "").trim(),
      data_publicare: req.body?.data_publicare || today(),
      tip: String(req.body?.tip || "altul").trim(),
      afecteaza_modul: String(req.body?.afecteaza_modul || "contabilitate").trim(),
      status: "nou",
      created_at: new Date().toISOString()
    };
    if (!alert.titlu) throwHttp(400, "Titlul alertei este obligatoriu.");
    accounting.lawAlerts.push(alert);
    addAudit(req.auth.db, req.auth.user, "accounting_alert_create", alert.titlu);
    writeDb(req.auth.db);
    sendJson(res, 201, { alert });
  } catch (error) { next(error); }
});

router.patch("/accounting/alerts/:id/read", requireAccountingView, markAlert("citit"));
router.patch("/accounting/alerts/:id/done", requireAccountingManage, markAlert("implementat"));

function requireAccountingView(req, res, next) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  if (!requireAnyPermission(auth, res, ["accounting:view", "accounting:reports", "settings:manage"])) return;
  next();
}

function requireAccountingManage(req, res, next) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  if (!requireAnyPermission(auth, res, ["accounting:manage", "settings:manage"])) return;
  next();
}

function requireAccountingPost(req, res, next) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  if (!requireAnyPermission(auth, res, ["accounting:post", "accounting:manage", "settings:manage"])) return;
  next();
}

function requireAccountingReports(req, res, next) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  if (!requireAnyPermission(auth, res, ["accounting:reports", "accounting:view", "settings:manage"])) return;
  next();
}

function requireAccountingClose(req, res, next) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  if (!requirePermission(auth, res, "accounting:close")) return;
  next();
}

function createInvoiceIn(db, user, body) {
  const accounting = engine.ensureAccounting(db);
  const invoice = normalizeInvoiceIn(db, body);
  invoice.id = engine.nextNumericId(accounting.invoicesIn);
  invoice.uuid = cryptoId();
  invoice.nr_intern = invoice.id;
  invoice.status = "draft";
  invoice.created_by = user?.id || "";
  invoice.created_at = new Date().toISOString();
  engine.checkPeriodOpen(db, invoice.an, invoice.luna);
  accounting.invoicesIn.push(invoice);
  return invoice;
}

function devalidateInvoice(db, user, invoice, auditAction, reason = "") {
  if (invoice.status !== "validat") throwHttp(409, "Doar facturile validate se pot devalida.");
  if (!invoice.journal_id) throwHttp(409, "Factura nu are nota contabila atasata.");
  if (!String(reason || "").trim()) throwHttp(400, "Motivul devalidarii este obligatoriu.");
  engine.checkPeriodOpen(db, invoice.an, invoice.luna);
  const journal = engine.devalidateJournal(db, user, invoice.journal_id, reason);
  invoice.status = "draft";
  invoice.journal_id = null;
  invoice.devalidat_de = user?.id || "";
  invoice.devalidat_la = new Date().toISOString();
  invoice.devalidare_motiv = String(reason || "").trim();
  invoice.last_devalidated_journal_id = journal.id;
  invoice.updated_at = new Date().toISOString();
  addAudit(db, user, auditAction, `${invoice.nr_document || invoice.numar || invoice.id} / nota ${journal.id}`);
  return invoice;
}

async function registerInvoiceInCostEntry(db, user, invoice) {
  if (!invoice.cost_center_id) return;
  const tert = thirdParty(db, invoice.furnizor_id);
  await insertCostEntry({
    cost_center_id: invoice.cost_center_id,
    subcentru_id: invoice.subcentru_id || null,
    santier_id: invoice.santier_id || null,
    data: invoice.data,
    categorie: controllingCategory(invoice.cont_cheltuiala || invoice.lines?.[0]?.cont),
    valoare: invoice.valoare,
    sursa: "factura_furnizor",
    sursa_ref_id: String(invoice.id),
    descriere: invoice.explicatie || `Factura ${invoice.nr_document}`,
    nr_document: invoice.nr_document,
    furnizor: tert.denumire || "",
    inregistrat_de: user?.id || ""
  }, db);
  invoice.controlling_registered = true;
  invoice.controlling_registered_at = new Date().toISOString();
}

async function reverseInvoiceInCostEntry(db, user, invoice, reason = "") {
  if (!invoice.cost_center_id || !invoice.controlling_registered) return;
  const tert = thirdParty(db, invoice.furnizor_id);
  await insertCostEntry({
    cost_center_id: invoice.cost_center_id,
    subcentru_id: invoice.subcentru_id || null,
    santier_id: invoice.santier_id || null,
    data: today(),
    categorie: controllingCategory(invoice.cont_cheltuiala || invoice.lines?.[0]?.cont),
    valoare: -Math.abs(round(invoice.valoare || 0)),
    sursa: "factura_furnizor",
    sursa_ref_id: `revers-${invoice.id}-${Date.now()}`,
    descriere: `Revers devalidare factura ${invoice.nr_document}${reason ? `: ${reason}` : ""}`,
    nr_document: invoice.nr_document,
    furnizor: tert.denumire || "",
    inregistrat_de: user?.id || ""
  }, db);
  invoice.controlling_reversed_at = new Date().toISOString();
}

function controllingCategory(account) {
  const cont = String(account || "");
  if (/^6022/.test(cont)) return "combustibil";
  if (/^602/.test(cont)) return "materiale";
  if (/^611/.test(cont)) return "reparatii";
  if (/^612/.test(cont)) return "chirii";
  if (/^613/.test(cont)) return "asigurari";
  if (/^635/.test(cont)) return "taxe_impozite";
  if (/^641/.test(cont)) return "manopera";
  if (/^6811/.test(cont)) return "amortizare";
  return "alte_cheltuieli";
}

function cancelDraftInvoice(db, user, invoice, reason = "") {
  return cancelDraftDocument(db, user, invoice, reason);
}

function cancelDraftDocument(db, user, document, reason = "") {
  if (document.status !== "draft") throwHttp(409, "Doar documentele draft se pot anula direct. Pentru documente validate foloseste devalidare sau storno.");
  engine.checkPeriodOpen(db, document.an, document.luna);
  document.status = "anulat";
  document.anulat_de = user?.id || "";
  document.anulat_la = new Date().toISOString();
  document.anulare_motiv = String(reason || "").trim();
  document.updated_at = new Date().toISOString();
  return document;
}

function createInvoiceOut(db, user, body) {
  const accounting = engine.ensureAccounting(db);
  const invoice = normalizeInvoiceOut(db, body);
  invoice.id = engine.nextNumericId(accounting.invoicesOut);
  invoice.uuid = cryptoId();
  invoice.status = "draft";
  invoice.created_by = user?.id || "";
  invoice.created_at = new Date().toISOString();
  engine.checkPeriodOpen(db, invoice.an, invoice.luna);
  accounting.invoicesOut.push(invoice);
  return invoice;
}

function createTreasury(db, user, body) {
  const accounting = engine.ensureAccounting(db);
  const treasury = normalizeTreasury(body || {}, {
    id: engine.nextNumericId(accounting.treasury),
    uuid: cryptoId(),
    journal_id: null,
    status: "draft",
    created_by: user?.id || "",
    created_at: new Date().toISOString()
  });
  prepareTreasuryInvoiceLink(db, treasury);
  engine.checkPeriodOpen(db, treasury.an, treasury.luna);
  accounting.treasury.push(treasury);
  return treasury;
}

function normalizeTreasury(body, existing = {}) {
  const data = body.data || existing.data || today();
  const [an, luna] = dateParts(data);
  const tip = ["banca", "casa", "decont"].includes(body.tip) ? body.tip : existing.tip || "banca";
  const treasury = {
    ...existing,
    an: Number(body.an || an),
    luna: Number(body.luna || luna),
    tip,
    cont_trezorerie: String(body.cont_trezorerie ?? body.cont_banca ?? existing.cont_trezorerie ?? (tip === "casa" ? "5311" : "5121")).trim(),
    data,
    nr_document: String(body.nr_document ?? existing.nr_document ?? "").trim(),
    tip_operatie: body.tip_operatie === "incasare" || (!body.tip_operatie && existing.tip_operatie === "incasare") ? "incasare" : "plata",
    suma: round(body.suma ?? existing.suma),
    cont_corespondent: String(body.cont_corespondent ?? existing.cont_corespondent ?? "").trim(),
    tert_id: body.tert_id === "" ? null : body.tert_id ?? existing.tert_id ?? null,
    invoice_in_id: body.invoice_in_id === "" ? null : body.invoice_in_id ?? existing.invoice_in_id ?? null,
    invoice_out_id: body.invoice_out_id === "" ? null : body.invoice_out_id ?? existing.invoice_out_id ?? null,
    explicatie: String(body.explicatie ?? existing.explicatie ?? "").trim(),
    updated_at: new Date().toISOString()
  };
  if (treasury.suma <= 0) throwHttp(400, "Suma trebuie sa fie pozitiva.");
  return treasury;
}

function findLinkedTreasuryInvoice(db, treasury) {
  const accounting = engine.ensureAccounting(db);
  const hasIn = treasury.invoice_in_id !== null && treasury.invoice_in_id !== undefined && treasury.invoice_in_id !== "";
  const hasOut = treasury.invoice_out_id !== null && treasury.invoice_out_id !== undefined && treasury.invoice_out_id !== "";
  if (hasIn && hasOut) throwHttp(422, "Alege o singura factura pentru operatia de trezorerie.");
  if (hasIn) {
    const invoice = accounting.invoicesIn.find((item) => String(item.id) === String(treasury.invoice_in_id));
    if (!invoice) throwHttp(404, "Factura de intrare legata nu a fost gasita.");
    return { tip: "intrare", invoice };
  }
  if (hasOut) {
    const invoice = accounting.invoicesOut.find((item) => String(item.id) === String(treasury.invoice_out_id));
    if (!invoice) throwHttp(404, "Factura de iesire legata nu a fost gasita.");
    return { tip: "iesire", invoice };
  }
  return null;
}

function prepareTreasuryInvoiceLink(db, treasury) {
  const link = findLinkedTreasuryInvoice(db, treasury);
  if (!link) return null;
  if (link.tip === "intrare") {
    if (treasury.tip_operatie !== "plata") throwHttp(422, "O factura de intrare se stinge prin plata, nu prin incasare.");
    const tert = thirdParty(db, link.invoice.furnizor_id);
    treasury.tert_id = link.invoice.furnizor_id;
    treasury.cont_corespondent = treasury.cont_corespondent || tert.cont_analitic_furnizor || "401";
    treasury.nr_document = treasury.nr_document || link.invoice.nr_document || "";
    treasury.explicatie = treasury.explicatie || `Plata factura ${link.invoice.nr_document || link.invoice.id}`;
  } else {
    if (treasury.tip_operatie !== "incasare") throwHttp(422, "O factura de iesire se stinge prin incasare, nu prin plata.");
    const tert = thirdParty(db, link.invoice.client_id);
    treasury.tert_id = link.invoice.client_id;
    treasury.cont_corespondent = treasury.cont_corespondent || tert.cont_analitic_client || "4111";
    treasury.nr_document = treasury.nr_document || link.invoice.numar || link.invoice.nr_document || "";
    treasury.explicatie = treasury.explicatie || `Incasare factura ${link.invoice.numar || link.invoice.nr_document || link.invoice.id}`;
  }
  treasury.updated_at = new Date().toISOString();
  return link;
}

function treasuryInvoiceRemaining(link) {
  if (!link) return 0;
  if (link.tip === "intrare") return round(link.invoice.neachitat ?? Number(link.invoice.total || 0) - Number(link.invoice.achitat || 0));
  return round(link.invoice.neincasat ?? Number(link.invoice.total || 0) - Number(link.invoice.incasat || 0));
}

function assertTreasuryInvoiceCanApply(db, treasury) {
  const link = findLinkedTreasuryInvoice(db, treasury);
  if (!link) return;
  if (!["validat", "partial"].includes(String(link.invoice.status || ""))) {
    throwHttp(409, "Factura legata trebuie sa fie validata sau partial stinsa.");
  }
  const remaining = treasuryInvoiceRemaining(link);
  if (remaining <= 0) throwHttp(409, "Factura legata este deja stinsa.");
  if (Number(treasury.suma || 0) > remaining + 0.01) {
    throwHttp(422, `Suma operatiei depaseste restul facturii: ${remaining.toFixed(2)}.`);
  }
}

function applyTreasuryInvoiceEffect(db, treasury) {
  const link = findLinkedTreasuryInvoice(db, treasury);
  if (!link) return;
  if (link.tip === "intrare") {
    link.invoice.achitat = round(Number(link.invoice.achitat || 0) + Number(treasury.suma || 0));
    link.invoice.neachitat = round(Number(link.invoice.total || 0) - Number(link.invoice.achitat || 0));
    link.invoice.status = link.invoice.neachitat <= 0 ? "achitat" : "partial";
  } else {
    link.invoice.incasat = round(Number(link.invoice.incasat || 0) + Number(treasury.suma || 0));
    link.invoice.neincasat = round(Number(link.invoice.total || 0) - Number(link.invoice.incasat || 0));
    link.invoice.status = link.invoice.neincasat <= 0 ? "incasat" : "partial";
  }
  link.invoice.updated_at = new Date().toISOString();
}

function devalidateTreasury(db, user, treasury, reason = "") {
  if (treasury.status !== "validat") throwHttp(409, "Doar operatiile validate se pot devalida.");
  if (!treasury.journal_id) throwHttp(409, "Operatia nu are nota contabila atasata.");
  engine.checkPeriodOpen(db, treasury.an, treasury.luna);
  const journal = engine.devalidateJournal(db, user, treasury.journal_id, reason);
  treasury.status = "draft";
  treasury.journal_id = null;
  treasury.devalidat_de = user?.id || "";
  treasury.devalidat_la = new Date().toISOString();
  treasury.devalidare_motiv = String(reason || "").trim();
  treasury.last_devalidated_journal_id = journal.id;
  treasury.updated_at = new Date().toISOString();
  reverseTreasuryInvoiceEffect(db, treasury);
  addAudit(db, user, "accounting_treasury_devalidate", `${treasury.tip_operatie} ${treasury.suma} / nota ${journal.id}`);
  return treasury;
}

function reverseTreasuryInvoiceEffect(db, treasury) {
  const accounting = engine.ensureAccounting(db);
  if (treasury.invoice_in_id) {
    const invoice = accounting.invoicesIn.find((item) => String(item.id) === String(treasury.invoice_in_id));
    if (invoice) {
      invoice.achitat = round(Math.max(0, Number(invoice.achitat || 0) - Number(treasury.suma || 0)));
      invoice.neachitat = round(Number(invoice.total || 0) - Number(invoice.achitat || 0));
      invoice.status = invoice.neachitat <= 0 ? "achitat" : "partial";
      if (invoice.achitat <= 0) invoice.status = "validat";
      invoice.updated_at = new Date().toISOString();
    }
  }
  if (treasury.invoice_out_id) {
    const invoice = accounting.invoicesOut.find((item) => String(item.id) === String(treasury.invoice_out_id));
    if (invoice) {
      invoice.incasat = round(Math.max(0, Number(invoice.incasat || 0) - Number(treasury.suma || 0)));
      invoice.neincasat = round(Number(invoice.total || 0) - Number(invoice.incasat || 0));
      invoice.status = invoice.neincasat <= 0 ? "incasat" : "partial";
      if (invoice.incasat <= 0) invoice.status = "validat";
      invoice.updated_at = new Date().toISOString();
    }
  }
}

function decorateTreasury(row, accounting) {
  const journal = row.journal_id
    ? accounting.journals.find((item) => Number(item.id) === Number(row.journal_id))
    : null;
  const invoiceIn = row.invoice_in_id
    ? accounting.invoicesIn.find((item) => String(item.id) === String(row.invoice_in_id))
    : null;
  const invoiceOut = row.invoice_out_id
    ? accounting.invoicesOut.find((item) => String(item.id) === String(row.invoice_out_id))
    : null;
  const month = row.data ? String(row.data).slice(0, 7) : `${row.an}-${String(row.luna).padStart(2, "0")}`;
  return {
    ...row,
    linked_invoice: invoiceIn ? {
      tip: "intrare",
      id: invoiceIn.id,
      uuid: invoiceIn.uuid,
      document: invoiceIn.nr_document || "",
      total: invoiceIn.total || 0,
      rest: round(invoiceIn.neachitat ?? Number(invoiceIn.total || 0) - Number(invoiceIn.achitat || 0))
    } : invoiceOut ? {
      tip: "iesire",
      id: invoiceOut.id,
      uuid: invoiceOut.uuid,
      document: invoiceOut.numar || invoiceOut.nr_document || "",
      total: invoiceOut.total || 0,
      rest: round(invoiceOut.neincasat ?? Number(invoiceOut.total || 0) - Number(invoiceOut.incasat || 0))
    } : null,
    journal_uuid: journal?.uuid || "",
    journal_status: journal?.status || "",
    journal_total_debit: journal?.total_debit || 0,
    journal_total_credit: journal?.total_credit || 0,
    balance_month: month
  };
}

function decorateInvoice(row, accounting) {
  const journal = row.journal_id
    ? accounting.journals.find((item) => Number(item.id) === Number(row.journal_id))
    : null;
  const month = row.data ? String(row.data).slice(0, 7) : `${row.an}-${String(row.luna).padStart(2, "0")}`;
  return {
    ...row,
    journal_uuid: journal?.uuid || "",
    journal_status: journal?.status || "",
    journal_total_debit: journal?.total_debit || 0,
    journal_total_credit: journal?.total_credit || 0,
    balance_month: month
  };
}

function previewJournalXls(db, file) {
  if (!file?.buffer) throwHttp(400, "Fisierul XLS este obligatoriu.");
  const name = String(file.originalname || "").toLowerCase();
  if (!name.endsWith(".xls") && !name.endsWith(".xlsx")) throwHttp(400, "Sunt acceptate fisiere .xls sau .xlsx.");
  const workbook = xlsx.read(file.buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throwHttp(400, "Fisierul nu contine foi de calcul.");
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const accounting = engine.ensureAccounting(db);
  const accounts = new Set(accounting.chart.map((account) => String(account.simbol)));
  const existingKeys = new Set(accounting.journals.filter((journal) => journal.import_source === "external_xls" && journal.import_key).map((journal) => String(journal.import_key)));
  const groups = new Map();
  const errors = [];
  const missingAccounts = new Set();

  rows.forEach((row, index) => {
    const normalized = normalizeImportRow(row);
    if (!normalized.cont_d && !normalized.cont_c && !normalized.suma) return;
    if (!normalized.data || !normalized.cont_d || !normalized.cont_c || normalized.suma <= 0) {
      errors.push(`Rand ${index + 2}: data, cont debit, cont credit si suma sunt obligatorii.`);
      return;
    }
    if (!accounts.has(normalized.cont_d)) missingAccounts.add(normalized.cont_d);
    if (!accounts.has(normalized.cont_c)) missingAccounts.add(normalized.cont_c);
    const key = normalized.id_nota || `${normalized.data}|${normalized.ndp}|${normalized.explicatie}`.slice(0, 120);
    const group = groups.get(key) || {
      import_key: key,
      data: normalized.data,
      nr_document: normalized.ndp,
      tip_document: normalized.fel_d || "import_xls",
      explicatie: normalized.explicatie,
      lines: [],
      total_debit: 0,
      total_credit: 0
    };
    group.lines.push({ cont: normalized.cont_d, debit: normalized.suma, explicatie: normalized.explicatie });
    group.lines.push({ cont: normalized.cont_c, credit: normalized.suma, explicatie: normalized.explicatie });
    group.total_debit = round(group.total_debit + normalized.suma);
    group.total_credit = round(group.total_credit + normalized.suma);
    groups.set(key, group);
  });

  const notes = Array.from(groups.values()).map((note) => ({
    ...note,
    balanced: Math.abs(note.total_debit - note.total_credit) <= 0.01,
    duplicate: existingKeys.has(String(note.import_key)),
    lines_count: note.lines.length
  }));
  const totalDebit = round(notes.reduce((sumValue, note) => sumValue + note.total_debit, 0));
  const totalCredit = round(notes.reduce((sumValue, note) => sumValue + note.total_credit, 0));
  return {
    filename: file.originalname || "",
    total_rows: rows.length,
    total_notes: notes.length,
    total_lines: notes.reduce((sumValue, note) => sumValue + note.lines.length, 0),
    total_debit: totalDebit,
    total_credit: totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) <= 0.01,
    unbalanced_notes: notes.filter((note) => !note.balanced).length,
    duplicate_notes: notes.filter((note) => note.duplicate).length,
    missing_accounts: Array.from(missingAccounts).sort((a, b) => a.localeCompare(b, "ro", { numeric: true })),
    errors,
    notes: notes.slice(0, 100)
  };
}

function normalizeImportRow(row) {
  const get = (...names) => {
    for (const name of names) {
      if (row[name] !== undefined) return row[name];
      const key = Object.keys(row).find((item) => item.toLowerCase() === name.toLowerCase());
      if (key) return row[key];
    }
    return "";
  };
  return {
    data: normalizeImportDate(get("data", "date")),
    ndp: String(get("ndp", "nr_doc", "nr document", "document")).trim(),
    cont_d: String(get("cont_d", "cont debit", "debit")).trim(),
    cont_c: String(get("cont_c", "cont credit", "credit")).trim(),
    suma: round(parseAmount(get("suma", "valoare", "amount"))),
    explicatie: String(get("explicatie", "descriere", "detalii")).trim(),
    fel_d: String(get("fel_d", "tip", "categorie")).trim(),
    id_nota: String(get("id_nota", "id nota", "nota")).trim()
  };
}

function normalizeImportDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!match) return text;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseAmount(value) {
  if (typeof value === "number") return value;
  const text = String(value || "0").trim().replace(/\s+/g, "");
  if (text.includes(",") && text.includes(".")) return Number(text.replace(/\./g, "").replace(",", "."));
  if (text.includes(",")) return Number(text.replace(",", "."));
  return Number(text || 0);
}

function normalizeInvoiceIn(db, body, existing = {}) {
  const data = body.data || existing.data || today();
  const [an, luna] = dateParts(data);
  const lines = normalizeInvoiceLines(body.lines ?? existing.lines, "628");
  const valoare = round(lines.length ? lines.reduce((sum, line) => sum + line.valoare, 0) : body.valoare ?? existing.valoare);
  const tvaProcent = Number(body.tva_procent ?? existing.tva_procent ?? 21);
  const tva = round(lines.length ? lines.reduce((sum, line) => sum + line.tva, 0) : body.tva ?? valoare * tvaProcent / 100);
  const total = round(body.total ?? valoare + tva);
  if (!body.furnizor_id && !existing.furnizor_id) throwHttp(400, "Furnizorul este obligatoriu.");
  if (!body.nr_document && !existing.nr_document) throwHttp(400, "Numarul documentului este obligatoriu.");
  thirdParty(db, body.furnizor_id || existing.furnizor_id);
  return {
    ...existing,
    an,
    luna,
    nr_document: String(body.nr_document ?? existing.nr_document ?? "").trim(),
    furnizor_id: body.furnizor_id ?? existing.furnizor_id,
    data,
    data_scadenta: body.data_scadenta || existing.data_scadenta || addDays(data, 30),
    valoare,
    tva_procent: tvaProcent,
    tva,
    total,
    lines,
    achitat: round(existing.achitat || body.achitat || 0),
    neachitat: round(total - Number(existing.achitat || body.achitat || 0)),
    template_key: String(body.template_key ?? existing.template_key ?? "").trim(),
    cont_cheltuiala: String(body.cont_cheltuiala ?? existing.cont_cheltuiala ?? "628").trim(),
    cost_center_id: body.cost_center_id === "" ? null : body.cost_center_id ?? existing.cost_center_id ?? null,
    subcentru_id: body.subcentru_id === "" ? null : body.subcentru_id ?? existing.subcentru_id ?? null,
    santier_id: body.santier_id === "" ? null : body.santier_id ?? existing.santier_id ?? null,
    explicatie: String(body.explicatie ?? existing.explicatie ?? "").trim()
  };
}

function normalizeInvoiceOut(db, body, existing = {}) {
  const data = body.data || existing.data || today();
  const [an, luna] = dateParts(data);
  const lines = normalizeInvoiceLines(body.lines ?? existing.lines, "704");
  const valoare = round(lines.length ? lines.reduce((sum, line) => sum + line.valoare, 0) : body.valoare ?? existing.valoare);
  const tvaProcent = Number(body.tva_procent ?? existing.tva_procent ?? 21);
  const tva = round(lines.length ? lines.reduce((sum, line) => sum + line.tva, 0) : body.tva ?? valoare * tvaProcent / 100);
  const total = round(body.total ?? valoare + tva);
  if (!body.client_id && !existing.client_id) throwHttp(400, "Clientul este obligatoriu.");
  thirdParty(db, body.client_id || existing.client_id);
  return {
    ...existing,
    an,
    luna,
    serie: String(body.serie ?? existing.serie ?? "IF").trim(),
    numar: Number(body.numar ?? existing.numar ?? engine.nextNumericId(engine.ensureAccounting(db).invoicesOut)),
    client_id: body.client_id ?? existing.client_id,
    data,
    data_scadenta: body.data_scadenta || existing.data_scadenta || addDays(data, 30),
    valoare,
    tva_procent: tvaProcent,
    tva,
    total,
    lines,
    incasat: round(existing.incasat || body.incasat || 0),
    neincasat: round(total - Number(existing.incasat || body.incasat || 0)),
    template_key: String(body.template_key ?? existing.template_key ?? "").trim(),
    cont_venit: String(body.cont_venit ?? existing.cont_venit ?? "704").trim(),
    cost_center_id: body.cost_center_id === "" ? null : body.cost_center_id ?? existing.cost_center_id ?? null,
    subcentru_id: body.subcentru_id === "" ? null : body.subcentru_id ?? existing.subcentru_id ?? null,
    santier_id: body.santier_id === "" ? null : body.santier_id ?? existing.santier_id ?? null,
    explicatie: String(body.explicatie ?? existing.explicatie ?? "").trim()
  };
}

function normalizeThirdParty(db, body, existing = null) {
  const accounting = engine.ensureAccounting(db);
  const id = existing?.id || engine.nextNumericId(accounting.thirdParties);
  const cod = String(body.cod || existing?.cod || id).replace(/\D/g, "").padStart(5, "0").slice(-5);
  if (!existing && accounting.thirdParties.some((item) => item.cod === cod)) throwHttp(409, "Codul tertului exista deja.");
  const tert = {
    ...(existing || {}),
    id,
    cod,
    tip: ["furnizor", "client", "ambele"].includes(body.tip) ? body.tip : existing?.tip || "furnizor",
    denumire: String(body.denumire ?? existing?.denumire ?? "").trim(),
    cui: String(body.cui ?? existing?.cui ?? "").trim(),
    nr_reg_com: String(body.nr_reg_com ?? existing?.nr_reg_com ?? "").trim(),
    tara: String(body.tara ?? existing?.tara ?? "RO").trim().slice(0, 2).toUpperCase(),
    judet: String(body.judet ?? existing?.judet ?? "").trim(),
    localitate: String(body.localitate ?? existing?.localitate ?? "").trim(),
    adresa: String(body.adresa ?? existing?.adresa ?? "").trim(),
    iban: String(body.iban ?? existing?.iban ?? "").trim(),
    banca: String(body.banca ?? existing?.banca ?? "").trim(),
    telefon: String(body.telefon ?? existing?.telefon ?? "").trim(),
    email: String(body.email ?? existing?.email ?? "").trim(),
    tva_platitor: Boolean(body.tva_platitor ?? existing?.tva_platitor),
    zile_scadenta: Number(body.zile_scadenta ?? existing?.zile_scadenta ?? 30),
    cont_analitic_furnizor: existing?.cont_analitic_furnizor || body.cont_analitic_furnizor || "",
    cont_analitic_client: existing?.cont_analitic_client || body.cont_analitic_client || "",
    blocat: Boolean(body.blocat ?? existing?.blocat),
    activ: body.activ === undefined ? existing?.activ !== false : body.activ !== false,
    created_at: existing?.created_at || new Date().toISOString()
  };
  if (!tert.denumire) throwHttp(400, "Denumirea tertului este obligatorie.");
  return tert;
}

function normalizeInvoiceLines(lines, defaultAccount) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line, index) => {
    const valoare = round(line.valoare ?? line.suma ?? line.pret_total ?? 0);
    const tvaProcent = Number(line.tva_procent ?? line.tvaProcent ?? 21);
    const tva = round(line.tva ?? valoare * tvaProcent / 100);
    return {
      id: line.id || index + 1,
      nr_crt: Number(line.nr_crt || index + 1),
      denumire: String(line.denumire || line.descriere || "").trim(),
      um: String(line.um || "buc").trim(),
      cantitate: Number(line.cantitate || 1),
      pret_unitar: round(line.pret_unitar ?? valoare),
      valoare,
      tva_procent: tvaProcent,
      tva,
      total: round(valoare + tva),
      cont: String(line.cont || line.cont_simbol || line.cont_cheltuiala || line.cont_venit || defaultAccount).trim(),
      cost_center_id: line.cost_center_id === "" ? null : line.cost_center_id || null,
      subcentru_id: line.subcentru_id === "" ? null : line.subcentru_id || null
    };
  }).filter((line) => line.valoare > 0);
}

function filterDocuments(items, query) {
  return items.filter((item) =>
    (query.status || item.status !== "anulat") &&
    (!query.an || Number(item.an) === Number(query.an)) &&
    (!query.luna || Number(item.luna) === Number(query.luna)) &&
    (!query.status || item.status === query.status) &&
    (!query.furnizor || String(item.furnizor_id) === String(query.furnizor)) &&
    (!query.client || String(item.client_id) === String(query.client)) &&
    (!query.tert_id || String(item.tert_id) === String(query.tert_id)) &&
    (!query.operatie || String(item.tip_operatie) === String(query.operatie)) &&
    (!query.tip || item.tip_document === query.tip || item.tip === query.tip)
  ).sort((a, b) => String(b.data || b.created_at || "").localeCompare(String(a.data || a.created_at || "")));
}

function thirdParty(db, id) {
  const tert = engine.ensureAccounting(db).thirdParties.find((item) => String(item.id) === String(id));
  if (!tert) throwHttp(404, "Tertul nu a fost gasit.");
  return tert;
}

function thirdPartyStatus(db, tip) {
  const accounting = engine.ensureAccounting(db);
  const source = tip === "client" ? accounting.invoicesOut : accounting.invoicesIn;
  const idKey = tip === "client" ? "client_id" : "furnizor_id";
  const paidKey = tip === "client" ? "incasat" : "achitat";
  const balanceKey = tip === "client" ? "neincasat" : "neachitat";
  const rows = accounting.thirdParties.filter((tert) => tert.tip === tip || tert.tip === "ambele").map((tert) => {
    const invoices = source.filter((item) => item.status !== "anulat" && String(item[idKey]) === String(tert.id));
    const sold = round(invoices.reduce((acc, item) => acc + Number(item[balanceKey] ?? item.total - Number(item[paidKey] || 0)), 0));
    const paid = round(invoices.reduce((acc, item) => acc + Number(item[paidKey] || 0), 0));
    const total = round(invoices.reduce((acc, item) => acc + Number(item.total || 0), 0));
    const aging = agingBuckets(invoices, balanceKey, paidKey);
    return {
      ...tert,
      sold,
      total_facturat: total,
      total_achitat: paid,
      facturi: invoices.length,
      aging,
      confirmation: latestBalanceConfirmation(accounting, tip, tert.id),
      scadente_depasite: invoices.filter((item) => Number(item[balanceKey] ?? item.total - Number(item[paidKey] || 0)) > 0 && item.data_scadenta < today()).length
    };
  });
  return { rows };
}

function thirdPartyDetail(db, tip, id) {
  const accounting = engine.ensureAccounting(db);
  const tert = accounting.thirdParties.find((item) => String(item.id) === String(id) && (item.tip === tip || item.tip === "ambele"));
  if (!tert) throwHttp(404, "Tertul nu a fost gasit.");
  const source = tip === "client" ? accounting.invoicesOut : accounting.invoicesIn;
  const idKey = tip === "client" ? "client_id" : "furnizor_id";
  const paidKey = tip === "client" ? "incasat" : "achitat";
  const balanceKey = tip === "client" ? "neincasat" : "neachitat";
  const invoices = source
    .filter((item) => item.status !== "anulat" && String(item[idKey]) === String(tert.id))
    .map((invoice) => {
      const rest = round(invoice[balanceKey] ?? Number(invoice.total || 0) - Number(invoice[paidKey] || 0));
      const due = invoice.data_scadenta || invoice.data || today();
      const days_overdue = rest > 0 ? Math.max(0, daysBetween(due, today())) : 0;
      const luna = invoice.an && invoice.luna ? `${invoice.an}-${String(invoice.luna).padStart(2, "0")}` : "";
      const treasuryParams = {
        new: 1,
        luna,
        tert_id: tert.id,
        operatie: tip === "client" ? "incasare" : "plata"
      };
      if (tip === "client") treasuryParams.invoice_out_id = invoice.id;
      else treasuryParams.invoice_in_id = invoice.id;
      return {
        id: invoice.id,
        uuid: invoice.uuid,
        data: invoice.data,
        data_scadenta: invoice.data_scadenta || "",
        nr_document: invoice.nr_document || invoice.numar || invoice.id,
        explicatie: invoice.explicatie || "",
        status: invoice.status || "",
        total: round(invoice.total || 0),
        paid: round(invoice[paidKey] || 0),
        rest,
        days_overdue,
        overdue: days_overdue > 0,
        invoice_url: `${tip === "client" ? "/contabilitate/facturi-iesire" : "/contabilitate/facturi-intrare"}${luna ? `?luna=${luna}` : ""}`,
        treasury_url: accountingLink("/contabilitate/trezorerie", treasuryParams)
      };
    })
    .sort((a, b) => String(a.data_scadenta || a.data || "").localeCompare(String(b.data_scadenta || b.data || "")));
  const open = invoices.filter((item) => item.rest > 0);
  const movements = accounting.treasury
    .filter((item) => item.status !== "anulat" && String(item.tert_id || "") === String(tert.id))
    .map((item) => {
      const decorated = decorateTreasury(item, accounting);
      return {
        id: decorated.id,
        uuid: decorated.uuid,
        data: decorated.data,
        tip: decorated.tip || "",
        tip_operatie: decorated.tip_operatie || "",
        nr_document: decorated.nr_document || decorated.id,
        cont_trezorerie: decorated.cont_trezorerie || "",
        cont_corespondent: decorated.cont_corespondent || "",
        suma: round(decorated.suma || 0),
        status: decorated.status || "",
        journal_id: decorated.journal_id || "",
        journal_uuid: decorated.journal_uuid || "",
        linked_invoice: decorated.linked_invoice,
        explicatie: decorated.explicatie || "",
        treasury_url: accountingLink("/contabilitate/trezorerie", {
          luna: decorated.balance_month,
          tert_id: tert.id,
          q: decorated.nr_document || decorated.uuid || decorated.id
        })
      };
    })
    .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
  const totals = {
    total: round(invoices.reduce((sum, item) => sum + item.total, 0)),
    paid: round(invoices.reduce((sum, item) => sum + item.paid, 0)),
    rest: round(open.reduce((sum, item) => sum + item.rest, 0)),
    overdue: round(open.filter((item) => item.overdue).reduce((sum, item) => sum + item.rest, 0)),
    invoices: invoices.length,
    open: open.length,
    overdue_count: open.filter((item) => item.overdue).length,
    treasury_in: round(movements.filter((item) => item.tip_operatie === "incasare").reduce((sum, item) => sum + item.suma, 0)),
    treasury_out: round(movements.filter((item) => item.tip_operatie === "plata").reduce((sum, item) => sum + item.suma, 0)),
    treasury_count: movements.length
  };
  return {
    tert,
    tip,
    account: tip === "client" ? tert.cont_analitic_client : tert.cont_analitic_furnizor,
    totals,
    confirmation: latestBalanceConfirmation(accounting, tip, tert.id),
    confirmations: balanceConfirmationsFor(accounting, tip, tert.id).slice(0, 10),
    invoices,
    openInvoices: open,
    treasury: movements
  };
}

function markThirdPartyBalanceConfirmation(db, user, tip, id, status, body = {}) {
  const accounting = engine.ensureAccounting(db);
  const detail = thirdPartyDetail(db, tip, id);
  const existingOpen = balanceConfirmationsFor(accounting, tip, id).find((item) => item.status === "trimisa");
  const now = new Date().toISOString();
  const confirmation = status === "confirmata" && existingOpen ? existingOpen : {
    id: engine.nextNumericId(accounting.balanceConfirmations),
    uuid: cryptoId(),
    tip,
    tert_id: detail.tert.id,
    tert_denumire: detail.tert.denumire || "",
    tert_cui: detail.tert.cui || "",
    sold: round(detail.totals.rest || 0),
    sold_depasit: round(detail.totals.overdue || 0),
    facturi_deschise: Number(detail.totals.open || 0),
    data_sold: today(),
    status: "draft",
    observatii: "",
    created_by: user?.id || null,
    created_at: now
  };
  confirmation.status = status;
  confirmation.observatii = String(body.observatii ?? confirmation.observatii ?? "").trim();
  confirmation.updated_by = user?.id || null;
  confirmation.updated_at = now;
  if (status === "trimisa") {
    confirmation.sent_at = body.data || now;
    confirmation.sent_by = user?.id || null;
  }
  if (status === "confirmata") {
    confirmation.received_at = body.data || now;
    confirmation.received_by = user?.id || null;
    confirmation.confirmed_sold = body.confirmed_sold === "" || body.confirmed_sold === undefined ? confirmation.sold : round(body.confirmed_sold);
    confirmation.diferenta = round(Number(confirmation.confirmed_sold || 0) - Number(confirmation.sold || 0));
  }
  if (!accounting.balanceConfirmations.some((item) => item.id === confirmation.id)) accounting.balanceConfirmations.push(confirmation);
  return confirmation;
}

function cancelThirdPartyBalanceConfirmation(db, user, tip, id, body = {}) {
  const accounting = engine.ensureAccounting(db);
  thirdPartyDetail(db, tip, id);
  const confirmation = balanceConfirmationsFor(accounting, tip, id).find((item) => item.status !== "anulata");
  if (!confirmation) throwHttp("Nu exista confirmare de sold activa pentru acest tert.", 404);
  const now = new Date().toISOString();
  confirmation.status = "anulata";
  confirmation.cancelled_at = now;
  confirmation.cancelled_by = user?.id || null;
  confirmation.cancelled_reason = String(body.motiv || body.reason || "Anulare confirmare sold").trim();
  confirmation.updated_at = now;
  confirmation.updated_by = user?.id || null;
  return confirmation;
}

function latestBalanceConfirmation(accounting, tip, tertId) {
  return balanceConfirmationsFor(accounting, tip, tertId)[0] || null;
}

function balanceConfirmationsFor(accounting, tip, tertId) {
  return (accounting.balanceConfirmations || [])
    .filter((item) => item.tip === tip && String(item.tert_id) === String(tertId))
    .filter((item) => item.status !== "anulata")
    .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
}

function exportThirdPartyStatus(res, db, tip) {
  const data = thirdPartyStatus(db, tip);
  const label = tip === "client" ? "Clienti" : "Furnizori";
  const summaryRows = [
    [`Scadentar ${label}`, `Generat la ${today()}`],
    [`Total sold`, data.rows.reduce((total, row) => round(total + Number(row.sold || 0)), 0)],
    [],
    ["Cod", "Denumire", "CUI", "Analitic furnizor", "Analitic client", "Total facturat", "Achitat/Incasat", "Sold", "Nescadent", "1-30 zile", "31-60 zile", "61-90 zile", "Peste 90 zile", "Facturi", "Scadente depasite", "Email", "Telefon"],
    ...data.rows.map((row) => [
      row.cod || "",
      row.denumire || "",
      row.cui || "",
      row.cont_analitic_furnizor || "",
      row.cont_analitic_client || "",
      row.total_facturat || 0,
      row.total_achitat || 0,
      row.sold || 0,
      row.aging?.current || 0,
      row.aging?.d1_30 || 0,
      row.aging?.d31_60 || 0,
      row.aging?.d61_90 || 0,
      row.aging?.d90_plus || 0,
      row.facturi || 0,
      row.scadente_depasite || 0,
      row.email || "",
      row.telefon || ""
    ])
  ];
  const detailRows = buildThirdPartyOpenInvoiceRows(db, tip);
  const workbook = xlsx.utils.book_new();
  const summarySheet = xlsx.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 10 }, { wch: 34 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 26 }, { wch: 16 }];
  summarySheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  summarySheet["!freeze"] = { xSplit: 0, ySplit: 4 };
  summarySheet["!autofilter"] = { ref: `A4:Q${Math.max(summaryRows.length, 4)}` };
  xlsx.utils.book_append_sheet(workbook, summarySheet, "Scadentar");
  const detailSheet = xlsx.utils.aoa_to_sheet(detailRows);
  detailSheet["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 36 }, { wch: 36 }];
  detailSheet["!freeze"] = { xSplit: 0, ySplit: 3 };
  detailSheet["!autofilter"] = { ref: `A3:M${Math.max(detailRows.length, 3)}` };
  xlsx.utils.book_append_sheet(workbook, detailSheet, "Facturi deschise");
  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Scadentar_${tip}_${today()}.xlsx"`);
  res.end(buffer);
}

function exportThirdPartyBalanceConfirmationRegister(res, db, tip) {
  const data = thirdPartyStatus(db, tip);
  const label = tip === "client" ? "clienti" : "furnizori";
  const rows = [
    [`Registru confirmari sold ${label}`, `Generat la ${today()}`],
    [],
    ["Cod", "Denumire", "CUI", "Analitic", "Sold", "Sold depasit", "Facturi deschise", "Status confirmare", "Data sold", "Trimisa la", "Primita la", "Sold confirmat", "Diferenta", "Observatii", "Email", "Telefon"],
    ...data.rows.map((row) => {
      const confirmation = row.confirmation || {};
      const overdue = row.aging ? round(Number(row.aging.d1_30 || 0) + Number(row.aging.d31_60 || 0) + Number(row.aging.d61_90 || 0) + Number(row.aging.d90_plus || 0)) : 0;
      return [
        row.cod || "",
        row.denumire || "",
        row.cui || "",
        tip === "client" ? row.cont_analitic_client || "" : row.cont_analitic_furnizor || "",
        row.sold || 0,
        overdue,
        row.scadente_depasite || 0,
        confirmation.status || "netrimisa",
        confirmation.data_sold || "",
        confirmation.sent_at ? String(confirmation.sent_at).slice(0, 10) : "",
        confirmation.received_at ? String(confirmation.received_at).slice(0, 10) : "",
        confirmation.confirmed_sold ?? "",
        confirmation.diferenta ?? "",
        confirmation.observatii || "",
        row.email || "",
        row.telefon || ""
      ];
    })
  ];
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 10 }, { wch: 34 }, { wch: 16 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 36 }, { wch: 28 }, { wch: 16 }
  ];
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  sheet["!freeze"] = { xSplit: 0, ySplit: 3 };
  sheet["!autofilter"] = { ref: `A3:P${Math.max(rows.length, 3)}` };
  xlsx.utils.book_append_sheet(workbook, sheet, "Confirmari sold");
  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Registru_confirmari_sold_${label}_${today()}.xlsx"`);
  res.end(buffer);
}

function buildThirdPartyOpenInvoiceRows(db, tip) {
  const data = thirdPartyStatus(db, tip);
  const rows = [
    [`Facturi deschise ${tip === "client" ? "clienti" : "furnizori"}`, `Generat la ${today()}`],
    [],
    ["Cod tert", "Tert", "CUI", "Analitic", "Document", "Data", "Scadenta", "Total", "Achitat/Incasat", "Rest", "Zile intarziere", "Actiune recomandata", "Link"]
  ];
  data.rows.forEach((row) => {
    const detail = thirdPartyDetail(db, tip, row.id);
    detail.openInvoices.forEach((invoice) => {
      rows.push([
        detail.tert.cod || "",
        detail.tert.denumire || "",
        detail.tert.cui || "",
        detail.account || "",
        invoice.nr_document || "",
        invoice.data || "",
        invoice.data_scadenta || "",
        invoice.total || 0,
        invoice.paid || 0,
        invoice.rest || 0,
        invoice.days_overdue || 0,
        tip === "client" ? "Incaseaza sau verifica scadenta." : "Plateste sau verifica scadenta.",
        invoice.treasury_url || invoice.invoice_url || ""
      ]);
    });
  });
  if (rows.length === 3) rows.push(["", "Nu exista facturi deschise pentru filtrul curent.", "", "", "", "", "", 0, 0, 0, 0, "", ""]);
  return rows;
}

function exportThirdPartyDetail(res, db, tip, id) {
  const detail = thirdPartyDetail(db, tip, id);
  const label = tip === "client" ? "Client" : "Furnizor";
  const summaryRows = [
    [`Fisa tert - ${label}`, detail.tert.denumire || ""],
    ["Generat la", today()],
    ["Cod", detail.tert.cod || ""],
    ["CUI", detail.tert.cui || ""],
    ["Analitic", detail.account || ""],
    ["Total facturat", detail.totals.total || 0],
    [tip === "client" ? "Total incasat" : "Total achitat", detail.totals.paid || 0],
    ["Sold deschis", detail.totals.rest || 0],
    ["Sold depasit", detail.totals.overdue || 0],
    ["Facturi deschise", detail.totals.open || 0],
    [tip === "client" ? "Total incasari trezorerie" : "Total plati trezorerie", tip === "client" ? detail.totals.treasury_in || 0 : detail.totals.treasury_out || 0],
    ["Operatii trezorerie", detail.totals.treasury_count || 0]
  ];
  const invoiceRows = [
    ["Data", "Document", "Scadenta", "Status", "Total", tip === "client" ? "Incasat" : "Achitat", "Rest", "Zile intarziere", "Explicatie", "Link trezorerie"],
    ...detail.openInvoices.map((invoice) => [
      invoice.data || "",
      invoice.nr_document || "",
      invoice.data_scadenta || "",
      invoice.status || "",
      invoice.total || 0,
      invoice.paid || 0,
      invoice.rest || 0,
      invoice.days_overdue || 0,
      invoice.explicatie || "",
      invoice.treasury_url || ""
    ])
  ];
  const allInvoiceRows = [
    ["Data", "Document", "Scadenta", "Status", "Total", tip === "client" ? "Incasat" : "Achitat", "Rest", "Zile intarziere", "Explicatie", "Link factura"],
    ...detail.invoices
      .slice()
      .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")))
      .map((invoice) => [
        invoice.data || "",
        invoice.nr_document || "",
        invoice.data_scadenta || "",
        invoice.status || "",
        invoice.total || 0,
        invoice.paid || 0,
        invoice.rest || 0,
        invoice.days_overdue || 0,
        invoice.explicatie || "",
        invoice.invoice_url || ""
      ])
  ];
  const treasuryRows = [
    ["Data", "Document", "Operatie", "Tip", "Cont trezorerie", "Cont corespondent", "Suma", "Status", "Nota", "Factura legata", "Explicatie", "Link"],
    ...detail.treasury.map((row) => [
      row.data || "",
      row.nr_document || "",
      row.tip_operatie || "",
      row.tip || "",
      row.cont_trezorerie || "",
      row.cont_corespondent || "",
      row.suma || 0,
      row.status || "",
      row.journal_id ? `NC ${row.journal_id}` : "",
      row.linked_invoice?.document || "",
      row.explicatie || "",
      row.treasury_url || ""
    ])
  ];
  if (invoiceRows.length === 1) invoiceRows.push(["", "Nu exista facturi deschise.", "", "", 0, 0, 0, 0, "", ""]);
  if (allInvoiceRows.length === 1) allInvoiceRows.push(["", "Nu exista facturi in istoricul tertului.", "", "", 0, 0, 0, 0, "", ""]);
  if (treasuryRows.length === 1) treasuryRows.push(["", "Nu exista miscari de trezorerie.", "", "", "", "", 0, "", "", "", "", ""]);

  const workbook = xlsx.utils.book_new();
  const summarySheet = xlsx.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 30 }, { wch: 34 }];
  xlsx.utils.book_append_sheet(workbook, summarySheet, "Sumar");
  const invoicesSheet = xlsx.utils.aoa_to_sheet(invoiceRows);
  invoicesSheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 36 }, { wch: 36 }];
  invoicesSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  invoicesSheet["!autofilter"] = { ref: `A1:J${Math.max(invoiceRows.length, 1)}` };
  xlsx.utils.book_append_sheet(workbook, invoicesSheet, "Facturi deschise");
  const allInvoicesSheet = xlsx.utils.aoa_to_sheet(allInvoiceRows);
  allInvoicesSheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 36 }, { wch: 36 }];
  allInvoicesSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  allInvoicesSheet["!autofilter"] = { ref: `A1:J${Math.max(allInvoiceRows.length, 1)}` };
  xlsx.utils.book_append_sheet(workbook, allInvoicesSheet, "Istoric facturi");
  const treasurySheet = xlsx.utils.aoa_to_sheet(treasuryRows);
  treasurySheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 36 }, { wch: 36 }];
  treasurySheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  treasurySheet["!autofilter"] = { ref: `A1:L${Math.max(treasuryRows.length, 1)}` };
  xlsx.utils.book_append_sheet(workbook, treasurySheet, "Trezorerie");
  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  const safe = String(detail.tert.denumire || detail.tert.cod || id || "tert").replace(/[^\w.-]+/g, "_").slice(0, 60);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Fisa_tert_${tip}_${safe}_${today()}.xlsx"`);
  res.end(buffer);
}

function exportThirdPartyBalanceConfirmation(res, db, tip, id) {
  const detail = thirdPartyDetail(db, tip, id);
  const direction = tip === "client" ? "de incasat de la" : "de plata catre";
  const rows = [
    ["CONFIRMARE SOLD"],
    [],
    ["Data emiterii", today()],
    ["Tert", detail.tert.denumire || ""],
    ["Cod tert", detail.tert.cod || ""],
    ["CUI", detail.tert.cui || ""],
    ["Analitic", detail.account || ""],
    [],
    [`Conform evidentei contabile, soldul ${direction} tertul mentionat este:`, detail.totals.rest || 0],
    ["Din care sold depasit la scadenta", detail.totals.overdue || 0],
    ["Numar facturi deschise", detail.totals.open || 0],
    [],
    ["Facturi care compun soldul"],
    ["Data", "Document", "Scadenta", "Status", "Total", tip === "client" ? "Incasat" : "Achitat", "Rest", "Zile intarziere", "Explicatie"],
    ...detail.openInvoices.map((invoice) => [
      invoice.data || "",
      invoice.nr_document || "",
      invoice.data_scadenta || "",
      invoice.status || "",
      invoice.total || 0,
      invoice.paid || 0,
      invoice.rest || 0,
      invoice.days_overdue || 0,
      invoice.explicatie || ""
    ]),
    [],
    ["Total sold confirmat", "", "", "", "", "", detail.totals.rest || 0],
    [],
    ["Va rugam sa confirmati soldul sau sa transmiteti diferentele constatate."],
    [],
    ["Emitent", "", "", "", "Confirmat de tert"],
    ["Nume / functie / semnatura", "", "", "", "Nume / functie / semnatura"]
  ];
  if (!detail.openInvoices.length) rows.splice(14, 0, ["", "Nu exista facturi deschise.", "", "", 0, 0, 0, 0, ""]);
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 40 }];
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 5 } },
    { s: { r: rows.length - 4, c: 0 }, e: { r: rows.length - 4, c: 8 } }
  ];
  xlsx.utils.book_append_sheet(workbook, sheet, "Confirmare sold");
  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  const safe = String(detail.tert.denumire || detail.tert.cod || id || "tert").replace(/[^\w.-]+/g, "_").slice(0, 60);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Confirmare_sold_${tip}_${safe}_${today()}.xlsx"`);
  res.end(buffer);
}

function sendThirdPartyBalanceConfirmationHtml(res, db, tip, id) {
  const detail = thirdPartyDetail(db, tip, id);
  const direction = tip === "client" ? "de incasat de la" : "de plata catre";
  const invoiceRows = detail.openInvoices.length
    ? detail.openInvoices.map((invoice) => `
      <tr>
        <td>${accountingHtmlEscape(invoice.data || "")}</td>
        <td>${accountingHtmlEscape(invoice.nr_document || "")}</td>
        <td>${accountingHtmlEscape(invoice.data_scadenta || "")}</td>
        <td>${accountingHtmlEscape(invoice.status || "")}</td>
        <td class="num">${formatReconciliationMoney(invoice.total || 0)}</td>
        <td class="num">${formatReconciliationMoney(invoice.paid || 0)}</td>
        <td class="num strong">${formatReconciliationMoney(invoice.rest || 0)}</td>
        <td class="num">${accountingHtmlEscape(invoice.days_overdue || 0)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8" class="empty">Nu exista facturi deschise.</td></tr>`;
  const html = `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <title>Confirmare sold - ${accountingHtmlEscape(detail.tert.denumire || "")}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; }
    .actions { position: sticky; top: 0; margin: 0 0 14px; padding: 10px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; text-align: right; }
    button { border: 1px solid #d1d5db; background: #065f46; color: white; border-radius: 6px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
    .sheet { max-width: 190mm; margin: 0 auto; }
    h1 { margin: 0 0 6px; text-align: center; font-size: 18pt; letter-spacing: .03em; text-transform: uppercase; }
    .subtitle { text-align: center; color: #475569; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin: 16px 0; }
    .box { border: 1px solid #d9e2ec; border-radius: 8px; padding: 10px 12px; background: #fbfdff; }
    .label { color: #64748b; font-size: 9pt; text-transform: uppercase; }
    .value { margin-top: 2px; font-weight: 700; }
    .lead { margin: 18px 0; padding: 12px; border-left: 4px solid #065f46; background: #f0fdf4; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 7px; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; color: #334155; font-size: 9pt; text-transform: uppercase; }
    .num { text-align: right; white-space: nowrap; }
    .strong { font-weight: 700; }
    .total { margin-top: 14px; text-align: right; font-size: 13pt; font-weight: 700; }
    .empty { text-align: center; color: #64748b; padding: 16px; }
    .note { margin-top: 18px; color: #334155; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; margin-top: 42px; }
    .signature { min-height: 80px; border-top: 1px solid #111827; padding-top: 8px; text-align: center; }
    .footer { margin-top: 28px; color: #64748b; font-size: 9pt; text-align: center; }
    @media print {
      .actions { display: none; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Tipareste / Salveaza PDF</button></div>
  <main class="sheet">
    <h1>Confirmare sold</h1>
    <div class="subtitle">Document generat din InfraFlow ERP la ${accountingHtmlEscape(today())}</div>
    <section class="grid">
      <div class="box"><div class="label">Tert</div><div class="value">${accountingHtmlEscape(detail.tert.denumire || "")}</div></div>
      <div class="box"><div class="label">CUI</div><div class="value">${accountingHtmlEscape(detail.tert.cui || "-")}</div></div>
      <div class="box"><div class="label">Cod tert</div><div class="value">${accountingHtmlEscape(detail.tert.cod || "-")}</div></div>
      <div class="box"><div class="label">Analitic</div><div class="value">${accountingHtmlEscape(detail.account || "-")}</div></div>
    </section>
    <p class="lead">Conform evidentei contabile, soldul ${accountingHtmlEscape(direction)} tertul mentionat este <strong>${accountingHtmlEscape(formatReconciliationMoney(detail.totals.rest || 0))}</strong>, din care depasit la scadenta <strong>${accountingHtmlEscape(formatReconciliationMoney(detail.totals.overdue || 0))}</strong>.</p>
    <h2>Facturi care compun soldul</h2>
    <table>
      <thead>
        <tr>
          <th>Data</th><th>Document</th><th>Scadenta</th><th>Status</th>
          <th>Total</th><th>${tip === "client" ? "Incasat" : "Achitat"}</th><th>Rest</th><th>Zile int.</th>
        </tr>
      </thead>
      <tbody>${invoiceRows}</tbody>
    </table>
    <div class="total">Total sold confirmat: ${accountingHtmlEscape(formatReconciliationMoney(detail.totals.rest || 0))}</div>
    <p class="note">Va rugam sa confirmati soldul sau sa transmiteti diferentele constatate.</p>
    <section class="signatures">
      <div class="signature">Emitent<br>Nume / functie / semnatura</div>
      <div class="signature">Confirmat de tert<br>Nume / functie / semnatura</div>
    </section>
    <div class="footer">InfraFlow ERP - Confirmare sold generata automat</div>
  </main>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

function accountingHtmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function agingBuckets(invoices, balanceKey, paidKey) {
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  invoices.forEach((invoice) => {
    const rest = round(invoice[balanceKey] ?? Number(invoice.total || 0) - Number(invoice[paidKey] || 0));
    if (rest <= 0) return;
    const due = invoice.data_scadenta || invoice.data || today();
    const days = daysBetween(due, today());
    if (days <= 0) buckets.current = round(buckets.current + rest);
    else if (days <= 30) buckets.d1_30 = round(buckets.d1_30 + rest);
    else if (days <= 60) buckets.d31_60 = round(buckets.d31_60 + rest);
    else if (days <= 90) buckets.d61_90 = round(buckets.d61_90 + rest);
    else buckets.d90_plus = round(buckets.d90_plus + rest);
  });
  return buckets;
}

function daysBetween(fromDate, toDate) {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function buildVatData(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const monthValue = query.perioada || query.month || (String(query.luna || "").includes("-") ? query.luna : `${query.an || new Date().getFullYear()}-${String(query.luna || new Date().getMonth() + 1).padStart(2, "0")}`);
  const [an, luna] = monthParts(monthValue);
  const requestedStatus = query.status === undefined || query.status === "" ? "" : String(query.status);
  const filters = { ...query, an, luna, status: requestedStatus || undefined };
  const period = accounting.periods.find((item) => Number(item.an) === Number(an) && Number(item.luna) === Number(luna)) || { an, luna, status: "deschisa" };
  const cota = query.cota === undefined || query.cota === "" ? "" : Number(query.cota);
  const allInMonthIn = filterDocuments(accounting.invoicesIn, { an, luna }).filter((item) => item.status !== "anulat");
  const allInMonthOut = filterDocuments(accounting.invoicesOut, { an, luna }).filter((item) => item.status !== "anulat");
  const vatReadyStatuses = new Set(["validat", "partial", "achitat", "incasat", "stornat"]);
  const invoicesIn = filterDocuments(accounting.invoicesIn, filters)
    .filter((item) => item.status !== "anulat")
    .filter((item) => requestedStatus || vatReadyStatuses.has(String(item.status || "")));
  const invoicesOut = filterDocuments(accounting.invoicesOut, filters)
    .filter((item) => item.status !== "anulat")
    .filter((item) => requestedStatus || vatReadyStatuses.has(String(item.status || "")));
  const jurnalCumparari = invoicesIn.map((invoice) => decorateVatInvoice(db, invoice, "furnizor")).filter((item) => cota === "" || Number(item.tva_procent || 0) === cota);
  const jurnalVanzari = invoicesOut.map((invoice) => decorateVatInvoice(db, invoice, "client")).filter((item) => cota === "" || Number(item.tva_procent || 0) === cota);
  const draftIn = allInMonthIn.filter((item) => item.status === "draft").length;
  const draftOut = allInMonthOut.filter((item) => item.status === "draft").length;
  const statusSummary = summarizeVatStatuses(allInMonthIn, allInMonthOut);
  const total4426 = sum(jurnalCumparari, "tva");
  const total4427 = sum(jurnalVanzari, "tva");
  const cote = groupVatRates(jurnalCumparari, jurnalVanzari);
  const sumarD300 = buildD300Summary(jurnalCumparari, jurnalVanzari);
  return {
    perioada: { an, luna },
    jurnal_cumparari: jurnalCumparari,
    jurnal_vanzari: jurnalVanzari,
    total_4426: total4426,
    total_4427: total4427,
    diferenta: round(total4427 - total4426),
    cote,
    sumar_d300: sumarD300,
    status_summary: statusSummary,
    warnings: [
      draftIn || draftOut ? `Exista documente draft neincluse in calculul TVA: ${draftIn} intrari / ${draftOut} iesiri.` : "",
      requestedStatus ? `Calculul este filtrat pe statusul ${requestedStatus}.` : "Calculul implicit include doar documente validate/achitate/incasate/partial/stornate."
    ].filter(Boolean),
    period_status: {
      status: period.status || "deschisa",
      tva_verificat_la: period.tva_verificat_la || "",
      tva_verificat_de_name: period.tva_verificat_de_name || ""
    }
  };
}

function summarizeVatStatuses(invoicesIn, invoicesOut) {
  const statuses = new Map();
  const add = (row, type) => {
    const status = String(row.status || "draft");
    const current = statuses.get(status) || { status, intrari: 0, iesiri: 0, tva_intrari: 0, tva_iesiri: 0 };
    if (type === "in") {
      current.intrari += 1;
      current.tva_intrari = round(current.tva_intrari + Number(row.tva || 0));
    } else {
      current.iesiri += 1;
      current.tva_iesiri = round(current.tva_iesiri + Number(row.tva || 0));
    }
    statuses.set(status, current);
  };
  invoicesIn.forEach((row) => add(row, "in"));
  invoicesOut.forEach((row) => add(row, "out"));
  return [...statuses.values()].sort((a, b) => a.status.localeCompare(b.status, "ro"));
}

function decorateVatInvoice(db, invoice, tip) {
  const accounting = engine.ensureAccounting(db);
  const id = tip === "client" ? invoice.client_id : invoice.furnizor_id;
  const tert = accounting.thirdParties.find((item) => String(item.id) === String(id)) || {};
  const rate = Number(invoice.tva_procent ?? inferVatRate(invoice.valoare, invoice.tva));
  return {
    ...invoice,
    tert: tert.denumire || invoice.tert || "",
    cui: tert.cui || "",
    tva_procent: Number.isFinite(rate) ? rate : 0
  };
}

function buildClassicJournalsData(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const vatData = buildVatData(db, query);
  const { an, luna } = vatData.perioada;
  const registruCasa = buildTreasuryRegister(accounting, query, an, luna, "casa");
  const jurnalBanca = buildTreasuryRegister(accounting, query, an, luna, "banca");
  return {
    perioada: { an, luna },
    filters: {
      status: query.status || "",
      cota: query.cota || ""
    },
    jurnal_cumparari: {
      rows: vatData.jurnal_cumparari,
      totals: invoiceJournalTotals(vatData.jurnal_cumparari)
    },
    jurnal_vanzari: {
      rows: vatData.jurnal_vanzari,
      totals: invoiceJournalTotals(vatData.jurnal_vanzari)
    },
    registru_casa: {
      rows: registruCasa.rows,
      totals: registruCasa.totals,
      accounts: registruCasa.accounts
    },
    jurnal_banca: {
      rows: jurnalBanca.rows,
      totals: jurnalBanca.totals,
      accounts: jurnalBanca.accounts
    },
    period_status: vatData.period_status,
    warnings: vatData.warnings || []
  };
}

function invoiceJournalTotals(rows) {
  return {
    count: rows.length,
    baza: sum(rows, "valoare"),
    tva: sum(rows, "tva"),
    total: sum(rows, "total")
  };
}

function buildTreasuryRegister(accounting, query, an, luna, registerType) {
  const firstDay = `${an}-${String(luna).padStart(2, "0")}-01`;
  const requestedStatus = query.status === undefined || query.status === "" ? "validat" : String(query.status);
  const matchesType = (row) => {
    const tip = String(row.tip || "").toLowerCase();
    return registerType === "casa" ? tip === "casa" : tip !== "casa";
  };
  const decorate = (row) => {
    const decorated = decorateTreasury(row, accounting);
    const tert = decorated.tert_id
      ? accounting.thirdParties.find((item) => String(item.id) === String(decorated.tert_id))
      : null;
    return {
      ...decorated,
      tert_denumire: tert?.denumire || "",
      tert_cui: tert?.cui || ""
    };
  };
  const previousRows = accounting.treasury
    .filter((row) => matchesType(row))
    .filter((row) => String(row.status || "") === "validat")
    .filter((row) => String(row.data || "") < firstDay)
    .map(decorate);
  const rows = accounting.treasury
    .filter((row) => Number(row.an) === Number(an) && Number(row.luna) === Number(luna))
    .filter((row) => matchesType(row))
    .filter((row) => requestedStatus ? String(row.status || "") === requestedStatus : row.status !== "anulat")
    .map(decorate)
    .sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")) || Number(a.id || 0) - Number(b.id || 0));
  const opening = treasuryMovementTotal(previousRows);
  let sold = opening;
  const rowsWithSold = rows.map((row) => {
    const incasari = row.tip_operatie === "incasare" ? Number(row.suma || 0) : 0;
    const plati = row.tip_operatie === "plata" ? Number(row.suma || 0) : 0;
    sold = round(sold + incasari - plati);
    return {
      ...row,
      incasari,
      plati,
      sold_curent: sold
    };
  });
  return {
    rows: rowsWithSold,
    totals: treasuryJournalTotals(rowsWithSold, opening),
    accounts: treasuryAccountSummary(previousRows, rowsWithSold)
  };
}

function treasuryMovementTotal(rows) {
  return round(rows.reduce((acc, row) => acc + (row.tip_operatie === "incasare" ? Number(row.suma || 0) : -Number(row.suma || 0)), 0));
}

function treasuryJournalTotals(rows, opening = 0) {
  const incasari = rows.reduce((acc, row) => acc + Number(row.incasari || (row.tip_operatie === "incasare" ? row.suma : 0) || 0), 0);
  const plati = rows.reduce((acc, row) => acc + Number(row.plati || (row.tip_operatie === "plata" ? row.suma : 0) || 0), 0);
  return {
    count: rows.length,
    sold_initial: round(opening),
    incasari: round(incasari),
    plati: round(plati),
    sold: round(opening + incasari - plati),
    sold_final: round(opening + incasari - plati)
  };
}

function treasuryAccountSummary(previousRows, currentRows) {
  const accounts = new Map();
  const ensure = (account) => {
    const key = account || "-";
    if (!accounts.has(key)) accounts.set(key, { cont_trezorerie: key, sold_initial: 0, incasari: 0, plati: 0, sold_final: 0 });
    return accounts.get(key);
  };
  previousRows.forEach((row) => {
    const summary = ensure(row.cont_trezorerie);
    summary.sold_initial = round(summary.sold_initial + (row.tip_operatie === "incasare" ? Number(row.suma || 0) : -Number(row.suma || 0)));
  });
  currentRows.forEach((row) => {
    const summary = ensure(row.cont_trezorerie);
    summary.incasari = round(summary.incasari + Number(row.incasari || 0));
    summary.plati = round(summary.plati + Number(row.plati || 0));
  });
  return [...accounts.values()].map((row) => ({
    ...row,
    sold_final: round(row.sold_initial + row.incasari - row.plati)
  })).sort((a, b) => String(a.cont_trezorerie).localeCompare(String(b.cont_trezorerie), "ro"));
}

function treasuryExportRows(rows) {
  return [
    ["Data", "Document", "Operatie", "Tert", "Cont trezorerie", "Cont corespondent", "Incasari", "Plati", "Sold", "Status", "Nota", "Explicatie"],
    ...rows.map((row) => [
      row.data || "",
      row.nr_document || "",
      row.tip_operatie || "",
      row.tert_denumire || "",
      row.cont_trezorerie || "",
      row.cont_corespondent || "",
      row.incasari || 0,
      row.plati || 0,
      row.sold_curent || 0,
      row.status || "",
      row.journal_id ? `NC ${row.journal_id}` : "",
      row.explicatie || ""
    ])
  ];
}

function appendClassicJournalSheet(workbook, name, rows, perioada, totals) {
  const exportRows = [
    [name, `${String(perioada.luna).padStart(2, "0")}/${perioada.an}`],
    [],
    ...rows,
    [],
    ["Total documente", totals.count || 0],
    ["Total baza", totals.baza || 0],
    ["Total TVA", totals.tva || 0],
    ["Sold initial", totals.sold_initial || 0],
    ["Total general", totals.total || totals.sold_final || totals.sold || 0],
    ["Total incasari", totals.incasari || 0],
    ["Total plati", totals.plati || 0],
    ["Sold final", totals.sold_final || totals.sold || 0]
  ];
  const sheet = xlsx.utils.aoa_to_sheet(exportRows);
  sheet["!cols"] = [
    { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 34 }, { wch: 16 },
    { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 42 }
  ];
  sheet["!freeze"] = { xSplit: 0, ySplit: 3 };
  xlsx.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
}

function inferVatRate(base, vat) {
  const value = Number(base || 0);
  if (!value) return 0;
  return round(Number(vat || 0) * 100 / value);
}

function groupVatRates(invoicesIn, invoicesOut) {
  const rates = new Map();
  const add = (row, type) => {
    const rate = String(Number(row.tva_procent || 0));
    const current = rates.get(rate) || { cota: Number(row.tva_procent || 0), cumparari_baza: 0, cumparari_tva: 0, vanzari_baza: 0, vanzari_tva: 0 };
    if (type === "in") {
      current.cumparari_baza = round(current.cumparari_baza + Number(row.valoare || 0));
      current.cumparari_tva = round(current.cumparari_tva + Number(row.tva || 0));
    } else {
      current.vanzari_baza = round(current.vanzari_baza + Number(row.valoare || 0));
      current.vanzari_tva = round(current.vanzari_tva + Number(row.tva || 0));
    }
    rates.set(rate, current);
  };
  invoicesIn.forEach((row) => add(row, "in"));
  invoicesOut.forEach((row) => add(row, "out"));
  return [...rates.values()].sort((a, b) => Number(b.cota) - Number(a.cota));
}

function buildD300Summary(invoicesIn, invoicesOut) {
  const rows = [];
  const addRows = (source, prefix, label) => {
    const byRate = new Map();
    source.forEach((invoice) => {
      const rate = Number(invoice.tva_procent || 0);
      const current = byRate.get(rate) || { baza: 0, tva: 0 };
      current.baza = round(current.baza + Number(invoice.valoare || 0));
      current.tva = round(current.tva + Number(invoice.tva || 0));
      byRate.set(rate, current);
    });
    [...byRate.entries()].sort((a, b) => Number(b[0]) - Number(a[0])).forEach(([rate, totals]) => {
      rows.push({
        cod: `${prefix}_${rate}`,
        descriere: `${label} cu TVA ${rate}%`,
        baza: totals.baza,
        tva: totals.tva
      });
    });
  };
  addRows(invoicesOut, "livrari", "Livrari/prestari");
  addRows(invoicesIn, "achizitii", "Achizitii");
  const totalColectata = sum(invoicesOut, "tva");
  const totalDeductibila = sum(invoicesIn, "tva");
  const diferenta = round(totalColectata - totalDeductibila);
  return {
    randuri: rows,
    total_tva_colectata: totalColectata,
    total_tva_deductibila: totalDeductibila,
    diferenta,
    tva_de_plata: round(Math.max(diferenta, 0)),
    tva_de_recuperat: round(Math.max(-diferenta, 0))
  };
}

function periodCheck(db, an, luna) {
  const accounting = engine.ensureAccounting(db);
  const period = accounting.periods.find((item) => Number(item.an) === Number(an) && Number(item.luna) === Number(luna)) || {
    an: Number(an),
    luna: Number(luna),
    status: "deschisa"
  };
  const inMonth = (item) => Number(item.an) === Number(an) && Number(item.luna) === Number(luna) && item.status !== "anulat";
  const draftDocuments = [
    ...accounting.invoicesIn.filter(inMonth).map((item) => ({ ...item, categorie: "Factura intrare", document: item.nr_document || item.numar || item.id, resolve_url: `/contabilitate/facturi-intrare?luna=${an}-${String(luna).padStart(2, "0")}` })),
    ...accounting.invoicesOut.filter(inMonth).map((item) => ({ ...item, categorie: "Factura iesire", document: item.nr_document || item.numar || item.id, resolve_url: `/contabilitate/facturi-iesire?luna=${an}-${String(luna).padStart(2, "0")}` })),
    ...accounting.treasury.filter(inMonth).map((item) => ({ ...item, categorie: "Trezorerie", document: item.nr_document || item.numar || item.id, resolve_url: `/contabilitate/trezorerie?luna=${an}-${String(luna).padStart(2, "0")}` })),
    ...accounting.journals.filter((item) => Number(item.an) === Number(an) && Number(item.luna) === Number(luna) && item.status === "draft").map((item) => ({ ...item, categorie: "Nota contabila", document: item.nr_document || item.id, resolve_url: `/contabilitate/registru-jurnal?luna=${an}-${String(luna).padStart(2, "0")}` }))
  ].filter((item) => item.status === "draft");
  const activeJournals = accounting.journals.filter((item) => engine.isActiveJournal(item) && Number(item.an) === Number(an) && Number(item.luna) === Number(luna));
  const unbalanced = activeJournals
    .map((item) => ({ ...item, diferenta: round(Number(item.total_debit || 0) - Number(item.total_credit || 0)) }))
    .filter((item) => Math.abs(item.diferenta) > 0.01);
  const balance = engine.buildBalance(db, Number(an), Number(luna), "sintetica");
  const invoicesIn = accounting.invoicesIn.filter(inMonth);
  const invoicesOut = accounting.invoicesOut.filter(inMonth);
  const treasury = accounting.treasury.filter(inMonth);
  const totalDebit = round(balance.totals?.rulaje_D || 0);
  const totalCredit = round(balance.totals?.rulaje_C || 0);
  const balanceDifference = round(totalDebit - totalCredit);
  const balanceOk = balance.balanced && Math.abs(balanceDifference) <= 0.01;
  const tvaChecked = Boolean(period.tva_verificat_la);
  return {
    period,
    checks: {
      draft_count: draftDocuments.length,
      unbalanced_journals: unbalanced.length,
      balance_ok: balanceOk,
      tva_checked: tvaChecked,
      can_close: period.status === "deschisa" && draftDocuments.length === 0 && unbalanced.length === 0 && balanceOk && tvaChecked,
      can_reopen: ["inchisa", "depusa"].includes(period.status),
      can_mark_submitted: period.status === "inchisa"
    },
    drafts: draftDocuments.slice(0, 25).map((item) => ({
      id: item.id,
      uuid: item.uuid,
      data: item.data,
      categorie: item.categorie,
      document: item.document,
      status: item.status,
      resolve_url: item.resolve_url || ""
    })),
    unbalanced: unbalanced.slice(0, 25).map((item) => ({
      id: item.id,
      uuid: item.uuid,
      data: item.data,
      nr_document: item.nr_document,
      tip_document: item.tip_document,
      total_debit: round(item.total_debit || 0),
      total_credit: round(item.total_credit || 0),
      diferenta: item.diferenta
    })),
    balance: {
      balanced: balanceOk,
      total_debit: totalDebit,
      total_credit: totalCredit,
      difference: balanceDifference
    },
    vat: {
      deductibil: sum(invoicesIn, "tva"),
      colectat: sum(invoicesOut, "tva"),
      diferenta: round(sum(invoicesOut, "tva") - sum(invoicesIn, "tva"))
    },
    counts: {
      journals: activeJournals.length,
      invoices_in: invoicesIn.length,
      invoices_out: invoicesOut.length,
      treasury: treasury.length
    }
  };
}

function markAlert(status) {
  return (req, res, next) => {
    try {
      const alert = engine.ensureAccounting(req.auth.db).lawAlerts.find((item) => String(item.id) === String(req.params.id));
      if (!alert) return sendJson(res, 404, { error: "Alerta nu a fost gasita." });
      alert.status = status;
      if (status === "citit") {
        alert.citit_de = req.auth.user.id;
        alert.citit_la = new Date().toISOString();
      }
      addAudit(req.auth.db, req.auth.user, `accounting_alert_${status}`, alert.titlu);
      writeDb(req.auth.db);
      sendJson(res, 200, { alert });
    } catch (error) { next(error); }
  };
}

function buildReconciliation(db, an, luna, options = {}) {
  const accounting = engine.ensureAccounting(db);
  const issueLimit = Number(options.issueLimit || 10);
  const month = `${an}-${String(luna).padStart(2, "0")}`;
  const inMonth = (item) => Number(item.an) === Number(an) && Number(item.luna) === Number(luna);
  const invoiceInRest = (item) => round(item.neachitat ?? Number(item.total || 0) - Number(item.achitat || 0));
  const invoiceOutRest = (item) => round(item.neincasat ?? Number(item.total || 0) - Number(item.incasat || 0));
  const activeOrReceivableIn = accounting.invoicesIn.filter((item) => item.status !== "anulat" && item.status !== "stornat" && inMonth(item));
  const activeOrReceivableOut = accounting.invoicesOut.filter((item) => item.status !== "anulat" && item.status !== "stornat" && inMonth(item));
  const openIn = activeOrReceivableIn.filter((item) => ["validat", "partial"].includes(String(item.status || "")) && invoiceInRest(item) > 0);
  const openOut = activeOrReceivableOut.filter((item) => ["validat", "partial"].includes(String(item.status || "")) && invoiceOutRest(item) > 0);
  const openInWithRest = openIn.map((item) => ({ ...item, _rest: invoiceInRest(item) }));
  const openOutWithRest = openOut.map((item) => ({ ...item, _rest: invoiceOutRest(item) }));
  const overdueIn = openIn.filter((item) => item.data_scadenta && item.data_scadenta < today());
  const overdueOut = openOut.filter((item) => item.data_scadenta && item.data_scadenta < today());
  const draftInvoices = [
    ...activeOrReceivableIn.filter((item) => item.status === "draft").map((item) => ({ ...item, source: "intrare" })),
    ...activeOrReceivableOut.filter((item) => item.status === "draft").map((item) => ({ ...item, source: "iesire" }))
  ];
  const invoiceMissingJournal = [
    ...activeOrReceivableIn.filter((item) => ["validat", "partial", "achitat"].includes(String(item.status || "")) && !item.journal_id).map((item) => ({ ...item, source: "intrare" })),
    ...activeOrReceivableOut.filter((item) => ["validat", "partial", "incasat"].includes(String(item.status || "")) && !item.journal_id).map((item) => ({ ...item, source: "iesire" }))
  ];
  const treasury = accounting.treasury.filter((item) => item.status !== "anulat" && inMonth(item));
  const treasuryDraft = treasury.filter((item) => item.status === "draft");
  const treasuryUnlinked = treasury.filter((item) =>
    item.status === "validat" &&
    item.tert_id &&
    !item.invoice_in_id &&
    !item.invoice_out_id &&
    ["401", "4111"].some((prefix) => String(item.cont_corespondent || "").startsWith(prefix))
  );
  const journalIds = new Set(accounting.journalLines.map((line) => Number(line.journal_id)));
  const journals = accounting.journals.filter((item) => item.status !== "anulat" && Number(item.an) === Number(an) && Number(item.luna) === Number(luna));
  const unbalancedJournals = journals.filter((journal) => {
    if (!journalIds.has(Number(journal.id))) return false;
    return Math.abs(Number(journal.total_debit || 0) - Number(journal.total_credit || 0)) > 0.01;
  });
  const balance = engine.buildBalance(db, an, luna, "sintetica");
  const balanceDiff = round(Math.abs(Number(balance.totals?.rulaje_D || 0) - Number(balance.totals?.rulaje_C || 0)));
  const checks = [
    {
      key: "draft_documents",
      label: "Documente draft",
      severity: draftInvoices.length || treasuryDraft.length ? "warning" : "ok",
      value: draftInvoices.length + treasuryDraft.length,
      message: draftInvoices.length || treasuryDraft.length ? "Valideaza sau anuleaza documentele draft inainte de inchiderea lunii." : "Nu exista documente draft in luna selectata.",
      link: "/contabilitate/inchidere-luna"
    },
    {
      key: "open_suppliers",
      label: "Furnizori de platit",
      severity: overdueIn.length ? "danger" : openIn.length ? "warning" : "ok",
      value: formatReconciliationMoney(sum(openInWithRest, "_rest")),
      message: openIn.length ? `${openIn.length} facturi deschise, ${overdueIn.length} depasite.` : "Nu exista facturi furnizor deschise in luna selectata.",
      link: "/contabilitate/furnizori"
    },
    {
      key: "open_clients",
      label: "Clienti de incasat",
      severity: overdueOut.length ? "danger" : openOut.length ? "warning" : "ok",
      value: formatReconciliationMoney(sum(openOutWithRest, "_rest")),
      message: openOut.length ? `${openOut.length} facturi deschise, ${overdueOut.length} depasite.` : "Nu exista facturi client deschise in luna selectata.",
      link: "/contabilitate/clienti"
    },
    {
      key: "unlinked_treasury",
      label: "Trezorerie necorelata",
      severity: treasuryUnlinked.length ? "warning" : "ok",
      value: treasuryUnlinked.length,
      message: treasuryUnlinked.length ? "Exista plati/incasari pe terti fara factura legata. Verifica daca sunt avansuri sau corectii." : "Operatiile pe terti sunt corelate cu facturile disponibile.",
      link: "/contabilitate/trezorerie"
    },
    {
      key: "journal_consistency",
      label: "Note contabile",
      severity: unbalancedJournals.length || invoiceMissingJournal.length ? "danger" : "ok",
      value: unbalancedJournals.length + invoiceMissingJournal.length,
      message: unbalancedJournals.length || invoiceMissingJournal.length ? "Exista note dezechilibrate sau facturi validate fara nota contabila." : "Notele contabile sunt coerente pentru luna selectata.",
      link: "/contabilitate/registru-jurnal"
    },
    {
      key: "balance",
      label: "Balanta",
      severity: balance.balanced ? "ok" : "danger",
      value: formatReconciliationMoney(balanceDiff),
      message: balance.balanced ? "Balanta este echilibrata." : "Balanta are diferenta intre debit si credit.",
      link: `/contabilitate/balanta?luna=${month}`
    }
  ];
  return {
    month,
    status: checks.some((item) => item.severity === "danger") ? "danger" : checks.some((item) => item.severity === "warning") ? "warning" : "ok",
    checks,
    issues: {
      draft_invoices: draftInvoices.slice(0, issueLimit).map((item) => reconcileInvoiceRow(item, null, month)),
      draft_treasury: treasuryDraft.slice(0, issueLimit).map((item) => reconcileTreasuryRow(item, month)),
      open_suppliers: openInWithRest.sort((a, b) => b._rest - a._rest).slice(0, issueLimit).map((item) => reconcileInvoiceRow(item, item._rest, month)),
      open_clients: openOutWithRest.sort((a, b) => b._rest - a._rest).slice(0, issueLimit).map((item) => reconcileInvoiceRow(item, item._rest, month)),
      unlinked_treasury: treasuryUnlinked.slice(0, issueLimit).map((item) => reconcileTreasuryRow(item, month)),
      invoice_missing_journal: invoiceMissingJournal.slice(0, issueLimit).map((item) => reconcileInvoiceRow(item, null, month)),
      unbalanced_journals: unbalancedJournals.slice(0, issueLimit).map((item) => ({
        id: item.id,
        uuid: item.uuid,
        data: item.data,
        document: item.nr_document || item.id,
        difference: round(Number(item.total_debit || 0) - Number(item.total_credit || 0)),
        status: item.status,
        link: accountingLink("/contabilitate/registru-jurnal", { luna: month, note: item.uuid || item.id })
      }))
    }
  };
}

function flattenReconciliationIssues(reconciliation) {
  const issues = reconciliation.issues || {};
  return [
    ...(issues.draft_invoices || []).map((row) => ({ ...row, group: "Facturi draft", action: "Valideaza sau anuleaza factura." })),
    ...(issues.draft_treasury || []).map((row) => ({ ...row, group: "Trezorerie draft", action: "Valideaza operatia sau anuleaz-o." })),
    ...(issues.open_suppliers || []).map((row) => ({ ...row, group: "Furnizori de plata", action: "Plateste factura sau verifica scadenta." })),
    ...(issues.open_clients || []).map((row) => ({ ...row, group: "Clienti de incasat", action: "Incaseaza factura sau verifica scadenta." })),
    ...(issues.unlinked_treasury || []).map((row) => ({ ...row, group: "Trezorerie necorelata", action: "Leaga operatia de factura sau marcheaz-o ca avans/corectie." })),
    ...(issues.invoice_missing_journal || []).map((row) => ({ ...row, group: "Facturi fara nota", action: "Devalideaza si valideaza din nou documentul." })),
    ...(issues.unbalanced_journals || []).map((row) => ({ ...row, group: "Note dezechilibrate", action: "Corecteaza debitul si creditul notei." }))
  ].map((row) => ({
    ...row,
    amount: row.rest !== null && row.rest !== undefined
      ? formatReconciliationMoney(row.rest)
      : row.suma !== undefined
        ? formatReconciliationMoney(row.suma)
        : row.difference !== undefined
          ? formatReconciliationMoney(row.difference)
          : ""
  }));
}

function reconciliationStatusLabel(status) {
  return {
    ok: "OK",
    warning: "Atentie",
    danger: "Critic"
  }[String(status || "")] || String(status || "");
}

function absoluteAppLink(baseUrl, link) {
  if (!link) return "";
  if (/^https?:\/\//i.test(String(link))) return String(link);
  return `${baseUrl}${String(link).startsWith("/") ? "" : "/"}${link}`;
}

function addHyperlinks(sheet, rows, columnIndex) {
  rows.forEach((row, rowIndex) => {
    const value = row[columnIndex];
    if (!value || !/^https?:\/\//i.test(String(value))) return;
    const address = xlsx.utils.encode_cell({ r: rowIndex, c: columnIndex });
    if (sheet[address]) sheet[address].l = { Target: value, Tooltip: "Deschide in InfraFlow" };
  });
}

function accountingLink(path, params = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return query ? `${path}?${query}` : path;
}

function reconciliationDocumentSearch(item) {
  return item.nr_document || item.numar || item.uuid || item.id;
}

function reconcileInvoiceRow(item, rest = null, month = "") {
  const source = item.source || (item.furnizor_id ? "intrare" : "iesire");
  const document = item.nr_document || item.numar || item.id;
  return {
    id: item.id,
    uuid: item.uuid,
    source,
    data: item.data,
    scadenta: item.data_scadenta,
    document,
    total: item.total || 0,
    rest: rest === null ? null : rest,
    status: item.status,
    link: accountingLink(source === "intrare" ? "/contabilitate/facturi-intrare" : "/contabilitate/facturi-iesire", {
      luna: month,
      status: item.status,
      q: reconciliationDocumentSearch(item)
    })
  };
}

function reconcileTreasuryRow(item, month = "") {
  const document = item.nr_document || item.id;
  return {
    id: item.id,
    uuid: item.uuid,
    data: item.data,
    document,
    tip: item.tip,
    operatie: item.tip_operatie,
    suma: item.suma || 0,
    status: item.status,
    link: accountingLink("/contabilitate/trezorerie", {
      luna: month,
      status: item.status,
      q: item.nr_document || item.uuid || item.id
    })
  };
}

function formatReconciliationMoney(value) {
  return `${round(value).toFixed(2)} RON`;
}

function getJournalTemplates(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const source = String(query.source || "").trim();
  const custom = accounting.journalTemplates.map((item) => ({ ...item, system: false }));
  const byKey = new Map(JOURNAL_TEMPLATES.map((item) => [item.key, { ...item, system: true, activ: true }]));
  custom.forEach((item) => byKey.set(item.key, item));
  return Array.from(byKey.values())
    .filter((item) => item.activ !== false)
    .filter((item) => !source || item.source === source)
    .sort((a, b) => String(a.source).localeCompare(String(b.source), "ro") || String(a.label).localeCompare(String(b.label), "ro"));
}

function normalizeJournalTemplate(body) {
  const key = String(body.key || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_").toLowerCase();
  const source = String(body.source || "").trim();
  if (!["intrare", "iesire"].includes(source)) throwHttp(400, "Tipul sablonului trebuie sa fie intrare sau iesire.");
  const label = String(body.label || "").trim();
  if (!label) throwHttp(400, "Denumirea sablonului este obligatorie.");
  const mainAccount = String(body.main_account || "").trim();
  const lineAccount = String(body.line_account || mainAccount).trim();
  if (!mainAccount || !lineAccount) throwHttp(400, "Contul principal si contul liniei sunt obligatorii.");
  return {
    id: body.id || null,
    key,
    source,
    label,
    description: String(body.description || "").trim(),
    main_account: mainAccount,
    line_account: lineAccount,
    vat_account: String(body.vat_account || (source === "intrare" ? "4426" : "4427")).trim(),
    party_account: String(body.party_account || (source === "intrare" ? "401.x" : "4111.x")).trim(),
    preview: String(body.preview || (source === "intrare" ? `${lineAccount} + 4426 = 401.x` : `4111.x = ${lineAccount} + 4427`)).trim(),
    activ: body.activ !== false
  };
}

function buildGeneralLedger(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const deLa = String(query.de_la || "").trim();
  const panaLa = String(query.pana_la || "").trim();
  const clasa = String(query.clasa || "").trim();
  const q = String(query.q || "").trim().toLowerCase();
  const onlyWithValues = String(query.only_with_values ?? "true") !== "false";
  const accounts = accounting.chart
    .filter((account) => account.activ !== false)
    .filter((account) => !clasa || String(account.simbol || "").startsWith(clasa))
    .filter((account) => !q || `${account.simbol || ""} ${account.denumire || ""}`.toLowerCase().includes(q))
    .map((account) => {
      const ledger = engine.ledger(db, account.simbol, deLa, panaLa);
      return {
        simbol: account.simbol,
        denumire: account.denumire || ledger.denumire || "",
        tip: account.tip || ledger.tip || "",
        clasa: account.clasa || String(account.simbol || "0")[0],
        sold_initial: ledger.sold_initial || 0,
        total_debit: ledger.total_debit || 0,
        total_credit: ledger.total_credit || 0,
        sold_final: ledger.sold_final || 0,
        movements_count: ledger.movements.length,
        movements: ledger.movements
      };
    })
    .filter((row) => !onlyWithValues || row.movements_count > 0 || Math.abs(row.sold_initial) > 0.009 || Math.abs(row.sold_final) > 0.009)
    .sort((a, b) => String(a.simbol).localeCompare(String(b.simbol), "ro"));
  const totals = accounts.reduce((acc, row) => {
    ["sold_initial", "total_debit", "total_credit", "sold_final", "movements_count"].forEach((key) => {
      acc[key] = round((acc[key] || 0) + Number(row[key] || 0));
    });
    return acc;
  }, {});
  totals.balanced = Math.abs(round((totals.sold_initial || 0) + (totals.total_debit || 0) - (totals.total_credit || 0) - (totals.sold_final || 0))) <= 0.01;
  return {
    perioada: { de_la: deLa, pana_la: panaLa },
    filters: { clasa, q, only_with_values: onlyWithValues },
    accounts,
    totals
  };
}

function buildProfitLoss(db, query = {}) {
  const [defaultAn, defaultLuna] = monthParts(currentMonth());
  const an = Number(query.an || defaultAn);
  const luna = Number(query.luna || defaultLuna);
  const endDate = monthEndDate(an, luna);
  const tip = query.tip || "analitica";
  const balance = engine.buildBalance(db, an, luna, tip);
  const mapRow = (row, kind) => {
    const debit = round(row.rulaje_D || 0);
    const credit = round(row.rulaje_C || 0);
    const valoare = kind === "venituri" ? round(credit - debit) : round(debit - credit);
    return {
      cont: row.cont,
      denumire: row.denumire || "",
      debit,
      credit,
      valoare,
      link: accountingLink(`/contabilitate/fisa-cont/${row.cont}`, {
        de_la: `${an}-01-01`,
        pana_la: endDate
      })
    };
  };
  const venituri = balance.rows
    .filter((row) => String(row.cont || "").startsWith("7"))
    .map((row) => mapRow(row, "venituri"))
    .filter((row) => Math.abs(row.valoare) > 0.009 || row.debit || row.credit);
  const cheltuieli = balance.rows
    .filter((row) => String(row.cont || "").startsWith("6"))
    .map((row) => mapRow(row, "cheltuieli"))
    .filter((row) => Math.abs(row.valoare) > 0.009 || row.debit || row.credit);
  const totalVenituri = round(venituri.reduce((sum, row) => sum + row.valoare, 0));
  const totalCheltuieli = round(cheltuieli.reduce((sum, row) => sum + row.valoare, 0));
  return {
    perioada: { an, luna, de_la: `${an}-01-01`, pana_la: endDate },
    tip,
    venituri,
    cheltuieli,
    totals: {
      venituri: totalVenituri,
      cheltuieli: totalCheltuieli,
      rezultat: round(totalVenituri - totalCheltuieli),
      profit: totalVenituri >= totalCheltuieli
    }
  };
}

function monthEndDate(an, luna) {
  return engine.localDate(new Date(Number(an), Number(luna), 0));
}

function normalizeOpeningBalances(db, rows, an) {
  const accounting = engine.ensureAccounting(db);
  if (!Array.isArray(rows)) throwHttp(400, "Lista soldurilor initiale este obligatorie.");
  const accounts = new Map(accounting.chart
    .filter((account) => account.activ !== false)
    .map((account) => [String(account.simbol), account]));
  const seen = new Set();
  return rows.map((row, index) => {
    const cont = String(row.cont_simbol || row.cont || "").trim();
    const debit = round(row.debit || 0);
    const credit = round(row.credit || 0);
    if (!cont && debit === 0 && credit === 0) return null;
    if (!cont) throwHttp(400, `Linia ${index + 1}: cont lipsa.`);
    if (!accounts.has(cont)) throwHttp(422, `Linia ${index + 1}: contul ${cont} nu exista in planul de conturi.`);
    if (seen.has(cont)) throwHttp(422, `Linia ${index + 1}: contul ${cont} este introdus de doua ori.`);
    seen.add(cont);
    if (debit < 0 || credit < 0) throwHttp(422, `Linia ${index + 1}: soldurile nu pot fi negative.`);
    if (debit > 0 && credit > 0) throwHttp(422, `Linia ${index + 1}: completeaza sold debit sau sold credit, nu ambele.`);
    if (debit === 0 && credit === 0) return null;
    return {
      an: Number(an),
      cont_simbol: cont,
      debit,
      credit,
      observatii: String(row.observatii || "").trim()
    };
  }).filter(Boolean);
}

function decorateOpeningBalance(row, accounting) {
  const account = accounting.chart.find((item) => item.simbol === row.cont_simbol) || {};
  return {
    ...row,
    denumire_cont: account.denumire || "",
    tip: account.tip || "",
    clasa: Number(account.clasa || String(row.cont_simbol || "0")[0] || 0)
  };
}

function openingBalanceTotals(rows) {
  const debit = round(rows.reduce((sum, row) => sum + Number(row.debit || 0), 0));
  const credit = round(rows.reduce((sum, row) => sum + Number(row.credit || 0), 0));
  return {
    debit,
    credit,
    diferenta: round(debit - credit),
    balanced: Math.abs(debit - credit) <= 0.01,
    count: rows.length
  };
}

function findByUuid(items, uuid, message) {
  const item = items.find((row) => row.uuid === uuid || String(row.id) === String(uuid));
  if (!item) throwHttp(404, message);
  return item;
}

function monthParts(value) {
  const [an, luna] = String(value || currentMonth()).split("-").map(Number);
  return [an || new Date().getFullYear(), luna || new Date().getMonth() + 1];
}

function dateParts(value) {
  const date = String(value || today());
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
}

function currentMonth() {
  return today().slice(0, 7);
}

function today() {
  return engine.localDate(new Date());
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return engine.localDate(date);
}

function sum(items, key) {
  return round(items.reduce((acc, item) => acc + Number(item[key] || 0), 0));
}

function round(value) {
  return engine.money(value);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cryptoId() {
  return require("crypto").randomUUID ? require("crypto").randomUUID() : require("crypto").randomBytes(16).toString("hex");
}

function sendJson(res, status, data) {
  res.status(status).json(data);
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

module.exports = router;

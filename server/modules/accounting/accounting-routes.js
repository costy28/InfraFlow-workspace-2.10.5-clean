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
    const treasury = createTreasury(req.auth.db, req.auth.user, {
      ...(req.body || {}),
      tip: "banca",
      tip_operatie: "plata",
      tert_id: invoice.furnizor_id,
      cont_corespondent: thirdParty(req.auth.db, invoice.furnizor_id).cont_analitic_furnizor,
      suma: Number(req.body?.suma || invoice.total - Number(invoice.achitat || 0)),
      data: req.body?.data || today(),
      explicatie: `Plata factura ${invoice.nr_document}`
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
    const treasury = createTreasury(req.auth.db, req.auth.user, {
      ...(req.body || {}),
      tip: "banca",
      tip_operatie: "incasare",
      tert_id: invoice.client_id,
      cont_corespondent: thirdParty(req.auth.db, invoice.client_id).cont_analitic_client,
      suma: Number(req.body?.suma || invoice.total - Number(invoice.incasat || 0)),
      data: req.body?.data || today(),
      explicatie: `Incasare factura ${invoice.numar || ""}`.trim()
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
    engine.checkPeriodOpen(req.auth.db, treasury.an, treasury.luna);
    addAudit(req.auth.db, req.auth.user, "accounting_treasury_update", `${treasury.tip_operatie} ${treasury.suma}`);
    writeDb(req.auth.db);
    sendJson(res, 200, { treasury });
  } catch (error) { next(error); }
});

router.post("/accounting/treasury/:uuid/validate", requireAccountingPost, (req, res, next) => {
  try {
    const treasury = findByUuid(engine.ensureAccounting(req.auth.db).treasury, req.params.uuid, "Operatia nu a fost gasita.");
    if (treasury.status !== "draft") throwHttp(409, "Operatia nu este in draft.");
    engine.checkPeriodOpen(req.auth.db, treasury.an, treasury.luna);
    const journal = engine.generateJournalFromTreasury(req.auth.db, req.auth.user, treasury);
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

router.get("/accounting/clients-status", requireAccountingView, (req, res) => {
  sendJson(res, 200, thirdPartyStatus(req.auth.db, "client"));
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
    explicatie: String(body.explicatie ?? existing.explicatie ?? "").trim(),
    updated_at: new Date().toISOString()
  };
  if (treasury.suma <= 0) throwHttp(400, "Suma trebuie sa fie pozitiva.");
  return treasury;
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
  addAudit(db, user, "accounting_treasury_devalidate", `${treasury.tip_operatie} ${treasury.suma} / nota ${journal.id}`);
  return treasury;
}

function decorateTreasury(row, accounting) {
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
    return {
      ...tert,
      sold,
      total_facturat: total,
      total_achitat: paid,
      facturi: invoices.length,
      scadente_depasite: invoices.filter((item) => Number(item[balanceKey] ?? item.total - Number(item[paidKey] || 0)) > 0 && item.data_scadenta < today()).length
    };
  });
  return { rows };
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

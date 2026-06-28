const crypto = require("crypto");
const xlsx = require("xlsx");
const engine = require("./accounting-engine");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

function registerSettlementRoutes(router, middleware) {
  const { requireAccountingView, requireAccountingPost, requireAccountingReports } = middleware;

  router.get("/accounting/settlements", requireAccountingView, (req, res) => {
    const accounting = engine.ensureAccounting(req.auth.db);
    const rows = accounting.settlements
      .filter((item) => !req.query.treasury_id || String(item.treasury_id) === String(req.query.treasury_id))
      .filter((item) => !req.query.tert_id || String(item.tert_id) === String(req.query.tert_id))
      .filter((item) => req.query.status ? item.status === req.query.status : item.status !== "anulat")
      .map((item) => decorateSettlement(accounting, item))
      .sort((a, b) => String(b.data || b.created_at || "").localeCompare(String(a.data || a.created_at || "")));
    res.status(200).json({ settlements: rows, totals: settlementTotals(rows) });
  });

  router.get("/accounting/treasury/:uuid/settlement-preview", requireAccountingView, (req, res, next) => {
    try {
      res.status(200).json(buildSettlementPreview(req.auth.db, req.params.uuid));
    } catch (error) { next(error); }
  });

  router.post("/accounting/treasury/:uuid/allocate", requireAccountingPost, (req, res, next) => {
    try {
      const result = allocateTreasury(req.auth.db, req.auth.user, req.params.uuid, req.body || {});
      addAudit(req.auth.db, req.auth.user, "accounting_treasury_allocate", `${result.treasury.nr_document || result.treasury.id} / ${result.total} / ${result.settlements.length} facturi`);
      writeDb(req.auth.db);
      res.status(201).json(result);
    } catch (error) { next(error); }
  });

  router.post("/accounting/settlement-groups/:groupUuid/reverse", requireAccountingPost, (req, res, next) => {
    try {
      const result = reverseSettlementGroup(req.auth.db, req.auth.user, req.params.groupUuid, req.body?.motiv);
      addAudit(req.auth.db, req.auth.user, "accounting_settlement_reverse", `${req.params.groupUuid} / ${result.total}`);
      writeDb(req.auth.db);
      res.status(200).json(result);
    } catch (error) { next(error); }
  });

  router.get("/accounting/settlements/export", requireAccountingReports, (req, res, next) => {
    try {
      const accounting = engine.ensureAccounting(req.auth.db);
      const rows = accounting.settlements
        .filter((item) => !req.query.tert_id || String(item.tert_id) === String(req.query.tert_id))
        .filter((item) => !req.query.an || Number(item.an) === Number(req.query.an))
        .filter((item) => !req.query.luna || Number(item.luna) === Number(req.query.luna))
        .filter((item) => item.status !== "anulat")
        .map((item) => decorateSettlement(accounting, item));
      const workbook = xlsx.utils.book_new();
      const sheet = xlsx.utils.aoa_to_sheet([
        ["Registru stingeri facturi", req.query.an || "", req.query.luna || ""], [],
        ["Data", "Tert", "Plata", "Factura", "Suma alocata", "Sursa", "Nota contabila", "Status"],
        ...rows.map((row) => [row.data, row.tert_denumire, row.treasury_document, row.invoice_document, row.suma, row.source_type, row.journal_id ? `NC ${row.journal_id}` : "", row.status])
      ]);
      sheet["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }];
      xlsx.utils.book_append_sheet(workbook, sheet, "Stingeri");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=Stingeri_facturi_${req.query.an || "toate"}_${req.query.luna || ""}.xlsx`);
      res.end(buffer);
    } catch (error) { next(error); }
  });
}

function buildSettlementPreview(db, treasuryId) {
  const accounting = engine.ensureAccounting(db);
  const treasury = findTreasury(accounting, treasuryId);
  const active = activeTreasurySettlements(accounting, treasury.id);
  const allocated = money(active.reduce((sum, item) => sum + Number(item.suma || 0), 0));
  const available = money(Math.max(0, Number(treasury.suma || 0) - allocated));
  const isSupplier = treasury.tip_operatie === "plata";
  const source = isSupplier ? accounting.invoicesIn : accounting.invoicesOut;
  const partyKey = isSupplier ? "furnizor_id" : "client_id";
  const invoices = source
    .filter((item) => String(item[partyKey]) === String(treasury.tert_id))
    .filter((item) => ["validat", "partial"].includes(String(item.status || "")))
    .map((item) => ({
      id: item.id,
      uuid: item.uuid,
      document: invoiceDocument(item),
      data: item.data || "",
      data_scadenta: item.data_scadenta || "",
      total: money(item.total),
      rest: invoiceRemaining(item, isSupplier ? "intrare" : "iesire")
    }))
    .filter((item) => item.rest > 0)
    .sort((a, b) => String(a.data_scadenta || a.data).localeCompare(String(b.data_scadenta || b.data)));
  return {
    treasury: { ...treasury, allocated_total: allocated, available_total: available },
    settlements: active.map((item) => decorateSettlement(accounting, item)),
    invoices,
    totals: { operation: money(treasury.suma), allocated, available, invoices_open: invoices.length, invoices_balance: money(invoices.reduce((sum, item) => sum + item.rest, 0)) }
  };
}

function allocateTreasury(db, user, treasuryId, body) {
  const accounting = engine.ensureAccounting(db);
  const treasury = findTreasury(accounting, treasuryId);
  if (treasury.status !== "validat") throwHttp(409, "Doar operatiile validate pot fi alocate pe facturi.");
  if (treasury.invoice_in_id || treasury.invoice_out_id) throwHttp(409, "Operatia este deja legata direct de o factura. Devalideaz-o pentru a folosi alocarea multipla.");
  if (!treasury.tert_id) throwHttp(422, "Operatia trebuie sa aiba un tert inainte de alocare.");
  engine.checkPeriodOpen(db, treasury.an, treasury.luna);

  const requested = normalizeAllocations(body.allocations);
  if (!requested.length) throwHttp(422, "Selecteaza cel putin o factura si completeaza suma alocata.");
  const existing = activeTreasurySettlements(accounting, treasury.id);
  const alreadyAllocated = money(existing.reduce((sum, item) => sum + Number(item.suma || 0), 0));
  const available = money(Number(treasury.suma || 0) - alreadyAllocated);
  const total = money(requested.reduce((sum, item) => sum + item.suma, 0));
  if (total > available + 0.01) throwHttp(422, `Alocarea depaseste suma disponibila a operatiei: ${available.toFixed(2)} RON.`);

  const isSupplier = treasury.tip_operatie === "plata";
  const invoices = isSupplier ? accounting.invoicesIn : accounting.invoicesOut;
  const idKey = isSupplier ? "invoice_in_id" : "invoice_out_id";
  const partyKey = isSupplier ? "furnizor_id" : "client_id";
  const selected = requested.map((allocation) => {
    const invoice = invoices.find((item) => String(item.id) === String(allocation.invoice_id) || String(item.uuid) === String(allocation.invoice_id));
    if (!invoice) throwHttp(404, `Factura ${allocation.invoice_id} nu a fost gasita.`);
    if (String(invoice[partyKey]) !== String(treasury.tert_id)) throwHttp(409, "Toate facturile alocate trebuie sa apartina tertului operatiei.");
    if (!["validat", "partial"].includes(String(invoice.status || ""))) throwHttp(409, `Factura ${invoiceDocument(invoice)} nu este disponibila pentru stingere.`);
    const rest = invoiceRemaining(invoice, isSupplier ? "intrare" : "iesire");
    if (allocation.suma > rest + 0.01) throwHttp(422, `Alocarea pentru factura ${invoiceDocument(invoice)} depaseste restul de ${rest.toFixed(2)} RON.`);
    return { ...allocation, invoice };
  });

  const groupUuid = crypto.randomUUID();
  const transferJournal = createAdvanceTransferJournal(db, user, treasury, selected, isSupplier, total);
  const createdAt = new Date().toISOString();
  const settlements = selected.map(({ invoice, suma }) => {
    applyInvoiceSettlement(invoice, suma, isSupplier);
    const row = {
      id: engine.nextNumericId(accounting.settlements),
      uuid: crypto.randomUUID(),
      group_uuid: groupUuid,
      treasury_id: treasury.id,
      treasury_uuid: treasury.uuid,
      [idKey]: invoice.id,
      tert_id: treasury.tert_id,
      an: Number(treasury.an),
      luna: Number(treasury.luna),
      data: body.data || treasury.data,
      suma,
      source_type: String(treasury.corelare_tip || "").toLowerCase() === "avans" ? "avans" : "plata",
      journal_id: transferJournal?.id || null,
      status: "activ",
      created_by: user?.id || "",
      created_by_name: user?.name || "",
      created_at: createdAt,
      observatii: String(body.observatii || "").trim()
    };
    accounting.settlements.push(row);
    return row;
  });
  const allocatedTotal = money(alreadyAllocated + total);
  treasury.allocated_total = allocatedTotal;
  treasury.available_total = money(Math.max(0, Number(treasury.suma || 0) - allocatedTotal));
  treasury.corelare_tip = treasury.available_total <= 0.01 ? "factura" : "avans";
  treasury.corelare_observatii = treasury.available_total <= 0.01
    ? `Stinsa integral prin ${activeTreasurySettlements(accounting, treasury.id).length} alocari.`
    : `Alocata partial; rest avans ${treasury.available_total.toFixed(2)} RON.`;
  treasury.updated_at = createdAt;
  return { group_uuid: groupUuid, treasury, settlements: settlements.map((item) => decorateSettlement(accounting, item)), journal: transferJournal, total, available: treasury.available_total };
}

function reverseSettlementGroup(db, user, groupUuid, reason = "") {
  const accounting = engine.ensureAccounting(db);
  const rows = accounting.settlements.filter((item) => item.group_uuid === groupUuid && item.status === "activ");
  if (!rows.length) throwHttp(404, "Grupul de stingeri active nu a fost gasit.");
  engine.checkPeriodOpen(db, rows[0].an, rows[0].luna);
  const journalId = rows.find((item) => item.journal_id)?.journal_id;
  const journal = journalId ? engine.stornoJournal(db, user, journalId) : null;
  const treasury = findTreasury(accounting, rows[0].treasury_id);
  let total = 0;
  rows.forEach((row) => {
    const isSupplier = Boolean(row.invoice_in_id);
    const source = isSupplier ? accounting.invoicesIn : accounting.invoicesOut;
    const invoiceId = isSupplier ? row.invoice_in_id : row.invoice_out_id;
    const invoice = source.find((item) => String(item.id) === String(invoiceId));
    if (invoice) reverseInvoiceSettlement(invoice, row.suma, isSupplier);
    row.status = "anulat";
    row.cancelled_by = user?.id || "";
    row.cancelled_by_name = user?.name || "";
    row.cancelled_at = new Date().toISOString();
    row.cancelled_reason = String(reason || "Corectie alocare").trim();
    total = money(total + Number(row.suma || 0));
  });
  const remainingActive = activeTreasurySettlements(accounting, treasury.id);
  const allocated = money(remainingActive.reduce((sum, item) => sum + Number(item.suma || 0), 0));
  treasury.allocated_total = allocated;
  treasury.available_total = money(Math.max(0, Number(treasury.suma || 0) - allocated));
  treasury.corelare_tip = allocated > 0 ? (treasury.available_total <= 0.01 ? "factura" : "avans") : "avans";
  treasury.corelare_observatii = allocated > 0 ? `Alocata partial; rest ${treasury.available_total.toFixed(2)} RON.` : "Alocarile au fost anulate; operatia ramane avans nestins.";
  treasury.updated_at = new Date().toISOString();
  return { group_uuid: groupUuid, treasury, settlements: rows.map((item) => decorateSettlement(accounting, item)), journal, total };
}

function createAdvanceTransferJournal(db, user, treasury, selected, isSupplier, total) {
  const correspondent = String(treasury.cont_corespondent || "");
  const needsTransfer = isSupplier ? correspondent.startsWith("409") : correspondent.startsWith("419");
  if (!needsTransfer) return null;
  const accounting = engine.ensureAccounting(db);
  const tert = accounting.thirdParties.find((item) => String(item.id) === String(treasury.tert_id)) || {};
  const partyAccount = isSupplier ? (tert.cont_analitic_furnizor || "401") : (tert.cont_analitic_client || "4111");
  const lines = isSupplier
    ? [...selected.map(({ invoice, suma }) => ({ cont: partyAccount, debit: suma, tert_id: tert.id, tert_tip: "furnizor", explicatie: `Stingere ${invoiceDocument(invoice)}` })), { cont: correspondent, credit: total, tert_id: tert.id, tert_tip: "furnizor", explicatie: "Regularizare avans furnizor" }]
    : [{ cont: correspondent, debit: total, tert_id: tert.id, tert_tip: "client", explicatie: "Regularizare avans client" }, ...selected.map(({ invoice, suma }) => ({ cont: partyAccount, credit: suma, tert_id: tert.id, tert_tip: "client", explicatie: `Stingere ${invoiceDocument(invoice)}` }))];
  return engine.createJournal(db, user, {
    an: treasury.an, luna: treasury.luna, data: treasury.data,
    nr_document: `STING-${treasury.nr_document || treasury.id}`,
    tip_document: "stingere_avans", document_ref_id: treasury.id, document_ref_tip: "accounting_treasury",
    explicatie: `Stingere avans ${tert.denumire || treasury.tert_id}`, lines
  });
}

function applyInvoiceSettlement(invoice, amount, isSupplier) {
  if (isSupplier) {
    invoice.achitat = money(Number(invoice.achitat || 0) + amount);
    invoice.neachitat = invoiceRemaining(invoice, "intrare");
    invoice.status = invoice.neachitat <= 0 ? (Number(invoice.credit_total || 0) >= Number(invoice.total || 0) - 0.01 ? "creditata" : "achitat") : "partial";
  } else {
    invoice.incasat = money(Number(invoice.incasat || 0) + amount);
    invoice.neincasat = invoiceRemaining(invoice, "iesire");
    invoice.status = invoice.neincasat <= 0 ? "incasat" : "partial";
  }
  invoice.updated_at = new Date().toISOString();
}

function reverseInvoiceSettlement(invoice, amount, isSupplier) {
  if (isSupplier) {
    invoice.achitat = money(Math.max(0, Number(invoice.achitat || 0) - Number(amount || 0)));
    invoice.neachitat = invoiceRemaining(invoice, "intrare");
    invoice.status = invoice.neachitat <= 0 ? (Number(invoice.credit_total || 0) >= Number(invoice.total || 0) - 0.01 ? "creditata" : "achitat") : (invoice.achitat > 0 ? "partial" : "validat");
  } else {
    invoice.incasat = money(Math.max(0, Number(invoice.incasat || 0) - Number(amount || 0)));
    invoice.neincasat = invoiceRemaining(invoice, "iesire");
    invoice.status = invoice.neincasat <= 0 ? "incasat" : (invoice.incasat > 0 ? "partial" : "validat");
  }
  invoice.updated_at = new Date().toISOString();
}

function invoiceRemaining(invoice, type) {
  if (type === "intrare") return money(Math.max(0, Number(invoice.total || 0) - Number(invoice.credit_total || 0) - Number(invoice.achitat || 0)));
  return money(Math.max(0, Number(invoice.total || 0) - Number(invoice.incasat || 0)));
}

function normalizeAllocations(rows) {
  const grouped = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const invoiceId = row.invoice_id ?? row.invoice_in_id ?? row.invoice_out_id;
    const amount = money(row.suma ?? row.amount);
    if (invoiceId === undefined || invoiceId === null || invoiceId === "" || amount <= 0) return;
    grouped.set(String(invoiceId), money((grouped.get(String(invoiceId)) || 0) + amount));
  });
  return [...grouped.entries()].map(([invoice_id, suma]) => ({ invoice_id, suma }));
}

function activeTreasurySettlements(accounting, treasuryId) {
  return accounting.settlements.filter((item) => String(item.treasury_id) === String(treasuryId) && item.status === "activ");
}

function findTreasury(accounting, id) {
  const row = accounting.treasury.find((item) => String(item.id) === String(id) || String(item.uuid) === String(id));
  if (!row) throwHttp(404, "Operatia de trezorerie nu a fost gasita.");
  return row;
}

function decorateSettlement(accounting, row) {
  const treasury = accounting.treasury.find((item) => String(item.id) === String(row.treasury_id));
  const invoice = row.invoice_in_id
    ? accounting.invoicesIn.find((item) => String(item.id) === String(row.invoice_in_id))
    : accounting.invoicesOut.find((item) => String(item.id) === String(row.invoice_out_id));
  const tert = accounting.thirdParties.find((item) => String(item.id) === String(row.tert_id));
  return { ...row, treasury_document: treasury?.nr_document || treasury?.id || "", invoice_document: invoice ? invoiceDocument(invoice) : "", tert_denumire: tert?.denumire || "" };
}

function settlementTotals(rows) {
  return { count: rows.length, total: money(rows.reduce((sum, item) => sum + Number(item.suma || 0), 0)), groups: new Set(rows.map((item) => item.group_uuid)).size };
}

function invoiceDocument(invoice) { return invoice.nr_document || invoice.numar || `ID ${invoice.id}`; }
function money(value) { return engine.money(value); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = registerSettlementRoutes;
module.exports.buildSettlementPreview = buildSettlementPreview;
module.exports.allocateTreasury = allocateTreasury;
module.exports.reverseSettlementGroup = reverseSettlementGroup;
module.exports.invoiceRemaining = invoiceRemaining;

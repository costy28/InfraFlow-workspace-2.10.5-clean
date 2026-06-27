const xlsx = require("xlsx");
const engine = require("./accounting-engine");

function registerDeclarationRoutes(router, { requireAccountingReports }) {
  router.get("/accounting/declarations/readiness", requireAccountingReports, (req, res) => {
    const data = buildDeclarationReadiness(req.auth.db, req.query);
    res.status(200).json(data);
  });

  router.get("/accounting/d394", requireAccountingReports, (req, res) => {
    res.status(200).json(buildD394Data(req.auth.db, req.query));
  });

  router.get("/accounting/d394/export", requireAccountingReports, (req, res, next) => {
    try {
      const data = buildD394Data(req.auth.db, req.query);
      const rows = [
        ["Pregatire D394", data.perioada, "Document intern de lucru"],
        ["Status", data.ready ? "Pregatit pentru verificare" : "Necesita verificari"],
        [],
        ["CUI", "Denumire tert", "Tip", "Nr. documente", "Baza", "TVA", "Total"],
        ...data.terti.map((row) => [row.cui, row.denumire, row.tip, row.documente, row.baza, row.tva, row.total]),
        [],
        ["TOTAL", "", "", data.totaluri.documente, data.totaluri.baza, data.totaluri.tva, data.totaluri.total]
      ];
      const workbook = xlsx.utils.book_new();
      const sheet = xlsx.utils.aoa_to_sheet(rows);
      sheet["!cols"] = [{ wch: 18 }, { wch: 42 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      sheet["!autofilter"] = { ref: `A4:G${Math.max(4, 3 + data.terti.length)}` };
      sheet["!freeze"] = { xSplit: 0, ySplit: 4 };
      xlsx.utils.book_append_sheet(workbook, sheet, "D394 lucru");

      if (data.warnings.length) {
        const warningSheet = xlsx.utils.aoa_to_sheet([
          ["Verificari necesare"],
          [],
          ["Mesaj"],
          ...data.warnings.map((message) => [message])
        ]);
        warningSheet["!cols"] = [{ wch: 100 }];
        xlsx.utils.book_append_sheet(workbook, warningSheet, "Verificari");
      }

      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="D394_lucru_${data.perioada.replace("-", "_")}.xlsx"`);
      res.end(buffer);
    } catch (error) {
      next(error);
    }
  });
}

function buildDeclarationReadiness(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(query.perioada || query.luna);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const inMonth = (item) => Number(item.an) === an && Number(item.luna) === luna && !["anulat", "stornat"].includes(String(item.status || ""));
  const invoices = [...accounting.invoicesIn.filter(inMonth), ...accounting.invoicesOut.filter(inMonth)];
  const drafts = invoices.filter((item) => item.status === "draft");
  const period = accounting.periods.find((item) => Number(item.an) === an && Number(item.luna) === luna) || { an, luna, status: "deschisa" };
  const d394 = buildD394Data(db, { perioada });
  const checks = [
    {
      key: "documents",
      label: "Documente validate",
      ok: drafts.length === 0,
      message: drafts.length ? `${drafts.length} facturi sunt inca draft.` : "Nu exista facturi draft in perioada."
    },
    {
      key: "vat",
      label: "TVA verificat",
      ok: Boolean(period.tva_verificat_la),
      message: period.tva_verificat_la ? "TVA-ul perioadei a fost verificat." : "TVA-ul trebuie verificat din pagina TVA / D300."
    },
    {
      key: "d394_partners",
      label: "Terti D394",
      ok: d394.ready,
      message: d394.ready ? `${d394.terti.length} terti sunt pregatiti pentru verificare.` : d394.warnings[0]
    },
    {
      key: "period",
      label: "Status perioada",
      ok: ["inchisa", "depusa"].includes(period.status),
      message: ["inchisa", "depusa"].includes(period.status) ? `Perioada este ${period.status}.` : "Inchiderea lunii ramane pasul final inainte de depunere."
    }
  ];
  return {
    perioada,
    period,
    status: checks.every((item) => item.ok) ? "ready" : "needs_attention",
    checks,
    declarations: [
      { code: "D300", status: drafts.length === 0 && period.tva_verificat_la ? "pregatit" : "in_lucru", description: "Decont TVA din jurnalele de cumparari si vanzari." },
      { code: "D394", status: d394.ready ? "pregatit" : "in_lucru", description: "Operatiuni interne grupate pe tert si CUI." },
      { code: "D406 / SAF-T", status: "neconfigurat", description: "Necesita maparea completa a nomenclatoarelor si schema ANAF aplicabila." }
    ]
  };
}

function buildD394Data(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(query.perioada || query.luna);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const acceptedStatuses = new Set(["validat", "partial", "achitat", "incasat"]);
  const groups = new Map();
  const missing = [];

  addInvoices(accounting.invoicesIn, "achizitie", "furnizor_id");
  addInvoices(accounting.invoicesOut, "livrare", "client_id");

  function addInvoices(invoices, tip, partyKey) {
    invoices
      .filter((item) => Number(item.an) === an && Number(item.luna) === luna && acceptedStatuses.has(String(item.status || "")))
      .forEach((invoice) => {
        const tert = accounting.thirdParties.find((item) => String(item.id) === String(invoice[partyKey]));
        const cui = normalizeCui(tert?.cui || tert?.cif || "");
        if (!tert || !cui) {
          missing.push(`${tip === "achizitie" ? "Factura furnizor" : "Factura client"} ${invoice.nr_document || invoice.numar || invoice.id} nu are tert cu CUI completat.`);
          return;
        }
        const key = `${tip}:${cui}`;
        const row = groups.get(key) || {
          cui,
          denumire: tert.denumire || tert.nume || "Tert",
          tip,
          documente: 0,
          baza: 0,
          tva: 0,
          total: 0
        };
        row.documente += 1;
        row.baza = money(row.baza + Number(invoice.valoare || 0));
        row.tva = money(row.tva + Number(invoice.tva || 0));
        row.total = money(row.total + Number(invoice.total || 0));
        groups.set(key, row);
      });
  }

  const terti = [...groups.values()].sort((a, b) => a.cui.localeCompare(b.cui, "ro", { numeric: true }) || a.tip.localeCompare(b.tip));
  return {
    perioada,
    ready: missing.length === 0,
    warnings: [...new Set(missing)],
    terti,
    totaluri: {
      documente: terti.reduce((sum, row) => sum + row.documente, 0),
      baza: money(terti.reduce((sum, row) => sum + row.baza, 0)),
      tva: money(terti.reduce((sum, row) => sum + row.tva, 0)),
      total: money(terti.reduce((sum, row) => sum + row.total, 0))
    }
  };
}

function monthParts(value) {
  const current = new Date();
  const [year, month] = String(value || "").split("-").map(Number);
  return [year || current.getFullYear(), month || current.getMonth() + 1];
}

function normalizeCui(value) {
  return String(value || "").trim().toUpperCase().replace(/^RO/, "").replace(/\s+/g, "");
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

module.exports = registerDeclarationRoutes;
module.exports.buildD394Data = buildD394Data;
module.exports.buildDeclarationReadiness = buildDeclarationReadiness;

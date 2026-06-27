const xlsx = require("xlsx");
const engine = require("./accounting-engine");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

function registerDeclarationRoutes(router, { requireAccountingReports, requireAccountingPost }) {
  router.get("/accounting/declarations/readiness", requireAccountingReports, (req, res) => {
    const data = buildDeclarationReadiness(req.auth.db, req.query);
    res.status(200).json(data);
  });

  router.get("/accounting/d394", requireAccountingReports, (req, res) => {
    res.status(200).json(buildD394Data(req.auth.db, req.query));
  });

  router.get("/accounting/saft/readiness", requireAccountingReports, (req, res) => {
    res.status(200).json(buildSaftReadiness(req.auth.db, req.query));
  });

  router.get("/accounting/declarations/history", requireAccountingReports, (req, res) => {
    const accounting = engine.ensureAccounting(req.auth.db);
    const [an, luna] = monthParts(req.query.perioada || req.query.luna);
    const runs = accounting.declarationRuns.filter((item) => Number(item.an) === an && Number(item.luna) === luna).slice().reverse();
    res.status(200).json({ perioada: `${an}-${String(luna).padStart(2, "0")}`, runs });
  });

  router.post("/accounting/declarations/:code/validate", requireAccountingPost, (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      if (!["D300", "D394"].includes(code)) throwHttp(400, "Declaratia selectata nu are inca validare interna disponibila.");
      const accounting = engine.ensureAccounting(req.auth.db);
      const readiness = buildDeclarationReadiness(req.auth.db, req.body || req.query || {});
      const [an, luna] = monthParts(readiness.perioada);
      const relevant = code === "D300"
        ? readiness.checks.filter((item) => ["documents", "vat", "vat_accounting"].includes(item.key))
        : readiness.checks.filter((item) => ["documents", "d394_partners", "vat_accounting"].includes(item.key));
      const errors = relevant.filter((item) => !item.ok).map((item) => item.message);
      const run = {
        id: engine.nextNumericId(accounting.declarationRuns), code, an, luna,
        status: errors.length ? "cu_erori" : "validat_intern", errors,
        checksum: require("crypto").createHash("sha256").update(JSON.stringify({ code, perioada: readiness.perioada, checks: relevant, vat: readiness.vat_control })).digest("hex"),
        validated_by: req.auth.user?.id || "", validated_at: new Date().toISOString()
      };
      accounting.declarationRuns.push(run);
      addAudit(req.auth.db, req.auth.user, "accounting_declaration_validate", `${code} ${readiness.perioada} / ${run.status}`);
      writeDb(req.auth.db);
      res.status(errors.length ? 422 : 201).json({ run, checks: relevant });
    } catch (error) { next(error); }
  });

  router.post("/accounting/declarations/:code/submit", requireAccountingPost, (req, res, next) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      const [an, luna] = monthParts(req.body?.perioada);
      const accounting = engine.ensureAccounting(req.auth.db);
      const run = accounting.declarationRuns.slice().reverse().find((item) => item.code === code && Number(item.an) === an && Number(item.luna) === luna && item.status === "validat_intern");
      if (!run) throwHttp(409, "Ruleaza mai intai validarea interna fara erori.");
      const receipt = String(req.body?.recipisa || "").trim();
      if (!receipt) throwHttp(400, "Completeaza numarul recipisei ANAF.");
      run.status = "depus";
      run.recipisa = receipt;
      run.submitted_at = new Date().toISOString();
      run.submitted_by = req.auth.user?.id || "";
      addAudit(req.auth.db, req.auth.user, "accounting_declaration_submit", `${code} ${an}-${String(luna).padStart(2, "0")} / ${receipt}`);
      writeDb(req.auth.db);
      res.status(200).json({ run });
    } catch (error) { next(error); }
  });

  router.get("/accounting/saft/export-mapping", requireAccountingReports, (req, res, next) => {
    try {
      const data = buildSaftReadiness(req.auth.db, req.query);
      const workbook = xlsx.utils.book_new();
      const summary = xlsx.utils.aoa_to_sheet([
        ["Diagnostic mapare SAF-T", data.perioada, "Document intern de lucru"],
        ["Acoperire", `${data.coverage}%`],
        [],
        ["Zona", "Total", "Mapate", "Lipsa", "Status"],
        ...data.areas.map((area) => [area.label, area.total, area.mapped, area.missing, area.ok ? "OK" : "Necesita completare"])
      ]);
      summary["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 24 }];
      xlsx.utils.book_append_sheet(workbook, summary, "Sumar");
      const problems = xlsx.utils.aoa_to_sheet([
        ["Zona", "Identificator", "Problema", "Rezolvare"],
        ...data.issues.map((issue) => [issue.area, issue.id, issue.message, issue.action])
      ]);
      problems["!cols"] = [{ wch: 24 }, { wch: 24 }, { wch: 70 }, { wch: 70 }];
      problems["!autofilter"] = { ref: `A1:D${Math.max(1, data.issues.length + 1)}` };
      xlsx.utils.book_append_sheet(workbook, problems, "Probleme");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Diagnostic_SAFT_${data.perioada.replace("-", "_")}.xlsx"`);
      res.end(buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get("/accounting/d394/export", requireAccountingReports, (req, res, next) => {
    try {
      const data = buildD394Data(req.auth.db, req.query);
      const rows = [
        ["Pregatire D394", data.perioada, "Document intern de lucru"],
        ["Status", data.ready ? "Pregatit pentru verificare" : "Necesita verificari"],
        [],
        ["CUI", "Denumire tert", "Tip", "Cote TVA", "Nr. documente", "Baza", "TVA", "Total"],
        ...data.terti.map((row) => [row.cui, row.denumire, row.tip, row.cote.map((rate) => `${rate}%`).join(", "), row.documente, row.baza, row.tva, row.total]),
        [],
        ["TOTAL", "", "", "", data.totaluri.documente, data.totaluri.baza, data.totaluri.tva, data.totaluri.total]
      ];
      const workbook = xlsx.utils.book_new();
      const sheet = xlsx.utils.aoa_to_sheet(rows);
      sheet["!cols"] = [{ wch: 18 }, { wch: 42 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      sheet["!autofilter"] = { ref: `A4:H${Math.max(4, 3 + data.terti.length)}` };
      sheet["!freeze"] = { xSplit: 0, ySplit: 4 };
      xlsx.utils.book_append_sheet(workbook, sheet, "D394 lucru");

      const detailSheet = xlsx.utils.aoa_to_sheet([
        ["Data", "Document", "CUI", "Tert", "Tip", "Cota TVA", "Baza", "TVA", "Total", "Status"],
        ...data.detalii.map((row) => [row.data, row.document, row.cui, row.denumire, row.tip, row.cota_tva, row.baza, row.tva, row.total, row.status])
      ]);
      detailSheet["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
      detailSheet["!autofilter"] = { ref: `A1:J${Math.max(1, data.detalii.length + 1)}` };
      xlsx.utils.book_append_sheet(workbook, detailSheet, "Documente");

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
  const invoices = [...accounting.invoicesIn.filter(inMonth), ...accounting.invoicesOut.filter(inMonth), ...accounting.creditNotes.filter(inMonth)];
  const drafts = invoices.filter((item) => item.status === "draft");
  const period = accounting.periods.find((item) => Number(item.an) === an && Number(item.luna) === luna) || { an, luna, status: "deschisa" };
  const d394 = buildD394Data(db, { perioada });
  const saft = buildSaftReadiness(db, { perioada });
  const activeJournalIds = new Set(accounting.journals.filter((item) => engine.isActiveJournal(item) && Number(item.an) === an && Number(item.luna) === luna).map((item) => Number(item.id)));
  const vatLines = accounting.journalLines.filter((item) => activeJournalIds.has(Number(item.journal_id)) && ["4426", "4427"].includes(String(item.cont_simbol)));
  const vatAccounting = {
    deductibila: money(vatLines.filter((item) => item.cont_simbol === "4426").reduce((sum, item) => sum + Number(item.debit || 0) - Number(item.credit || 0), 0)),
    colectata: money(vatLines.filter((item) => item.cont_simbol === "4427").reduce((sum, item) => sum + Number(item.credit || 0) - Number(item.debit || 0), 0))
  };
  const vatDocuments = {
    deductibila: money(d394.detalii.filter((item) => item.tip === "achizitie").reduce((sum, item) => sum + item.tva, 0)),
    colectata: money(d394.detalii.filter((item) => item.tip === "livrare").reduce((sum, item) => sum + item.tva, 0))
  };
  const vatConsistent = Math.abs(vatAccounting.deductibila - vatDocuments.deductibila) <= 0.01 && Math.abs(vatAccounting.colectata - vatDocuments.colectata) <= 0.01;
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
      key: "vat_accounting",
      label: "TVA facturi vs contabilitate",
      ok: vatConsistent,
      message: vatConsistent ? "TVA-ul documentelor corespunde rulajelor 4426/4427." : `Diferente: 4426 ${money(vatAccounting.deductibila - vatDocuments.deductibila)}, 4427 ${money(vatAccounting.colectata - vatDocuments.colectata)}.`
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
      { code: "D300", status: drafts.length === 0 && period.tva_verificat_la && vatConsistent ? "pregatit" : "in_lucru", description: "Decont TVA din jurnalele de cumparari si vanzari." },
      { code: "D394", status: d394.ready ? "pregatit" : "in_lucru", description: "Operatiuni interne grupate pe tert si CUI." },
      { code: "D406 / SAF-T", status: saft.ready ? "pregatit_mapare" : "neconfigurat", description: `Mapare tehnica ${saft.coverage}%. XML-ul fiscal necesita in continuare schema ANAF aplicabila.` }
    ],
    vat_control: { accounting: vatAccounting, documents: vatDocuments, consistent: vatConsistent }
  };
}

function buildD394Data(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(query.perioada || query.luna);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const acceptedStatuses = new Set(["validat", "partial", "achitat", "incasat", "creditata"]);
  const groups = new Map();
  const missing = [];
  const details = [];
  let foreignDocuments = 0;

  addInvoices(accounting.invoicesIn, "achizitie", "furnizor_id");
  addInvoices(accounting.creditNotes.filter((item) => item.status === "validat").map((item) => ({ ...item, valoare: -Math.abs(Number(item.valoare || 0)), tva: -Math.abs(Number(item.tva || 0)), total: -Math.abs(Number(item.total || 0)) })), "achizitie", "furnizor_id");
  addInvoices(accounting.invoicesOut, "livrare", "client_id");

  function addInvoices(invoices, tip, partyKey) {
    invoices
      .filter((item) => Number(item.an) === an && Number(item.luna) === luna && acceptedStatuses.has(String(item.status || "")))
      .forEach((invoice) => {
        const tert = accounting.thirdParties.find((item) => String(item.id) === String(invoice[partyKey]));
        const cui = normalizeCui(tert?.cui || tert?.cif || "");
        const country = String(tert?.tara || "RO").trim().toUpperCase();
        const document = invoice.nr_document || invoice.numar || "";
        if (country && country !== "RO") {
          foreignDocuments += 1;
          return;
        }
        if (!tert || !isValidRomanianCui(cui)) {
          missing.push(`${tip === "achizitie" ? "Factura furnizor" : "Factura client"} ${invoice.nr_document || invoice.numar || invoice.id} nu are tert cu CUI completat.`);
          return;
        }
        if (!document) missing.push(`${tip === "achizitie" ? "Factura furnizor" : "Factura client"} ID ${invoice.id} nu are numar de document.`);
        if (!invoice.data) missing.push(`Factura ${document || invoice.id} nu are data documentului.`);
        const rate = Number(invoice.tva_procent ?? (Number(invoice.valoare || 0) ? Number(invoice.tva || 0) * 100 / Number(invoice.valoare || 1) : 0));
        const normalizedRate = money(rate);
        const key = `${tip}:${cui}`;
        const row = groups.get(key) || {
          cui,
          denumire: tert.denumire || tert.nume || "Tert",
          tip,
          documente: 0,
          baza: 0,
          tva: 0,
          total: 0
          ,cote: []
        };
        row.documente += 1;
        row.baza = money(row.baza + Number(invoice.valoare || 0));
        row.tva = money(row.tva + Number(invoice.tva || 0));
        row.total = money(row.total + Number(invoice.total || 0));
        if (!row.cote.includes(normalizedRate)) row.cote.push(normalizedRate);
        groups.set(key, row);
        details.push({
          id: invoice.id,
          uuid: invoice.uuid || "",
          data: invoice.data || "",
          document: document || `ID ${invoice.id}`,
          cui,
          denumire: tert.denumire || tert.nume || "Tert",
          tip,
          cota_tva: normalizedRate,
          baza: money(invoice.valoare || 0),
          tva: money(invoice.tva || 0),
          total: money(invoice.total || 0),
          status: invoice.status || ""
        });
      });
  }

  const terti = [...groups.values()].map((row) => ({ ...row, cote: row.cote.sort((a, b) => a - b) })).sort((a, b) => a.cui.localeCompare(b.cui, "ro", { numeric: true }) || a.tip.localeCompare(b.tip));
  return {
    perioada,
    ready: missing.length === 0,
    warnings: [...new Set(missing)],
    terti,
    detalii: details.sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.document).localeCompare(String(b.document), "ro", { numeric: true })),
    documente_externe_excluse: foreignDocuments,
    totaluri: {
      documente: terti.reduce((sum, row) => sum + row.documente, 0),
      baza: money(terti.reduce((sum, row) => sum + row.baza, 0)),
      tva: money(terti.reduce((sum, row) => sum + row.tva, 0)),
      total: money(terti.reduce((sum, row) => sum + row.total, 0))
    }
  };
}

function buildSaftReadiness(db, query = {}) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = monthParts(query.perioada || query.luna);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const issues = [];
  const companyCui = normalizeCui(db.settings?.general?.cif || db.settings?.companyCui || db.settings?.cui || "");
  if (!isValidRomanianCui(companyCui)) issues.push(issue("Companie", "CUI", "CUI-ul companiei lipseste sau este invalid.", "Completeaza CUI-ul in Setari > General."));

  const activeAccounts = accounting.chart.filter((item) => item.activ !== false);
  activeAccounts.forEach((account) => {
    if (!account.simbol || !account.denumire) issues.push(issue("Plan conturi", account.id || "-", "Cont fara simbol sau denumire.", "Completeaza contul in Plan de conturi."));
  });
  accounting.thirdParties.filter((item) => item.activ !== false).forEach((party) => {
    if (!party.denumire) issues.push(issue("Terti", party.id, "Tert fara denumire.", "Completeaza denumirea tertului."));
    if (String(party.tara || "RO").toUpperCase() === "RO" && !isValidRomanianCui(normalizeCui(party.cui))) issues.push(issue("Terti", party.cod || party.id, "Tert roman fara CUI valid.", "Completeaza CUI-ul in fisa tertului."));
  });
  const accepted = new Set(["validat", "partial", "achitat", "incasat", "creditata"]);
  const invoices = [...accounting.invoicesIn, ...accounting.invoicesOut].filter((item) => Number(item.an) === an && Number(item.luna) === luna && accepted.has(String(item.status || "")));
  invoices.forEach((invoice) => {
    if (!invoice.data) issues.push(issue("Facturi", invoice.id, "Factura fara data.", "Completeaza data documentului."));
    if (!(invoice.nr_document || invoice.numar)) issues.push(issue("Facturi", invoice.id, "Factura fara numar.", "Completeaza numarul documentului."));
  });
  const activeJournalIds = new Set(accounting.journals.filter((item) => engine.isActiveJournal(item) && Number(item.an) === an && Number(item.luna) === luna).map((item) => Number(item.id)));
  const accountSymbols = new Set(activeAccounts.map((item) => String(item.simbol)));
  const periodLines = accounting.journalLines.filter((item) => activeJournalIds.has(Number(item.journal_id)));
  periodLines.forEach((line) => {
    if (!accountSymbols.has(String(line.cont_simbol || ""))) issues.push(issue("Note contabile", line.id, `Contul ${line.cont_simbol || "-"} nu exista in plan.`, "Corecteaza linia notei sau adauga contul."));
  });
  const materials = Array.isArray(db.inventory?.materials) ? db.inventory.materials.filter((item) => item.active !== false && item.activ !== false) : [];
  materials.forEach((material) => {
    if (!(material.cod || material.code)) issues.push(issue("Produse", material.id, "Material fara cod intern.", "Completeaza codul materialului in Gestiune."));
  });

  const areas = [
    area("Companie", 1, isValidRomanianCui(companyCui) ? 1 : 0),
    area("Plan de conturi", activeAccounts.length, activeAccounts.filter((item) => item.simbol && item.denumire).length),
    area("Terti", accounting.thirdParties.filter((item) => item.activ !== false).length, accounting.thirdParties.filter((item) => item.activ !== false && item.denumire && (String(item.tara || "RO").toUpperCase() !== "RO" || isValidRomanianCui(normalizeCui(item.cui)))).length),
    area("Facturi perioada", invoices.length, invoices.filter((item) => item.data && (item.nr_document || item.numar)).length),
    area("Linii contabile", periodLines.length, periodLines.filter((item) => accountSymbols.has(String(item.cont_simbol || ""))).length),
    area("Produse/materiale", materials.length, materials.filter((item) => item.cod || item.code).length)
  ];
  const total = areas.reduce((sum, item) => sum + item.total, 0);
  const mapped = areas.reduce((sum, item) => sum + item.mapped, 0);
  return {
    perioada,
    ready: issues.length === 0 && total > 0,
    coverage: total ? Math.round(mapped * 10000 / total) / 100 : 0,
    areas,
    issues,
    note: "Diagnostic tehnic de mapare. Generarea si validarea XML D406 necesita schema ANAF aplicabila perioadei."
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

function isValidRomanianCui(value) {
  return /^\d{2,10}$/.test(String(value || ""));
}

function issue(areaName, id, message, action) {
  return { area: areaName, id: String(id || "-"), message, action };
}

function area(label, total, mapped) {
  return { label, total, mapped, missing: Math.max(0, total - mapped), ok: total === mapped };
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

module.exports = registerDeclarationRoutes;
module.exports.buildD394Data = buildD394Data;
module.exports.buildDeclarationReadiness = buildDeclarationReadiness;
module.exports.buildSaftReadiness = buildSaftReadiness;

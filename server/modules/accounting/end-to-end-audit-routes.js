const { Router } = require("express");
const xlsx = require("xlsx");
const engine = require("./accounting-engine");
const { requireAuth } = require("../../core/auth");
const { requirePermission } = require("../../core/permissions");

const router = Router();

router.get("/accounting/audit/end-to-end", accountingReports, (req, res, next) => {
  try { res.json(buildAudit(req.auth.db, req.query.luna || req.query.perioada)); }
  catch (error) { next(error); }
});

router.get("/accounting/audit/end-to-end/export", accountingReports, (req, res, next) => {
  try {
    const report = buildAudit(req.auth.db, req.query.luna || req.query.perioada);
    const rows = report.checks.map((item) => [item.area, item.status, item.count, item.message, item.action]);
    const sheet = xlsx.utils.aoa_to_sheet([["Audit contabil end-to-end", report.perioada, report.ready ? "OK" : "Necesita verificari"], [], ["Zona", "Status", "Numar", "Mesaj", "Actiune"], ...rows]);
    sheet["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 70 }, { wch: 55 }];
    const workbook = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(workbook, sheet, "Audit");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Audit_contabil_${report.perioada.replace("-", "_")}.xlsx"`);
    res.end(buffer);
  } catch (error) { next(error); }
});

function buildAudit(db, value) {
  const match = String(value || new Date().toISOString().slice(0, 7)).match(/^(\d{4})-(\d{1,2})$/);
  if (!match) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
  const an = Number(match[1]); const luna = Number(match[2]); const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const accounting = engine.ensureAccounting(db);
  const activeJournals = accounting.journals.filter((item) => engine.isActiveJournal(item) && Number(item.an) === an && Number(item.luna) === luna);
  const journalByRef = (type, id) => activeJournals.some((item) => item.document_ref_tip === type && String(item.document_ref_id) === String(id));
  const invoiceMissing = [...accounting.invoicesIn.map((item) => [item, "accounting_invoices_in"]), ...accounting.invoicesOut.map((item) => [item, "accounting_invoices_out"])]
    .filter(([item, type]) => Number(item.an) === an && Number(item.luna) === luna && ["validat", "partial", "achitat", "incasat", "creditata"].includes(item.status) && !journalByRef(type, item.id));
  const treasuryMissing = accounting.treasury.filter((item) => Number(item.an) === an && Number(item.luna) === luna && item.status === "validat" && !item.journal_id && !journalByRef("accounting_treasury", item.id));
  const payroll = (db.hr?.payrollRuns || []).filter((item) => item.luna === perioada && item.status === "validat" && !item.cancelled_at);
  const payrollMissing = payroll.filter((item) => !item.accounting_journal_id || item.accounting_reversed_at);
  const brokenPayments = (db.hr?.payrollPayments || []).filter((item) => payroll.some((run) => run.id === item.run_id) && item.status === "platit" && (!item.treasury_uuid || !item.accounting_journal_id));
  const declarations = ["D300", "D394", "D112"].map((code) => ({ code, run: [...accounting.declarationRuns].reverse().find((item) => item.code === code && Number(item.an) === an && Number(item.luna) === luna && !item.cancelled_at) }));
  const checks = [
    check("Facturi validate fara nota", invoiceMissing.length, "Genereaza sau repara nota din factura sursa."),
    check("Trezorerie fara nota", treasuryMissing.length, "Valideaza sau reface operatia de trezorerie."),
    check("Stat salarial fara nota", payrollMissing.length, "Genereaza nota contabila din statul validat."),
    check("Plati salariale incomplete", brokenPayments.length, "Storneaza si reia plata prin circuitul salarial."),
    ...declarations.map((item) => ({ area: item.code, status: item.run ? item.run.status : "neinceput", count: item.run ? 0 : 1, message: item.run ? `Ultima stare: ${item.run.status}.` : "Declaratia nu are inregistrare in registrul fiscal.", action: item.run ? "Verifica recipisa si fisierul arhivat." : "Porneste validarea interna din Centrul fiscal." }))
  ];
  return { perioada, ready: checks.every((item) => item.count === 0 || !["eroare", "neinceput"].includes(item.status)), checks };
}
function check(area, count, action) { return { area, status: count ? "eroare" : "ok", count, message: count ? `${count} inregistrari necesita interventie.` : "Circuit complet.", action }; }
function accountingReports(req, res, next) { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, "accounting:reports")) return; req.auth = auth; next(); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

router.buildAudit = buildAudit;
module.exports = router;

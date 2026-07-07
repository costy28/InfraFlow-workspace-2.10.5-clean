const engine = require("./accounting-engine");

function money(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function text(value) { return String(value ?? "").trim(); }
function xml(value) { return text(value).replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char])); }
const D205_INCOME_CODES = new Set(Array.from({ length: 30 }, (_, index) => String(index + 1).padStart(2, "0")));
const D205_LEGACY_CODES = { dividende: "08", dobanzi: "09", alte_venituri: "04" };

function d205Report(db, year) {
  const accounting = engine.ensureAccounting(db);
  const an = Number(year || new Date().getFullYear());
  const rows = accounting.withholdingTaxEntries.filter((row) => Number(row.an) === an && !row.cancelled_at);
  const issues = [];
  rows.forEach((row, index) => {
    if (!text(row.cnp_cui)) issues.push(`Randul ${index + 1}: lipseste CNP/CUI beneficiar.`);
    if (!text(row.nume)) issues.push(`Randul ${index + 1}: lipseste numele beneficiarului.`);
    if (!D205_INCOME_CODES.has(d205IncomeCode(row.tip_venit))) issues.push(`Randul ${index + 1}: codul tipului de venit nu este acceptat de schema D205.`);
    if (![0, 2, 3].includes(Number(row.tip_plata ?? 2))) issues.push(`Randul ${index + 1}: tipul platii trebuie sa fie 0, 2 sau 3.`);
    if (money(row.impozit_retinut) < 0 || money(row.venit_brut) < 0) issues.push(`Randul ${index + 1}: valorile nu pot fi negative.`);
  });
  const totals = rows.reduce((sum, row) => ({ venit_brut: money(sum.venit_brut + money(row.venit_brut)), impozit_retinut: money(sum.impozit_retinut + money(row.impozit_retinut)) }), { venit_brut: 0, impozit_retinut: 0 });
  return { an, rows, totals, issues, ready: rows.length > 0 && issues.length === 0, schema: "d205_2025_v3.xsd", schema_url: "https://static.anaf.ro/static/10/Anaf/Declaratii_R/AplicatiiDec/d205_2025_v3.xsd", note: "Structura XML ANAF D205 v3. Fisierul trebuie verificat si cu programul de asistenta ANAF inainte de depunere." };
}

function d205CandidateXml(report, company = {}, declarant = {}) {
  const groups = new Map();
  report.rows.forEach((row) => {
    const code = d205IncomeCode(row.tip_venit);
    const current = groups.get(code) || { rows: [], venit: 0, impozit: 0, dividendeDistribuite: 0, dividendePlatite: 0 };
    current.rows.push(row); current.venit += money(row.venit_brut); current.impozit += money(row.impozit_retinut);
    current.dividendeDistribuite += money(row.dividende_distribuite); current.dividendePlatite += money(row.dividende_platite);
    groups.set(code, current);
  });
  const attrs = {
    luna: 12, an: report.an, d_rec: Number(company.d_rec || 0), d_succ: Number(company.d_succ || 0),
    cifSS: digits(company.cifSS || company.cif || company.cui),
    nume_declar: declarant.lastName || declarant.nume || company.nume_declar || "NECOMPLETAT",
    prenume_declar: declarant.firstName || declarant.prenume || company.prenume_declar || "NECOMPLETAT",
    functie_declar: declarant.function || declarant.functie || company.functie_declar || "Administrator",
    cui: digits(company.cif || company.cui), den: company.name || company.companyName || company.denumire || "NECOMPLETAT",
    adresa: company.address || company.adresa || "NECOMPLETAT", telefon: company.phone || company.telefon || "",
    fax: company.fax || "", mail: company.email || company.mail || "", totalPlata_A: integer(report.totals.impozit_retinut)
  };
  const sections = [...groups.entries()].map(([code, group]) => `\n  <sect_II tip_venit="${code}" nrben="${group.rows.length}" Tcastig="0" Tpierd="0" Tbaza="${integer(group.venit)}" Timp="${integer(group.impozit)}" T_VB="0" T_GAR="0"/>`).join("");
  const beneficiaries = report.rows.map((row, index) => {
    const code = d205IncomeCode(row.tip_venit); const dividend = code === "08";
    return `\n  <benef id_inreg="${index + 1}" tip_venit1="${code}" den1="${xml(row.nume)}" cifR="${xml(digits(row.cnp_cui))}" tip_plata="${Number(row.tip_plata ?? 2)}" Rezid="${Number(row.rezidenta || 1)}"${row.stat_rezidenta ? ` Stat_R="${xml(String(row.stat_rezidenta).toUpperCase())}"` : ""} baza1="${integer(row.venit_brut)}" imp1="${integer(row.impozit_retinut)}"${dividend ? ` divid_D="${integer(row.dividende_distribuite || row.venit_brut)}" divid_P="${integer(row.dividende_platite || row.venit_brut)}"` : ""}/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<declaratie205 xmlns="mfp:anaf:dgti:d205:declaratie:v2" ${Object.entries(attrs).filter(([, value]) => value !== "").map(([key, value]) => `${key}="${xml(value)}"`).join(" ")}>${sections}${beneficiaries}\n</declaratie205>`;
}

function d205IncomeCode(value) { const raw = text(value).toLowerCase(); return D205_LEGACY_CODES[raw] || raw.padStart(2, "0"); }
function digits(value) { return text(value).replace(/^RO/i, "").replace(/\D/g, ""); }
function integer(value) { return String(Math.round(Number(value || 0))); }

function intrastatReport(db, period) {
  const accounting = engine.ensureAccounting(db);
  const match = String(period || "").match(/^(\d{4})-(\d{2})$/);
  const an = match ? Number(match[1]) : new Date().getFullYear();
  const luna = match ? Number(match[2]) : new Date().getMonth() + 1;
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const rows = accounting.intrastatEntries.filter((row) => Number(row.an) === an && Number(row.luna) === luna && !row.cancelled_at);
  const issues = [];
  rows.forEach((row, index) => {
    if (!/^[A-Z]{2}$/.test(text(row.tara_partenera).toUpperCase())) issues.push(`Randul ${index + 1}: tara partenera trebuie sa fie cod ISO cu 2 litere.`);
    if (!/^\d{8}$/.test(text(row.cod_nc))) issues.push(`Randul ${index + 1}: codul NC trebuie sa aiba 8 cifre.`);
    if (!text(row.flux) || !["introduceri", "expedieri"].includes(row.flux)) issues.push(`Randul ${index + 1}: flux invalid.`);
    if (money(row.valoare_facturata) < 0 || Number(row.masa_neta || 0) < 0) issues.push(`Randul ${index + 1}: valorile nu pot fi negative.`);
    if (row.tara_origine && !/^[A-Z]{2}$/.test(text(row.tara_origine).toUpperCase())) issues.push(`Randul ${index + 1}: tara de origine trebuie sa fie cod ISO cu 2 litere.`);
  });
  const totals = rows.reduce((sum, row) => ({ valoare_facturata: money(sum.valoare_facturata + money(row.valoare_facturata)), masa_neta: money(sum.masa_neta + Number(row.masa_neta || 0)) }), { valoare_facturata: 0, masa_neta: 0 });
  return { perioada, an, luna, rows, totals, issues, ready: rows.length > 0 && issues.length === 0, note: "Fisier de lucru pentru verificare si incarcare in aplicatia oficiala Intrastat." };
}

function intrastatCandidateXml(report, company = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<IntrastatWorkFile perioada="${report.perioada}" cui="${xml(company.cui || company.cif)}" statut="fisier_de_lucru">${report.rows.map((row) => `\n  <Linie flux="${xml(row.flux)}" taraPartenera="${xml(row.tara_partenera)}" taraOrigine="${xml(row.tara_origine)}" judetDestinatie="${xml(row.judet_destinatie)}" codNC="${xml(row.cod_nc)}" naturaTranzactie="${xml(row.natura_tranzactie || "11")}" conditieLivrare="${xml(row.conditie_livrare)}" modTransport="${xml(row.mod_transport)}" masaNeta="${money(row.masa_neta).toFixed(3)}" valoareFacturata="${money(row.valoare_facturata).toFixed(2)}" valoareStatistica="${money(row.valoare_statistica || row.valoare_facturata).toFixed(2)}"/>`).join("")}\n</IntrastatWorkFile>`;
}

function completionMap(db, period) {
  const accounting = engine.ensureAccounting(db);
  const [an, luna] = String(period).split("-").map(Number);
  const latest = (code) => [...accounting.declarationRuns].reverse().find((row) => row.code === code && Number(row.an) === an && Number(row.luna) === luna && !row.cancelled_at);
  const d205 = d205Report(db, an);
  const intrastat = intrastatReport(db, period);
  const declarations = ["D300", "D394", "D112", "D406"].map((code) => ({ code, status: latest(code)?.status || "nepregatit", receipt_status: latest(code)?.receipt_status || "" }));
  return { perioada: period, declarations, d205: { ready: d205.ready, rows: d205.rows.length, issues: d205.issues }, intrastat: { ready: intrastat.ready, rows: intrastat.rows.length, issues: intrastat.issues } };
}

module.exports = { d205Report, d205CandidateXml, intrastatReport, intrastatCandidateXml, completionMap, d205IncomeCode };

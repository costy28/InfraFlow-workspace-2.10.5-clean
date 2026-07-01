const engine = require("./accounting-engine");

function buildSource(db, period) {
  const [an, luna] = periodParts(period);
  const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const start = `${perioada}-01`;
  const end = new Date(Date.UTC(an, luna, 0)).toISOString().slice(0, 10);
  const accounting = engine.ensureAccounting(db);
  const settings = { ...(db.settings || {}), ...(db.settings?.general || {}), ...(db.company || {}) };
  const journals = accounting.journals.filter((item) => engine.isActiveJournal(item) && Number(item.an) === an && Number(item.luna) === luna);
  const journalIds = new Set(journals.map((item) => Number(item.id)));
  const lines = accounting.journalLines.filter((item) => journalIds.has(Number(item.journal_id)));
  const accepted = new Set(["validat", "partial", "achitat", "incasat", "creditata"]);
  const sales = accounting.invoicesOut.filter((item) => Number(item.an) === an && Number(item.luna) === luna && accepted.has(String(item.status)));
  const purchases = accounting.invoicesIn.filter((item) => Number(item.an) === an && Number(item.luna) === luna && accepted.has(String(item.status)));
  const payments = accounting.treasury.filter((item) => Number(item.an) === an && Number(item.luna) === luna && item.status === "validat");
  const products = materialList(db).filter((item) => item.active !== false && item.activ !== false);
  const stockMovements = movementList(db).filter((item) => dateOf(item) >= start && dateOf(item) <= end && !item.canceled && !item.cancelledAt);
  const company = companyData(settings);
  const issues = companyIssues(company);
  lines.forEach((line) => { if (!line.cont_simbol) issues.push(`Linia contabila ${line.id || "-"} nu are cont.`); });
  products.forEach((item) => {
    if (!commodityCode(item)) issues.push(`Produsul ${item.cod || item.code || item.id || "-"} nu are cod NC/commodity pentru SAF-T.`);
  });
  sales.forEach((item) => { if (!item.client_id && !item.tert_id) issues.push(`Factura de iesire ${documentNo(item)} nu are client.`); });
  purchases.forEach((item) => { if (!item.furnizor_id && !item.tert_id) issues.push(`Factura de intrare ${documentNo(item)} nu are furnizor.`); });

  return {
    perioada, an, luna, start, end, company,
    accounts: accounting.chart.filter((item) => item.activ !== false),
    customers: accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "client" || item.cont_analitic_client)),
    suppliers: accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "furnizor" || item.cont_analitic_furnizor)),
    products, journals, lines, allJournals: accounting.journals, allLines: accounting.journalLines,
    sales, purchases, payments, stockMovements, issues,
    summary: {
      accounts: accounting.chart.filter((item) => item.activ !== false).length,
      customers: accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "client" || item.cont_analitic_client)).length,
      suppliers: accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "furnizor" || item.cont_analitic_furnizor)).length,
      products: products.length, journals: journals.length, lines: lines.length,
      sales: sales.length, purchases: purchases.length, payments: payments.length, stock_movements: stockMovements.length
    }
  };
}

function companyData(settings) {
  return {
    cui: normalizeCui(first(settings.cif, settings.cui, settings.companyCui, settings.company_cif, settings.companyCif)),
    name: first(settings.name, settings.companyName, settings.company_name, settings.denumire, settings.denumire_firma),
    address: first(settings.address, settings.adresa, settings.companyAddress, settings.company_address),
    city: first(settings.city, settings.localitate, settings.oras, settings.companyCity),
    country: String(first(settings.country, settings.tara, "RO")).slice(0, 2).toUpperCase(),
    phone: first(settings.phone, settings.telefon, settings.companyPhone),
    email: first(settings.email, settings.companyEmail),
    iban: normalizeIban(first(settings.iban, settings.companyIban, settings.company_iban)),
    bank: first(settings.bank, settings.banca, settings.companyBank),
    contact_name: first(settings.contactName, settings.contact_name, settings.reprezentant, "InfraFlow Operator")
  };
}

function companyIssues(company) {
  const checks = [
    [company.cui, "CUI companie lipsa."], [company.name, "Denumire companie lipsa."],
    [company.address, "Adresa companiei lipseste."], [company.city, "Localitatea companiei lipseste."],
    [company.phone, "Telefonul companiei lipseste."], [company.iban, "IBAN-ul companiei lipseste."]
  ];
  return checks.filter(([value]) => !value).map(([, message]) => message);
}

function materialList(db) {
  if (Array.isArray(db.materials)) return db.materials;
  if (Array.isArray(db.inventory?.materials)) return db.inventory.materials;
  return [];
}
function movementList(db) {
  if (Array.isArray(db.stockMovements)) return db.stockMovements;
  if (Array.isArray(db.inventory?.movements)) return db.inventory.movements;
  return [];
}
function commodityCode(item) { return first(item.productCommodityCode, item.commodity_code, item.cod_nc, item.nc_code); }
function documentNo(item) { return first(item.nr_document, item.numar, item.number, item.id, "NECOMPLETAT"); }
function dateOf(item) { return String(first(item.date, item.data, item.created_at, item.createdAt)).slice(0, 10); }
function normalizeCui(value) { return String(value || "").toUpperCase().replace(/^RO/, "").replace(/\D/g, ""); }
function normalizeIban(value) { return String(value || "").replace(/\s/g, "").toUpperCase(); }
function first(...values) { return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || ""; }
function periodParts(period) { const match = String(period || "").match(/^(\d{4})-(\d{1,2})$/); if (!match) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM."); return [Number(match[1]), Number(match[2])]; }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = { buildSource, commodityCode, dateOf, documentNo, first, normalizeCui };

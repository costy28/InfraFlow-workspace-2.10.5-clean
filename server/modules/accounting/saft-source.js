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
  const company = companyData(settings);
  const stockMovements = company.declaration_type === "C"
    ? movementList(db).filter((item) => dateOf(item) >= start && dateOf(item) <= end && !item.canceled && !item.cancelledAt)
    : [];
  const issues = [];
  const issueDetails = [];
  const addIssue = (message, details = {}) => { issues.push(message); issueDetails.push({ message, ...details }); };
  companyIssues(company).forEach((message) => addIssue(message, { area: "Companie", action: "Completeaza datele societatii.", to: "/setari" }));
  const usedAccounts = new Set(accounting.journalLines.map((item) => normalizeAccount(item.cont_simbol)).filter(Boolean));
  const accounts = accounting.chart.filter((item) => item.activ !== false && usedAccounts.has(normalizeAccount(item.simbol)));
  lines.forEach((line) => { if (!line.cont_simbol) addIssue(`Linia contabila ${line.id || "-"} nu are cont.`, { area: "Registru jurnal", action: "Completeaza contul liniei.", to: `/contabilitate/registru-jurnal?luna=${perioada}`, entity_type: "journal_line", entity_id: line.id || "" }); });
  products.forEach((item) => {
    if (!commodityCode(item)) addIssue(`Produsul ${item.cod || item.code || item.id || "-"} nu are cod NC/commodity pentru SAF-T.`, { area: "Produse", action: "Completeaza codul NC al produsului.", to: "/gestiune", entity_type: "product", entity_id: item.id || "" });
  });
  sales.forEach((item) => { if (!item.client_id && !item.tert_id) addIssue(`Factura de iesire ${documentNo(item)} nu are client.`, { area: "Facturi iesire", action: "Selecteaza clientul facturii.", to: `/contabilitate/facturi-iesire?luna=${perioada}&q=${encodeURIComponent(documentNo(item))}`, entity_type: "invoice_out", entity_id: item.id || item.uuid || "" }); });
  purchases.forEach((item) => { if (!item.furnizor_id && !item.tert_id) addIssue(`Factura de intrare ${documentNo(item)} nu are furnizor.`, { area: "Facturi intrare", action: "Selecteaza furnizorul facturii.", to: `/contabilitate/facturi-intrare?luna=${perioada}&q=${encodeURIComponent(documentNo(item))}`, entity_type: "invoice_in", entity_id: item.id || item.uuid || "" }); });
  const customers = accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "client" || item.cont_analitic_client));
  const suppliers = accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "furnizor" || item.cont_analitic_furnizor));
  [...customers, ...suppliers].forEach((item) => {
    const label = item.denumire || item.nume || item.cod || item.id;
    const type = item.tip === "furnizor" || item.cont_analitic_furnizor ? "furnizor" : "client";
    const to = `/contabilitate/${type === "furnizor" ? "furnizori" : "clienti"}?${type}=${item.id}&edit=1`;
    if (!item.iban) addIssue(`Tertul ${label} nu are IBAN pentru SAF-T.`, { area: type === "furnizor" ? "Furnizori" : "Clienti", action: "Completeaza IBAN-ul tertului.", to, entity_type: type, entity_id: item.id || "" });
    if (String(item.tara || "RO").toUpperCase() === "RO" && !validRomanianCui(item.cui || item.cif)) addIssue(`Tertul ${label} nu are un CUI romanesc valid.`, { area: type === "furnizor" ? "Furnizori" : "Clienti", action: "Corecteaza CUI-ul tertului.", to, entity_type: type, entity_id: item.id || "" });
  });

  return {
    perioada, an, luna, start, end, company,
    accounts, customers, suppliers,
    products, journals, lines, allJournals: accounting.journals, allLines: accounting.journalLines,
    sales, purchases, payments, stockMovements, issues, issueDetails,
    summary: {
      accounts: accounts.length,
      customers: customers.length,
      suppliers: suppliers.length,
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
    contact_name: first(settings.contactName, settings.contact_name, settings.reprezentant, "InfraFlow Operator"),
    declaration_type: declarationType(first(settings.saftDeclarationType, settings.saft_declaration_type, settings.tip_decl, "L"))
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
function partyIdentifier(item) {
  const country = String(item?.tara || item?.country || "RO").trim().toUpperCase().slice(0, 2) || "RO";
  const raw = String(item?.cui || item?.cif || item?.tax_id || "").trim().toUpperCase();
  const taxId = raw.replace(new RegExp(`^${country}`), "").replace(/[^A-Z0-9]/g, "");
  if (country === "RO" && /^\d{2,10}$/.test(taxId)) return `00${taxId}`;
  if (country !== "RO" && taxId) return `${isEuropeanUnion(country) ? "01" : "02"}${country}${taxId}`;
  const internal = String(item?.cod || item?.code || item?.id || "NECOMPLETAT").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `04${internal || "NECOMPLETAT"}`;
}
function normalizeIban(value) { return String(value || "").replace(/\s/g, "").toUpperCase(); }
function normalizeAccount(value) { return String(value || "").trim().replace(/\.+$/, ""); }
function declarationType(value) { const code = String(value || "L").trim().toUpperCase(); return new Set(["L", "T", "A", "C", "NL", "NT"]).has(code) ? code : "L"; }
function validRomanianCui(value) {
  const digits = normalizeCui(value); if (!/^\d{2,10}$/.test(digits)) return false;
  const control = "753217532".slice(-digits.length + 1); let sum = 0;
  for (let index = 0; index < digits.length - 1; index += 1) sum += Number(digits[index]) * Number(control[index]);
  return (sum * 10) % 11 % 10 === Number(digits.at(-1));
}
function isEuropeanUnion(country) { return new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]).has(country); }
function first(...values) { return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || ""; }
function periodParts(period) { const match = String(period || "").match(/^(\d{4})-(\d{1,2})$/); if (!match) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM."); return [Number(match[1]), Number(match[2])]; }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = { buildSource, commodityCode, dateOf, documentNo, first, normalizeAccount, normalizeCui, partyIdentifier, validRomanianCui };

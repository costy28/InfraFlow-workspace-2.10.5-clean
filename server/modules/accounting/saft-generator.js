const crypto = require("crypto");
const engine = require("./accounting-engine");

function generate(db, period, profile = null) {
  const source = buildSource(db, period);
  const namespace = profile?.target_namespace || "urn:StandardAuditFile-Taxation-Financial:RO";
  const version = profile?.schema_version || "2.00";
  const content = render(source, namespace, version);
  return {
    code: "D406", perioada: source.perioada, schema_version: version, profile: profile || null,
    content, source_summary: source.summary, issues: source.issues,
    sha256: crypto.createHash("sha256").update(content).digest("hex"), generated_at: new Date().toISOString(),
    warning: "Candidat D406. Fisierul devine export valid numai dupa acceptarea validatorului ANAF configurat."
  };
}

function buildSource(db, period) {
  const [an, luna] = periodParts(period); const perioada = `${an}-${String(luna).padStart(2, "0")}`;
  const accounting = engine.ensureAccounting(db); const company = db.company || db.settings?.company || db.settings?.general || {};
  const journals = accounting.journals.filter((item) => engine.isActiveJournal(item) && Number(item.an) === an && Number(item.luna) === luna);
  const journalIds = new Set(journals.map((item) => Number(item.id)));
  const lines = accounting.journalLines.filter((item) => journalIds.has(Number(item.journal_id)));
  const accepted = new Set(["validat", "partial", "achitat", "incasat", "creditata"]);
  const sales = accounting.invoicesOut.filter((item) => Number(item.an) === an && Number(item.luna) === luna && accepted.has(String(item.status)));
  const purchases = accounting.invoicesIn.filter((item) => Number(item.an) === an && Number(item.luna) === luna && accepted.has(String(item.status)));
  const payments = accounting.treasury.filter((item) => Number(item.an) === an && Number(item.luna) === luna && item.status === "validat");
  const products = (db.inventory?.materials || []).filter((item) => item.active !== false && item.activ !== false);
  const issues = [];
  if (!normalizeCui(company.cif || company.cui || db.settings?.companyCui)) issues.push("CUI companie lipsa.");
  lines.forEach((line) => { if (!line.cont_simbol) issues.push(`Linia contabila ${line.id || "-"} nu are cont.`); });
  return {
    perioada, an, luna, start: `${an}-${String(luna).padStart(2, "0")}-01`, end: new Date(Date.UTC(an, luna, 0)).toISOString().slice(0, 10),
    company: { cui: normalizeCui(company.cif || company.cui || db.settings?.companyCui), name: company.name || company.companyName || company.denumire || "", address: company.address || company.adresa || "", city: company.city || company.localitate || "", country: "RO" },
    accounts: accounting.chart.filter((item) => item.activ !== false),
    customers: accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "client" || item.cont_analitic_client)),
    suppliers: accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "furnizor" || item.cont_analitic_furnizor)),
    products, journals, lines, sales, purchases, payments, issues,
    summary: { accounts: accounting.chart.filter((item) => item.activ !== false).length, customers: accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "client" || item.cont_analitic_client)).length, suppliers: accounting.thirdParties.filter((item) => item.activ !== false && (item.tip === "furnizor" || item.cont_analitic_furnizor)).length, products: products.length, journals: journals.length, lines: lines.length, sales: sales.length, purchases: purchases.length, payments: payments.length }
  };
}

function render(source, namespace, version) {
  const accountRows = source.accounts.map((item) => `<Account><AccountID>${x(item.simbol)}</AccountID><AccountDescription>${x(item.denumire)}</AccountDescription><AccountType>${x(item.tip || item.tip_cont || "GL")}</AccountType></Account>`).join("");
  const customerRows = source.customers.map((item) => partyXml("Customer", item, item.cont_analitic_client)).join("");
  const supplierRows = source.suppliers.map((item) => partyXml("Supplier", item, item.cont_analitic_furnizor)).join("");
  const productRows = source.products.map((item) => `<Product><ProductType>Goods</ProductType><ProductCode>${x(item.cod || item.code || item.id)}</ProductCode><ProductDescription>${x(item.denumire || item.name)}</ProductDescription><UOMBase>${x(item.um || item.unit || "BUC")}</UOMBase></Product>`).join("");
  const journals = source.journals.map((journal) => {
    const lines = source.lines.filter((item) => Number(item.journal_id) === Number(journal.id));
    const transactionLines = lines.map((line) => `<Line><RecordID>${x(line.id)}</RecordID><AccountID>${x(line.cont_simbol)}</AccountID><Description>${x(line.explicatie || journal.explicatie || "")}</Description>${amountXml(line)}</Line>`).join("");
    return `<Journal><JournalID>${x(journal.tip || "GL")}</JournalID><Description>${x(journal.explicatie || "Registru general")}</Description><Transaction><TransactionID>${x(journal.uuid || journal.id)}</TransactionID><Period>${source.luna}</Period><TransactionDate>${x(journal.data)}</TransactionDate><SourceID>${x(journal.created_by || "INFRAFLOW")}</SourceID><Description>${x(journal.explicatie || journal.nr_document || "Nota contabila")}</Description>${transactionLines}</Transaction></Journal>`;
  }).join("");
  const sales = source.sales.map((item) => invoiceXml("Invoice", item, "CustomerID", item.client_id)).join("");
  const purchases = source.purchases.map((item) => invoiceXml("Invoice", item, "SupplierID", item.furnizor_id)).join("");
  const payments = source.payments.map((item) => `<Payment><PaymentRefNo>${x(item.nr_document || item.uuid || item.id)}</PaymentRefNo><TransactionID>${x(item.journal_id || item.uuid || item.id)}</TransactionID><TransactionDate>${x(item.data)}</TransactionDate><PaymentMethod>${x(item.tip || "Banca")}</PaymentMethod><Description>${x(item.explicatie || "")}</Description><PaymentAmount><Amount currencyID="RON">${n(item.suma)}</Amount></PaymentAmount></Payment>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<AuditFile xmlns="${x(namespace)}"><Header><AuditFileVersion>${x(version)}</AuditFileVersion><AuditFileCountry>RO</AuditFileCountry><AuditFileDateCreated>${new Date().toISOString().slice(0, 10)}</AuditFileDateCreated><SoftwareCompanyName>InfraFlow</SoftwareCompanyName><SoftwareID>InfraFlow ERP</SoftwareID><SoftwareVersion>${x(require("../../../package.json").version)}</SoftwareVersion><Company><RegistrationNumber>${x(source.company.cui)}</RegistrationNumber><Name>${x(source.company.name)}</Name><Address><AddressDetail>${x(source.company.address)}</AddressDetail><City>${x(source.company.city)}</City><Country>${x(source.company.country)}</Country></Address></Company><DefaultCurrencyCode>RON</DefaultCurrencyCode><SelectionCriteria><PeriodStart>${x(source.start)}</PeriodStart><PeriodEnd>${x(source.end)}</PeriodEnd></SelectionCriteria></Header><MasterFiles><GeneralLedgerAccounts>${accountRows}</GeneralLedgerAccounts><Customers>${customerRows}</Customers><Suppliers>${supplierRows}</Suppliers><Products>${productRows}</Products></MasterFiles><GeneralLedgerEntries><NumberOfEntries>${source.journals.length}</NumberOfEntries><TotalDebit>${n(source.lines.reduce((s, i) => s + Number(i.debit || 0), 0))}</TotalDebit><TotalCredit>${n(source.lines.reduce((s, i) => s + Number(i.credit || 0), 0))}</TotalCredit>${journals}</GeneralLedgerEntries><SourceDocuments><SalesInvoices><NumberOfEntries>${source.sales.length}</NumberOfEntries>${sales}</SalesInvoices><PurchaseInvoices><NumberOfEntries>${source.purchases.length}</NumberOfEntries>${purchases}</PurchaseInvoices><Payments><NumberOfEntries>${source.payments.length}</NumberOfEntries>${payments}</Payments></SourceDocuments></AuditFile>\n`;
}

function partyXml(tag, item, account) { const id = normalizeCui(item.cui || item.cif) || item.cod || item.id; return `<${tag}><${tag}ID>${x(id)}</${tag}ID><AccountID>${x(account || "")}</AccountID><CompanyName>${x(item.denumire || item.nume || "")}</CompanyName><BillingAddress><AddressDetail>${x(item.adresa || "")}</AddressDetail><City>${x(item.localitate || "")}</City><Country>${x(item.tara || "RO")}</Country></BillingAddress><TaxRegistrationNumber>${x(normalizeCui(item.cui || item.cif))}</TaxRegistrationNumber></${tag}>`; }
function amountXml(line) { const debit = Number(line.debit || 0); return debit ? `<DebitAmount><Amount currencyID="RON">${n(debit)}</Amount></DebitAmount>` : `<CreditAmount><Amount currencyID="RON">${n(line.credit)}</Amount></CreditAmount>`; }
function invoiceXml(tag, item, partyTag, partyId) { return `<${tag}><InvoiceNo>${x(item.nr_document || item.numar || item.id)}</InvoiceNo><InvoiceDate>${x(item.data)}</InvoiceDate><${partyTag}>${x(partyId || item.tert_id || "")}</${partyTag}><DocumentTotals><TaxPayable>${n(item.tva)}</TaxPayable><NetTotal>${n(item.valoare)}</NetTotal><GrossTotal>${n(item.total)}</GrossTotal></DocumentTotals></${tag}>`; }
function periodParts(period) { const match = String(period || "").match(/^(\d{4})-(\d{1,2})$/); if (!match) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM."); return [Number(match[1]), Number(match[2])]; }
function normalizeCui(value) { return String(value || "").toUpperCase().replace(/^RO/, "").replace(/\D/g, ""); }
function n(value) { return Number(value || 0).toFixed(2); }
function x(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = { generate, buildSource };

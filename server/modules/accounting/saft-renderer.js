const sourceHelpers = require("./saft-source");
const nomenclatures = require("./saft-nomenclatures");

function render(source, namespace, auditFileVersion) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<AuditFile xmlns="${x(namespace)}">${headerXml(source, auditFileVersion)}${masterFilesXml(source)}${generalLedgerXml(source)}${sourceDocumentsXml(source)}</AuditFile>\n`;
}

function headerXml(source, version) {
  const company = source.company;
  const [firstName, ...lastParts] = String(company.contact_name || "InfraFlow Operator").trim().split(/\s+/);
  const lastName = lastParts.join(" ") || "Operator";
  return `<Header><AuditFileVersion>${x(version)}</AuditFileVersion><AuditFileCountry>RO</AuditFileCountry><AuditFileDateCreated>${today()}</AuditFileDateCreated><SoftwareCompanyName>InfraFlow</SoftwareCompanyName><SoftwareID>InfraFlow ERP</SoftwareID><SoftwareVersion>${x(require("../../../package.json").version)}</SoftwareVersion><Company><RegistrationNumber>${required(company.cui)}</RegistrationNumber><Name>${required(company.name)}</Name>${addressXml(company)}<Contact><ContactPerson><FirstName>${required(firstName)}</FirstName><LastName>${required(lastName)}</LastName></ContactPerson><Telephone>${required(company.phone)}</Telephone>${company.email ? `<Email>${x(company.email)}</Email>` : ""}</Contact><TaxRegistration><TaxRegistrationNumber>${required(company.cui)}</TaxRegistrationNumber><TaxType>VAT</TaxType><TaxNumber>${required(company.cui)}</TaxNumber><TaxAuthority>ANAF</TaxAuthority></TaxRegistration><BankAccount><IBANNumber>${required(company.iban)}</IBANNumber></BankAccount></Company><DefaultCurrencyCode>RON</DefaultCurrencyCode><SelectionCriteria><SelectionStartDate>${source.start}</SelectionStartDate><SelectionEndDate>${source.end}</SelectionEndDate><DocumentType>SAF-T D406</DocumentType></SelectionCriteria><HeaderComment>Generat de InfraFlow ERP pentru validare D406.</HeaderComment><SegmentIndex>1</SegmentIndex><TotalSegmentsInsequence>1</TotalSegmentsInsequence><TaxAccountingBasis>A</TaxAccountingBasis></Header>`;
}

function masterFilesXml(source) {
  const accounts = source.accounts.map((item) => accountXml(source, item)).join("");
  const customers = source.customers.map((item) => partyXml("Customer", item, item.cont_analitic_client || "4111")).join("");
  const suppliers = source.suppliers.map((item) => partyXml("Supplier", item, item.cont_analitic_furnizor || "401")).join("");
  const products = source.products.map(productXml).join("");
  const units = [...new Set(source.products.map((item) => unitCode(item)).filter(Boolean))].map((unit) => `<UOMTableEntry><UnitOfMeasure>${x(unit)}</UnitOfMeasure><Description>${x(unit)}</Description></UOMTableEntry>`).join("");
  const movementTypes = [...new Map(source.stockMovements.map((item) => {
    const movement = nomenclatures.movement(item);
    return [movement.code, movement];
  })).values()].map((item) => `<MovementTypeTableEntry><MovementType>${x(item.code)}</MovementType><Description>${x(item.description)}</Description></MovementTypeTableEntry>`).join("");
  return `<MasterFiles><GeneralLedgerAccounts>${accounts}</GeneralLedgerAccounts><Customers>${customers}</Customers><Suppliers>${suppliers}</Suppliers><TaxTable></TaxTable><UOMTable>${units}</UOMTable><AnalysisTypeTable></AnalysisTypeTable><MovementTypeTable>${movementTypes}</MovementTypeTable><Products>${products}</Products><Owners></Owners><Assets></Assets></MasterFiles>`;
}

function accountXml(source, item) {
  const balances = accountBalances(source, item.simbol);
  return `<Account><AccountID>${required(item.simbol)}</AccountID><AccountDescription>${required(item.denumire)}</AccountDescription><StandardAccountID>${required(item.simbol)}</StandardAccountID><AccountType>${accountType(item)}</AccountType>${balanceChoice("Opening", balances.opening)}${balanceChoice("Closing", balances.closing)}</Account>`;
}

function partyXml(tag, item, account) {
  const id = sourceHelpers.normalizeCui(item.cui || item.cif) || item.cod || item.id;
  return `<${tag}>${companyStructureXml(item)}<${tag}ID>${required(id)}</${tag}ID><SelfBillingIndicator>0</SelfBillingIndicator><AccountID>${required(account)}</AccountID><OpeningDebitBalance>0.00</OpeningDebitBalance><ClosingDebitBalance>0.00</ClosingDebitBalance></${tag}>`;
}

function companyStructureXml(item) {
  const name = item.denumire || item.nume || "";
  if (!name) return "";
  return `<CompanyStructure><RegistrationNumber>${required(sourceHelpers.normalizeCui(item.cui || item.cif) || item.cod || item.id)}</RegistrationNumber><Name>${required(name)}</Name>${addressXml({ address: item.adresa, city: item.localitate, country: item.tara || "RO" })}${item.telefon ? `<Contact><ContactPerson><FirstName>NotUsed</FirstName><LastName>${x(name)}</LastName></ContactPerson><Telephone>${x(item.telefon)}</Telephone>${item.email ? `<Email>${x(item.email)}</Email>` : ""}</Contact>` : ""}${item.iban ? `<BankAccount><IBANNumber>${x(String(item.iban).replace(/\s/g, "").toUpperCase())}</IBANNumber></BankAccount>` : ""}</CompanyStructure>`;
}

function productXml(item) {
  const unit = unitCode(item);
  return `<Product><ProductCode>${required(item.cod || item.code || item.id)}</ProductCode><GoodsServicesID>01</GoodsServicesID><Description>${required(item.denumire || item.name)}</Description><ProductCommodityCode>${required(sourceHelpers.commodityCode(item))}</ProductCommodityCode><UOMBase>${x(unit)}</UOMBase><UOMStandard>${x(unit)}</UOMStandard><UOMToUOMBaseConversionFactor>1</UOMToUOMBaseConversionFactor></Product>`;
}

function generalLedgerXml(source) {
  const debit = source.lines.reduce((sum, item) => sum + number(item.debit), 0);
  const credit = source.lines.reduce((sum, item) => sum + number(item.credit), 0);
  const journals = source.journals.map((journal) => journalXml(source, journal)).join("");
  return `<GeneralLedgerEntries><NumberOfEntries>${source.journals.length}</NumberOfEntries><TotalDebit>${n(debit)}</TotalDebit><TotalCredit>${n(credit)}</TotalCredit>${journals}</GeneralLedgerEntries>`;
}

function journalXml(source, journal) {
  const lines = source.lines.filter((item) => Number(item.journal_id) === Number(journal.id));
  const customer = relatedPartyId(source, journal, lines, "customer");
  const supplier = relatedPartyId(source, journal, lines, "supplier");
  const transactionLines = lines.map((line, index) => transactionLineXml(line, journal, index, customer, supplier)).join("");
  return `<Journal><JournalID>${required(journal.tip || "GL")}</JournalID><Description>${required(journal.explicatie || "Registru general")}</Description><Type>GL</Type><Transaction><TransactionID>${required(journal.uuid || journal.id)}</TransactionID><Period>${source.luna}</Period><PeriodYear>${source.an}</PeriodYear><TransactionDate>${date(journal.data, source.end)}</TransactionDate><SourceID>${required(journal.created_by || "INFRAFLOW")}</SourceID><TransactionType>N</TransactionType><Description>${required(journal.explicatie || journal.nr_document || "Nota contabila")}</Description><SystemEntryDate>${date(journal.created_at, journal.data || source.end)}</SystemEntryDate><GLPostingDate>${date(journal.data, source.end)}</GLPostingDate><CustomerID>${required(customer)}</CustomerID><SupplierID>${required(supplier)}</SupplierID>${transactionLines}</Transaction></Journal>`;
}

function transactionLineXml(line, journal, index, customer, supplier) {
  const debit = number(line.debit); const value = debit || number(line.credit);
  return `<TransactionLine><RecordID>${required(line.id || index + 1)}</RecordID><AccountID>${required(line.cont_simbol)}</AccountID><SourceDocumentID>${required(journal.nr_document || journal.id)}</SourceDocumentID><CustomerID>${required(customer)}</CustomerID><SupplierID>${required(supplier)}</SupplierID><Description>${required(line.explicatie || journal.explicatie || "Linie contabila")}</Description>${debit ? `<DebitAmount>${amountXml(value)}</DebitAmount>` : `<CreditAmount>${amountXml(value)}</CreditAmount>`}${taxInformationXml(line.tva_procent, line.tva, value, "TaxInformation", "ledger")}</TransactionLine>`;
}

function sourceDocumentsXml(source) {
  const sales = source.sales.map((item) => invoiceXml(source, item, "Customer")).join("");
  const purchases = source.purchases.map((item) => invoiceXml(source, item, "Supplier")).join("");
  const payments = source.payments.map((item, index) => paymentXml(source, item, index)).join("");
  const movements = source.stockMovements.map((item, index) => stockMovementXml(source, item, index)).join("");
  const salesTotals = invoiceControlTotals(source.sales);
  const purchaseTotals = invoiceControlTotals(source.purchases);
  return `<SourceDocuments><SalesInvoices><NumberOfEntries>${source.sales.length}</NumberOfEntries><TotalDebit>${n(salesTotals.debit)}</TotalDebit><TotalCredit>${n(salesTotals.credit)}</TotalCredit>${sales}</SalesInvoices><PurchaseInvoices><NumberOfEntries>${source.purchases.length}</NumberOfEntries><TotalDebit>${n(purchaseTotals.debit)}</TotalDebit><TotalCredit>${n(purchaseTotals.credit)}</TotalCredit>${purchases}</PurchaseInvoices><Payments><NumberOfEntries>${source.payments.length}</NumberOfEntries>${payments}</Payments><MovementOfGoods><NumberOfMovementLines>${source.stockMovements.length}</NumberOfMovementLines><TotalQuantityReceived>${n(source.stockMovements.filter((item) => number(item.amount) > 0).reduce((sum, item) => sum + number(item.amount), 0), 6)}</TotalQuantityReceived><TotalQuantityIssued>${n(Math.abs(source.stockMovements.filter((item) => number(item.amount) < 0).reduce((sum, item) => sum + number(item.amount), 0)), 6)}</TotalQuantityIssued>${movements}</MovementOfGoods></SourceDocuments>`;
}

function invoiceXml(source, item, partyType) {
  const party = findParty(source, partyType === "Customer" ? item.client_id || item.tert_id : item.furnizor_id || item.tert_id);
  const partyId = sourceHelpers.normalizeCui(party?.cui || party?.cif) || party?.cod || party?.id || "NECOMPLETAT";
  const account = partyType === "Customer" ? party?.cont_analitic_client || "4111" : party?.cont_analitic_furnizor || "401";
  const invoiceLines = Array.isArray(item.lines) && item.lines.length ? item.lines : [{ denumire: item.explicatie || sourceHelpers.documentNo(item), cantitate: 1, valoare: item.valoare, tva: item.tva, tva_procent: item.tva_procent }];
  const lines = invoiceLines.map((line, index) => invoiceLineXml(item, line, index, partyType)).join("");
  const dateValue = date(item.data, source.end);
  const taxContext = partyType === "Customer" ? "sales" : "purchases";
  return `<Invoice><InvoiceNo>${required(sourceHelpers.documentNo(item))}</InvoiceNo><${partyType}Info><${partyType}ID>${required(partyId)}</${partyType}ID>${addressXml({ address: party?.adresa, city: party?.localitate, country: party?.tara || "RO" }, "BillingAddress")}</${partyType}Info><AccountID>${required(account)}</AccountID><Period>${source.luna}</Period><PeriodYear>${source.an}</PeriodYear><InvoiceDate>${dateValue}</InvoiceDate><InvoiceType>${nomenclatures.invoiceType(item)}</InvoiceType><SelfBillingIndicator>0</SelfBillingIndicator><SourceID>INFRAFLOW</SourceID><GLPostingDate>${dateValue}</GLPostingDate><SystemID>${required(item.uuid || item.id)}</SystemID>${lines}<InvoiceDocumentTotals>${taxInformationXml(item.tva_procent, item.tva, item.valoare, "TaxInformationTotals", taxContext)}<NetTotal>${n(item.valoare)}</NetTotal><GrossTotal>${n(item.total || number(item.valoare) + number(item.tva))}</GrossTotal></InvoiceDocumentTotals></Invoice>`;
}

function invoiceLineXml(invoice, line, index, partyType) {
  const quantity = number(line.cantitate || line.quantity || 1) || 1;
  const net = number(line.valoare ?? line.value ?? invoice.valoare);
  const debitCredit = partyType === "Customer" ? "C" : "D";
  const account = line.cont || line.account || (partyType === "Customer" ? "704" : "628");
  const dateValue = date(invoice.data, today());
  const taxContext = partyType === "Customer" ? "sales" : "purchases";
  return `<InvoiceLine><LineNumber>${index + 1}</LineNumber><AccountID>${required(account)}</AccountID><GoodsServicesID>01</GoodsServicesID><ProductCode>${required(line.material_id || line.product_id || line.cod || `LINIE-${index + 1}`)}</ProductCode><ProductDescription>${required(line.denumire || line.name || invoice.explicatie || "Linie factura")}</ProductDescription><Quantity>${n(quantity, 6)}</Quantity><InvoiceUOM>${x(line.um || line.unit || "BUC")}</InvoiceUOM><UnitPrice>${n(net / quantity, 6)}</UnitPrice><TaxPointDate>${dateValue}</TaxPointDate><Description>${required(line.denumire || line.name || invoice.explicatie || "Linie factura")}</Description><InvoiceLineAmount>${amountXml(net)}</InvoiceLineAmount><DebitCreditIndicator>${debitCredit}</DebitCreditIndicator>${taxInformationXml(line.tva_procent ?? invoice.tva_procent, line.tva ?? invoice.tva, net, "TaxInformation", taxContext)}</InvoiceLine>`;
}

function paymentXml(source, item, index) {
  const party = findParty(source, item.tert_id || item.client_id || item.furnizor_id);
  const partyId = sourceHelpers.normalizeCui(party?.cui || party?.cif) || party?.cod || party?.id || "0";
  const amount = Math.abs(number(item.suma || item.amount));
  const indicator = String(item.tip_operatie || "").toLowerCase() === "incasare" ? "D" : "C";
  const account = item.cont_trezorerie || (item.tip === "casa" ? "5311" : "5121");
  const dateValue = date(item.data, source.end);
  return `<Payment><PaymentRefNo>${required(item.nr_document || item.uuid || item.id)}</PaymentRefNo><Period>${source.luna}</Period><PeriodYear>${source.an}</PeriodYear><TransactionID>${required(item.journal_id || item.uuid || item.id)}</TransactionID><TransactionDate>${dateValue}</TransactionDate><PaymentMethod>${required(item.tip || "Banca")}</PaymentMethod><Description>${required(item.explicatie || "Operatiune trezorerie")}</Description><SystemID>${required(item.uuid || item.id)}</SystemID><SourceID>INFRAFLOW</SourceID><PaymentLine><LineNumber>${index + 1}</LineNumber><SourceDocumentID>${required(item.nr_document || item.id)}</SourceDocumentID><AccountID>${required(account)}</AccountID><CustomerID>${required(partyId)}</CustomerID><SupplierID>${required(partyId)}</SupplierID><TaxPointDate>${dateValue}</TaxPointDate><Description>${required(item.explicatie || "Operatiune trezorerie")}</Description><DebitCreditIndicator>${indicator}</DebitCreditIndicator><PaymentLineAmount>${amountXml(amount)}</PaymentLineAmount>${taxInformationXml(0, 0, amount)}</PaymentLine><PaymentDocumentTotals><NetTotal>${n(amount)}</NetTotal><GrossTotal>${n(amount)}</GrossTotal></PaymentDocumentTotals></Payment>`;
}

function stockMovementXml(source, item, index) {
  const material = source.products.find((row) => String(row.id) === String(item.materialId || item.material_id));
  const amount = number(item.amount || item.cantitate); const quantity = Math.abs(amount);
  const code = nomenclatures.movement(item).code; const dateValue = date(sourceHelpers.dateOf(item), source.end);
  return `<StockMovement><MovementReference>${required(item.id || `M-${index + 1}`)}</MovementReference><MovementDate>${dateValue}</MovementDate><MovementType>${x(code)}</MovementType><SourceID>${required(item.createdBy || item.created_by || "INFRAFLOW")}</SourceID><SystemID>${required(item.id || index + 1)}</SystemID><StockMovementLine><LineNumber>1</LineNumber><AccountID>${required(material?.cont || material?.account || "301")}</AccountID><CustomerID>0</CustomerID><SupplierID>0</SupplierID><ProductCode>${required(material?.cod || material?.code || item.materialId || item.material_id)}</ProductCode><Quantity>${n(quantity, 6)}</Quantity><UnitOfMeasure>${x(unitCode(material || item))}</UnitOfMeasure><UOMToUOMPhysicalStockConversionFactor>1</UOMToUOMPhysicalStockConversionFactor><BookValue>${n(Math.abs(number(item.value || item.valoare || item.total)))}</BookValue><MovementSubType>${x(code)}</MovementSubType><MovementComments>${required(item.note || item.reason || "Miscare stoc")}</MovementComments></StockMovementLine></StockMovement>`;
}

function taxInformationXml(rate, tax, base, tag = "TaxInformation", context = "ledger") {
  const taxAmount = number(tax); const taxBase = number(base);
  const inferredRate = taxBase && taxAmount ? Math.round((Math.abs(taxAmount / taxBase) * 100) * 100) / 100 : 0;
  const mapping = nomenclatures.tax(number(rate) || inferredRate, context);
  return `<${tag}><TaxType>${mapping.type}</TaxType><TaxCode>${mapping.code}</TaxCode><TaxPercentage>${n(mapping.percentage, 2)}</TaxPercentage><TaxBase>${n(base)}</TaxBase><TaxAmount>${amountXml(taxAmount)}</TaxAmount></${tag}>`;
}
function amountXml(value) { return `<Amount>${n(value)}</Amount><CurrencyCode>RON</CurrencyCode><CurrencyAmount>${n(value)}</CurrencyAmount><ExchangeRate>1</ExchangeRate>`; }
function addressXml(value, tag = "Address") { return `<${tag}><StreetName>${required(value?.address)}</StreetName><City>${required(value?.city)}</City><Country>${x(String(value?.country || "RO").slice(0, 2).toUpperCase())}</Country></${tag}>`; }
function accountBalances(source, symbol) {
  const journalDates = new Map(source.allJournals.map((item) => [Number(item.id), date(item.data, "9999-12-31")]));
  let opening = 0; let closing = 0;
  source.allLines.filter((item) => String(item.cont_simbol) === String(symbol)).forEach((line) => {
    const lineDate = journalDates.get(Number(line.journal_id)) || "9999-12-31";
    const net = number(line.debit) - number(line.credit);
    if (lineDate < source.start) opening += net;
    if (lineDate <= source.end) closing += net;
  });
  return { opening, closing };
}
function balanceChoice(prefix, value) { return value >= 0 ? `<${prefix}DebitBalance>${n(value)}</${prefix}DebitBalance>` : `<${prefix}CreditBalance>${n(Math.abs(value))}</${prefix}CreditBalance>`; }
function accountType(item) { const value = String(item.tip || item.tip_cont || "").toUpperCase(); return value === "P" || value === "PASIV" ? "Pasiv" : value === "B" || value.includes("BIF") ? "Bifunctional" : "Activ"; }
function relatedPartyId(source, journal, lines, kind) { const id = journal[`${kind}_id`] || journal.tert_id || lines.find((item) => item[`${kind}_id`] || item.tert_id)?.[`${kind}_id`] || lines.find((item) => item.tert_id)?.tert_id; const party = findParty(source, id); return sourceHelpers.normalizeCui(party?.cui || party?.cif) || party?.cod || party?.id || "0"; }
function findParty(source, id) { return [...source.customers, ...source.suppliers].find((item) => String(item.id) === String(id)); }
function invoiceControlTotals(items) { return { debit: items.reduce((sum, item) => sum + number(item.total), 0), credit: 0 }; }
function unitCode(item) { return String(item?.um || item?.unit || "BUC").trim().toUpperCase().slice(0, 9) || "BUC"; }
function required(value) { const text = String(value ?? "").trim(); return x(text || "NECOMPLETAT"); }
function date(value, fallback) { const text = String(value || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : String(fallback || today()).slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }
function number(value) { const result = Number(value || 0); return Number.isFinite(result) ? result : 0; }
function n(value, digits = 2) { return number(value).toFixed(digits); }
function x(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }

module.exports = { render };

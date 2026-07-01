const sourceBuilder = require("./saft-source");

function inspect(db, period) {
  const source = sourceBuilder.buildSource(db, period);
  const issues = [...(source.issueDetails || [])];
  const accountIds = new Set(source.accounts.map((item) => sourceBuilder.normalizeAccount(item.simbol)));
  const add = (message, area, action, to, entityType = "", entityId = "") => issues.push({ message, area, action, to, entity_type: entityType, entity_id: entityId });

  source.lines.forEach((line) => {
    const account = sourceBuilder.normalizeAccount(line.cont_simbol);
    if (account && !accountIds.has(account)) add(`Contul ${account} folosit in jurnal nu exista sau nu este activ in planul SAF-T.`, "Plan de conturi", "Activeaza sau corecteaza contul.", "/contabilitate/plan-conturi", "journal_line", line.id);
  });
  source.journals.forEach((journal) => {
    const lines = source.lines.filter((line) => Number(line.journal_id) === Number(journal.id));
    const debit = sum(lines, "debit"); const credit = sum(lines, "credit");
    if (!lines.length) add(`Nota ${journal.nr_document || journal.id} nu are linii contabile.`, "Registru jurnal", "Completeaza sau anuleaza nota goala.", `/contabilitate/registru-jurnal?luna=${source.perioada}`, "journal", journal.id);
    else if (Math.abs(debit - credit) > 0.01) add(`Nota ${journal.nr_document || journal.id} este dezechilibrata cu ${Math.abs(debit - credit).toFixed(2)} RON.`, "Registru jurnal", "Corecteaza debitul si creditul notei.", `/contabilitate/registru-jurnal?luna=${source.perioada}`, "journal", journal.id);
  });
  [...source.sales.map((item) => [item, "iesire"]), ...source.purchases.map((item) => [item, "intrare"])].forEach(([invoice, type]) => {
    if (!invoice.journal_id || !source.allJournals.some((journal) => Number(journal.id) === Number(invoice.journal_id))) add(`Factura ${sourceBuilder.documentNo(invoice)} nu este corelata cu o nota contabila.`, type === "iesire" ? "Facturi iesire" : "Facturi intrare", "Genereaza sau reface nota contabila a facturii.", `/contabilitate/facturi-${type}?luna=${source.perioada}&q=${encodeURIComponent(sourceBuilder.documentNo(invoice))}`, `invoice_${type}`, invoice.id || invoice.uuid);
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
    lines.forEach((line, index) => { if (!line.cont && !line.account) add(`Factura ${sourceBuilder.documentNo(invoice)}, linia ${index + 1}, nu are cont contabil explicit.`, type === "iesire" ? "Facturi iesire" : "Facturi intrare", "Completeaza contul liniei de factura.", `/contabilitate/facturi-${type}?luna=${source.perioada}&q=${encodeURIComponent(sourceBuilder.documentNo(invoice))}`, `invoice_${type}`, invoice.id || invoice.uuid); });
  });
  source.payments.forEach((payment) => {
    if (!payment.journal_id || !source.allJournals.some((journal) => Number(journal.id) === Number(payment.journal_id))) add(`Operatiunea de trezorerie ${payment.nr_document || payment.id} nu este corelata cu o nota contabila.`, "Trezorerie", "Revalideaza operatiunea sau genereaza nota contabila.", `/contabilitate/trezorerie?luna=${source.perioada}`, "treasury", payment.id || payment.uuid);
  });

  const unique = [...new Map(issues.map((item) => [`${item.message}|${item.entity_id || ""}`, item])).values()];
  return { perioada: source.perioada, ready: unique.length === 0, issues: unique, summary: source.summary, checks: { journals: source.journals.length, journal_lines: source.lines.length, invoices: source.sales.length + source.purchases.length, payments: source.payments.length, products: source.products.length } };
}

function sum(items, key) { return items.reduce((total, item) => total + Number(item[key] || 0), 0); }

module.exports = { inspect };

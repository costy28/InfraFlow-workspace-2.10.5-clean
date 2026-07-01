const MOVEMENT_TYPES = {
  delivery: { code: "10", description: "Achizitie" },
  purchase: { code: "10", description: "Achizitie" },
  production: { code: "20", description: "Productie" },
  sale: { code: "30", description: "Vanzare" },
  sales_return: { code: "40", description: "Retur produse vandute" },
  cancel_delivery: { code: "50", description: "Retur produse achizitionate" },
  purchase_return: { code: "50", description: "Retur produse achizitionate" },
  discount: { code: "60", description: "Reduceri comerciale primite" },
  consumption: { code: "70", description: "Consum" },
  manual_out: { code: "70", description: "Consum" },
  transfer: { code: "80", description: "Transfer intern" },
  opening_stock: { code: "110", description: "Plus de inventar" },
  manual_in: { code: "110", description: "Plus de inventar" },
  inventory_plus: { code: "110", description: "Plus de inventar" },
  inventory_minus: { code: "120", description: "Minus de inventar" }
};

const VAT_CODES = {
  sales: { 21: "310344", 19: "310309", 11: "310351", 9: "310310", 5: "310311" },
  purchases: { 21: "301104", 19: "301101", 11: "301105", 9: "301102", 5: "301103" },
  ledger: { 21: "380006", 19: "380001", 11: "380007", 9: "380002", 5: "380003" }
};

function movement(item) {
  const raw = String(item?.type || item?.tip || "").trim().toLowerCase();
  if (MOVEMENT_TYPES[raw]) return MOVEMENT_TYPES[raw];
  return Number(item?.amount ?? item?.cantitate ?? 0) >= 0
    ? { code: "110", description: "Plus de inventar" }
    : { code: "120", description: "Minus de inventar" };
}

function invoiceType(invoice) {
  const marker = `${invoice?.tip || ""} ${invoice?.status || ""} ${invoice?.explicatie || ""}`.toLowerCase();
  const total = Number(invoice?.total ?? invoice?.valoare ?? 0);
  if (/autofact/.test(marker)) return "389";
  if (/corect|reemis/.test(marker)) return "384";
  if (/storn|credit/.test(marker) || total < 0) return "381";
  if (/asigur/.test(marker)) return "575";
  if (/contabil/.test(marker)) return "751";
  return "380";
}

function tax(rate, context = "ledger") {
  const percentage = Number(rate || 0);
  if (!percentage) return { type: "000", code: "000000", percentage: 0 };
  const group = VAT_CODES[context] || VAT_CODES.ledger;
  return { type: "300", code: group[percentage] || "000000", percentage };
}

module.exports = { invoiceType, movement, tax };

const crypto = require("crypto");
const engine = require("./accounting-engine");

const DEFAULTS = {
  D300: { root: "declaratie300", namespace: "urn:anaf:declaratie:300" },
  D394: { root: "declaratie394", namespace: "urn:anaf:declaratie:394" }
};

function generate(db, code, period, profile = null) {
  const declarationCode = String(code || "").toUpperCase();
  if (!DEFAULTS[declarationCode]) throwHttp(400, "Adaptorul declaratiei nu este disponibil.");
  const [an, luna] = periodParts(period);
  const source = declarationCode === "D300" ? buildD300Source(db, an, luna) : buildD394Source(db, an, luna);
  const defaults = DEFAULTS[declarationCode];
  const root = safeXmlName(profile?.root_element) || defaults.root;
  const namespace = String(profile?.target_namespace || defaults.namespace);
  const attributes = mapRequiredAttributes(db, declarationCode, an, luna, profile, source);
  const warnings = [];
  if (!profile?.target_namespace || !profile?.root_element) warnings.push("Profilul XSD nu contine namespace-ul si radacina complete; candidatul necesita verificare externa.");
  const unresolved = attributes.filter((item) => item.required && item.value === "").map((item) => item.name);
  if (unresolved.length) warnings.push(`Campuri obligatorii fara mapare: ${unresolved.join(", ")}.`);
  const content = declarationCode === "D300"
    ? d300Xml(root, namespace, attributes, source, warnings)
    : d394Xml(root, namespace, attributes, source, warnings);
  return {
    code: declarationCode,
    perioada: `${an}-${String(luna).padStart(2, "0")}`,
    schema_version: profile?.schema_version || "neconfirmata",
    profile: profile || null,
    source,
    warnings,
    content,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    generated_at: new Date().toISOString(),
    warning: "Candidat XML bazat pe profilul incarcat. Devine fisier utilizabil numai dupa acceptarea validatorului configurat."
  };
}

function buildD300Source(db, an, luna) {
  const accounting = engine.ensureAccounting(db);
  const input = activeMonth(accounting.invoicesIn, an, luna);
  const output = activeMonth(accounting.invoicesOut, an, luna);
  const credits = activeMonth(accounting.creditNotes, an, luna).filter((item) => item.status === "validat");
  const purchases = groupVat([...input, ...credits.map(negativeDocument)]);
  const sales = groupVat(output);
  const deductible = money(purchases.reduce((sum, item) => sum + item.tva, 0));
  const collected = money(sales.reduce((sum, item) => sum + item.tva, 0));
  return {
    purchases,
    sales,
    totals: {
      purchases_base: money(purchases.reduce((sum, item) => sum + item.baza, 0)),
      deductible_vat: deductible,
      sales_base: money(sales.reduce((sum, item) => sum + item.baza, 0)),
      collected_vat: collected,
      payable: Math.max(0, money(collected - deductible)),
      recoverable: Math.max(0, money(deductible - collected))
    }
  };
}

function buildD394Source(db, an, luna) {
  const accounting = engine.ensureAccounting(db);
  const parties = new Map(accounting.thirdParties.map((item) => [String(item.id), item]));
  const documents = [];
  add(accounting.invoicesIn, "A", "furnizor_id");
  add(accounting.creditNotes.filter((item) => item.status === "validat").map(negativeDocument), "A", "furnizor_id");
  add(accounting.invoicesOut, "L", "client_id");
  function add(items, operation, partyKey) {
    activeMonth(items, an, luna).forEach((item) => {
      const party = parties.get(String(item[partyKey] || item.tert_id)) || {};
      if (String(party.tara || "RO").toUpperCase() !== "RO") return;
      documents.push({
        operation,
        cui: normalizeCui(party.cui || party.cif),
        name: party.denumire || party.nume || "",
        number: item.nr_document || item.numar || String(item.id || ""),
        date: item.data || "",
        rate: vatRate(item),
        base: money(item.valoare), vat: money(item.tva), total: money(item.total)
      });
    });
  }
  return {
    documents,
    totals: {
      documents: documents.length,
      base: money(documents.reduce((sum, item) => sum + item.base, 0)),
      vat: money(documents.reduce((sum, item) => sum + item.vat, 0)),
      total: money(documents.reduce((sum, item) => sum + item.total, 0))
    }
  };
}

function mapRequiredAttributes(db, code, an, luna, profile, source) {
  const company = db.company || db.settings?.company || db.settings?.general || {};
  const aliases = {
    an: an, luna: String(luna).padStart(2, "0"),
    cui: normalizeCui(company.cif || company.cui || db.settings?.companyCui),
    cif: normalizeCui(company.cif || company.cui || db.settings?.companyCui),
    den: company.name || company.companyName || company.denumire || "",
    denumire: company.name || company.companyName || company.denumire || "",
    totalplata_a: code === "D300" ? source.totals.payable : 0,
    sumacontrol: code === "D300" ? money(source.totals.deductible_vat + source.totals.collected_vat) : source.totals.total,
    tip_intocmit: "1"
  };
  const requested = new Set(["an", "luna", "cui", "den", ...(profile?.required_attributes || []).map((item) => String(item))]);
  return [...requested].map((name) => ({ name: safeXmlName(name), value: String(aliases[String(name).toLowerCase()] ?? ""), required: (profile?.required_attributes || []).includes(name) })).filter((item) => item.name);
}

function d300Xml(root, namespace, attributes, source, warnings) {
  const rates = [...source.purchases.map((item) => ({ ...item, section: "achizitii" })), ...source.sales.map((item) => ({ ...item, section: "livrari" }))]
    .map((item) => `  <if:rand section="${item.section}" cota="${item.rate}" baza="${item.baza}" tva="${item.tva}" documente="${item.documents}" />`).join("\n");
  return xmlEnvelope(root, namespace, attributes, rates, warnings);
}

function d394Xml(root, namespace, attributes, source, warnings) {
  const rows = source.documents.map((item) => `  <if:operatie tip="${item.operation}" cuiP="${escapeXml(item.cui)}" denP="${escapeXml(item.name)}" nrFact="${escapeXml(item.number)}" data="${escapeXml(item.date)}" cota="${item.rate}" baza="${item.base}" tva="${item.vat}" total="${item.total}" />`).join("\n");
  return xmlEnvelope(root, namespace, attributes, rows, warnings);
}

function xmlEnvelope(root, namespace, attributes, body, warnings) {
  const attrs = attributes.map((item) => `${item.name}="${escapeXml(item.value)}"`).join(" ");
  const notes = warnings.map((item) => `  <!-- ${escapeXml(item)} -->`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="${escapeXml(namespace)}" xmlns:if="urn:infraflow:adapter:1" ${attrs}>\n${notes}${notes ? "\n" : ""}${body}\n</${root}>\n`;
}

function groupVat(items) {
  const groups = new Map();
  items.forEach((item) => {
    const rate = vatRate(item); const row = groups.get(rate) || { rate, baza: 0, tva: 0, documents: 0 };
    row.baza = money(row.baza + Number(item.valoare || 0)); row.tva = money(row.tva + Number(item.tva || 0)); row.documents += 1; groups.set(rate, row);
  });
  return [...groups.values()].sort((a, b) => b.rate - a.rate);
}
function vatRate(item) { return money(item.tva_procent ?? (Number(item.valoare || 0) ? Number(item.tva || 0) * 100 / Number(item.valoare) : 0)); }
function negativeDocument(item) { return { ...item, valoare: -Math.abs(Number(item.valoare || 0)), tva: -Math.abs(Number(item.tva || 0)), total: -Math.abs(Number(item.total || 0)) }; }
function activeMonth(items, an, luna) { return (items || []).filter((item) => Number(item.an) === an && Number(item.luna) === luna && !item.cancelled_at && !["anulat", "stornat", "draft"].includes(String(item.status || ""))); }
function periodParts(period) { const match = String(period || "").match(/^(\d{4})-(\d{1,2})$/); if (!match) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM."); return [Number(match[1]), Number(match[2])]; }
function normalizeCui(value) { return String(value || "").toUpperCase().replace(/^RO/, "").replace(/\D/g, ""); }
function safeXmlName(value) { const name = String(value || "").trim(); return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) ? name : ""; }
function money(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function escapeXml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = { generate, buildD300Source, buildD394Source };

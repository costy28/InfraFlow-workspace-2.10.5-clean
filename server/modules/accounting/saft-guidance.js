function guide(message, context = {}) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  if (context.to) return { message: text, area: context.area || "Date sursa", action: context.action || "Completeaza datele lipsa.", to: context.to, entity_type: context.entity_type || "", entity_id: context.entity_id || "" };
  if (/companie|auditfile\/header|taxregistration/.test(lower)) return item(text, "Companie", "Completeaza datele societatii.", "/setari");
  if (/tert|customer|client/.test(lower)) return item(text, "Clienti", "Verifica identificarea fiscala, adresa si IBAN-ul clientului.", "/contabilitate/clienti");
  if (/supplier|furnizor/.test(lower)) return item(text, "Furnizori", "Verifica identificarea fiscala, adresa si IBAN-ul furnizorului.", "/contabilitate/furnizori");
  if (/taxcode|taxpercentage|tva/.test(lower)) return item(text, "TVA", "Verifica cota si codul fiscal aplicabil perioadei.", "/contabilitate/tva-declaratii?tab=saft");
  if (/accountid|contul|cont /.test(lower)) return item(text, "Plan de conturi", "Verifica simbolul si maparea contului.", "/contabilitate/plan-conturi");
  if (/payment|plata|incasare|trezorerie/.test(lower)) return item(text, "Trezorerie", "Verifica operatiunea si tertul corelat.", "/contabilitate/trezorerie");
  if (/invoice|factura/.test(lower)) return item(text, "Facturi", "Deschide factura si completeaza campurile obligatorii.", "/contabilitate/facturi-intrare");
  if (/product|produs|commodity|unit|uom/.test(lower)) return item(text, "Produse", "Completeaza codul NC si unitatea de masura.", "/gestiune");
  if (/journal|ledger|transaction|nota contabila/.test(lower)) return item(text, "Registru jurnal", "Verifica nota contabila si legatura cu documentul sursa.", "/contabilitate/registru-jurnal");
  return item(text, "SAF-T", "Deschide Audit fiscal si verifica detaliul validatorului.", "/contabilitate/audit-fiscal");
}

function guideMany(messages) { return [...new Map((messages || []).map((message) => { const result = typeof message === "string" ? guide(message) : guide(message.message, message); return [`${result.message}:${result.to}`, result]; })).values()]; }
function item(message, area, action, to) { return { message, area, action, to, entity_type: "", entity_id: "" }; }

module.exports = { guide, guideMany };

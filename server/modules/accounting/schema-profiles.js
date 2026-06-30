const path = require("path");
const AdmZip = require("adm-zip");

function inspect(fileName, buffer) {
  const extension = path.extname(String(fileName || "")).toLowerCase();
  let xsdName = path.basename(fileName || "schema.xsd");
  let source = buffer;
  if (extension === ".zip") {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find((item) => !item.isDirectory && /\.xsd$/i.test(item.entryName));
    if (!entry) throwHttp(422, "Arhiva nu contine niciun fisier XSD.");
    xsdName = entry.entryName;
    source = entry.getData();
  }
  const text = decodeXml(source);
  if (!/<(?:xs|xsd):schema\b/i.test(text)) throwHttp(422, "Fisierul nu contine o schema XML valida.");
  const targetNamespace = match(text, /targetNamespace\s*=\s*["']([^"']+)["']/i);
  const version = match(text, /<(?:xs|xsd):schema\b[^>]*\bversion\s*=\s*["']([^"']+)["']/i);
  const root = match(text, /<(?:xs|xsd):element\s+name\s*=\s*["']([^"']+)["']/i);
  const requiredAttributes = unique([...text.matchAll(/<(?:xs|xsd):attribute\s+name\s*=\s*["']([^"']+)["'][^>]*\buse\s*=\s*["']required["'][^>]*\/?>/gi)].map((item) => item[1]));
  return { xsd_name: xsdName, target_namespace: targetNamespace, schema_version: version, root_element: root, required_attributes: requiredAttributes, required_count: requiredAttributes.length };
}

function select(accounting, code, period) {
  const value = `${String(period || "").slice(0, 7)}-01`;
  return (accounting.anafSchemas || [])
    .filter((item) => item.code === String(code || "").toUpperCase() && item.active !== false)
    .filter((item) => (!item.valid_from || item.valid_from <= value) && (!item.valid_to || item.valid_to >= value))
    .sort((a, b) => String(b.valid_from || b.uploaded_at || "").localeCompare(String(a.valid_from || a.uploaded_at || "")))[0] || null;
}

function profile(schema) {
  if (!schema) return null;
  const metadata = schema.schema_metadata || parseJson(schema.schema_json) || {};
  return {
    id: schema.id, uuid: schema.uuid, code: schema.code, original_name: schema.original_name,
    sha256: schema.sha256, valid_from: schema.valid_from || "", valid_to: schema.valid_to || "",
    order_reference: schema.order_reference || "", source_url: schema.source_url || "",
    ...metadata
  };
}

function decodeXml(buffer) {
  if (!Buffer.isBuffer(buffer)) return String(buffer || "");
  if (buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString("utf16le");
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}
function match(text, regex) { return regex.exec(text)?.[1] || ""; }
function unique(items) { return [...new Set(items.filter(Boolean))]; }
function parseJson(value) { try { return typeof value === "string" ? JSON.parse(value) : value; } catch (_) { return null; } }
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = { inspect, select, profile };

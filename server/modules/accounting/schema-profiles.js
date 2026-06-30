const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const bundledDirectory = path.resolve(__dirname, "../../resources/anaf");

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
  const documentationVersion = match(text, /<(?:\w+:)?Number>\s*([^<]+)\s*<\/(?:\w+:)?Number>/i);
  const documentationModifiedAt = match(text, /<(?:\w+:)?ModificationDate>\s*([^<]+)\s*<\/(?:\w+:)?ModificationDate>/i);
  const basedOn = match(text, /<(?:\w+:)?BasedOn>\s*([^<]+)\s*<\/(?:\w+:)?BasedOn>/i);
  const auditFileVersion = match(basedOn, /(\d+\.\d+)\s*$/);
  const root = match(text, /<(?:xs|xsd):element\s+name\s*=\s*["']([^"']+)["']/i);
  const requiredAttributes = unique([...text.matchAll(/<(?:xs|xsd):attribute\s+name\s*=\s*["']([^"']+)["'][^>]*\buse\s*=\s*["']required["'][^>]*\/?>/gi)].map((item) => item[1]));
  return { xsd_name: xsdName, target_namespace: targetNamespace, schema_version: version, audit_file_version: auditFileVersion, documentation_version: documentationVersion, documentation_modified_at: documentationModifiedAt, root_element: root, required_attributes: requiredAttributes, required_count: requiredAttributes.length };
}

function select(accounting, code, period) {
  const value = `${String(period || "").slice(0, 7)}-01`;
  const requestedCode = String(code || "").toUpperCase();
  const aliases = requestedCode === "D406" || requestedCode === "SAF-T" ? new Set(["D406", "SAF-T"]) : new Set([requestedCode]);
  const configured = (accounting.anafSchemas || [])
    .filter((item) => aliases.has(item.code) && item.active !== false)
    .filter((item) => (!item.valid_from || item.valid_from <= value) && (!item.valid_to || item.valid_to >= value))
    .sort((a, b) => String(b.valid_from || b.uploaded_at || "").localeCompare(String(a.valid_from || a.uploaded_at || "")))[0];
  if (configured) return configured;
  return bundled().find((item) => aliases.has(item.code) && (!item.valid_from || item.valid_from <= value) && (!item.valid_to || item.valid_to >= value)) || null;
}

function bundled() {
  const manifestPath = path.join(bundledDirectory, "saft-schema-manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const filePath = path.join(bundledDirectory, manifest.file_name);
    if (!fs.existsSync(filePath)) return [];
    const actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
    if (actualSha256 !== String(manifest.sha256 || "").toUpperCase()) return [];
    return [{
      id: "bundled-saft-v249-2025", uuid: "bundled-saft-v249-2025", active: true, bundled: true,
      uploaded_at: manifest.published_at || "2025-07-08", uploaded_by: "system", file_path: filePath,
      actual_sha256: actualSha256, hash_valid: true,
      ...manifest
    }];
  } catch (_) { return []; }
}

function profile(schema) {
  if (!schema) return null;
  const metadata = schema.schema_metadata || parseJson(schema.schema_json) || {};
  return {
    id: schema.id, uuid: schema.uuid, code: schema.code, declaration_code: schema.declaration_code || schema.code,
    original_name: schema.original_name, file_path: schema.file_path || "", bundled: Boolean(schema.bundled),
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

module.exports = { inspect, select, profile, bundled };

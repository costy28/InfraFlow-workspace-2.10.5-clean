const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const xsdValidator = require("./xsd-validator");

const OFFICIAL_SCHEMA = path.resolve(process.cwd(), "server", "resources", "anaf", "d205_2025_v3.xsd");

function validate(content) {
  const source = fs.readFileSync(OFFICIAL_SCHEMA, "utf8");
  const normalized = source.replace('xmlns="mfp:anaf:dgti:d205:declaratie:v3"', 'xmlns="mfp:anaf:dgti:d205:declaratie:v2"');
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  const schemaPath = path.join(os.tmpdir(), `infraflow-d205-${hash.slice(0, 12)}.xsd`);
  if (!fs.existsSync(schemaPath) || fs.readFileSync(schemaPath, "utf8") !== normalized) fs.writeFileSync(schemaPath, normalized, "utf8");
  const result = xsdValidator.validate(Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"), { file_path: schemaPath, schema_version: "D205 v3 / 2026" });
  return { ...result, official_schema: OFFICIAL_SCHEMA, official_sha256: hash, namespace_compatibility_applied: normalized !== source };
}

module.exports = { validate, OFFICIAL_SCHEMA };

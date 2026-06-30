const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function validate(buffer, schema) {
  const schemaPath = resolveSchemaPath(schema);
  const script = path.resolve(__dirname, "../../../scripts/windows/validate-xml-xsd.ps1");
  if (!schemaPath || !fs.existsSync(schemaPath)) return unavailable("Schema XSD nu este disponibila local.");
  if (!fs.existsSync(script)) return unavailable("Scriptul local de validare XSD lipseste.");
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "infraflow-xsd-"));
  const xmlPath = path.join(folder, "candidate.xml");
  try {
    fs.writeFileSync(xmlPath, buffer);
    const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-XmlPath", xmlPath, "-XsdPath", schemaPath], {
      encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 5 * 1024 * 1024
    });
    const parsed = parseResult(result.stdout);
    return {
      available: true, accepted: result.status === 0 && parsed.valid === true,
      exit_code: Number.isInteger(result.status) ? result.status : -1,
      schema_path: schemaPath, schema_version: schema?.schema_metadata?.schema_version || schema?.schema_version || "",
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      error_count: Number(parsed.error_count || parsed.errors?.length || 0),
      stderr: String(result.stderr || result.error?.message || "").trim()
    };
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}

function resolveSchemaPath(schema) {
  const value = schema?.file_path || "";
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}
function parseResult(value) { try { return JSON.parse(String(value || "{}").trim()); } catch (_) { return { valid: false, errors: ["Validatorul XSD nu a returnat un raspuns JSON valid."] }; } }
function unavailable(message) { return { available: false, accepted: false, exit_code: -1, errors: [message], error_count: 1 }; }

module.exports = { validate, resolveSchemaPath };

const crypto = require("crypto");
const d112Generator = require("./d112-generator");
const declarationAdapters = require("./declaration-adapters");
const saftGenerator = require("./saft-generator");

function generate(db, code, period, profileOrVersion = "") {
  const declarationCode = String(code || "").toUpperCase();
  const [an, luna] = String(period || "").split("-").map(Number);
  if (!an || !luna) throwHttp(400, "Perioada trebuie sa aiba formatul YYYY-MM.");
  const profile = typeof profileOrVersion === "object" && profileOrVersion ? profileOrVersion : null;
  const schemaVersion = profile?.schema_version || String(profileOrVersion || "");
  if (["D300", "D394"].includes(declarationCode)) return declarationAdapters.generate(db, declarationCode, period, profile || { schema_version: schemaVersion });
  if (["D406", "SAF-T"].includes(declarationCode)) return saftGenerator.generate(db, period, profile || { schema_version: schemaVersion });
  let content;
  if (declarationCode === "D112") content = d112Generator.toWorkingXml(d112Generator.buildSource(db, period)).content;
  else throwHttp(400, "Declaratia nu accepta generare de candidat XML.");
  return {
    code: declarationCode,
    perioada: period,
    schema_version: schemaVersion || "neconfirmata",
    content,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    generated_at: new Date().toISOString(),
    warning: "Fisier candidat InfraFlow. Devine export verificat numai dupa acceptarea de validatorul configurat."
  };
}
function throwHttp(status, message) { const error = new Error(message); error.status = status; throw error; }

module.exports = { generate };

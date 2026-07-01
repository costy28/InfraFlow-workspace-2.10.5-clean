const crypto = require("crypto");
const sourceBuilder = require("./saft-source");
const renderer = require("./saft-renderer");

function generate(db, period, profile = null) {
  const source = buildSource(db, period);
  const namespace = profile?.filing_namespace || profile?.target_namespace || "urn:StandardAuditFile-Taxation-Financial:RO";
  const schemaVersion = profile?.schema_version || "";
  const auditFileVersion = profile?.audit_file_version || "2.00";
  const content = renderer.render(source, namespace, auditFileVersion);
  return {
    code: "D406", perioada: source.perioada, schema_version: schemaVersion, audit_file_version: auditFileVersion, profile: profile || null,
    content, source_summary: source.summary, issues: source.issues,
    sha256: crypto.createHash("sha256").update(content).digest("hex"), generated_at: new Date().toISOString(),
    warning: "Candidat D406. Fisierul devine export valid numai dupa acceptarea validatorului ANAF configurat."
  };
}

function buildSource(db, period) { return sourceBuilder.buildSource(db, period); }

module.exports = { generate, buildSource };

const path = require("path");

const FINAL_STATUSES = new Set(["acceptat", "respins", "anulat"]);

function declarationPeriod(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { an: Number(match[1]), luna: month, value: `${match[1]}-${String(month).padStart(2, "0")}` };
}

function latestRun(runs, code, an, luna, statuses = []) {
  const allowed = new Set(statuses);
  return [...(runs || [])].reverse().find((item) =>
    String(item.code || "").toUpperCase() === String(code || "").toUpperCase()
      && Number(item.an) === Number(an)
      && Number(item.luna) === Number(luna)
      && (!allowed.size || allowed.has(String(item.status || "")))
      && !item.cancelled_at
  );
}

function buildRegister(runs, period) {
  const declarations = ["D300", "D394", "D112"].map((code) => {
    const history = (runs || [])
      .filter((item) => item.code === code && Number(item.an) === period.an && Number(item.luna) === period.luna && !item.cancelled_at)
      .sort((a, b) => String(b.updated_at || b.validated_at || "").localeCompare(String(a.updated_at || a.validated_at || "")));
    return { code, latest: history[0] || null, history };
  });
  return { perioada: period.value, declarations };
}

function receiptStatus(value) {
  const status = String(value || "acceptata").toLowerCase();
  if (!["acceptata", "respinsa", "in_procesare"].includes(status)) return null;
  return status;
}

function runStatusFromReceipt(status) {
  if (status === "acceptata") return "acceptat";
  if (status === "respinsa") return "respins";
  return "depus";
}

function safeStoredName(originalName, prefix) {
  const extension = path.extname(String(originalName || "")).toLowerCase();
  const allowed = new Set([".pdf", ".xml", ".zip", ".txt"]);
  if (!allowed.has(extension)) return null;
  return `${String(prefix || "recipisa").replace(/[^a-zA-Z0-9_-]/g, "_")}${extension}`;
}

function canExport(run) {
  return Boolean(run && ["validat_intern", "exportat"].includes(run.status) && !run.cancelled_at);
}

function canReceiveReceipt(run) {
  return Boolean(run && ["validat_intern", "exportat", "depus", "respins"].includes(run.status) && !FINAL_STATUSES.has(run.status) && !run.cancelled_at);
}

module.exports = {
  declarationPeriod,
  latestRun,
  buildRegister,
  receiptStatus,
  runStatusFromReceipt,
  safeStoredName,
  canExport,
  canReceiveReceipt
};

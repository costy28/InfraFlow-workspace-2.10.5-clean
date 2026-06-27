const crypto = require("crypto");
const engine = require("./accounting-engine");

function createPeriodSnapshot(db, user, an, luna, check) {
  const accounting = engine.ensureAccounting(db);
  const balance = engine.buildBalance(db, Number(an), Number(luna), "analitica");
  const inPeriod = (item) => Number(item.an) === Number(an) && Number(item.luna) === Number(luna) && item.status !== "anulat";
  const previous = accounting.periodSnapshots.filter((item) => Number(item.an) === Number(an) && Number(item.luna) === Number(luna));
  const payload = {
    an: Number(an),
    luna: Number(luna),
    versiune: previous.length + 1,
    balance_rows: balance.rows.map((row) => ({
      cont: row.cont,
      rulaje_D: row.rulaje_D || 0,
      rulaje_C: row.rulaje_C || 0,
      sold_D: row.sold_D || 0,
      sold_C: row.sold_C || 0
    })),
    balance_totals: balance.totals || {},
    journal_ids: accounting.journals.filter((item) => engine.isActiveJournal(item) && inPeriod(item)).map((item) => item.id),
    invoice_in_ids: accounting.invoicesIn.filter(inPeriod).map((item) => item.id),
    invoice_out_ids: accounting.invoicesOut.filter(inPeriod).map((item) => item.id),
    treasury_ids: accounting.treasury.filter(inPeriod).map((item) => item.id),
    checks: check?.checks || {},
    vat: check?.vat || {}
  };
  const snapshot = {
    id: engine.nextNumericId(accounting.periodSnapshots),
    ...payload,
    checksum: checksum(payload),
    created_by: user?.id || "",
    created_by_name: user?.name || "",
    created_at: new Date().toISOString()
  };
  accounting.periodSnapshots.push(snapshot);
  return snapshot;
}

function addPeriodEvent(db, user, an, luna, type, details = {}) {
  const accounting = engine.ensureAccounting(db);
  const event = {
    id: engine.nextNumericId(accounting.periodEvents),
    an: Number(an),
    luna: Number(luna),
    type,
    details,
    user_id: user?.id || "",
    user_name: user?.name || "",
    created_at: new Date().toISOString()
  };
  accounting.periodEvents.push(event);
  return event;
}

function periodHistory(db, an, luna) {
  const accounting = engine.ensureAccounting(db);
  const matches = (item) => Number(item.an) === Number(an) && Number(item.luna) === Number(luna);
  return {
    events: accounting.periodEvents.filter(matches).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    snapshots: accounting.periodSnapshots.filter(matches).sort((a, b) => Number(b.versiune) - Number(a.versiune)),
    latest_snapshot: accounting.periodSnapshots.filter(matches).sort((a, b) => Number(b.versiune) - Number(a.versiune))[0] || null
  };
}

function checksum(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

module.exports = { createPeriodSnapshot, addPeriodEvent, periodHistory, checksum };

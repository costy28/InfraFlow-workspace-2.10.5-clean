const fiscal = require("./fiscal-register");

const REQUIRED_CODES = ["D300", "D394", "D112", "D406"];

function submissionCheck(accounting, an, luna) {
  const period = `${an}-${String(luna).padStart(2, "0")}`;
  const declarations = REQUIRED_CODES.map((code) => {
    if (code === "D406") {
      const run = [...(accounting.saftRuns || [])].reverse().find((item) => item.perioada === period && !item.cancelled_at);
      return { code, accepted: run?.receipt_status === "acceptata", receipt: run?.recipisa || "", run_id: run?.id || null, status: run?.receipt_status || run?.status || "lipsa" };
    }
    const run = fiscal.latestRun(accounting.declarationRuns, code, an, luna);
    return { code, accepted: run?.receipt_status === "acceptata", receipt: run?.recipisa || "", run_id: run?.id || null, status: run?.receipt_status || run?.status || "lipsa" };
  });
  return { perioada: period, ready: declarations.every((item) => item.accepted), declarations, missing: declarations.filter((item) => !item.accepted).map((item) => item.code) };
}

module.exports = { REQUIRED_CODES, submissionCheck };

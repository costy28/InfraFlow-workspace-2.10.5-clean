function dailyOvertime(workedHours, normalHours = 8, explicitS1 = 0, explicitS2 = 0) {
  const explicit = number(explicitS1) + number(explicitS2);
  return round(explicit > 0 ? explicit : Math.max(0, number(workedHours) - number(normalHours, 8)));
}

function overtimePaymentStatus(workedAt, uncompensatedHours, referenceDate = new Date()) {
  const deadline = new Date(`${workedAt}T12:00:00`);
  deadline.setDate(deadline.getDate() + 90);
  return { deadline: deadline.toISOString().slice(0, 10), overdue: number(uncompensatedHours) > 0 && deadline < referenceDate, hours: round(Math.max(0, number(uncompensatedHours))), minimumBonusPercent: 75 };
}

function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function round(value) { return Math.round(value * 100) / 100; }

module.exports = { dailyOvertime, overtimePaymentStatus };

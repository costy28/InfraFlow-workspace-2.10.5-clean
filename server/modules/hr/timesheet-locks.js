function ensureTimesheetLocks(db) {
  db.hr = db.hr || {};
  db.hr.timesheetLocks = Array.isArray(db.hr.timesheetLocks) ? db.hr.timesheetLocks : [];
  return db.hr.timesheetLocks;
}

function findTimesheetLock(db, month) {
  return ensureTimesheetLocks(db).find((item) => item.luna === month && !item.unlocked_at) || null;
}

function assertTimesheetOpen(db, month) {
  const lock = findTimesheetLock(db, month);
  if (!lock) return;
  const error = new Error(`Pontajul pentru ${month} este inchis. Deblocheaza luna inainte de modificare.`);
  error.status = 409;
  error.code = "HR_TIMESHEET_MONTH_LOCKED";
  throw error;
}

module.exports = { ensureTimesheetLocks, findTimesheetLock, assertTimesheetOpen };

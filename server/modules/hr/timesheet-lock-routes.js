const { Router } = require("express");
const { requireAuth } = require("../../core/auth");
const { requirePermission, requireAnyPermission, authHasPermission } = require("../../core/permissions");
const { overtimeApprovalScope } = require("./timesheet-access");
const { writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");
const { ensureTimesheetLocks, findTimesheetLock } = require("./timesheet-locks");

const router = Router();

router.get("/hr/timesheets/lock", authorizeStatus, (req, res) => {
  const luna = validMonth(req.query.luna);
  res.json({ luna, locked: Boolean(findTimesheetLock(req.auth.db, luna)), lock: findTimesheetLock(req.auth.db, luna), can_manage: canManageMonth(req.auth) });
});

router.post("/hr/timesheets/lock", authorizeMonthManagement, (req, res, next) => {
  try {
    const luna = validMonth(req.body?.luna);
    const locks = ensureTimesheetLocks(req.auth.db);
    if (findTimesheetLock(req.auth.db, luna)) return res.status(409).json({ error: `Pontajul pentru ${luna} este deja inchis.`, code: "HR_TIMESHEET_ALREADY_LOCKED" });
    const item = { id: nextId(locks), luna, motiv: String(req.body?.motiv || "Inchidere pontaj lunar").trim(), locked_at: new Date().toISOString(), locked_by: req.auth.user.id };
    locks.push(item);
    addAudit(req.auth.db, req.auth.user, "hr_timesheet_month_locked", `${luna} / ${item.motiv}`);
    writeDb(req.auth.db);
    res.status(201).json({ item });
  } catch (error) { next(error); }
});

router.post("/hr/timesheets/unlock", authorizeMonthManagement, (req, res, next) => {
  try {
    const luna = validMonth(req.body?.luna);
    const motiv = String(req.body?.motiv || "").trim();
    if (motiv.length < 5) return res.status(400).json({ error: "Motivul deblocarii este obligatoriu (minimum 5 caractere).", code: "HR_TIMESHEET_UNLOCK_REASON_REQUIRED" });
    const item = findTimesheetLock(req.auth.db, luna);
    if (!item) return res.status(409).json({ error: `Pontajul pentru ${luna} nu este inchis.`, code: "HR_TIMESHEET_NOT_LOCKED" });
    Object.assign(item, { unlocked_at: new Date().toISOString(), unlocked_by: req.auth.user.id, unlock_reason: motiv });
    addAudit(req.auth.db, req.auth.user, "hr_timesheet_month_unlocked", `${luna} / ${motiv}`);
    writeDb(req.auth.db);
    res.json({ item });
  } catch (error) { next(error); }
});

function authorizeStatus(req, res, next) {
  const auth = requireAuth(req, res);
  if (!auth || !requireAnyPermission(auth, res, ['hr:timesheet', 'hr:timesheets_validate', 'hr:timesheet_approve'])) return;
  req.auth = auth;
  next();
}
function canManageMonth(auth) {
  return authHasPermission(auth, 'hr:timesheets_validate') && overtimeApprovalScope(auth).type === 'all';
}
function authorizeMonthManagement(req, res, next) {
  const auth = requireAuth(req, res);
  if (!auth || !requirePermission(auth, res, 'hr:timesheets_validate')) return;
  if (!canManageMonth(auth)) return res.status(403).json({ error: 'La închiderea sau redeschiderea lunii este necesar acces global la pontaje.', code: 'HR_TIMESHEET_GLOBAL_ACCESS_REQUIRED' });
  req.auth = auth;
  next();
}
function validMonth(value) { const month = String(value || new Date().toISOString().slice(0, 7)); if (!/^\d{4}-\d{2}$/.test(month)) { const error = new Error("Luna pontajului este invalida."); error.status = 400; throw error; } return month; }
function nextId(items) { return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1; }

module.exports = router;

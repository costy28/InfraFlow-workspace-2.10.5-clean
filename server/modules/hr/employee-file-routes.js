const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { requireAuth } = require("../../core/auth");
const { requirePermission, authHasPermission } = require("../../core/permissions");
const kioskSessions = require("../../core/kiosk-sessions");
const { readDb, writeDb } = require("../../core/db");
const { addAudit } = require("../../core/audit");

const router = Router();
const root = path.join(__dirname, "../../../storage/hr-files");
const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
fs.mkdirSync(root, { recursive: true });

router.get("/hr/employees/:id/files", authorize("hr:view"), (req, res) => {
  const files = ensureFiles(req.auth.db).filter((item) => String(item.employee_id) === String(req.params.id) && !item.cancelled_at);
  res.json({ items: files });
});

router.get("/hr/dossier-checklist", authorize("hr:view"), (req, res) => {
  const hr = req.auth.db.hr || {};
  const employees = (Array.isArray(hr.employees) ? hr.employees : []).filter((employee) => employee.activ !== false && employee.activ !== 0);
  const files = ensureFiles(req.auth.db).filter((item) => !item.cancelled_at);
  const rows = employees.map((employee) => dossierChecklistFor(employee, files.filter((item) => String(item.employee_id) === String(employee.id))));
  const complete = rows.filter((row) => row.percent === 100).length;
  const criticalMissing = rows.filter((row) => row.items.some((item) => item.required && !item.ok)).length;
  res.json({ rows, summary: { total: rows.length, complete, incomplete: rows.length - complete, critical_missing: criticalMissing } });
});

router.get("/hr/advanced-expirations", authorize("hr:view"), (req, res) => {
  const relevant = collectAdvancedExpirations(req.auth.db);
  res.json({ rows: relevant, summary: summarizeExpirations(relevant) });
});

router.post("/hr/advanced-expirations/notify", authorize("hr:manage"), (req, res) => {
  const rows = collectAdvancedExpirations(req.auth.db);
  const urgentRows = rows.filter((item) => item.severity === "expired" || item.severity === "critical");
  const users = hrNotificationUsers(req.auth.db, req.auth.user);
  req.auth.db.notifications = Array.isArray(req.auth.db.notifications) ? req.auth.db.notifications : [];
  let created = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  urgentRows.forEach((item) => {
    users.forEach((user) => {
      const key = `hr-scadenta-${user.id}-${item.id}`;
      if (req.auth.db.notifications.some((notification) => notification.key === key)) {
        skipped += 1;
        return;
      }
      const expired = item.days < 0;
      req.auth.db.notifications.push({
        id: `notification-${crypto.randomUUID()}`,
        key,
        user_id: user.id,
        type: expired ? "bad" : "warning",
        event: "hr_expiration",
        severity: expired ? "bad" : "warn",
        title: expired ? "Scadență HR depășită" : "Scadență HR critică",
        message: `${item.employee_name}: ${item.label} ${expired ? `a expirat de ${Math.abs(item.days)} zile` : `expiră în ${item.days} zile`} (${item.date}).`,
        detail: `${item.source} · marca ${item.marca || "-"} · ${item.functia || "-"}`,
        targetView: "hr",
        targetLabel: "Vezi HR",
        roles: ["hr", "manager", "admin", "superadmin"],
        entity_key: item.id,
        employee_id: item.employee_id,
        createdAt: now,
        created_at: now,
        read: false
      });
      created += 1;
    });
  });
  if (created) {
    addAudit(req.auth.db, req.auth.user, "hr_scadente_notificari_generate", `${created} notificări pentru ${urgentRows.length} scadențe critice`);
    writeDb(req.auth.db);
  }
  res.json({ created, skipped, targets: users.length, rows: urgentRows.length });
});

router.get("/hr/advanced-expirations/notifications", authorize("hr:manage"), (req, res) => {
  const notifications = hrExpirationNotifications(req.auth.db);
  const open = notifications.filter((item) => item.read !== true && !item.read_at && !item.resolved_at).length;
  res.json({
    notifications,
    summary: {
      total: notifications.length,
      open,
      resolved: notifications.length - open
    }
  });
});

router.post("/hr/advanced-expirations/notifications/:id/resolve", authorize("hr:manage"), (req, res) => {
  req.auth.db.notifications = Array.isArray(req.auth.db.notifications) ? req.auth.db.notifications : [];
  const notification = req.auth.db.notifications.find((item) => String(item.id) === String(req.params.id));
  if (!notification || notification.event !== "hr_expiration") return res.status(404).json({ error: "Notificarea HR nu a fost gasita.", code: "HR_NOTIFICATION_NOT_FOUND" });
  const now = new Date().toISOString();
  notification.read = true;
  notification.read_at = now;
  notification.resolved_at = now;
  notification.resolved_by = req.auth.user.id;
  notification.resolved_by_name = req.auth.user.name || req.auth.user.username || "";
  addAudit(req.auth.db, req.auth.user, "hr_scadenta_notificare_rezolvata", notification.message || notification.key || notification.id);
  writeDb(req.auth.db);
  res.json({ notification });
});

router.get("/hr/kiosk/my-documents", (req, res) => {
  const auth = ownDocumentAuth(req, res);
  if (!auth) return;
  const files = ensureFiles(auth.db)
    .filter((item) => String(item.employee_id) === String(auth.employee.id) && !item.cancelled_at && (item.requires_ack || item.generated || item.kiosk_visible))
    .sort((a, b) => String(b.data_document || b.created_at || "").localeCompare(String(a.data_document || a.created_at || "")))
    .map(publicFileForKiosk);
  res.json({ documents: files });
});

router.post("/hr/employees/:id/files", authorize("hr:manage"), upload.single("file"), (req, res, next) => {
  try {
    if (!req.file || !allowed.has(req.file.mimetype)) return res.status(422).json({ error: "Acceptam PDF, JPG, PNG, DOCX sau XLSX, maximum 10 MB.", code: "HR_FILE_TYPE_INVALID" });
    const employeeId = String(req.params.id);
    const folder = path.join(root, `employee_${safeSegment(employeeId)}`);
    fs.mkdirSync(folder, { recursive: true });
    const uuid = crypto.randomUUID();
    const extension = path.extname(req.file.originalname).toLowerCase();
    const storedName = `${uuid}${extension}`;
    fs.writeFileSync(path.join(folder, storedName), req.file.buffer);
    const files = ensureFiles(req.auth.db);
    const item = { id: nextId(files), uuid, employee_id: employeeId, tip: String(req.body.tip || "altul").slice(0, 50), denumire: String(req.body.denumire || req.file.originalname).slice(0, 200), file_name: req.file.originalname.slice(0, 200), stored_name: storedName, mime_type: req.file.mimetype, file_size: req.file.size, data_document: req.body.data_document || null, data_expirare: req.body.data_expirare || null, requires_ack: req.body.requires_ack === "true" || req.body.requires_ack === true, kiosk_visible: req.body.kiosk_visible === "true" || req.body.kiosk_visible === true, uploaded_by: req.auth.user.id, created_at: new Date().toISOString() };
    files.push(item);
    addAudit(req.auth.db, req.auth.user, "hr_employee_file_upload", `${employeeId} / ${item.tip} / ${item.file_name}`);
    writeDb(req.auth.db);
    res.status(201).json({ item });
  } catch (error) { next(error); }
});

router.post("/hr/employees/:id/files/generated", authorize("hr:manage"), (req, res, next) => {
  try {
    const employeeId = String(req.params.id);
    const html = String(req.body?.html || "").trim();
    if (!html || !/^<!DOCTYPE html>|<html[\s>]/i.test(html)) return res.status(422).json({ error: "Documentul generat nu contine HTML valid.", code: "HR_GENERATED_DOCUMENT_INVALID" });
    if (Buffer.byteLength(html, "utf8") > 2 * 1024 * 1024) return res.status(422).json({ error: "Documentul generat este prea mare pentru dosarul electronic.", code: "HR_GENERATED_DOCUMENT_TOO_LARGE" });
    const folder = path.join(root, `employee_${safeSegment(employeeId)}`);
    fs.mkdirSync(folder, { recursive: true });
    const uuid = crypto.randomUUID();
    const storedName = `${uuid}.html`;
    const denumire = String(req.body?.denumire || "Document HR generat").trim().slice(0, 200);
    fs.writeFileSync(path.join(folder, storedName), html, "utf8");
    const files = ensureFiles(req.auth.db);
    const item = {
      id: nextId(files),
      uuid,
      employee_id: employeeId,
      tip: String(req.body?.tip || "altul").slice(0, 50),
      denumire,
      file_name: `${safeSegment(denumire) || "document-hr"}.html`,
      stored_name: storedName,
      mime_type: "text/html",
      file_size: Buffer.byteLength(html, "utf8"),
      data_document: req.body?.data_document || new Date().toISOString().slice(0, 10),
      data_expirare: req.body?.data_expirare || null,
      generated: true,
      generated_source: String(req.body?.source || "").slice(0, 80),
      requires_ack: req.body?.requires_ack !== false,
      kiosk_visible: true,
      uploaded_by: req.auth.user.id,
      created_at: new Date().toISOString()
    };
    files.push(item);
    addAudit(req.auth.db, req.auth.user, "hr_employee_file_generated", `${employeeId} / ${item.tip} / ${item.denumire}`);
    writeDb(req.auth.db);
    res.status(201).json({ item });
  } catch (error) { next(error); }
});

router.get("/hr/employees/:id/files/:fileId/download", authorize("hr:view"), (req, res) => {
  const item = ensureFiles(req.auth.db).find((file) => String(file.id) === String(req.params.fileId) && String(file.employee_id) === String(req.params.id) && !file.cancelled_at);
  if (!item) return res.status(404).json({ error: "Documentul nu a fost gasit.", code: "HR_FILE_NOT_FOUND" });
  const filePath = path.join(root, `employee_${safeSegment(item.employee_id)}`, item.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Fisierul nu mai exista in storage.", code: "HR_FILE_STORAGE_MISSING" });
  if (item.mime_type) res.type(item.mime_type);
  res.download(filePath, item.file_name);
});

router.get("/hr/kiosk/my-documents/:fileId/download", (req, res) => {
  const auth = ownDocumentAuth(req, res);
  if (!auth) return;
  const item = ensureFiles(auth.db).find((file) => String(file.id) === String(req.params.fileId) && String(file.employee_id) === String(auth.employee.id) && !file.cancelled_at && (file.requires_ack || file.generated || file.kiosk_visible));
  if (!item) return res.status(404).json({ error: "Documentul nu a fost gasit.", code: "HR_FILE_NOT_FOUND" });
  sendFileDownload(res, item);
});

router.post("/hr/kiosk/my-documents/:fileId/ack", (req, res) => {
  const auth = ownDocumentAuth(req, res);
  if (!auth) return;
  const files = ensureFiles(auth.db);
  const item = files.find((file) => String(file.id) === String(req.params.fileId) && String(file.employee_id) === String(auth.employee.id) && !file.cancelled_at && (file.requires_ack || file.generated || file.kiosk_visible));
  if (!item) return res.status(404).json({ error: "Documentul nu a fost gasit.", code: "HR_FILE_NOT_FOUND" });
  const now = new Date().toISOString();
  item.requires_ack = true;
  item.kiosk_visible = true;
  item.acknowledged_at = item.acknowledged_at || now;
  item.acknowledged_by = item.acknowledged_by || auth.user.id;
  item.acknowledged_by_name = item.acknowledged_by_name || auth.user.name || auth.user.username || auth.employeeName;
  item.acknowledged_note = String(req.body?.note || "Am luat la cunostinta.").slice(0, 300);
  item.acknowledged_ip = clientIp(req);
  addAudit(auth.db, auth.user, "hr_employee_file_ack", `${auth.employee.id} / ${item.id} / ${item.denumire}`);
  writeDb(auth.db);
  res.json({ item: publicFileForKiosk(item) });
});

router.patch("/hr/employees/:id/files/:fileId", authorize("hr:manage"), (req, res) => {
  const item = ensureFiles(req.auth.db).find((file) => String(file.id) === String(req.params.fileId) && String(file.employee_id) === String(req.params.id) && !file.cancelled_at);
  if (!item) return res.status(404).json({ error: "Documentul nu a fost gasit.", code: "HR_FILE_NOT_FOUND" });
  if (req.body.tip !== undefined) item.tip = String(req.body.tip || "altul").slice(0, 50);
  if (req.body.denumire !== undefined) item.denumire = String(req.body.denumire || item.file_name || "Document").slice(0, 200);
  if (req.body.data_document !== undefined) item.data_document = req.body.data_document || null;
  if (req.body.data_expirare !== undefined) item.data_expirare = req.body.data_expirare || null;
  if (req.body.requires_ack !== undefined) item.requires_ack = Boolean(req.body.requires_ack);
  if (req.body.kiosk_visible !== undefined) item.kiosk_visible = Boolean(req.body.kiosk_visible);
  item.updated_at = new Date().toISOString();
  item.updated_by = req.auth.user.id;
  addAudit(req.auth.db, req.auth.user, "hr_employee_file_update", `${item.employee_id} / ${item.id} / ${item.tip}`);
  writeDb(req.auth.db);
  res.json({ item });
});

router.delete("/hr/employees/:id/files/:fileId", authorize("hr:manage"), (req, res) => {
  const item = ensureFiles(req.auth.db).find((file) => String(file.id) === String(req.params.fileId) && String(file.employee_id) === String(req.params.id) && !file.cancelled_at);
  if (!item) return res.status(404).json({ error: "Documentul nu a fost gasit.", code: "HR_FILE_NOT_FOUND" });
  const reason = String(req.body?.motiv || "Anulare document din dosarul angajatului").trim();
  Object.assign(item, { cancelled_at: new Date().toISOString(), cancelled_by: req.auth.user.id, cancelled_reason: reason });
  addAudit(req.auth.db, req.auth.user, "hr_employee_file_cancel", `${item.employee_id} / ${item.id} / ${reason}`);
  writeDb(req.auth.db);
  res.status(204).end();
});

function ensureFiles(db) { db.hr = db.hr || {}; db.hr.employeeFiles = Array.isArray(db.hr.employeeFiles) ? db.hr.employeeFiles : []; return db.hr.employeeFiles; }
function authorize(permission) { return (req, res, next) => { const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, permission)) return; req.auth = auth; next(); }; }
function safeSegment(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, "_"); }
function nextId(items) { return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1; }
function clientIp(req) { return kioskSessions.clientIp ? kioskSessions.clientIp(req) : String(req.socket?.remoteAddress || ""); }
function sendFileDownload(res, item) {
  const filePath = path.join(root, `employee_${safeSegment(item.employee_id)}`, item.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Fisierul nu mai exista in storage.", code: "HR_FILE_STORAGE_MISSING" });
  if (item.mime_type) res.type(item.mime_type);
  return res.download(filePath, item.file_name);
}
function publicFileForKiosk(item) {
  return {
    id: item.id,
    uuid: item.uuid,
    tip: item.tip,
    denumire: item.denumire,
    file_name: item.file_name,
    mime_type: item.mime_type,
    file_size: item.file_size,
    data_document: item.data_document,
    data_expirare: item.data_expirare,
    generated: Boolean(item.generated),
    requires_ack: Boolean(item.requires_ack || item.generated || item.kiosk_visible),
    acknowledged_at: item.acknowledged_at || null,
    acknowledged_by_name: item.acknowledged_by_name || "",
    created_at: item.created_at
  };
}
function ownDocumentAuth(req, res) {
  const session = kioskSessions.getSession(kioskSessions.tokenFromRequest(req));
  const db = session ? readDb() : null;
  if (session) {
    const employee = findEmployee(db, session.employee_id);
    if (!employee) { res.status(404).json({ error: "Angajatul nu a fost gasit.", code: "HR_EMPLOYEE_NOT_FOUND" }); return null; }
    return { db, employee, employeeName: employeeName(employee), user: { id: `kiosk-${session.employee_id}`, username: session.username, name: session.username, role: "kiosk" } };
  }
  const appAuth = requireAuth(req, res);
  if (!appAuth) return null;
  const employee = findLinkedEmployee(appAuth.db, appAuth.user);
  if (!employee) { res.status(404).json({ error: "Contul nu este asociat unui angajat.", code: "HR_EMPLOYEE_LINK_MISSING" }); return null; }
  return { db: appAuth.db, employee, employeeName: employeeName(employee), user: appAuth.user };
}
function findEmployee(db, employeeId) {
  const employees = Array.isArray(db.hr?.employees) ? db.hr.employees : [];
  return employees.find((item) => String(item.id) === String(employeeId) && item.activ !== false && item.activ !== 0);
}
function findLinkedEmployee(db, user) {
  const employees = Array.isArray(db.hr?.employees) ? db.hr.employees : [];
  const linkedEmployeeId = user.employee_id || user.employeeId || "";
  return employees.find((item) => item.activ !== false && item.activ !== 0 && (String(item.user_id || "") === String(user.id) || (linkedEmployeeId && String(item.id) === String(linkedEmployeeId))));
}
function employeeName(employee) { return [employee.prenume, employee.nume].filter(Boolean).join(" ") || employee.nume_complet || employee.name || "Angajat"; }
function collectAdvancedExpirations(db) {
  const hr = db.hr || {};
  const employees = (Array.isArray(hr.employees) ? hr.employees : []).filter((employee) => employee.activ !== false && employee.activ !== 0);
  const files = ensureFiles(db).filter((item) => !item.cancelled_at);
  const contracts = Array.isArray(hr.contracts) ? hr.contracts : [];
  const amendments = Array.isArray(hr.contractAmendments) ? hr.contractAmendments : [];
  const authorizations = Array.isArray(hr.authorizations) ? hr.authorizations : [];
  const rows = [];
  employees.forEach((employee) => {
    const name = employeeName(employee);
    addExpiration(rows, employee, "contract_angajat", "Contract angajat", employee.data_expirare_contract, "📄", name, "Date angajat");
    addExpiration(rows, employee, "permis", "Permis conducere", employee.permis_conducere_expira || employee.data_expirare_permis, "🪪", name, "Date angajat");
    addExpiration(rows, employee, "iscir", "ISCIR", employee.data_expirare_iscir, "⚙️", name, "Date angajat");
    addExpiration(rows, employee, "apt_medical", "Apt medical", employee.apt_medical_expira || employee.adeverinta_medicala, "🏥", name, "Date angajat");
    addExpiration(rows, employee, "act_identitate", "Act identitate", employee.act_identitate_valabil_pana, "🪪", name, "Date angajat");
    contracts
      .filter((contract) => String(contract.employee_id) === String(employee.id) && String(contract.status || "activ") !== "incetat")
      .forEach((contract) => addExpiration(rows, employee, "contract_operational", `Contract ${contract.numar_contract || contract.id}`, contract.data_sfarsit, "📑", name, "Contracte HR"));
    amendments
      .filter((item) => String(item.employee_id) === String(employee.id) && item.tip === "suspendare")
      .forEach((item) => addExpiration(rows, employee, "suspendare", `Suspendare ${item.numar_act || item.id}`, item.data_efect, "⏸️", name, "Acte adiționale"));
    authorizations
      .filter((item) => String(item.employee_id) === String(employee.id))
      .forEach((item) => addExpiration(rows, employee, "autorizatie", item.tip || item.tip_autorizatie || "Autorizație", item.data_expirare, "🛂", name, "Autorizații"));
    files
      .filter((item) => String(item.employee_id) === String(employee.id) && item.data_expirare)
      .forEach((item) => addExpiration(rows, employee, "document_dosar", item.denumire || item.file_name || item.tip || "Document dosar", item.data_expirare, "📁", name, "Dosar electronic"));
  });
  return rows.filter((item) => item.days !== null && item.days <= 90).sort((a, b) => a.days - b.days || String(a.employee_name).localeCompare(String(b.employee_name)));
}
function hrNotificationUsers(db, fallbackUser) {
  const users = (Array.isArray(db.users) ? db.users : []).filter((user) => user && user.active !== false && user.activ !== false && user.disabled !== true);
  const targets = users.filter((user) => (
    authHasPermission({ db, user }, "hr:manage")
    || authHasPermission({ db, user }, "hr:authorizations_manage")
    || authHasPermission({ db, user }, "hr:contracts_manage")
  ));
  const unique = [];
  const seen = new Set();
  [...targets, fallbackUser].filter(Boolean).forEach((user) => {
    if (seen.has(String(user.id))) return;
    seen.add(String(user.id));
    unique.push(user);
  });
  return unique;
}
function hrExpirationNotifications(db) {
  const users = Array.isArray(db.users) ? db.users : [];
  return (Array.isArray(db.notifications) ? db.notifications : [])
    .filter((item) => item && item.event === "hr_expiration")
    .map((item) => {
      const user = users.find((row) => String(row.id) === String(item.user_id || item.userId || ""));
      return {
        id: item.id,
        key: item.key,
        title: item.title || "Scadență HR",
        message: item.message || "",
        detail: item.detail || "",
        employee_id: item.employee_id || null,
        entity_key: item.entity_key || "",
        user_id: item.user_id || item.userId || null,
        user_name: user ? (user.name || user.username || `Utilizator ${user.id}`) : (item.user_name || ""),
        severity: item.severity || item.type || "warn",
        created_at: item.created_at || item.createdAt || null,
        resolved_at: item.resolved_at || item.read_at || null,
        resolved_by: item.resolved_by || null,
        resolved_by_name: item.resolved_by_name || "",
        status: item.read === true || item.read_at || item.resolved_at ? "rezolvată" : "deschisă"
      };
    })
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}
function dossierChecklistFor(employee, files) {
  const checks = [
    { key: "contract", label: "CIM / contract", required: true, aliases: ["contract", "cim"] },
    { key: "identitate", label: "Act identitate", required: true, aliases: ["identitate", "ci", "act_identitate"] },
    { key: "fisa_post", label: "Fișa postului", required: true, aliases: ["fisa_post", "fisa post", "post"] },
    { key: "medical", label: "Apt medical", required: true, aliases: ["medical", "apt_medical", "medicina_muncii"] },
    { key: "ssm", label: "SSM / PSI", required: true, aliases: ["ssm", "psi", "protectia_muncii"] },
    { key: "gdpr", label: "GDPR", required: false, aliases: ["gdpr", "date_personale"] },
    { key: "diploma", label: "Diplome / calificări", required: false, aliases: ["diploma", "calificare", "studii"] },
    { key: "act_aditional", label: "Acte adiționale", required: false, aliases: ["act_aditional", "act aditional", "decizie_incetare"] }
  ];
  const normalized = files.map((file) => ({
    ...file,
    haystack: `${file.tip || ""} ${file.denumire || ""} ${file.file_name || ""} ${file.generated_source || ""}`.toLowerCase()
  }));
  const items = checks.map((check) => {
    const match = normalized.find((file) => check.aliases.some((alias) => file.haystack.includes(alias.toLowerCase())));
    const date = match?.data_document || match?.created_at || null;
    const expires = match?.data_expirare || (check.key === "medical" ? (employee.apt_medical_expira || employee.adeverinta_medicala || null) : null);
    return {
      key: check.key,
      label: check.label,
      required: check.required,
      ok: Boolean(match) || (check.key === "medical" && Boolean(employee.apt_medical_expira || employee.adeverinta_medicala)),
      file_id: match?.id || null,
      file_name: match?.file_name || "",
      date: date ? String(date).slice(0, 10) : null,
      expires: expires ? String(expires).slice(0, 10) : null,
      acknowledged_at: match?.acknowledged_at || null
    };
  });
  const required = items.filter((item) => item.required);
  const done = required.filter((item) => item.ok).length;
  const percent = required.length ? Math.round(done / required.length * 100) : 100;
  return {
    employee_id: employee.id,
    nume: employee.nume || "",
    prenume: employee.prenume || "",
    nume_complet: employeeName(employee),
    marca: employee.marca || "",
    functia: employee.functia || employee.functie || "",
    department_id: employee.department_id || "",
    percent,
    required_done: done,
    required_total: required.length,
    missing_required: required.filter((item) => !item.ok).map((item) => item.label),
    items
  };
}
function addExpiration(rows, employee, type, label, date, icon, employeeNameValue, source) {
  const days = daysUntil(date);
  if (days === null) return;
  rows.push({
    id: `${employee.id}-${type}-${String(label).replace(/\W+/g, "_")}-${String(date).slice(0, 10)}`,
    employee_id: employee.id,
    employee_name: employeeNameValue,
    marca: employee.marca || "",
    functia: employee.functia || employee.functie || "",
    department_id: employee.department_id || "",
    type,
    label,
    source,
    icon,
    date: String(date).slice(0, 10),
    days,
    severity: days < 0 ? "expired" : days <= 30 ? "critical" : days <= 60 ? "warning" : "info"
  });
}
function daysUntil(date) {
  if (!date) return null;
  const raw = String(date).slice(0, 10);
  const parsed = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((parsed.getTime() - today.getTime()) / 86400000);
}
function summarizeExpirations(rows) {
  return {
    total: rows.length,
    expired: rows.filter((item) => item.severity === "expired").length,
    critical: rows.filter((item) => item.severity === "critical").length,
    warning: rows.filter((item) => item.severity === "warning").length,
    info: rows.filter((item) => item.severity === "info").length
  };
}

module.exports = router;

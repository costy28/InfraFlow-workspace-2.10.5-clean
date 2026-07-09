const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { requireAuth } = require("../../core/auth");
const { requirePermission } = require("../../core/permissions");
const { writeDb } = require("../../core/db");
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
    const item = { id: nextId(files), uuid, employee_id: employeeId, tip: String(req.body.tip || "altul").slice(0, 50), denumire: String(req.body.denumire || req.file.originalname).slice(0, 200), file_name: req.file.originalname.slice(0, 200), stored_name: storedName, mime_type: req.file.mimetype, file_size: req.file.size, data_document: req.body.data_document || null, data_expirare: req.body.data_expirare || null, uploaded_by: req.auth.user.id, created_at: new Date().toISOString() };
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

router.patch("/hr/employees/:id/files/:fileId", authorize("hr:manage"), (req, res) => {
  const item = ensureFiles(req.auth.db).find((file) => String(file.id) === String(req.params.fileId) && String(file.employee_id) === String(req.params.id) && !file.cancelled_at);
  if (!item) return res.status(404).json({ error: "Documentul nu a fost gasit.", code: "HR_FILE_NOT_FOUND" });
  if (req.body.tip !== undefined) item.tip = String(req.body.tip || "altul").slice(0, 50);
  if (req.body.denumire !== undefined) item.denumire = String(req.body.denumire || item.file_name || "Document").slice(0, 200);
  if (req.body.data_document !== undefined) item.data_document = req.body.data_document || null;
  if (req.body.data_expirare !== undefined) item.data_expirare = req.body.data_expirare || null;
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

module.exports = router;

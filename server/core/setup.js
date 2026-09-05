const crypto = require("crypto");
const { assertPasswordPolicy, hashPassword } = require('./auth');
const { addAudit } = require('./audit');
const { normalizeDb } = require('./db');
const { importSeed: importCpvSeed } = require('../modules/nomenclator/service');

const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAYNXaZvihiimTZ3M0C7DLvUoYMfgD3qty3Ohm0+/0SFQ=
-----END PUBLIC KEY-----`;

const LICENSE_FORMAT = "asfalt-pro-license-v1";

const LICENSE_TOKEN_PREFIX = "ASFLIC1";

const permissionGroups = {
  dashboard: ["dashboard:view"],
  dailyReport: ["daily_report:view", "daily_report:print", "daily_report:export", "period_report:view", "period_report:print", "period_report:export"],
  accountingReport: ["accounting_report:view", "accounting_report:print", "accounting_report:export"],
  consumptions: ["consumptions:view", "consumptions:create", "consumptions:cancel", "consumptions:export"],
  recipes: ["recipes:view", "recipes:manage"],
  materials: ["materials:view", "materials:edit"],
  departmentRequests: ["department_requests:view", "department_requests:create", "department_requests:manage", "department_requests:plan"],
  stockOperations: ["stock_operations:view", "stock_operations:create", "stock_operations:cancel", "stock_operations:export"],
  deliveries: ["deliveries:view", "deliveries:create", "deliveries:cancel"],
  procurementOrders: ["procurement_orders:view", "procurement_orders:create", "procurement_orders:receive", "procurement_orders:close"],
  referate: ["referate:view", "referate:create", "referate:achizitii", "referate:gestionar", "referate:secretariat", "referate:cfp", "referate:contabil_sef", "referate:dir_adjunct", "referate:dir_general", "referate:receptie"],
  echipamente: ["echipamente:gestionar"],
  mechanization: ["mechanization:view", "mechanization:manage", "mechanization:request", "mechanization:approve"],
  technical: ["technical:view", "technical:worklog", "technical:sales", "technical:export"],
  costAccounting: ["cost_accounting:view", "cost_accounting:manage", "cost_accounting:import", "cost_accounting:export"],
  ledger: ["ledger:view", "ledger:export"],
  planning: ["planning:view", "planning:manage"],
  users: ["users:manage"],
  settings: ["settings:manage"],
  audit: ["audit:view", "audit:manage"],
  system: ["system:view"]
};

const allPermissions = Object.values(permissionGroups).flat();

const rolePermissions = {
  superadmin: allPermissions,
  admin: allPermissions.filter((permission) => !["settings:manage", "audit:manage", "system:view"].includes(permission)),
  manager: [
    ...permissionGroups.dashboard,
    ...permissionGroups.dailyReport,
    ...permissionGroups.accountingReport,
    ...permissionGroups.consumptions,
    "recipes:view",
    ...permissionGroups.planning,
    ...permissionGroups.departmentRequests,
    "materials:view",
    "stock_operations:view",
    "stock_operations:export",
    "deliveries:view",
    "procurement_orders:view",
    "mechanization:view",
    "mechanization:approve",
    ...permissionGroups.technical,
    "cost_accounting:view",
    "cost_accounting:export",
    ...permissionGroups.ledger,
    "audit:view"
  ],
  inventory: [
    ...permissionGroups.dashboard,
    ...permissionGroups.dailyReport,
    ...permissionGroups.accountingReport,
    "recipes:view",
    "department_requests:view",
    ...permissionGroups.materials,
    ...permissionGroups.stockOperations,
    ...permissionGroups.deliveries,
    ...permissionGroups.procurementOrders,
    "mechanization:view",
    ...permissionGroups.ledger,
    "consumptions:view",
    "consumptions:export",
    "audit:view"
  ],
  procurement: [
    ...permissionGroups.dashboard,
    "daily_report:view",
    "period_report:view",
    "accounting_report:view",
    "accounting_report:export",
    "recipes:view",
    "materials:view",
    "department_requests:view",
    "stock_operations:view",
    "stock_operations:export",
    ...permissionGroups.deliveries,
    ...permissionGroups.procurementOrders,
    ...permissionGroups.ledger,
    "planning:view"
  ],
  mechanization: [
    ...permissionGroups.dashboard,
    "department_requests:view",
    ...permissionGroups.mechanization,
    "technical:worklog",
    "planning:view",
    "audit:view"
  ],
  technical: [
    ...permissionGroups.dashboard,
    "department_requests:view",
    "mechanization:view",
    ...permissionGroups.technical,
    "planning:view",
    "consumptions:view",
    "consumptions:export",
    "recipes:view",
    "materials:view"
  ],
  accounting: [
    ...permissionGroups.dashboard,
    ...permissionGroups.dailyReport,
    ...permissionGroups.accountingReport,
    ...permissionGroups.costAccounting,
    "technical:view",
    "technical:export",
    "mechanization:view",
    "recipes:view",
    "materials:view",
    "consumptions:view",
    "consumptions:export",
    "stock_operations:view",
    "stock_operations:export",
    "deliveries:view",
    ...permissionGroups.ledger,
    "planning:view",
    "department_requests:view"
  ],
  operator: [
    ...permissionGroups.dashboard,
    "consumptions:view",
    "consumptions:create",
    "department_requests:view",
    "department_requests:create",
    "recipes:view",
    "materials:view"
  ],
  department: [
    ...permissionGroups.dashboard,
    "department_requests:view",
    "department_requests:create",
    "mechanization:view",
    "mechanization:request",
    "technical:view",
    "technical:worklog",
    "recipes:view",
    "materials:view",
    "planning:view"
  ],
  viewer: [
    ...permissionGroups.dashboard,
    "accounting_report:view",
    "department_requests:view",
    "consumptions:view",
    "recipes:view",
    "materials:view",
    "stock_operations:view",
    "deliveries:view",
    "procurement_orders:view",
    "mechanization:view",
    "technical:view",
    "cost_accounting:view",
    "ledger:view",
    "planning:view"
  ]
};

function inferInitialStockCompleted(db) {
  return Boolean(
    (db.consumptions || []).some((item) => !item.canceled) ||
    (db.stockMovements || []).length ||
    (db.deliveries || []).some((item) => !item.canceled)
  );
}

function requiresInitialSetup(db) {
  return db?.settings?.setupCompleted === false;
}

function completeInitialSetup(db, body) {
  const companyName = String(body.companyName || "").trim();
  // stationName și location pot fi derivate din câmpurile wizard-ului
  const city   = String(body.city   || "").trim();
  const county = String(body.county || "").trim();
  const stationName = String(body.stationName || companyName).trim();
  const location    = String(body.location || (city && county ? `${city}, jud. ${county}` : city || county || "")).trim();
  const adminName = String(body.adminName || "").trim();
  const username  = String(body.username  || "").trim().toLowerCase();
  const password  = String(body.password  || "");
  const confirmPassword = String(body.confirmPassword || "");
  if (!companyName) throwHttp(400, "Numele firmei este obligatoriu.");
  if (!adminName)   throwHttp(400, "Numele Superadminului este obligatoriu.");
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throwHttp(400, "Utilizatorul trebuie sa aiba 3-32 caractere: litere, cifre, punct, minus sau underscore.");
  assertPasswordPolicy(password, { username, name: adminName }, {});
  if (password !== confirmPassword) throwHttp(400, "Parolele nu coincid.");

  const now = new Date().toISOString();
  const user = {
    id: id("user"),
    name: adminName,
    username,
    email: String(body.adminEmail || "").trim(),
    title: String(body.adminTitle || "").trim(),
    passwordHash: hashPassword(password),
    role: "superadmin",
    active: true,
    createdAt: now,
    createdBy: "initial-setup"
  };
  const licenseText = String(body.licenseText || "").trim();
  const trialDays = Math.max(1, Number(body.trialDays || 30));
  const license = licenseText
    ? importSignedLicense(licenseText)
    : normalizeLicense({
      plan: "trial",
      clientName: companyName,
      maxUsers: Math.max(1, Number(body.maxUsers || 50)),
      maxDevices: Math.max(1, Number(body.maxDevices || 50)),
      trialDays,
      trialStartedAt: localDate(new Date()),
      source: "initial-setup"
    });

  db.settings = {
    ...db.settings,
    companyName,
    stationName,
    location,
    // Câmpuri adiționale din Setup Wizard
    companyCui:  String(body.companyCui  || body.cui || "").trim(),
    address:     String(body.address     || "").trim(),
    city,
    county,
    email:       String(body.email       || "").trim(),
    phone:       String(body.phone       || "").trim(),
    logoDataUrl: String(body.logoDataUrl || db.settings?.logoDataUrl || ""),
    industry_profile: String(body.industry_profile || "").trim(),
    modules_enabled:  Array.isArray(body.modules_enabled) ? body.modules_enabled : (db.settings?.modules_enabled || []),
    appCredit: db.settings?.appCredit || "Aplicatie realizata de Constantin Constantin",
    setupCompleted: true,
    setupCompletedAt: now,
    initialStockCompleted: false,
    networkAccessMode: "internal-only",
    scaleDbPath:  String(db.settings?.scaleDbPath  || "").trim(),
    scaleProductMap: normalizeScaleProductMap(db.settings?.scaleProductMap || {}),
    nexusDbPath:  String(db.settings?.nexusDbPath  || "").trim(),
    autominderDbPath: String(db.settings?.autominderDbPath || "").trim(),
    rolePermissionOverrides: normalizeRolePermissionOverrides(db.settings?.rolePermissionOverrides || {}),
    license
  };
  db.users = [user];
  importCpvSeed(db);
  if (!Array.isArray(db.audit)) db.audit = [];
  addAudit(db, user, "setup_initial_finalizat", `${companyName} / ${stationName}`);
  return { db: normalizeDb(db), user };
}

function ensureActiveSuperadmin(db) {
  if (!Array.isArray(db.users) || !db.users.length) return;
  if (db.users.some((user) => user.active !== false && user.role === "superadmin")) return;
  const admin = db.users.find((user) => user.active !== false && user.username === "admin")
    || db.users.find((user) => user.active !== false && user.role === "admin")
    || db.users.find((user) => user.active !== false);
  if (admin) admin.role = "superadmin";
}

function importSignedLicense(input) {
  const document = parseLicenseDocument(input);
  if (document.format !== LICENSE_FORMAT) throwHttp(400, "Fisier de licenta invalid.");
  if (!document.payload || !document.signature) throwHttp(400, "Licenta nu contine payload si semnatura.");
  const valid = crypto.verify(
    null,
    Buffer.from(String(document.payload), "utf8"),
    crypto.createPublicKey(LICENSE_PUBLIC_KEY),
    Buffer.from(String(document.signature), "base64url")
  );
  if (!valid) throwHttp(400, "Semnatura licentei este invalida.");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(String(document.payload), "base64url").toString("utf8"));
  } catch {
    throwHttp(400, "Payload licenta invalid.");
  }
  return normalizeLicense({
    ...payload,
    source: "signed-file",
    signature: document.signature,
    payload: document.payload,
    importedAt: new Date().toISOString()
  }, true);
}

function parseLicenseDocument(input) {
  if (input && typeof input === "object" && input.format) return input;
  const text = typeof input === "string" ? input.trim() : JSON.stringify(input || {});
  if (text.startsWith(`${LICENSE_TOKEN_PREFIX}.`)) {
    const [, payload, signature] = text.split(".");
    return { format: LICENSE_FORMAT, payload, signature };
  }
  try {
    return JSON.parse(text);
  } catch {
    throwHttp(400, "Licenta trebuie sa fie fisier JSON sau cod de activare valid.");
  }
}

function normalizeLicense(license, strict = false) {
  const plan = String(license.plan || "internal-preview").trim();
  const expiresAt = license.expiresAt ? String(license.expiresAt) : null;
  if (strict && !["trial", "internal", "full"].includes(plan)) throwHttp(400, "Tip licenta invalid.");
  if (expiresAt && !validDateValue(expiresAt)) throwHttp(400, "Data expirare licenta invalida.");
  const trialStartedAt = license.trialStartedAt && validDateValue(license.trialStartedAt) ? String(license.trialStartedAt) : null;
  const trialDays = Math.max(1, Number(license.trialDays || 30));
  const trialExpiresAt = plan === "trial"
    ? (expiresAt || addDays(trialStartedAt || localDate(new Date()), trialDays - 1))
    : null;
  const normalized = {
    plan,
    licenseId: String(license.licenseId || license.id || "").trim(),
    clientName: String(license.clientName || license.companyName || "").trim(),
    clientCode: String(license.clientCode || "").trim(),
    companyTaxId: String(license.companyTaxId || "").trim(),
    maxUsers: plan === "trial" && license.source === "initial-setup" && Number(license.maxUsers || 1) <= 5 ? 50 : Math.max(1, Number(license.maxUsers || 1)),
    maxDevices: plan === "trial" && license.source === "initial-setup" && Number(license.maxDevices || 1) <= 10 ? 50 : Math.max(1, Number(license.maxDevices || 1)),
    expiresAt,
    trialDays,
    trialStartedAt,
    trialExpiresAt,
    modules: Array.isArray(license.modules) ? license.modules.map((item) => String(item).trim()).filter(Boolean) : [],
    issuedAt: license.issuedAt || null,
    importedAt: license.importedAt || null,
    source: license.source || "manual",
    signature: license.signature || "",
    payload: license.payload || ""
  };
  normalized.status = licenseStatus(normalized);
  return normalized;
}

function licenseStatus(license) {
  if (license.expiresAt && license.expiresAt < localDate(new Date())) return "expired";
  if (license.source === "signed-file") return "active";
  if (license.plan === "trial") {
    if (license.trialExpiresAt && license.trialExpiresAt < localDate(new Date())) return "expired";
    return "active";
  }
  return "internal";
}

function validDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return localDate(date);
}

function normalizeScaleProductMap(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.entries(input).reduce((map, [product, materialId]) => {
    const productKey = normalizeScaleProductName(product);
    const value = String(materialId || "").trim();
    if (productKey && value) map[productKey] = value;
    return map;
  }, {});
}

function normalizeScaleProductName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRolePermissionOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const allowed = new Set(allPermissions);
  return Object.fromEntries(Object.entries(input)
    .filter(([role]) => rolePermissions[role] && role !== "superadmin")
    .map(([role, permissions]) => [
      role,
      Array.from(new Set(Array.isArray(permissions) ? permissions.filter((permission) => allowed.has(permission)) : []))
    ]));
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

module.exports = {
  requiresInitialSetup,
  completeInitialSetup,
  ensureActiveSuperadmin,
  inferInitialStockCompleted
};

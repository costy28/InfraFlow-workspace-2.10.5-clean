const { readDb, writeDb } = require('./db')
const { addAudit } = require('./audit')
const { effectivePermissionsForUser } = require('./permissions')
const crypto = require("crypto");

const sessions = new Map();
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

function requireAuth(req, res) {
  const token = tokenFrom(req);
  const session = token ? sessions.get(token) : null;
  if (!session) {
    sendJson(res, 401, { error: "Autentificare necesara." });
    return null;
  }
  const db = readDb();
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) {
    sessions.delete(token);
    sendJson(res, 401, { error: "Sesiune invalida." });
    return null;
  }
  if (user.active === false || user.active === 0) {
    sessions.delete(token);
    sendJson(res, 401, { error: "Cont dezactivat" });
    return null;
  }
  return { db, user, token, permissions: effectivePermissionsForUser(user, db) };
}

function tokenFrom(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams.get("token") || "";
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(user, password) {
  if (user.passwordHash) {
    const [method, salt, stored] = user.passwordHash.split(":");
    if (method !== "scrypt" || !salt || !stored) return false;
    const hash = crypto.scryptSync(password, salt, 64);
    const storedBuffer = Buffer.from(stored, "hex");
    return storedBuffer.length === hash.length && crypto.timingSafeEqual(storedBuffer, hash);
  }
  return user.password === password;
}

function networkAccessAllowed(req) {
  let db;
  try {
    db = readDb();
  } catch {
    return isPrivateNetworkAddress(clientIp(req));
  }
  const mode = normalizeNetworkAccessMode(db.settings?.networkAccessMode);
  return mode === "open" || isPrivateNetworkAddress(clientIp(req));
}

function clientIp(req) {
  const raw = req.socket?.remoteAddress || "";
  return normalizeIp(raw);
}

function normalizeIp(value) {
  let ip = String(value || "").trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

function isPrivateNetworkAddress(ipValue) {
  const ip = normalizeIp(ipValue);
  if (!ip || ip === "127.0.0.1" || ip === "localhost") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
  }
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  return false;
}

function registerClientDevice(db, user, body, req) {
  if (!Array.isArray(db.devices)) db.devices = [];
  const now = new Date().toISOString();
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 240);
  const ip = clientIp(req);
  const deviceId = normalizeDeviceId(body.deviceId || req.headers["x-infraflow-device-id"] || req.headers["x-asfalt-device-id"] || fallbackDeviceId(ip, userAgent));
  const name = String(body.deviceName || req.headers["x-infraflow-device-name"] || req.headers["x-asfalt-device-name"] || "Statie de lucru").trim().slice(0, 80) || "Statie de lucru";
  const existing = db.devices.find((device) => device.id === deviceId);
  const license = normalizeLicense(db.settings?.license || {});
  const active = activeDevices(db);
  if (!existing && license.status !== "internal" && active.length >= Number(license.maxDevices || 1)) {
    throwHttp(403, `Licenta permite maxim ${license.maxDevices} statii de lucru. Elimina o statie veche din Setari sau extinde licenta.`);
  }
  const device = existing || {
    id: deviceId,
    createdAt: now,
    firstIp: ip,
    firstUserAgent: userAgent
  };
  device.name = name;
  device.active = true;
  device.lastSeenAt = now;
  device.lastIp = ip;
  device.lastUserAgent = userAgent;
  device.lastUserId = user.id;
  device.lastUsername = user.username;
  device.lastUserName = user.name;
  if (!existing) {
    db.devices.push(device);
    addAudit(db, user, "dispozitiv_autorizat", `${name} / ${ip || "-"}`);
  }
  return device;
}

function registerWorkstationRequest(db, body, req) {
  if (!Array.isArray(db.workstationRequests)) db.workstationRequests = [];
  const now = new Date().toISOString();
  const stationName = String(body.stationName || body.deviceName || "Statie de lucru").trim().slice(0, 80) || "Statie de lucru";
  const departmentName = String(body.departmentName || "").trim().slice(0, 100);
  const requestedUserName = String(body.userFullName || body.requestedUserName || "").trim().slice(0, 100);
  const requestedUsername = normalizeUsername(body.username || body.requestedUsername || suggestedUsername(requestedUserName || stationName));
  const requestedRole = rolePermissions[String(body.role || body.requestedRole || "department")] ? String(body.role || body.requestedRole || "department") : "department";
  if (!departmentName) throwHttp(400, "Departamentul este obligatoriu.");
  if (!requestedUserName) throwHttp(400, "Numele utilizatorului este obligatoriu.");
  const deviceId = normalizeDeviceId(body.deviceId || req.headers["x-infraflow-device-id"] || fallbackDeviceId(clientIp(req), String(req.headers["user-agent"] || "")));
  const existing = db.workstationRequests.find((item) => item.deviceId === deviceId && item.status === "pending");
  const request = existing || {
    id: id("wks"),
    deviceId,
    createdAt: now,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 240),
    status: "pending"
  };
  request.stationName = stationName;
  request.departmentName = departmentName;
  request.requestedUserName = requestedUserName;
  request.requestedUsername = requestedUsername;
  request.requestedRole = requestedRole;
  request.updatedAt = now;
  if (!existing) db.workstationRequests.push(request);
  addAudit(db, { id: "system", name: "Installer statie" }, existing ? "cerere_statie_actualizata" : "cerere_statie_noua", `${stationName} / ${departmentName} / ${requestedUsername}`);
  return publicWorkstationRequest(request);
}

function publicWorkstationRequest(request) {
  return {
    id: request.id,
    stationName: request.stationName || "Statie de lucru",
    departmentName: request.departmentName || "",
    requestedUserName: request.requestedUserName || "",
    requestedUsername: request.requestedUsername || "",
    requestedRole: request.requestedRole || "department",
    status: request.status || "pending",
    deviceId: request.deviceId || "",
    ip: request.ip || "",
    createdAt: request.createdAt || "",
    resolvedAt: request.resolvedAt || "",
    resolvedByName: request.resolvedByName || ""
  };
}

function suggestedUsername(value) {
  const clean = String(value || "utilizator").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 28);
  return clean || `user.${Date.now().toString(36)}`;
}

function normalizeUsername(value) {
  const username = suggestedUsername(value);
  return /^[a-z0-9._-]{3,32}$/.test(username) ? username : `user.${Date.now().toString(36)}`;
}

function activeDevices(db) {
  return (db.devices || []).filter((device) => device.active !== false);
}

function normalizeDeviceId(value) {
  const idValue = String(value || "").trim().toLowerCase();
  if (/^[a-z0-9._:-]{12,96}$/.test(idValue)) return idValue;
  return fallbackDeviceId(idValue, "");
}

function fallbackDeviceId(ip, userAgent) {
  return `device-${crypto.createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 24)}`;
}

function normalizeNetworkAccessMode(value) {
  return String(value || "internal-only").trim() === "open" ? "open" : "internal-only";
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

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
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
  sessions,
  requireAuth,
  tokenFrom,
  hashPassword,
  verifyPassword,
  registerClientDevice,
  registerWorkstationRequest,
  networkAccessAllowed
};

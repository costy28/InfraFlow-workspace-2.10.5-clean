#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const seedPath = path.join(ROOT, "data", "app-db.seed.json");
const serverEntry = path.join(ROOT, "server", "src", "server.js");
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "infraflow-commercial-smoke-"));
const dbFile = path.join(tempDir, "app-db.audit.json");
const password = `Audit-${crypto.randomBytes(8).toString("hex")}aA1`;
const username = `audit_${stamp}`;
const port = 47000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;

let child = null;
let token = "";
let currentCheck = "";
const results = [];

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(value, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function ensureArray(target, key) {
  if (!Array.isArray(target[key])) target[key] = [];
  return target[key];
}

function prepareDatabase() {
  if (!fs.existsSync(seedPath)) throw new Error(`Seed lipsă: ${seedPath}`);
  const db = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const now = new Date().toISOString();
  const auditAdmin = {
    id: `audit-admin-${stamp}`,
    username,
    passwordHash: hashPassword(password),
    name: "Audit Comercial",
    email: "audit@infraflow.local",
    role: "superadmin",
    roles: ["superadmin"],
    departmentId: "",
    active: true,
    mustChangePassword: false,
    created_at: now,
  };

  db.users = [auditAdmin, ...(Array.isArray(db.users) ? db.users.filter((user) => user.username !== username) : [])];
  db.settings = {
    ...(db.settings || {}),
    setupCompleted: true,
    initialSetupCompleted: true,
    company_name: "InfraFlow Audit",
    companyName: "InfraFlow Audit",
    country: "RO",
    language: "ro-RO",
    locale: "ro-RO",
    currency: "RON",
    timezone: "Europe/Bucharest",
    networkAccessMode: "open",
    license: {
      plan: "internal",
      modules: ["all"],
      maxUsers: 1000,
      maxDevices: 1000,
      source: "commercial-smoke",
    },
    imap_auto_sync_enabled: false,
    email_sync_enabled: false,
    piusi_auto_sync_enabled: false,
  };

  db.hr = db.hr || {};
  ensureArray(db.hr, "employees");
  ensureArray(db.hr, "contracts");
  ensureArray(db.hr, "timeSheets");
  ensureArray(db.hr, "leaveRequests");
  ensureArray(db.hr, "medicalLeaveCertificates");
  ensureArray(db, "materials");
  ensureArray(db, "stockMovements");
  ensureArray(db, "fleetAssets");
  db.contractManagement = db.contractManagement || {};
  ensureArray(db.contractManagement, "contracts");
  ensureArray(db.contractManagement, "consumptions");
  db.taskManagement = db.taskManagement || {};
  ensureArray(db.taskManagement, "tasks");
  ensureArray(db.taskManagement, "comments");
  db.messaging = db.messaging || {};
  ensureArray(db.messaging, "emailMessages");
  ensureArray(db.messaging, "channels");
  ensureArray(db.messaging, "messages");
  db.documents = db.documents || {};
  ensureArray(db.documents, "documentTypes");
  ensureArray(db.documents, "documents");
  ensureArray(db.documents, "circuitSteps");
  ensureArray(db.documents, "circuitAudit");
  ensureArray(db, "audit");

  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

function startServer() {
  const env = {
    ...process.env,
    INFRAFLOW_DB_PROVIDER: "json",
    DB_MODE: "json",
    INFRAFLOW_DB_FILE: dbFile,
    INFRAFLOW_SEED_FILE: dbFile,
    INFRAFLOW_PORT: String(port),
    PORT: String(port),
    NODE_ENV: "test",
    INFRAFLOW_AUDIT_SMOKE: "true",
  };

  child = childProcess.spawn(process.execPath, [serverEntry], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));
  child.on("exit", (code, signal) => {
    if (currentCheck) {
      process.stderr.write(`[server] exit în timpul "${currentCheck}": code=${code} signal=${signal}\n`);
    }
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = text;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          // păstrăm textul brut pentru erori HTML/print.
        }
        resolve({ status: res.statusCode || 0, data, text, headers: res.headers });
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error(`Request timeout pentru ${options.method || "GET"} ${url}`));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function request(apiPath, { method = "GET", body, token: tokenOverride = token, allowText = false } = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const headers = {
    Accept: "application/json",
    "User-Agent": "InfraFlow commercial smoke",
    Connection: "close",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(payload);
  }
  if (tokenOverride) headers.Authorization = `Bearer ${tokenOverride}`;
  const response = await httpRequest(`${baseUrl}${apiPath}`, { method, headers }, payload);
  if (!allowText && response.text && typeof response.data === "string") {
    throw new Error(`${method} ${apiPath} a întors non-JSON (${response.status}): ${response.text.slice(0, 180)}`);
  }
  return response;
}

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await request("/health", { token: null, allowText: true });
      if (response.status === 200 && response.data?.ok) return;
      lastError = `status ${response.status}: ${response.text}`;
    } catch (error) {
      lastError = error.message;
    }
    await wait(500);
  }
  throw new Error(`Serverul nu a pornit sănătos pe portul ${port}. Ultima eroare: ${lastError}`);
}

function expectStatus(response, statuses, context) {
  const accepted = Array.isArray(statuses) ? statuses : [statuses];
  if (!accepted.includes(response.status)) {
    throw new Error(`${context}: status ${response.status}, așteptat ${accepted.join("/")}; răspuns: ${JSON.stringify(response.data).slice(0, 500)}`);
  }
  return response.data;
}

function expectTruthy(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function entityId(payload, ...keys) {
  if (!payload || typeof payload !== "object") return "";
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  for (const nested of ["item", "material", "asset", "contract", "task", "document", "draft", "ticket", "email", "message", "channel"]) {
    if (payload[nested] && typeof payload[nested] === "object") {
      for (const key of keys) {
        if (payload[nested][key] !== undefined && payload[nested][key] !== null) return payload[nested][key];
      }
    }
  }
  return "";
}

async function check(name, fn) {
  currentCheck = name;
  const started = Date.now();
  console.log(`→ ${name}`);
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: error.message });
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
  } finally {
    currentCheck = "";
  }
}

async function login() {
  const badLogin = await request("/login", { method: "POST", body: { username, password: "gresit" }, token: null });
  expectStatus(badLogin, 401, "login greșit");
  const response = await request("/login", {
    method: "POST",
    token: null,
    body: {
      username,
      password,
      deviceId: `audit-device-${stamp}`,
      deviceName: "Stație audit comercial",
    },
  });
  const data = expectStatus(response, 200, "login corect");
  token = expectTruthy(data.token, "Login corect fără token.");
  return data.user;
}

async function runChecks(user) {
  const adminId = user.id;

  await check("Auth: rutele protejate refuză accesul fără sesiune", async () => {
    const response = await request("/session", { token: null });
    if (response.status < 400 || response.status >= 500) {
      throw new Error(`Sesiunea fără token a întors status ${response.status}.`);
    }
  });

  await check("Auth: sesiunea validă întoarce utilizatorul și permisiuni", async () => {
    const data = expectStatus(await request("/session"), 200, "session valid");
    expectTruthy(data.user?.username === username, "Sesiunea validă nu întoarce utilizatorul de audit.");
    expectTruthy(Array.isArray(data.permissions) && data.permissions.includes("settings:manage"), "Permisiunile superadmin nu sunt complete.");
  });

  let materialId = "";
  await check("Gestiune: creează material, blochează duplicatul și operează ieșire stoc", async () => {
    const name = `Audit material ${stamp}`;
    const created = expectStatus(await request("/materials", {
      method: "POST",
      body: { name, unit: "buc", stock: 10, alert: 2, recipeMaterial: false, stockDate: "2026-09-01" },
    }), 201, "creare material");
    materialId = expectTruthy(entityId(created, "id"), "Materialul creat nu are id.");

    expectStatus(await request("/materials", {
      method: "POST",
      body: { name, unit: "buc", stock: 1, alert: 0 },
    }), 409, "material duplicat");

    expectStatus(await request("/stock-operations", {
      method: "POST",
      body: { materialId, direction: "out", amount: 3, date: "2026-09-02", note: "Audit ieșire stoc" },
    }), [200, 201], "ieșire stoc");
  });

  let fleetAssetId = "";
  await check("Parc & Resurse: creează resursă manuală și salvează date tehnice", async () => {
    const created = expectStatus(await request("/fleet-assets", {
      method: "POST",
      body: {
        category: "vehicle",
        name: `Audit vehicul ${stamp}`,
        registrationNumber: `AUD-${stamp.slice(-4)}`,
        currentMeter: 123,
        meterUnit: "km",
        fuelType: "diesel",
        tankCapacity: 80,
      },
    }), [200, 201], "creare resursă parc");
    fleetAssetId = expectTruthy(entityId(created, "id"), "Resursa creată nu are id.");
    expectStatus(await request(`/fleet-assets/${encodeURIComponent(fleetAssetId)}/technical`, {
      method: "PATCH",
      body: { tankCapacity: 90, standardConsumption: 7.5, fuelWarningThreshold: 20 },
    }), 200, "actualizare date tehnice resursă");
  });

  let contractId = "";
  await check("Contracte: validează date obligatorii, creează contract și înregistrează consum", async () => {
    expectStatus(await request("/contracts", { method: "POST", body: { numar: `BAD-${stamp}`, valoare_contract: 100 } }), [400, 422], "contract invalid");
    const created = expectStatus(await request("/contracts", {
      method: "POST",
      body: {
        numar: `AUD-${stamp}`,
        titlu: `Contract audit ${stamp}`,
        partener: "Partener Audit SRL",
        valoare_contract: 1000,
        moneda: "RON",
        data_start: "2026-09-01",
        data_sfarsit: "2026-12-31",
        responsabil_id: adminId,
        responsabil_nume: "Audit Comercial",
        cpv_cod: "30200000-1",
        cpv_descriere: "Echipament informatic",
      },
    }), 201, "creare contract");
    contractId = expectTruthy(entityId(created, "id"), "Contractul creat nu are id.");
    expectStatus(await request(`/contracts/${encodeURIComponent(contractId)}/consumptions`, {
      method: "POST",
      body: { valoare: 850, data: "2026-09-05", document_nr: `FAC-AUD-${stamp}`, descriere: "Factură audit" },
    }), [200, 201], "consum contract");
  });

  let taskId = "";
  await check("Task-uri: validează titlu, creează, comentează și finalizează task", async () => {
    expectStatus(await request("/tasks", { method: "POST", body: { assigned_to: adminId } }), [400, 422], "task invalid");
    const created = expectStatus(await request("/tasks", {
      method: "POST",
      body: {
        title: `Task audit ${stamp}`,
        descriere: "Smoke test comercial",
        assigned_to: adminId,
        priority: "urgent",
        due_date: "2026-09-10",
        source_type: "contract",
        source_id: String(contractId),
      },
    }), 201, "creare task");
    taskId = expectTruthy(entityId(created, "id"), "Task-ul creat nu are id.");
    expectStatus(await request(`/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: "POST",
      body: { text: "Comentariu audit automat." },
    }), [200, 201], "comentariu task");
    expectStatus(await request(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: { status: "done" },
    }), 200, "finalizare task");
  });

  await check("Mesaje: salvează draft email fără trimitere externă", async () => {
    const draft = expectStatus(await request("/messaging/email/drafts", {
      method: "POST",
      body: {
        to: "audit@example.invalid",
        subject: `Draft audit ${stamp}`,
        body: "Conținut draft audit.",
        category: "operational",
        importance: "normal",
      },
    }), [200, 201], "draft email");
    expectTruthy(entityId(draft, "id"), "Draftul email nu are id.");
  });

  let documentUuid = "";
  await check("Documente: validează documentul, creează template, document și watchlist", async () => {
    const typeId = `audit-${stamp}`;
    expectStatus(await request("/documents", { method: "POST", body: { titlu: "Document fără tip" } }), [400, 422], "document invalid");
    expectStatus(await request("/documents/templates", {
      method: "POST",
      body: {
        id: typeId,
        denumire: `Șablon audit ${stamp}`,
        categorie: "Audit",
        template_html: "<h1>{{titlu}}</h1><p>{{initiator.nume}}</p>",
        activ: true,
      },
    }), [200, 201], "template document");
    const created = expectStatus(await request("/documents", {
      method: "POST",
      body: {
        tip_id: typeId,
        titlu: `Document audit ${stamp}`,
        prioritate: "normal",
        continut: "Conținut audit.",
        date: { valoare_estimata: 1200, departament: "Audit" },
      },
    }), 201, "creare document");
    documentUuid = expectTruthy(entityId(created, "uuid", "id"), "Documentul creat nu are uuid/id.");
    expectStatus(await request(`/documents/${encodeURIComponent(documentUuid)}/watch`, {
      method: "POST",
      body: { watched: true },
    }), [200, 201], "urmărire document");
  });

  await check("HR: pontaj validat blochează concediul, devalidarea îl deblochează și actualizează pontajul", async () => {
    const employee = expectStatus(await request("/hr/employees", {
      method: "POST",
      body: {
        nume: `Angajat ${stamp}`,
        prenume: "Audit",
        marca: `AUD${stamp.slice(-7)}`,
        functia: "Operator audit",
        data_angajare: "2026-09-01",
        norma_ore_zi: 8,
        acord_gdpr: true,
      },
    }), 201, "creare angajat");
    const employeeId = expectTruthy(entityId(employee, "id"), "Angajatul creat nu are id.");
    expectStatus(await request(`/hr/employees/${encodeURIComponent(employeeId)}/contracts`, {
      method: "POST",
      body: {
        data_contract: "2026-09-01",
        data_start: "2026-09-01",
        norma_ore: 8,
        salariu_baza: 4500,
        status: "activ",
      },
    }), 201, "contract HR");
    expectStatus(await request("/hr/timesheets", {
      method: "POST",
      body: { employee_id: employeeId, data: "2026-09-07", ore_lucrate: 8, tip: "lucru" },
    }), 200, "pontaj zi");
    expectStatus(await request("/hr/timesheets/validate", {
      method: "POST",
      body: { employee_ids: [employeeId], luna: "2026-09" },
    }), 200, "validare pontaj");
    const leave = expectStatus(await request("/hr/leave-requests", {
      method: "POST",
      body: { employee_id: employeeId, tip: "co", data_start: "2026-09-07", data_sfarsit: "2026-09-07", motiv: "Audit concediu" },
    }), 201, "cerere concediu");
    const leaveUuid = expectTruthy(entityId(leave, "uuid"), "Cererea de concediu nu are uuid.");
    const blocked = await request(`/hr/leave-requests/${encodeURIComponent(leaveUuid)}/approve`, { method: "POST", body: {} });
    expectStatus(blocked, 409, "aprobare concediu cu pontaj validat");
    expectTruthy(blocked.data?.code === "HR_TIMESHEET_VALIDATED", "Aprobarea nu a întors codul HR_TIMESHEET_VALIDATED.");
    expectStatus(await request("/hr/timesheets/invalidate", {
      method: "POST",
      body: { employee_ids: [employeeId], luna: "2026-09", reason: "Audit deblocare concediu" },
    }), 200, "devalidare pontaj");
    const approved = expectStatus(await request(`/hr/leave-requests/${encodeURIComponent(leaveUuid)}/approve`, { method: "POST", body: {} }), 200, "aprobare după devalidare");
    expectTruthy(["aprobata", "aprobat"].includes(String(approved.status || "").toLowerCase()), "Cererea nu a fost aprobată după devalidare.");
    const sheet = expectStatus(await request(`/hr/timesheets?luna=2026-09&employee_id=${encodeURIComponent(employeeId)}`), 200, "citire pontaj după concediu");
    const day = sheet.pontaje?.[0]?.zile?.find((item) => item.data === "2026-09-07");
    expectTruthy(day?.tip === "concediu_odihna" && Number(day.ore_lucrate || 0) === 0, `Pontajul nu a fost actualizat din concediu: ${JSON.stringify(day)}`);
  });

  await check("Servicii suport: creează înregistrări minime în Sesizări, Arhivă și Secretariat", async () => {
    const ticket = expectStatus(await request("/tickets", {
      method: "POST",
      body: { titlu: `Sesizare audit ${stamp}`, descriere: "Verificare audit", categorie: "operational", prioritate: "normala" },
    }), [200, 201], "creare sesizare");
    expectTruthy(entityId(ticket, "id", "uuid"), "Sesizarea creată nu are id/uuid.");

    const archiveDoc = expectStatus(await request("/archive/documents", {
      method: "POST",
      body: { titlu: `Document arhivă audit ${stamp}`, tip: "audit", an: 2026, emitent: "InfraFlow", termen_pastrare: 5 },
    }), [200, 201], "creare document arhivă");
    expectTruthy(entityId(archiveDoc, "id", "uuid"), "Documentul arhivat nu are id/uuid.");

    const registry = expectStatus(await request("/secretariat/registry", {
      method: "POST",
      body: { tip: "intrare", subiect: `Adresă audit ${stamp}`, expeditor: "Partener Audit", data_document: "2026-09-05" },
    }), [200, 201], "registratură secretariat");
    expectTruthy(entityId(registry, "id", "uuid"), "Înregistrarea de secretariat nu are id/uuid.");
  });
}

async function main() {
  prepareDatabase();
  console.log(`Audit comercial izolat: ${dbFile}`);
  startServer();
  await waitForHealth();
  const user = await login();
  await runChecks(user);

  const failed = results.filter((item) => !item.ok);
  console.log("");
  console.log(`Rezultat audit comercial: ${results.length - failed.length}/${results.length} verificări trecute.`);
  if (failed.length) {
    console.log("Verificări eșuate:");
    failed.forEach((item) => console.log(`- ${item.name}: ${item.error}`));
    process.exitCode = 1;
  }
}

async function cleanup() {
  if (child && !child.killed) {
    child.kill("SIGTERM");
    await wait(1000);
    if (!child.killed) child.kill("SIGKILL");
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // tmp cleanup best-effort
  }
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);


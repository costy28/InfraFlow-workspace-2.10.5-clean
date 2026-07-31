const crypto = require('crypto')

const defaultWorkflowTemplates = [
  { id: "wft-material", type: "material", name: "Solicitare materiale", moduleKey: "gestiune" },
  { id: "wft-asphalt", type: "asphalt", name: "Solicitare output operațional", moduleKey: "production" },
  { id: "wft-fleet", type: "fleet", name: "Solicitare resursă mobilă", moduleKey: "mecanizare" },
  { id: "wft-procurement", type: "procurement", name: "Aprovizionare", moduleKey: "achizitii" },
  { id: "wft-work-situation", type: "work_situation", name: "Situatie de lucrari", moduleKey: "tehnic" },
  { id: "wft-personnel", type: "personnel", name: "Solicitare personal", moduleKey: "ru" },
  { id: "wft-nonconformity", type: "nonconformity", name: "Raport neconformitate", moduleKey: "tehnic" }
];


const defaultDepartmentConnections = [
  ["tehnic", "production", "Situații lucrări și producție / operațiuni"], 
  ["tehnic", "asternere", "Lucrări, ore resurse și output pus în operă"],
  ["tehnic", "canalizare", "Lucrari canalizare si materiale"],      
  ["tehnic", "betoane", "Lucrări beton / prefabricate și producție"],
  ["tehnic", "contabilitate", "Centre de cost si rapoarte lucrari"],
  ["mecanizare", "production", "Alocări resurse pentru producție"], 
  ["mecanizare", "asternere", "Alocări resurse către execuție"],   
  ["mecanizare", "betoane", "Alocări resurse către beton / prefabricate"],       
  ["gestiune", "production", "Materiale si transferuri catre productie"],
  ["gestiune", "betoane", "Materiale si transferuri catre betoane"],
  ["gestiune", "mecanizare", "Piese, consumabile și materiale parc resurse"],
  ["gestiune", "contabilitate", "Stocuri si documente pentru contabilitate"],
  ["production", "asternere", "Output livrat spre execuție"],      
  ["betoane", "canalizare", "Beton / materiale pentru canalizare"],
  ["contabilitate", "gestiune", "Verificari contabile pe stocuri"]  
];


function ensureDefaultWorkflowTemplates(db) {
  const existing = new Set(db.workflowTemplates.map((item) => item.type));
  defaultWorkflowTemplates.forEach((template) => {
    if (existing.has(template.type)) return;
    db.workflowTemplates.push({
      ...template,
      active: true,
      createdAt: new Date().toISOString()
    });
  });
}

function ensureDefaultDepartmentConnections(db) {
  const existing = new Set(db.departmentConnections.map((item) => `${item.sourceModuleKey || item.source}|${item.targetModuleKey || item.target}`));
  defaultDepartmentConnections.forEach(([sourceModuleKey, targetModuleKey, label]) => {
    const key = `${sourceModuleKey}|${targetModuleKey}`;
    if (existing.has(key)) return;
    db.departmentConnections.push({
      id: `dc-${sourceModuleKey}-${targetModuleKey}`,
      sourceModuleKey,
      targetModuleKey,
      sourceDepartmentId: findDepartmentByModule(db, sourceModuleKey)?.id || "",
      targetDepartmentId: findDepartmentByModule(db, targetModuleKey)?.id || "",
      type: "workflow",
      label,
      active: true,
      createdAt: new Date().toISOString()
    });
  });
}

function findDepartmentByModule(db, moduleKey) {
  const normalized = String(moduleKey || "").toLowerCase();
  return (db.departments || []).find((department) => String(department.moduleKey || "").toLowerCase() === normalized)
    || (db.departments || []).find((department) => moduleKeyForDepartmentName(department.name) === normalized)
    || null;
}

function findDepartmentByName(db, name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return null;
  return (db.departments || []).find((department) => String(department.name || "").trim().toLowerCase() === normalized) || null;
}

function moduleKeyForDepartmentName(name) {
  const value = String(name || "").toLowerCase();
  if (value.includes("tehnic")) return "tehnic";
  if (value.includes("mecanizare") || value.includes("parc")) return "mecanizare";
  if (value.includes("gestiune")) return "gestiune";
  if (value.includes("conta")) return "contabilitate";
  if (value.includes("betoane")) return "betoane";
  if (value.includes("asternere")) return "asternere";
  if (value.includes("canalizare")) return "canalizare";
  if (value.includes("achiz")) return "achizitii";
  if (value.includes("siguranta")) return "siguranta";
  if (value.includes("product") || value.includes("asfalt") || value.includes("statie")) return "production";
  return "custom";
}

function ensureProjectForJob(db, jobName, sourceType = "", sourceId = "", user = null, extra = {}) {
  const name = String(jobName || "").trim();
  if (!name) return null;
  const existing = (db.projects || []).find((project) => String(project.name || "").trim().toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const project = {
    id: stableEntityId("project", name),
    code: "",
    name,
    clientName: String(extra.clientName || ""),
    contractNo: String(extra.contractNo || ""),
    type: String(extra.type || "general"),
    status: "active",
    location: String(extra.location || ""),
    sourceType,
    sourceId,
    createdBy: user?.id || "",
    createdByName: user?.name || "",
    createdAt: new Date().toISOString()
  };
  db.projects.push(project);
  return project;
}

function workflowStatusFromDepartment(status) {
  return ({
    new: "SUBMIS",
    accepted: "IN_EXECUTIE",
    planned: "IN_EXECUTIE",
    partial: "IN_EXECUTIE",
    done: "FINALIZAT",
    rejected: "RESPINS"
  })[status] || "SUBMIS";
}

function workflowStatusFromFleet(status) {
  return ({
    new: "SUBMIS",
    approved: "IN_EXECUTIE",
    planned: "IN_EXECUTIE",
    done: "FINALIZAT",
    rejected: "RESPINS",
    canceled: "ANULAT"
  })[status] || "SUBMIS";
}

function syncWorkflowForDepartmentRequest(db, user, request, action = "updated", oldStatus = "") {
  if (!request) return null;
  const project = ensureProjectForJob(db, request.jobName, "department_request", request.id, user, { location: request.location });
  const requesterDepartment = findDepartmentByName(db, request.department);
  const targetDepartment = request.type === "asphalt" ? findDepartmentByModule(db, "production") : findDepartmentByModule(db, "gestiune");
  return upsertWorkflowRequest(db, user, {
    id: stableEntityId("wfr", `department_request:${request.id}`),
    templateType: request.type === "asphalt" ? "asphalt" : "material",
    requestType: request.type === "asphalt" ? "asphalt" : "material",
    sourceType: "department_request",
    sourceId: request.id,
    title: request.itemName || request.materialName || request.requestedMaterialName || "Solicitare materiale",
    status: workflowStatusFromDepartment(request.status),
    oldStatus,
    action,
    priority: request.priority || "medie",
    requesterUserId: request.createdBy || "",
    requesterDepartmentId: requesterDepartment?.id || "",
    targetDepartmentId: targetDepartment?.id || "",
    projectId: project?.id || "",
    amount: Number(request.amount || 0),
    unit: request.unit || "",
    neededDate: request.neededDate || "",
    createdAt: request.createdAt || new Date().toISOString(),
    payload: request
  });
}

function syncWorkflowForFleetRequest(db, user, request, action = "updated", oldStatus = "") {
  if (!request) return null;
  const project = ensureProjectForJob(db, request.jobName, "fleet_request", request.id, user, { location: request.location });
  const requesterDepartment = findDepartmentByName(db, request.department);
  const targetDepartment = findDepartmentByModule(db, "mecanizare");
  return upsertWorkflowRequest(db, user, {
    id: stableEntityId("wfr", `fleet_request:${request.id}`),
    templateType: "fleet",
    requestType: "fleet",
    sourceType: "fleet_request",
    sourceId: request.id,
    title: `${request.assetName || "Utilaj"} / ${request.jobName || request.department || ""}`.trim(),
    status: workflowStatusFromFleet(request.status),
    oldStatus,
    action,
    priority: "medie",
    requesterUserId: request.createdBy || "",
    requesterDepartmentId: requesterDepartment?.id || "",
    targetDepartmentId: targetDepartment?.id || "",
    projectId: project?.id || "",
    amount: fleetRequestHours(request),
    unit: "ore",
    neededDate: request.date || "",
    createdAt: request.createdAt || new Date().toISOString(),
    payload: request
  });
}

function upsertWorkflowRequest(db, user, input) {
  const existing = db.workflowRequests.find((item) => item.sourceType === input.sourceType && item.sourceId === input.sourceId);
  const template = db.workflowTemplates.find((item) => item.type === input.templateType);
  const now = new Date().toISOString();
  const payload = safeJsonObject(input.payload);
  if (existing) {
    const previousStatus = existing.status || "";
    Object.assign(existing, {
      templateId: template?.id || existing.templateId || "",
      requestType: input.requestType,
      title: input.title,
      status: input.status,
      priority: input.priority,
      requesterUserId: input.requesterUserId,
      requesterDepartmentId: input.requesterDepartmentId,
      targetDepartmentId: input.targetDepartmentId,
      projectId: input.projectId,
      amount: input.amount,
      unit: input.unit,
      neededDate: input.neededDate,
      payload,
      updatedAt: now,
      completedAt: input.status === "FINALIZAT" ? (existing.completedAt || now) : existing.completedAt || ""
    });
    if (user && (previousStatus !== input.status || input.action !== "sync")) {
      addWorkflowAudit(db, user, existing, input.action, previousStatus, input.status);
    }
    return existing;
  }
  const created = {
    id: input.id,
    templateId: template?.id || "",
    requestType: input.requestType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title,
    status: input.status,
    priority: input.priority,
    requesterUserId: input.requesterUserId,
    requesterDepartmentId: input.requesterDepartmentId,
    targetDepartmentId: input.targetDepartmentId,
    projectId: input.projectId,
    amount: input.amount,
    unit: input.unit,
    neededDate: input.neededDate,
    payload,
    createdAt: input.createdAt,
    updatedAt: input.action === "sync" ? "" : now,
    completedAt: input.status === "FINALIZAT" ? now : ""
  };
  db.workflowRequests.push(created);
  if (user) addWorkflowAudit(db, user, created, input.action, input.oldStatus || "", input.status);
  return created;
}

function addWorkflowAudit(db, user, request, action, oldStatus = "", newStatus = "") {
  db.workflowAudit.push({
    id: id("wfa"),
    requestId: request.id,
    sourceType: request.sourceType,
    sourceId: request.sourceId,
    action,
    oldStatus,
    newStatus,
    userId: user.id,
    userName: user.name,
    details: request.title || "",
    createdAt: new Date().toISOString()
  });
}

function safeJsonObject(value) {
  if (!value || typeof value !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function fleetRequestHours(request) {
  if (!validTimeValue(request.startTime) || !validTimeValue(request.endTime)) return 0;
  const [startHour, startMinute] = request.startTime.split(":").map(Number);
  const [endHour, endMinute] = request.endTime.split(":").map(Number);
  return round(Math.max(0, (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60));
}

function stableEntityId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha1").update(String(value || "").toLowerCase()).digest("hex").slice(0, 20)}`;
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function validTimeValue(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

module.exports = {
  syncWorkflowForDepartmentRequest,
  syncWorkflowForFleetRequest,
  upsertWorkflowRequest,
  addWorkflowAudit,
  workflowStatusFromDepartment,
  workflowStatusFromFleet,
  ensureDefaultWorkflowTemplates,
  ensureDefaultDepartmentConnections,
  findDepartmentByModule,
  findDepartmentByName,
  moduleKeyForDepartmentName
}

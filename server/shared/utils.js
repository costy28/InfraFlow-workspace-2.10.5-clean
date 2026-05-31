const crypto = require("crypto");
const path = require("path");

function slugId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || id("item");
}

function stableEntityId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha1").update(String(value || "").toLowerCase()).digest("hex").slice(0, 20)}`;
}

function formatBytesServer(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatAgeHours(hoursValue) {
  const hours = Math.max(0, Number(hoursValue || 0));
  if (hours < 1) return "sub 1 ora";
  if (hours < 48) return `${Math.round(hours)} ore`;
  return `${Math.round(hours / 24)} zile`;
}

function compareVersions(a, b) {
  const left = String(a || "0").split(".").map((part) => Number(part) || 0);
  const right = String(b || "0").split(".").map((part) => Number(part) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

function isSafeRelativePath(relativePath) {
  return Boolean(relativePath)
    && !relativePath.includes("..")
    && !path.isAbsolute(relativePath)
    && !relativePath.split("/").some((part) => !part || part === "." || part === "..");
}

function safeJsonObject(value) {
  if (!value || typeof value !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

module.exports = {
  slugId,
  stableEntityId,
  formatBytesServer,
  formatAgeHours,
  compareVersions,
  isSafeRelativePath,
  safeJsonObject
};
const crypto = require("crypto");

function addAudit(db, user, action, details) {
  db.audit.push({
    id: id("audit"),
    at: new Date().toISOString(),
    userId: user.id,
    userName: user.name,
    role: user.role,
    action,
    details
  });
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

module.exports = { addAudit };

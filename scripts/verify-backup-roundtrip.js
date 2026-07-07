const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "data", "app-db.seed.json");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "infraflow-backup-"));
try {
  const original = JSON.parse(fs.readFileSync(source, "utf8"));
  const backup = path.join(temp, "backup.json");
  fs.writeFileSync(backup, JSON.stringify(original, null, 2));
  const restored = JSON.parse(fs.readFileSync(backup, "utf8"));
  const canonical = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  if (canonical(original) !== canonical(restored)) throw new Error("Checksum diferit dupa restaurare.");
  console.log(JSON.stringify({ ok: true, source, top_level_keys: Object.keys(restored).length, checksum: canonical(restored) }, null, 2));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

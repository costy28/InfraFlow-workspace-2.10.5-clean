const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateRestoreData } = require('../server/modules/system/restore-data');

const root = path.resolve(__dirname, "..");
const source = path.join(root, "data", "app-db.seed.json");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "infraflow-backup-"));
try {
  const original = JSON.parse(fs.readFileSync(source, "utf8"));
  const backup = path.join(temp, "backup.json");
  fs.writeFileSync(backup, JSON.stringify(original, null, 2));
  const restored = validateRestoreData(JSON.parse(fs.readFileSync(backup, "utf8")));
  const canonical = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  for (const key of Object.keys(original)) {
    if (canonical(original[key]) !== canonical(restored[key])) throw new Error(`Date diferite dupa restaurare: ${key}`);
  }
  console.log(JSON.stringify({ ok: true, source, top_level_keys: Object.keys(restored).length, checksum: canonical(restored) }, null, 2));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function main() {
  const root = path.resolve(__dirname, "..");
  const version = require(path.join(root, "package.json")).version;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "infraflow-acceptance-"));
  const dbFile = path.join(tempDir, "app-db.json");
  fs.copyFileSync(path.join(root, "data", "app-db.seed.json"), dbFile);
  const port = 45180 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, [path.join(root, "server", "src", "server.js")], {
    cwd: root, env: { ...process.env, DB_MODE: "json", INFRAFLOW_DB_PROVIDER: "json", INFRAFLOW_DB_FILE: dbFile, INFRAFLOW_PORT: String(port), PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (data) => { output += data; }); child.stderr.on("data", (data) => { output += data; });
  try {
    const health = await waitForHealth(`http://127.0.0.1:${port}/api/system/health`, 30000);
    if (!health.ok) throw new Error(`Health invalid: ${JSON.stringify(health)}`);
    const parsed = JSON.parse(fs.readFileSync(dbFile, "utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("Baza temporara nu mai este JSON valid.");
    console.log(JSON.stringify({ ok: true, version, health, database: dbFile, server_output: output.slice(-500) }, null, 2));
  } finally {
    child.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function waitForHealth(url, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Serverul nu a raspuns la health in ${timeout / 1000}s.`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

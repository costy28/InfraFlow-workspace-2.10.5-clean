const crypto = require("node:crypto");
const { encryptSettingSecret, decryptSettingSecret } = require("../../core/settings-crypto");

const DEFAULTS = {
  authorization_url: "https://logincert.anaf.ro/anaf-oauth2/v1/authorize",
  token_url: "https://logincert.anaf.ro/anaf-oauth2/v1/token",
  api_base_url: "https://api.anaf.ro/prod/FCTEL/rest"
};

function ensureConfig(db) {
  db.anaf = db.anaf || {};
  db.anaf.spv = { ...DEFAULTS, ...(db.anaf.spv || {}) };
  return db.anaf.spv;
}

function publicConfig(db) {
  const cfg = ensureConfig(db);
  return {
    authorization_url: cfg.authorization_url, token_url: cfg.token_url, api_base_url: cfg.api_base_url,
    client_id: cfg.client_id || "", redirect_uri: cfg.redirect_uri || "", configured: Boolean(cfg.client_id && cfg.client_secret_enc && cfg.redirect_uri),
    authorized: Boolean(cfg.access_token_enc), token_expires_at: cfg.token_expires_at || "", last_error: cfg.last_error || ""
  };
}

function saveConfig(db, values) {
  const cfg = ensureConfig(db);
  ["authorization_url", "token_url", "api_base_url", "client_id", "redirect_uri"].forEach((key) => {
    if (values[key] !== undefined) cfg[key] = String(values[key] || "").trim();
  });
  if (values.client_secret) cfg.client_secret_enc = encryptSettingSecret(values.client_secret);
  cfg.updated_at = new Date().toISOString();
  return publicConfig(db);
}

function authorizationUrl(db) {
  const cfg = ensureConfig(db);
  assertConfigured(cfg);
  cfg.oauth_state = crypto.randomBytes(24).toString("hex");
  const url = new URL(cfg.authorization_url);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.client_id);
  url.searchParams.set("redirect_uri", cfg.redirect_uri);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", cfg.oauth_state);
  return { url: url.toString(), state: cfg.oauth_state };
}

async function exchangeCode(db, code, state) {
  const cfg = ensureConfig(db);
  assertConfigured(cfg);
  if (!code) throw httpError(400, "Codul de autorizare ANAF lipseste.");
  if (!state || state !== cfg.oauth_state) throw httpError(409, "Starea OAuth nu corespunde. Reia autorizarea SPV.");
  const token = await tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirect_uri });
  storeToken(cfg, token);
  delete cfg.oauth_state;
  return publicConfig(db);
}

async function refresh(db) {
  const cfg = ensureConfig(db);
  assertConfigured(cfg);
  const refreshToken = decryptSettingSecret(cfg.refresh_token_enc || "");
  if (!refreshToken) throw httpError(409, "Nu exista token de reinnoire SPV. Autorizeaza din nou aplicatia.");
  const token = await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
  storeToken(cfg, token);
  return publicConfig(db);
}

async function tokenRequest(cfg, fields) {
  const body = new URLSearchParams({ ...fields, client_id: cfg.client_id, client_secret: decryptSettingSecret(cfg.client_secret_enc) });
  const response = await fetch(cfg.token_url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(30000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw httpError(502, payload.error_description || payload.error || `ANAF OAuth a raspuns cu HTTP ${response.status}.`);
  return payload;
}

function storeToken(cfg, token) {
  cfg.access_token_enc = encryptSettingSecret(token.access_token);
  if (token.refresh_token) cfg.refresh_token_enc = encryptSettingSecret(token.refresh_token);
  cfg.token_expires_at = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString();
  cfg.authorized_at = new Date().toISOString();
  cfg.last_error = "";
}

function assertConfigured(cfg) {
  if (!cfg.client_id || !cfg.client_secret_enc || !cfg.redirect_uri) throw httpError(409, "Configureaza client ID, secretul si URL-ul de redirectare ANAF.");
}
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }

module.exports = { ensureConfig, publicConfig, saveConfig, authorizationUrl, exchangeCode, refresh };

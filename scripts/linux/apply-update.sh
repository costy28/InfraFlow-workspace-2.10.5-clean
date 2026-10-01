#!/usr/bin/env bash
set -euo pipefail

# Acest worker rulează exclusiv ca root, instalat într-o cale root-owned.
# Aplicația nu execută arhive; ea doar le depune în inbox-ul controlat.
APP_DIR=/opt/infraflow/app
INBOX="$APP_DIR/runtime/update-inbox"
BACKUP_DIR=/var/backups/infraflow
SERVICE_USER="${SERVICE_USER:-infraflow}"
WORKER_PATH=/usr/local/lib/infraflow/apply-update.sh
WORKER_SERVICE_PATH=/etc/systemd/system/infraflow-update.service
WORKER_PATH_UNIT=/etc/systemd/system/infraflow-update.path
LOCK_FILE=/run/lock/infraflow-update.lock
exec 9>"$LOCK_FILE"
flock -n 9 || { echo 'Un update InfraFlow este deja în curs.' >&2; exit 0; }
ARCHIVE="$(find "$INBOX" -maxdepth 1 -type f -name 'InfraFlow-update-*.tar.gz' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"

[[ -n "$ARCHIVE" && -f "$ARCHIVE" ]] || exit 0
mkdir -p "$BACKUP_DIR"
STAGE="$(mktemp -d /var/tmp/infraflow-update.XXXXXX)"
ROLLBACK_DIR="$(mktemp -d /var/tmp/infraflow-rollback.XXXXXX)"
STATUS_FILE="$APP_DIR/runtime/update-last.log"
BACKUP_ARCHIVE=""
SERVICE_STOPPED=0
CHANGED=0

write_status() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$STATUS_FILE"
  chown "$SERVICE_USER:$SERVICE_USER" "$STATUS_FILE"
  chmod 0640 "$STATUS_FILE"
}

read_version() {
  /usr/local/bin/node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(String(data.version || ''))" "$1"
}

is_newer_version() {
  /usr/local/bin/node -e "const parse=value=>String(value).split('.').map(Number); const [next,current]=process.argv.slice(1).map(parse); for(let index=0; index<3; index+=1){ if(next[index] !== current[index]) process.exit(next[index] > current[index] ? 0 : 1) } process.exit(1)" "$1" "$2"
}

refresh_worker_for_next_update() {
  install -d -o root -g root -m 0755 /usr/local/lib/infraflow
  install -o root -g root -m 0755 "$APP_DIR/scripts/linux/apply-update.sh" "$WORKER_PATH"
  install -o root -g root -m 0644 "$APP_DIR/scripts/linux/infraflow-update.service" "$WORKER_SERVICE_PATH"
  install -o root -g root -m 0644 "$APP_DIR/scripts/linux/infraflow-update.path" "$WORKER_PATH_UNIT"
  systemctl daemon-reload
  systemctl enable infraflow-update.path >/dev/null
}

rollback() {
  local exit_code="$?"
  if [[ "$exit_code" -ne 0 && "$CHANGED" -eq 1 && -n "$BACKUP_ARCHIVE" && -f "$BACKUP_ARCHIVE" ]]; then
    write_status "EROARE: update eșuat; se restaurează backupul anterior."
    systemctl stop infraflow.service || true
    tar -xzf "$BACKUP_ARCHIVE" -C "$ROLLBACK_DIR" --no-same-owner --no-same-permissions || true
    rsync -a --delete --exclude='runtime/' --exclude='storage/' --exclude='logs/' --exclude='node_modules/' "$ROLLBACK_DIR/" "$APP_DIR/" || true
    /usr/local/bin/npm --prefix "$APP_DIR/server" ci --omit=dev || true
  fi
  if [[ "$SERVICE_STOPPED" -eq 1 ]]; then systemctl start infraflow.service || true; fi
  if [[ "$exit_code" -ne 0 ]]; then write_status "EROARE: update neaplicat. Verifică journalctl -u infraflow-update.service."; fi
  rm -rf "$STAGE" "$ROLLBACK_DIR"
  exit "$exit_code"
}
trap rollback EXIT

write_status "Update detectat: $(basename "$ARCHIVE"). Se verifică pachetul."

# Refuză paths absolute, traversal și linkuri înainte de extragere.
if tar -tzf "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then echo 'Arhivă invalidă: cale nesigură.' >&2; exit 1; fi
if tar -tvzf "$ARCHIVE" | grep -Eq '^l|^h'; then echo 'Arhivă invalidă: linkuri nepermise.' >&2; exit 1; fi
tar -xzf "$ARCHIVE" -C "$STAGE" --no-same-owner --no-same-permissions
[[ -f "$STAGE/server/app.js" && -f "$STAGE/server/package.json" && -f "$STAGE/client/dist/index.html" && -f "$STAGE/version.json" ]] || { echo 'Pachet Linux incomplet.' >&2; exit 1; }
command -v rsync >/dev/null || { echo 'Lipsește rsync. Instalează-l înainte de primul update Linux.' >&2; exit 1; }
STAGED_VERSION="$(read_version "$STAGE/version.json")"
CURRENT_VERSION="$(read_version "$APP_DIR/version.json")"
[[ "$STAGED_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Pachet Linux invalid: versiune lipsă.' >&2; exit 1; }
is_newer_version "$STAGED_VERSION" "$CURRENT_VERSION" || { echo "Pachetul $STAGED_VERSION nu este mai nou decât versiunea curentă $CURRENT_VERSION." >&2; exit 1; }
write_status "Pachet valid: $CURRENT_VERSION -> $STAGED_VERSION."

STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_ARCHIVE="$BACKUP_DIR/app-before-update-$STAMP.tar.gz"
tar -C "$APP_DIR" -czf "$BACKUP_ARCHIVE" --exclude='./runtime' --exclude='./storage' --exclude='./logs' --exclude='./node_modules' .
write_status "Backup creat: $(basename "$BACKUP_ARCHIVE"). Se aplică pachetul."
systemctl stop infraflow.service
SERVICE_STOPPED=1
CHANGED=1
rsync -a --delete --exclude='runtime/' --exclude='storage/' --exclude='logs/' --exclude='node_modules/' "$STAGE/" "$APP_DIR/"
/usr/local/bin/npm --prefix "$APP_DIR/server" ci --omit=dev
( cd "$APP_DIR/server" && /usr/local/bin/node -e "require('mssql'); require('https-proxy-agent'); require('sprintf-js')" )
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/storage" "$APP_DIR/logs" "$APP_DIR/runtime"
INSTALLED_VERSION="$(read_version "$APP_DIR/version.json")"
[[ "$INSTALLED_VERSION" == "$STAGED_VERSION" ]] || { echo "Versiunea instalată $INSTALLED_VERSION nu corespunde pachetului $STAGED_VERSION." >&2; exit 1; }
systemctl start infraflow.service
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:4180/api/health >/dev/null; then
    SERVICE_STOPPED=0
    break
  fi
  sleep 1
done
[[ "$SERVICE_STOPPED" -eq 0 ]] || { echo 'Serverul nu a trecut verificarea de sănătate.' >&2; exit 1; }
refresh_worker_for_next_update
rm -f "$ARCHIVE"
write_status "OK: update $CURRENT_VERSION -> $STAGED_VERSION aplicat. Serviciul InfraFlow a fost repornit."

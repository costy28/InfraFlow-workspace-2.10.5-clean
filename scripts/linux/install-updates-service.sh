#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-}"
if [[ -z "$SOURCE_DIR" || ! -f "$SOURCE_DIR/app.js" ]]; then
  echo "Utilizare: sudo bash install-updates-service.sh /cale/catre/app" >&2
  exit 1
fi

INSTALL_DIR=/opt/infraflow-updates/app
STATE_DIR=/var/lib/infraflow-updates
ENV_DIR=/etc/infraflow-updates
UNIT_SOURCE="$(dirname "$0")/infraflow-updates.service"

id -u infraflow-updates >/dev/null 2>&1 || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin infraflow-updates
install -d -o root -g root -m 0755 "$INSTALL_DIR" "$STATE_DIR" "$STATE_DIR/catalog" "$STATE_DIR/packages" "$ENV_DIR"
install -o root -g root -m 0755 "$SOURCE_DIR/app.js" "$INSTALL_DIR/app.js"
if [[ -f "$SOURCE_DIR/licenses.example.json" && ! -f "$ENV_DIR/licenses.json" ]]; then
  install -o root -g infraflow-updates -m 0640 "$SOURCE_DIR/licenses.example.json" "$ENV_DIR/licenses.json"
fi

if [[ ! -f "$ENV_DIR/infraflow-updates.env" ]]; then
  install -o root -g root -m 0644 /dev/null "$ENV_DIR/infraflow-updates.env"
  cat > "$ENV_DIR/infraflow-updates.env" <<'EOF'
INFRAFLOW_UPDATES_HOST=127.0.0.1
INFRAFLOW_UPDATES_PORT=4182
INFRAFLOW_UPDATES_ROOT=/var/lib/infraflow-updates
EOF
fi

install -o root -g root -m 0644 "$UNIT_SOURCE" /etc/systemd/system/infraflow-updates.service
systemctl daemon-reload
systemctl enable --now infraflow-updates.service
systemctl --no-pager --full status infraflow-updates.service

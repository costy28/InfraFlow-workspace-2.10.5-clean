#!/usr/bin/env bash
set -euo pipefail

# Rulează ca root după ce aplicația a fost extrasă în /opt/infraflow/app și
# Node.js 20+, SQL Server Express și cloudflared au fost instalate separat.
APP_DIR="${APP_DIR:-/opt/infraflow/app}"
SERVICE_USER="${SERVICE_USER:-infraflow}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Rulează scriptul ca root." >&2
  exit 1
fi
if [[ ! -f "${APP_DIR}/server/app.js" ]]; then
  echo "Nu găsesc ${APP_DIR}/server/app.js. Extrage întâi pachetul InfraFlow." >&2
  exit 1
fi
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir /opt/infraflow --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 0750 \
  "${APP_DIR}/storage" "${APP_DIR}/logs" "${APP_DIR}/runtime"
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 0750 /var/backups/infraflow
install -d -o root -g "${SERVICE_USER}" -m 0750 /etc/infraflow

if [[ ! -f /etc/infraflow/infraflow.env ]]; then
  install -o root -g "${SERVICE_USER}" -m 0640 \
    "${APP_DIR}/scripts/linux/infraflow.env.example" /etc/infraflow/infraflow.env
  echo "Completează /etc/infraflow/infraflow.env cu parola SQL și APP_KEY, apoi rulează din nou scriptul." >&2
  exit 2
fi

install -o root -g root -m 0644 "${APP_DIR}/scripts/linux/infraflow.service" /etc/systemd/system/infraflow.service
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 0750 "${APP_DIR}/runtime/update-inbox"
install -d -o root -g root -m 0755 /usr/local/lib/infraflow
install -o root -g root -m 0755 "${APP_DIR}/scripts/linux/apply-update.sh" /usr/local/lib/infraflow/apply-update.sh
install -o root -g root -m 0644 "${APP_DIR}/scripts/linux/infraflow-update.service" /etc/systemd/system/infraflow-update.service
install -o root -g root -m 0644 "${APP_DIR}/scripts/linux/infraflow-update.path" /etc/systemd/system/infraflow-update.path
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}/storage" "${APP_DIR}/logs" "${APP_DIR}/runtime"
systemctl daemon-reload
systemctl enable --now infraflow-update.path
systemctl enable --now infraflow.service
systemctl --no-pager status infraflow.service

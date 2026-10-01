#!/usr/bin/env bash
set -euo pipefail

# Backup local MSSQL. După rulare copiați criptat fișierul în storage extern;
# un backup păstrat doar pe VPS nu este suficient pentru producție.
ENV_FILE="${INFRAFLOW_ENV_FILE:-/etc/infraflow/infraflow.env}"
BACKUP_DIR="${INFRAFLOW_BACKUP_DIR:-/var/backups/infraflow}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Rulează backupul ca root sau printr-un service systemd controlat." >&2
  exit 1
fi
if [[ ! -r "${ENV_FILE}" ]]; then
  echo "Nu pot citi ${ENV_FILE}." >&2
  exit 1
fi
set -a
source "${ENV_FILE}"
set +a
: "${DB_SERVER:?Lipsește DB_SERVER}"
: "${DB_DATABASE:?Lipsește DB_DATABASE}"
: "${DB_USER:?Lipsește DB_USER}"
: "${DB_PASSWORD:?Lipsește DB_PASSWORD}"
command -v sqlcmd >/dev/null 2>&1 || { echo "Lipsește sqlcmd (mssql-tools18)." >&2; exit 1; }

install -d -m 0750 "${BACKUP_DIR}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${BACKUP_DIR}/${DB_DATABASE}-${stamp}.bak"
safe_target="${target//\'/\'\'}"
export SQLCMDPASSWORD="${DB_PASSWORD}"
trap 'unset SQLCMDPASSWORD' EXIT
sqlcmd -S "${DB_SERVER}" -U "${DB_USER}" -C -b -Q "BACKUP DATABASE [${DB_DATABASE}] TO DISK = N'${safe_target}' WITH COPY_ONLY, CHECKSUM, COMPRESSION;"
chmod 0640 "${target}"
echo "Backup creat: ${target}"

#!/usr/bin/env bash
# New isolated diagnostic service only. Never restarts ERP or alters SQL/firewall.
set -euo pipefail
[[ "${1:-}" == '--install-confirmed' && $# == 1 && $EUID == 0 ]] || { echo 'Root and --install-confirmed required'; exit 1; }
name=infraflow-demo-platform
app=/opt/infraflow-demo-platform
state=/var/lib/infraflow-demo-platform
config=/etc/infraflow-demo-platform
unit=/etc/systemd/system/infraflow-demo-platform.service
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
[[ $(uname -s) == Linux && -x /usr/local/bin/node ]] || { echo 'Linux /usr/local/bin/node required'; exit 1; }
for p in "$app" "$state" "$config" "$unit"; do
  [[ ! -e "$p" && ! -L "$p" ]] || { echo "Already exists; stop for review: $p"; exit 1; }
done
if getent passwd "$name" >/dev/null || getent group "$name" >/dev/null; then echo 'Identity exists; stop for review'; exit 1; fi
if systemctl cat "$name.service" >/dev/null 2>&1; then echo 'Unit exists; stop for review'; exit 1; fi
[[ -z $(ss -H -ltn 'sport = :4280') ]] || { echo 'Port 4280 occupied'; exit 1; }
[[ -f "$root/server/demo-platform/service.js" && -f "$root/scripts/linux/infraflow-demo-platform.service.example" ]] || exit 1
/usr/local/bin/node --check "$root/server/demo-platform/service.js"
echo 'Installing only isolated demo-platform foundation; partial failures require review, no automatic deletion.'
groupadd --system "$name"
useradd --system --gid "$name" --home-dir "$state" --no-create-home --shell /usr/sbin/nologin "$name"
install -d -o root -g root -m 0755 "$app" "$app/server" "$app/server/demo-platform"
install -d -o "$name" -g "$name" -m 0700 "$state"
install -d -o root -g "$name" -m 0750 "$config"
install -o root -g root -m 0644 "$root/server/demo-platform/service.js" "$app/server/demo-platform/service.js"
install -o root -g root -m 0644 "$root/scripts/linux/infraflow-demo-platform.service.example" "$unit"
systemd-analyze verify "$unit"
systemctl daemon-reload
# Start only this new service; no enable at boot until acceptance.
systemctl start "$name.service"
systemctl --no-pager --full status "$name.service"
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4280/health/live
printf '\nReadiness (503 expected):\n'
curl --silent --show-error --max-time 5 -w '\nHTTP %{http_code}\n' http://127.0.0.1:4280/health/ready
printf '\nERP status (read-only):\n'
systemctl is-active infraflow

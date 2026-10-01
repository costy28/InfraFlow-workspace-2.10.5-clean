# UPDATE 626 — Hardening updater Linux

Versiune: `v2.12.606`  
Data: `2026-10-01`

## Corecții

- Mutarea pachetului acceptă directoare aflate pe volume diferite: copiază și
  șterge sursa doar după copiere reușită.
- Workerul systemd are lock exclusiv, astfel două declanșări nu pot executa
  simultan `npm ci`.
- După repornire, workerul verifică `/api/health` timp de maximum 30 secunde.
  Un eșec restaurează automat backupul anterior.

# UPDATE 621 — Hotfix service Hosted Linux

Versiune: `v2.12.601`  
Data: `2026-09-30`

## Corecție

- `infraflow.service` pornește explicit Node din `/usr/local/bin/node`, calea
  folosită de instalarea din arhiva oficială Node pe Ubuntu.
- Ghidul hosted indică SQL Server 2025 Express pentru Ubuntu 24.04, versiunea
  compatibilă cu această distribuție.

## Impact

- Nu modifică instalările Windows, baza de date sau porturile expuse.
- Pachetul demo Linux poate porni serviciul fără dependență de un binar Node
  furnizat de distribuția Ubuntu.

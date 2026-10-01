# UPDATE 620 — Fundație Hosted Linux

Versiune: `v2.12.600`  
Data: `2026-09-30`

## Ce se schimbă

- Instalările Linux nu mai depind de `powershell.exe` pentru executorul MSSQL
  folosit de rutele istorice sincrone; folosesc același driver Node `mssql` ca
  aplicația.
- Sunt incluse șabloane pentru Ubuntu 24.04 LTS: serviciu `systemd`, fișier de
  mediu separat, backup MSSQL și timer zilnic.
- Există un ghid de pilot hosted care păstrează SQL și aplicația numai pe
  loopback, în spatele Cloudflare Tunnel.

## Limite deliberate

- Instalarea Windows și update-ul web Windows nu se modifică.
- Update-ul web pe Linux nu este activat încă; aplicarea pachetelor se face
  controlat până la testarea completă a restartului systemd și rollbackului.
- PIUSI și alte citiri directe din aplicații locale Windows nu fac parte din
  runtime-ul hosted Linux; vor deveni conectori opționali cu agent local.

# UPDATE 623 — Hardening Hosted Linux loopback

Versiune: `v2.12.603`  
Data: `2026-09-30`

## Corecție

- Pe Linux, serverul Express leagă implicit portul aplicației la
  `127.0.0.1`. Accesul public rămâne posibil numai printr-un tunnel sau proxy
  local configurat explicit.

## Compatibilitate

- Windows nu primește implicit restricția loopback, astfel încât instalările
  existente din rețeaua locală își păstrează comportamentul.

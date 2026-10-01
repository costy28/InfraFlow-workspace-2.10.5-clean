# UPDATE 622 — Hotfix dependență Hosted Linux

Versiune: `v2.12.602`  
Data: `2026-09-30`

## Corecție

- `node-adodb` este declarat dependență opțională. Este folosit numai pentru
  importul PIUSI MDB prin ADODB/COM, disponibil doar în Windows.

## Impact

- `npm ci --omit=dev` poate continua pe Ubuntu fără a instala un modul al cărui
  manifest cere explicit platforma Windows.
- Importul PIUSI MDB rămâne delimitat ca funcție Windows-only; nu este emulat
  sau expus pe serverul hosted Linux.

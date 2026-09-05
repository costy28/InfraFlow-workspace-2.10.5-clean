# UPDATE 550 — Securizare acces fișiere storage

Versiune: **2.12.530**
Data: **2026-09-05**

## Ce s-a schimbat

- Înlocuiește servirea statică publică `/storage` cu handler protejat prin sesiune validă.
- Blochează accesul la fișiere din afara folderului `storage` prin normalizare de cale și refuz traversal.
- Păstrează endpoint-urile dedicate de download existente pentru modulele care au deja verificări de context.
- Extinde `npm run audit:commercial-smoke` cu verificare explicită pentru `/storage` fără sesiune și traversal.

## Impact

- Fișierele sensibile încărcate în ERP nu mai sunt servite public doar prin ghicirea URL-ului.
- Linkurile directe către `/storage/...` au nevoie de sesiune validă; pe termen lung trebuie mutate în endpoint-uri dedicate pe fiecare dosar/entitate.
- Nu schimbă schema bazei de date și nu necesită migrare SQL nouă.

## Verificări

- `npm run audit:commercial-smoke` ✅ 11/11 verificări trecute.
- `npm run release:check -- --no-zip` ✅
- `npm run audit:local` ✅
- ZIP generat și validat: `installer/output/InfraFlow-update-v2.12.530.zip`

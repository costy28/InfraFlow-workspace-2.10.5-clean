# UPDATE 565 — Liste compacte în HR operațional

Versiune: 2.12.545
Data: 2026-09-11

## Scop

Continuă curățarea paginilor aglomerate: HR Inbox și jurnalul operațional nu mai încarcă vizual zeci de rânduri la prima deschidere.

## Implementare

- Inbox HR afișează implicit primele 6 sarcini relevante.
- Jurnalul operațional HR afișează implicit primele 8 evenimente.
- Am adăugat footer compact cu numărul de elemente vizibile și buton de extindere/restrângere.
- Acțiunile existente rămân disponibile: deschidere sarcină, încărcare document, filtre, reload și export Excel.

## Verificare

- npm run build

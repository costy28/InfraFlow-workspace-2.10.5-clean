# UPDATE 572 — Setări General cu detalii pliabile pentru GPS și email

Versiune: v2.12.552  
Data: 2026-09-12

## Scop

Continuă simplificarea paginii Setări → General: informațiile folosite rar trebuie să rămână disponibile, dar să nu ocupe vizual pagina principală.

## Implementat

- Integrarea GPS este grupată într-un panou pliabil separat.
- Configurarea email organizațional, IMAP, sincronizarea și regulile automate sunt grupate într-un panou pliabil separat.
- Cardurile de identitate organizație, profil internațional, server/locație și TVA rămân vizibile ca zone principale.
- Câmpurile existente rămân compatibile cu salvarea curentă a setărilor.

## Verificări

- Build frontend/backend.
- Release check fără ZIP.
- Audit expuneri fișiere.
- Verificare whitespace cu git diff --check.
- Pachet update ZIP generat și validat.

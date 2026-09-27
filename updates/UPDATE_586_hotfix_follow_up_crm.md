# UPDATE 586 — Hotfix follow-up CRM

Versiune: `v2.12.566`  
Data: `2026-09-27`

## Corecții

- Activitatea creată automat de un follow-up este normalizată înainte de salvare și primește întotdeauna momentul obligatoriu.
- Erorile interne CRM, inclusiv cele provenite din SQL Server, rămân în jurnalul serverului și nu mai sunt trimise în browser.

## Verificare

1. Deschide un lead și alege **Creează follow-up**.
2. Salvează task-ul de follow-up.
3. Confirmă apariția task-ului și a activității în fișa lead-ului, fără mesaj tehnic roșu.

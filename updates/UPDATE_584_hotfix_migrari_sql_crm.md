# UPDATE 584 — Hotfix migrări SQL Server CRM (`v2.12.564`)

## Problema rezolvată

O conexiune SQL Server cu `QUOTED_IDENTIFIER` sau alte opțiuni ANSI dezactivate
putea opri o migrare care crea indecși filtrați sau unici. Efectul vizibil era
CRM activat, dar cu mesajul „Migrarea CRM nu este aplicată complet”.

## Schimbare

Executorul MSSQL configurează explicit, pentru fiecare comandă, opțiunile ANSI
cerute de SQL Server înainte de rularea scriptului. Nu modifică date de business
și nu schimbă regulile CRM.

## Verificare

1. Aplică update-ul și permite repornirea serverului.
2. Deschide CRM / Vânzări.
3. Endpoint-ul intern `/api/crm/health` trebuie să indice `schema.ready: true`.

# UPDATE 027 — Pornire automată unificată
Data: 02 Iunie 2026
Versiune: 2.12.7

## Descriere

Shortcut-ul manual nu mai pornește o instanță separată în modul JSON. Atât
pornirea manuală, cât și Task Scheduler folosesc launcherul MSSQL generat de
installer.

Task-ul `InfraFlow ERP` este înregistrat cu trigger la boot și la logon.
Scriptul `repair-autostart.ps1` reconstruiește task-ul și afișează starea plus
jurnalul de erori dacă serverul nu răspunde.

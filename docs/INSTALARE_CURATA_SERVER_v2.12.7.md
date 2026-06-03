# Instalare curată InfraFlow Server v2.12.7

Acest ghid recreează numai aplicația InfraFlow și baza dedicată `INFRAFLOW`.
Nu șterge și nu modifică bazele CIEL existente.

## Instalare curată

1. Dezinstalați `InfraFlow ERP Server`.
2. Ștergeți folderul rămas `C:\Program Files (x86)\InfraFlow`.
3. Extrageți kitul `InfraFlow-Clean-Install-v2.12.7.zip`.
4. Deschideți PowerShell cu `Run as Administrator` în folderul extras.
5. Resetați exclusiv baza InfraFlow:

```powershell
powershell -ExecutionPolicy Bypass -File .\reset-infraflow-database.ps1 -Server '.\CIEL' -Confirm 'STERG INFRAFLOW'
```

6. Rulați ca Administrator `InfraFlow-Server-Setup-v2.12.7.exe`.
7. Nu bifați instalarea SQL Express. Serverul Publiserv are deja instanța
   `SERVER\CIEL`.

Installerul creează baza `INFRAFLOW`, configurează task-ul `InfraFlow ERP` și
verifică obligatoriu `http://localhost:4180/api/system/health`.

## Reparare pornire automată fără reinstalare

Extrageți `InfraFlow-Repair-Autostart-v2.12.7.zip`, deschideți PowerShell ca
Administrator în folderul extras și rulați:

```powershell
powershell -ExecutionPolicy Bypass -File .\APLICA_REPARATIA.ps1
```

Scriptul oprește procesul pornit manual, reconstruiește task-ul și verifică
strict pornirea automată. Dacă eșuează, afișează starea task-ului și jurnalul.

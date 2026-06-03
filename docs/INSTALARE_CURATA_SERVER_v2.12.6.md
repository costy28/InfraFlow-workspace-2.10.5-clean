# Instalare curată InfraFlow Server v2.12.6

Acest ghid recreează numai aplicația InfraFlow și baza dedicată `INFRAFLOW`.
Nu șterge și nu modifică bazele CIEL existente.

## 1. Dezinstalare aplicație veche

Din Windows Apps eliminați `InfraFlow ERP Server`. Dacă folderul există încă
după dezinstalare, ștergeți:

```text
C:\Program Files (x86)\InfraFlow
```

## 2. Resetare bază InfraFlow

Extrageți kitul `InfraFlow-Clean-Install-v2.12.6.zip`. Deschideți PowerShell cu
`Run as Administrator`, intrați în folderul extras și rulați:

```powershell
powershell -ExecutionPolicy Bypass -File .\reset-infraflow-database.ps1 -Server '.\CIEL' -Confirm 'STERG INFRAFLOW'
```

Scriptul șterge exclusiv:

- baza `INFRAFLOW`;
- loginul SQL `infraflow`;
- task-ul Windows `InfraFlow ERP`.

## 3. Instalare de la zero

Rulați cu `Run as Administrator`:

```text
InfraFlow-Server-Setup-v2.12.6.exe
```

Nu bifați instalarea SQL Express: serverul Publiserv are deja instanța
`SERVER\CIEL`.

Installerul:

- detectează automat `.\CIEL`;
- creează baza `INFRAFLOW`;
- generează și salvează protejat parola loginului `infraflow`;
- instalează dependențele Node;
- creează task-ul automat `InfraFlow ERP`;
- pornește serverul;
- configurează backup MSSQL zilnic;
- verifică obligatoriu `http://localhost:4180/api/system/health`.

La final deschideți:

```text
http://localhost:4180
```

# Reparare pornire InfraFlow pe instanța SQL CIEL

Folosiți acești pași dacă browserul afișează `localhost refused to connect`, iar
baza `INFRAFLOW` există deja pe instanța SQL Server `SERVER\CIEL`.

## Pași

1. Copiați folderul kitului pe server.
2. Deschideți PowerShell cu `Run as Administrator`.
3. Intrați în folderul kitului.
4. Rulați:

```powershell
powershell -ExecutionPolicy Bypass -File .\repair-sql-instance.ps1 -Server '.\CIEL'
```

Scriptul:

- pornește serviciul SQL corespunzător instanței `CIEL`;
- înlocuiește configurația veche `.\SQLEXPRESS` cu `.\CIEL`;
- păstrează baza și parola SQL existente;
- repornește task-ul `InfraFlow ERP`;
- verifică automat `http://localhost:4180/api/system/health`.

## Dacă lipsește configurația runtime

Dacă scriptul raportează că lipsește `runtime\mssql.env`, rulați installerul
`InfraFlow-Server-Setup-v2.12.5.exe`. Installerul detectează automat instanța
care conține baza `INFRAFLOW`.

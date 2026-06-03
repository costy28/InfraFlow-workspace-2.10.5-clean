# Instalare automată InfraFlow Server v2.12.8

## Ce detectează installerul

Installerul caută serviciile SQL Server existente și preferă automat instanța
care conține deja baza `INFRAFLOW`. Sunt acceptate inclusiv instanțe precum
`.\CIEL`, `.\SQLEXPRESS` și instanța implicită `.`.

După conectare salvează:

- instanța SQL selectată;
- versiunea și ediția SQL Server;
- profilul de compatibilitate `legacy` sau `modern`;
- credentialele dedicate aplicației în `runtime\mssql.env`;
- configurația launcherului Task Scheduler.

## Profiluri SQL

- SQL Server 2008–2014: profil `legacy`, fără funcția `ISJSON`.
- SQL Server 2016+: profil `modern`.
- Modul relațional extins rămâne dezactivat implicit până la validarea
  separată pe fiecare generație SQL Server.

## Instalare

1. Rulați `InfraFlow-Server-Setup-v2.12.8.exe` cu `Run as Administrator`.
2. Dacă utilizatorul Windows nu are drepturi SQL administrative, installerul
   solicită utilizatorul SQL administrator, implicit `sa`, și parola acestuia.
3. Installerul creează automat baza `INFRAFLOW`, loginul dedicat `infraflow`,
   tabela compatibilă `dbo.app_state`, task-ul de pornire automată și backup-ul
   zilnic.
4. La final verifică automat `http://localhost:4180/api/system/health`.

## Verificare

Răspunsul corect conține:

```json
{
  "ok": true,
  "mode": "mssql",
  "server": ".\\CIEL",
  "database": "INFRAFLOW"
}
```

Valoarea `server` diferă în funcție de instanța SQL detectată.

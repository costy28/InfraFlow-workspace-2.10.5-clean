# InfraFlow workspace curat 2.10.5

Creat la 2026-05-31 din:

- surse complete: `E:\CODEX 1\Bitum app\InfraFlow-proiect\InfraFlow Git`
- fix GPS confirmat functional: `E:\Anthropic`
- date runtime active: `C:\Program Files (x86)\InfraFlow`

## Date locale

Workspace-ul ruleaza in `DB_MODE=json` cu baza activa copiata in
`data/app-db.json`.

Installerul foloseste separat `data/app-db.seed.json`, astfel incat datele
runtime locale sa nu fie incluse intr-o instalare noua.

Copiile de siguranta locale sunt in `_local-runtime-backup/`:

- `source-seed/app-db.json`
- `installed-runtime/app-db.json`
- `installed-runtime/.env`

Acest director este ignorat de Git deoarece poate contine date sensibile.

## Pornire

```powershell
cd "E:\CODEX 1\InfraFlow-workspace-2.10.5-clean"
node server\app.js
```

Aplicatia este disponibila implicit la `http://localhost:4180`.

## Build complet

```powershell
cd "E:\CODEX 1\InfraFlow-workspace-2.10.5-clean"
powershell -ExecutionPolicy Bypass -File .\Build-InfraFlow.ps1
```

Scriptul genereaza:

- `installer/output/InfraFlow-Server-Setup-v2.10.5.exe`
- `electron/dist/InfraFlow ERP Setup 2.10.5.exe`
- `installer/output/InfraFlow-update-v2.10.5.zip`

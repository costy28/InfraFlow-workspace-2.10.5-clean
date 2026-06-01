; ================================================
; InfraFlow ERP — Server Installer
; Inno Setup 6 Script
; ================================================

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName=InfraFlow ERP Server
AppVersion=2.12.3
AppPublisher=InfraSuite
AppPublisherURL=https://infraflow.ro
DefaultDirName={autopf}\InfraFlow
DefaultGroupName=InfraFlow
OutputDir=output
OutputBaseFilename=InfraFlow-Server-Setup-v2.12.3
PrivilegesRequired=admin
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
MinVersion=10.0
UninstallDisplayIcon={app}\infraflow-server.ico

[Languages]
Name: "romanian"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "sqlexpress"; Description: "Instalează SQL Server Express 2022 (dacă nu există)"; GroupDescription: "Bază de date:"
Name: "autostart"; Description: "Pornește InfraFlow automat la boot Windows"; GroupDescription: "Opțiuni:"; Flags: checkedonce
Name: "desktopicon"; Description: "Creează scurtătură pe Desktop"; GroupDescription: "Scurtături:"; Flags: checkedonce

[Files]
; === Aplicație server ===
Source: "..\server\*"; \
  DestDir: "{app}\server"; \
  Flags: ignoreversion recursesubdirs createallsubdirs; \
  Excludes: "node_modules\*,.env,*.log"

; === Client build (React/Vite) ===
Source: "..\client\dist\*"; \
  DestDir: "{app}\client\dist"; \
  Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\client\public\favicon.svg"; DestDir: "{app}\client\public"; Flags: ignoreversion
Source: "..\client\public\icon-192.png"; DestDir: "{app}\client\public"; Flags: ignoreversion
Source: "..\client\public\icon-512.png"; DestDir: "{app}\client\public"; Flags: ignoreversion

; === Baza de date ===
Source: "..\db\*"; \
  DestDir: "{app}\db"; \
  Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\data\app-db.install.json"; \
  DestDir: "{app}\data"; \
  DestName: "app-db.json"; \
  Flags: ignoreversion onlyifdoesntexist uninsneveruninstall

; === Tools === (nssm.exe opțional — nu mai e necesar cu Task Scheduler)
Source: "nssm.exe"; DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist

; === Config & Scripts ===
Source: "setup-task.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "uninstall-task.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "setup-db.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\scripts\windows\install-service.ps1"; DestDir: "{app}\scripts\windows"; Flags: ignoreversion
Source: "..\scripts\windows\uninstall-service.ps1"; DestDir: "{app}\scripts\windows"; Flags: ignoreversion
Source: "..\scripts\windows\check-sqlserver.ps1"; DestDir: "{app}\scripts\windows"; Flags: ignoreversion
Source: "..\scripts\windows\configure-mssql-login.ps1"; DestDir: "{app}\scripts\windows"; Flags: ignoreversion
Source: "..\scripts\windows\CREARE_BAZA_INFRAFLOW.sql"; DestDir: "{app}\scripts\windows"; Flags: ignoreversion
Source: "..\scripts\windows\backup-mssql.ps1"; DestDir: "{app}\scripts\windows"; Flags: ignoreversion
Source: "..\scripts\windows\schedule-backup.ps1"; DestDir: "{app}\scripts\windows"; Flags: ignoreversion
Source: "..\scripts\migrate-json-to-mssql.js"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\.env.example"; DestDir: "{app}"; DestName: ".env.example"; \
  Flags: ignoreversion onlyifdoesntexist
Source: "Porneste-InfraFlow.bat"; DestDir: "{app}"; Flags: ignoreversion

; === Metadata ===
Source: "..\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\CHANGELOG.md"; DestDir: "{app}"; Flags: ignoreversion

; === Node.js MSI (embedded) ===
Source: "node-v20-x64.msi"; \
  DestDir: "{tmp}"; \
  Flags: deleteafterinstall skipifsourcedoesntexist

; === SQL Server Express (opțional) ===
Source: "SQLEXPR_x64_ENU.exe"; \
  DestDir: "{tmp}"; \
  Flags: deleteafterinstall skipifsourcedoesntexist; \
  Tasks: sqlexpress

[Dirs]
Name: "{app}\logs"; Flags: uninsneveruninstall
Name: "{app}\data"; Flags: uninsneveruninstall
Name: "{app}\backups"; Flags: uninsneveruninstall
Name: "{app}\storage\angajati"; Flags: uninsneveruninstall
Name: "{app}\storage\documente"; Flags: uninsneveruninstall
Name: "{app}\storage\foi-parcurs"; Flags: uninsneveruninstall
Name: "{app}\storage\field-photos"; Flags: uninsneveruninstall
Name: "{app}\storage\signatures"; Flags: uninsneveruninstall
Name: "{app}\storage\temp"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\InfraFlow ERP Server"; Filename: "{app}\Porneste-InfraFlow.bat"
Name: "{group}\Dezinstalare InfraFlow"; Filename: "{uninstallexe}"
Name: "{commondesktop}\InfraFlow ERP"; Filename: "{app}\Porneste-InfraFlow.bat"; \
  Tasks: desktopicon

[Registry]
Root: HKLM; \
  Subkey: "SOFTWARE\InfraSuite\InfraFlow"; \
  ValueType: string; ValueName: "InstallPath"; \
  ValueData: "{app}"; \
  Flags: uninsdeletekey
Root: HKLM; \
  Subkey: "SOFTWARE\InfraSuite\InfraFlow"; \
  ValueType: string; ValueName: "Version"; \
  ValueData: "2.12.3"; \
  Flags: uninsdeletevalue

[Run]
; 1. Instaleaza Node.js daca lipseste
Filename: "powershell.exe"; Parameters: "-NonInteractive -Command ""if (!(Get-Command node -EA SilentlyContinue)) {{ Start-Process msiexec -Wait -ArgumentList ""/i"", ""{tmp}\node-v20-x64.msi"", ""/quiet"", ""/norestart"" }}"""; StatusMsg: "Verific Node.js..."; Flags: runhidden waituntilterminated

; 2. Configurare MSSQL obligatorie
Filename: "powershell.exe"; Parameters: "-NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\setup-db.ps1"" -AppDir ""{app}"""; StatusMsg: "Verific SQL Server Express si configurez MSSQL..."; Flags: runhidden waituntilterminated

; 3. Configureaza loginul SQL dedicat InfraFlow
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\windows\configure-mssql-login.ps1"" -AppDir ""{app}"""; StatusMsg: "Configurez loginul SQL dedicat InfraFlow..."; Flags: waituntilterminated

; 4. npm install
Filename: "cmd.exe"; Parameters: "/c cd /d ""{app}\server"" && npm install --omit=dev --prefer-offline"; StatusMsg: "Instalez dependentele server..."; Flags: runhidden waituntilterminated

; 5. Task Scheduler pornire automata
Filename: "powershell.exe"; Parameters: "-NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\setup-task.ps1"""; StatusMsg: "Configurez pornire automata..."; Flags: runhidden waituntilterminated

; 6. Backup MSSQL zilnic
Filename: "powershell.exe"; Parameters: "-NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\windows\schedule-backup.ps1"" -AppDir ""{app}"""; StatusMsg: "Configurez backup MSSQL zilnic..."; Flags: runhidden waituntilterminated

; 7. Deschide browser
Filename: "http://localhost:4180"; Description: "Deschide InfraFlow in browser"; Flags: nowait postinstall shellexec skipifsilent
[UninstallRun]
; Oprire task + kill proces node.exe care rulează app.js din folderul de instalare
Filename: "powershell.exe"; \
  Parameters: "-NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-task.ps1"" -AppDir ""{app}"""; \
  RunOnceId: "StopTask"; \
  Flags: runhidden

[Code]
procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel2.Caption :=
    'InfraFlow ERP Server v2.12.3' + #13#10#13#10 +
    'Acest installer va configura:' + #13#10 +
    '  • Aplicația server Node.js (Express)' + #13#10 +
    '  • Frontend React (servit de server)' + #13#10 +
    '  • Task Scheduler Windows (pornire automată la boot)' + #13#10 +
    '  • Baza de date SQL Server Express (obligatoriu)' + #13#10 +
    '  • Backup MSSQL automat zilnic la ora 02:00' + #13#10#13#10 +
    'Port implicit: 4180 (http://localhost:4180)' + #13#10 +
    'Durata estimată: 3-8 minute.' + #13#10#13#10 +
    'Recomandat: închideți toate aplicațiile înainte de instalare.';
end;

function InitializeSetup(): Boolean;
var
  NodeExists: Boolean;
  Msg: String;
begin
  Result := True;

  // Verifică dacă Node.js e instalat
  NodeExists := FileExists(ExpandConstant('{sys}\node.exe')) or FileExists('C:\Program Files\nodejs\node.exe');

  if not NodeExists then
  begin
    Msg := 'Node.js 20 LTS nu a fost detectat pe acest sistem.' + #13#10#13#10 +
           'Dacă ați inclus node-v20-x64.msi în folderul installer/' + #13#10 +
           'el va fi instalat automat.' + #13#10#13#10 +
           'Altfel, instalați manual Node.js 20 LTS de la nodejs.org' + #13#10 +
           'înainte de a continua.' + #13#10#13#10 +
           'Continuați oricum?';
    if MsgBox(Msg, mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
end;

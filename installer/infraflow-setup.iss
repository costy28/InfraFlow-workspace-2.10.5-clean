; ================================================
; InfraFlow v2 - Inno Setup Script
; ================================================

[Setup]
AppId={{8F4A2B1C-3D5E-4F6A-8B9C-0D1E2F3A4B5C}
AppName=InfraFlow ERP
AppVersion=2.12.463
AppPublisher=InfraFlow Software
AppPublisherURL=https://infraflow.ro
DefaultDirName={autopf}\InfraFlow
DefaultGroupName=InfraFlow
AllowNoIcons=yes
OutputDir=output
OutputBaseFilename=InfraFlow-Setup-v2.12.463
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
MinVersion=10.0

[Languages]
Name: "default"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Creaza scurtatura pe Desktop"; GroupDescription: "Scurtaturi:"
Name: "autostart"; Description: "Porneste InfraFlow automat la pornirea Windows"; GroupDescription: "Optiuni:"; Flags: unchecked

[Files]
Source: "..\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.log,node_modules\*,.env,mssql.env"
Source: "..\client\dist\*"; DestDir: "{app}\client\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\client\public\favicon.svg"; DestDir: "{app}\client\public"; Flags: ignoreversion
Source: "..\client\public\icon-192.png"; DestDir: "{app}\client\public"; Flags: ignoreversion
Source: "..\client\public\icon-512.png"; DestDir: "{app}\client\public"; Flags: ignoreversion
Source: "..\db\*"; DestDir: "{app}\db"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\data\app-db.install.json"; DestDir: "{app}\data"; DestName: "app-db.json"; Flags: ignoreversion onlyifdoesntexist uninsneveruninstall
Source: "..\scripts\windows\install-service.ps1"; DestDir: "{app}\scripts\windows"; Flags: ignoreversion
Source: "..\scripts\windows\uninstall-service.ps1"; DestDir: "{app}\scripts\windows"; Flags: ignoreversion
Source: "..\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\CHANGELOG.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\.env.example"; DestDir: "{app}"; DestName: ".env.example"; Flags: ignoreversion onlyifdoesntexist
Source: "nssm.exe"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "Porneste-InfraFlow.bat"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\data"; Flags: uninsneveruninstall
Name: "{app}\storage\field-photos"; Flags: uninsneveruninstall
Name: "{app}\storage\signatures"; Flags: uninsneveruninstall
Name: "{app}\storage\foi-parcurs"; Flags: uninsneveruninstall
Name: "{app}\storage\temp"; Flags: uninsneveruninstall
Name: "{app}\logs"; Flags: uninsneveruninstall
Name: "{app}\backups"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\InfraFlow ERP"; Filename: "{app}\Porneste-InfraFlow.bat"
Name: "{group}\Dezinstalare InfraFlow"; Filename: "{uninstallexe}"
Name: "{commondesktop}\InfraFlow ERP"; Filename: "{app}\Porneste-InfraFlow.bat"; Tasks: desktopicon

[Registry]
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "InfraFlow"; ValueData: """{app}\Porneste-InfraFlow.bat"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\installer\nssm.exe"; Parameters: "install InfraFlow node.exe ""{app}\server\app.js"""; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "set InfraFlow AppDirectory ""{app}"""; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "set InfraFlow AppEnvironmentExtra INFRAFLOW_PORT=4180 DB_MODE=json NODE_ENV=production"; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "set InfraFlow DisplayName ""InfraFlow ERP"""; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "set InfraFlow Description ""InfraFlow ERP - Server principal"""; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "set InfraFlow AppStdout ""{app}\logs\infraflow.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "set InfraFlow AppStderr ""{app}\logs\infraflow-error.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "set InfraFlow AppRotateFiles 1"; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "set InfraFlow AppRotateBytes 10485760"; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "set InfraFlow Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated
Filename: "{app}\installer\nssm.exe"; Parameters: "start InfraFlow"; StatusMsg: "Pornesc InfraFlow..."; Flags: runhidden waituntilterminated
Filename: "http://localhost:4180"; Description: "Deschide InfraFlow in browser"; Flags: nowait postinstall shellexec

[UninstallRun]
Filename: "{app}\installer\nssm.exe"; Parameters: "stop InfraFlow"; Flags: runhidden
Filename: "{app}\installer\nssm.exe"; Parameters: "remove InfraFlow confirm"; Flags: runhidden

[Code]
procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel2.Caption :=
    'Acest program va instala InfraFlow ERP v2.12.463' + #13#10#13#10 +
    'Contine toate actualizarile din v2.8.0, v2.9.0 si v2.10.0:' + #13#10 +
    '  - Kiosk Angajat & Foi Parcurs (VERSO + semnatura)' + #13#10 +
    '  - Verificare angajat HR la creare cont' + #13#10 +
    '  - Icon macara, serviciu Windows NSSM' + #13#10 +
    '  - Canale automate mesagerie' + #13#10#13#10 +
    'Dupa instalare, aplicatia va porni automat ca serviciu Windows.' + #13#10 +
    'Este recomandat sa inchideti toate celelalte aplicatii inainte de a continua.';
end;




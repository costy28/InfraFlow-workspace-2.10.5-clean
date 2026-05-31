; ================================================
; InfraFlow ERP — Client Desktop (Electron) Installer
; Inno Setup 6 Script
; ================================================
;
; PREREQUISITE: Electron app trebuie construit înainte cu:
;   cd electron && npm install && npm run build
;   → generează electron\dist\win-unpacked\InfraFlow.exe
;
; SAU folosiți electron-builder care generează propriul NSIS installer.
; Acest .iss este alternativa Inno Setup pentru Electron packaged app.
; ================================================

[Setup]
AppId={{B2C3D4E5-F6A7-8901-BCDE-F12345678901}
AppName=InfraFlow ERP Client
AppVersion=2.10.5
AppPublisher=InfraSuite
AppPublisherURL=https://infraflow.ro
DefaultDirName={autopf}\InfraFlow Client
DefaultGroupName=InfraFlow
OutputDir=output
OutputBaseFilename=InfraFlow-Client-Setup-v2.10.5
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
MinVersion=10.0
; Nu necesită admin — instalare per utilizator posibilă
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline dialog

[Languages]
Name: "romanian"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; \
  Description: "Creează scurtătură pe Desktop"; \
  GroupDescription: "Scurtături:"; \
  Flags: checked
Name: "autostart"; \
  Description: "Pornește InfraFlow Client la Windows login"; \
  GroupDescription: "Opțiuni:"; \
  Flags: unchecked

[Files]
; Electron app — build result (win-unpacked sau similar)
; Trebuie să existe înainte de compilarea .iss:
;   electron\dist\win-unpacked\*
Source: "..\electron\dist\win-unpacked\*"; \
  DestDir: "{app}"; \
  Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\InfraFlow ERP"; \
  Filename: "{app}\InfraFlow.exe"; \
  Comment: "InfraFlow ERP Client"
Name: "{group}\Dezinstalare InfraFlow Client"; \
  Filename: "{uninstallexe}"
Name: "{commondesktop}\InfraFlow ERP"; \
  Filename: "{app}\InfraFlow.exe"; \
  Tasks: desktopicon

[Registry]
; Autostart opțional
Root: HKCU; \
  Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "InfraFlow Client"; \
  ValueData: """{app}\InfraFlow.exe"""; \
  Flags: uninsdeletevalue; \
  Tasks: autostart
; Salvare director instalare
Root: HKCU; \
  Subkey: "SOFTWARE\InfraSuite\InfraFlow Client"; \
  ValueType: string; ValueName: "InstallPath"; \
  ValueData: "{app}"; \
  Flags: uninsdeletekey

[Run]
Filename: "{app}\InfraFlow.exe"; \
  Description: "Pornește InfraFlow ERP Client"; \
  Flags: nowait postinstall skipifsilent

[Code]
procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel2.Caption :=
    'InfraFlow ERP Client v2.10.5' + #13#10#13#10 +
    'Aplicație desktop pentru accesarea serverului InfraFlow' + #13#10 +
    'din rețeaua locală sau de pe internet.' + #13#10#13#10 +
    'La prima pornire vei fi ghidat să introduci' + #13#10 +
    'adresa serverului InfraFlow (ex: 192.168.100.27:4180).' + #13#10#13#10 +
    'Dimensiune instalare: ~120 MB' + #13#10 +
    'Durata: ~1 minut.';
end;

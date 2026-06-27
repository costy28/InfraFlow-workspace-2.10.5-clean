; ================================================
; InfraFlow ERP Ã¢â‚¬â€ Client Desktop (Electron) Installer
; Inno Setup 6 Script
; ================================================
;
; PREREQUISITE: Electron app trebuie construit ÃƒÂ®nainte cu:
;   cd electron && npm install && npm run build
;   Ã¢â€ â€™ genereazÃ„Æ’ electron\dist\win-unpacked\InfraFlow ERP.exe
;
; SAU folosiÃˆâ€ºi electron-builder care genereazÃ„Æ’ propriul NSIS installer.
; Acest .iss este alternativa Inno Setup pentru Electron packaged app.
; ================================================

[Setup]
AppId={{B2C3D4E5-F6A7-8901-BCDE-F12345678901}
AppName=InfraFlow ERP Client
AppVersion=2.12.152
AppPublisher=InfraSuite
AppPublisherURL=https://infraflow.ro
DefaultDirName={autopf}\InfraFlow Client
DefaultGroupName=InfraFlow
OutputDir=output
OutputBaseFilename=InfraFlow-Client-Setup-v2.12.152
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
MinVersion=10.0
; Nu necesitÃ„Æ’ admin Ã¢â‚¬â€ instalare per utilizator posibilÃ„Æ’
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline dialog

[Languages]
Name: "romanian"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; \
  Description: "CreeazÃ„Æ’ scurtÃ„Æ’turÃ„Æ’ pe Desktop"; \
  GroupDescription: "ScurtÃ„Æ’turi:"
Name: "autostart"; \
  Description: "PorneÃˆâ„¢te InfraFlow Client la Windows login"; \
  GroupDescription: "OpÃˆâ€ºiuni:"; \
  Flags: unchecked

[Files]
; Electron app Ã¢â‚¬â€ build result (win-unpacked sau similar)
; Trebuie sÃ„Æ’ existe ÃƒÂ®nainte de compilarea .iss:
;   electron\dist\win-unpacked\*
Source: "..\electron\dist\win-unpacked\*"; \
  DestDir: "{app}"; \
  Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\InfraFlow ERP"; \
  Filename: "{app}\InfraFlow ERP.exe"; \
  Comment: "InfraFlow ERP Client"
Name: "{group}\Dezinstalare InfraFlow Client"; \
  Filename: "{uninstallexe}"
Name: "{commondesktop}\InfraFlow ERP"; \
  Filename: "{app}\InfraFlow ERP.exe"; \
  Tasks: desktopicon

[Registry]
; Autostart opÃˆâ€ºional
Root: HKCU; \
  Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "InfraFlow Client"; \
  ValueData: """{app}\InfraFlow ERP.exe"""; \
  Flags: uninsdeletevalue; \
  Tasks: autostart
; Salvare director instalare
Root: HKCU; \
  Subkey: "SOFTWARE\InfraSuite\InfraFlow Client"; \
  ValueType: string; ValueName: "InstallPath"; \
  ValueData: "{app}"; \
  Flags: uninsdeletekey

[Run]
Filename: "{app}\InfraFlow ERP.exe"; \
  Description: "PorneÃˆâ„¢te InfraFlow ERP Client"; \
  Flags: nowait postinstall skipifsilent

[Code]
procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel2.Caption :=
    'InfraFlow ERP Client v2.12.152' + #13#10#13#10 +
    'AplicaÃˆâ€ºie desktop pentru accesarea serverului InfraFlow' + #13#10 +
    'din reÃˆâ€ºeaua localÃ„Æ’ sau de pe internet.' + #13#10#13#10 +
    'La prima pornire vei fi ghidat sÃ„Æ’ introduci' + #13#10 +
    'adresa serverului InfraFlow (ex: 192.168.100.27:4180).' + #13#10#13#10 +
    'Dimensiune instalare: ~120 MB' + #13#10 +
    'Durata: ~1 minut.';
end;


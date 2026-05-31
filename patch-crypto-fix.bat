@echo off
:: Auto-elevare Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Repornire ca Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ================================================
echo  InfraFlow - Patch crypto fix (key length)
echo ================================================

set TARGET=C:\Program Files (x86)\InfraFlow\server\modules\system\routes.js
set SOURCE=E:\Anthropic\server\modules\system\routes.js

:: Backup
copy "%TARGET%" "%TARGET%.bak" >nul 2>&1
echo Backup creat: routes.js.bak

:: Patch cu node direct - inlocuieste functia buggy
node -e "
const fs = require('fs');
const file = process.argv[1];
let src = fs.readFileSync(file, 'utf8');
const OLD = 'function settingSecretKey() {\n  return Buffer.from(process.env.APP_KEY || \"infraflow-default-key-32chars!!\", \"utf8\").subarray(0, 32);\n}';
const NEW = 'function settingSecretKey() {\n  const raw = Buffer.from(process.env.APP_KEY || \"infraflow-default-key-32chars!!\", \"utf8\");\n  return Buffer.concat([raw, Buffer.alloc(32)]).subarray(0, 32);\n}';
if (src.includes(OLD)) {
  fs.writeFileSync(file, src.replace(OLD, NEW), 'utf8');
  console.log('PATCH APLICAT - settingSecretKey fixat la 32 bytes');
} else {
  console.log('Nu e nevoie de patch sau deja aplicat');
}
" "%TARGET%"

echo.
echo Reporneste InfraFlow pentru a aplica fix-ul!
pause

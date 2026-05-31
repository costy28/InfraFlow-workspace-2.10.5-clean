# Descarca NSSM pentru Windows Service
# Ruleaza din folderul proiectului

Write-Host "Descarc NSSM..." -ForegroundColor Yellow

$url = "https://nssm.cc/release/nssm-2.24.zip"
$zip = "installer\nssm-tmp.zip"
$tmp = "installer\nssm-tmp"

New-Item -ItemType Directory -Path "installer" -Force | Out-Null

Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $tmp -Force

# 64-bit
Copy-Item "$tmp\nssm-2.24\win64\nssm.exe" "installer\nssm.exe" -Force

Remove-Item $tmp -Recurse -Force
Remove-Item $zip -Force

Write-Host "NSSM descarat in installer\nssm.exe" -ForegroundColor Green

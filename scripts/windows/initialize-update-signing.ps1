#Requires -Version 5.1
param([string]$KeyDirectory = (Join-Path $HOME ".infraflow\updates"))

$ErrorActionPreference = "Stop"
$PrivateKey = Join-Path $KeyDirectory "catalog-ed25519-private.pem"
$PublicKey = Join-Path $KeyDirectory "catalog-ed25519-public.pem"

function Protect-PrivateKey([string]$Path) {
  & icacls.exe $Path /inheritance:r /grant:r "${env:USERNAME}:(R,W)" /remove:g "Users" "Authenticated Users" "Everyone" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Nu am putut restricționa accesul la cheia privată." }
}

if ((Test-Path $PublicKey) -and -not (Test-Path $PrivateKey)) {
  $firstLine = Get-Content -LiteralPath $PublicKey -TotalCount 1
  if ($firstLine -match 'BEGIN PRIVATE KEY') {
    Move-Item -LiteralPath $PublicKey -Destination $PrivateKey
    $deriveScript = @'
const crypto = require('crypto')
const fs = require('fs')
const [privatePath, publicPath] = process.argv.slice(1)
const privateKey = crypto.createPrivateKey(fs.readFileSync(privatePath, 'utf8'))
fs.writeFileSync(publicPath, crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }), { mode: 0o644 })
'@
    node -e $deriveScript $PrivateKey $PublicKey
    if ($LASTEXITCODE -ne 0) { throw "Nu am putut recupera cheia publică." }
    Protect-PrivateKey $PrivateKey
    $fingerprint = (Get-FileHash $PublicKey -Algorithm SHA256).Hash
    Write-Host "Cheia de semnare a fost recuperată local." -ForegroundColor Green
    Write-Host "Cheie publică: $PublicKey"
    Write-Host "Fingerprint SHA-256: $fingerprint"
    exit 0
  }
}

if ((Test-Path $PrivateKey) -or (Test-Path $PublicKey)) {
  throw "Există deja o cheie de catalog în $KeyDirectory. Nu a fost suprascrisă."
}

New-Item -ItemType Directory -Force -Path $KeyDirectory | Out-Null
$script = @'
const crypto = require('crypto')
const fs = require('fs')
const [privatePath, publicPath] = process.argv.slice(1)
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 })
'@
node -e $script $PrivateKey $PublicKey
if ($LASTEXITCODE -ne 0) { throw "Generarea cheii Ed25519 a eșuat." }

# Pe Windows, cheia privată rămâne accesibilă numai utilizatorului curent.
Protect-PrivateKey $PrivateKey

$fingerprint = (Get-FileHash $PublicKey -Algorithm SHA256).Hash
Write-Host "Cheie de semnare creată local." -ForegroundColor Green
Write-Host "Cheie publică: $PublicKey"
Write-Host "Fingerprint SHA-256: $fingerprint"
Write-Host "Cheia privată nu se copiază pe VPS și nu se trimite clienților." -ForegroundColor Yellow

# InfraFlow — Ghid de instalare rapidă

## Cerințe
- Windows 10/11 sau Windows Server 2019+
- Node.js 20 LTS
- SQL Server Express 2019+
- 4GB RAM, 10GB spațiu disk

## Instalare
1. Descarcă InfraFlow-setup.zip.
2. Extrage în `C:\InfraFlow\`.
3. Rulează `scripts\windows\install.ps1` ca Administrator.
4. Deschide `http://localhost:4180`.

## Pornire manuală (development)
```powershell
cd InfraFlow-proiect
$env:PORT=4180 ; node server/app.js
cd client && npm run dev
```

Accesează `http://localhost:5175` dacă ai pornit clientul pe acel port.

## Suport
contact@infraflow.ro

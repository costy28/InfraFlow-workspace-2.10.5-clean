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

## Hosted Linux

Pentru pilotul hosted este disponibilă fundația de instalare pe Ubuntu 24.04 LTS:
[INSTALARE_SERVER_UBUNTU_24_04.md](INSTALARE_SERVER_UBUNTU_24_04.md).

Instalarea Windows rămâne fluxul stabil pentru serverele existente. Pentru Linux,
prima instalare a workerului se face o singură dată prin `install-service.sh`;
apoi administratorul poate încărca din Setări numai pachete
`InfraFlow-update-vX.Y.Z-linux.tar.gz`. Aplicarea rămâne o acțiune explicită,
cu backup și rollback automat prin systemd.

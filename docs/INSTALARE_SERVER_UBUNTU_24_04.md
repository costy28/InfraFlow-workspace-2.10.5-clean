# Instalare InfraFlow pe Ubuntu 24.04 LTS — fundație Hosted

> Acest document este pentru un VPS de test controlat. Nu muta datele unui
> client până când backupul și restaurarea nu au fost testate pe același model
> de server.

## Arhitectură

```text
Internet → Cloudflare Tunnel → InfraFlow (systemd, 127.0.0.1:4180)
                                  └→ SQL Server Express (127.0.0.1:1433)
```

Nu expune porturile 4180 sau 1433 pe internet. Administratorii intră prin SSH
cu cheie; RDP nu există pe serverul Linux.

## Componente necesare

- Ubuntu 24.04 LTS actualizat;
- Node.js 20.x în `/usr/local/bin` (runtime-ul compatibil cu aplicația);
- SQL Server 2025 Express pe Linux și `mssql-tools18` (`sqlcmd`);
- `cloudflared` instalat ca serviciu;
- `rsync` instalat (`sudo apt-get install -y rsync`), folosit pentru update-uri controlate;
- pachetul InfraFlow extras în `/opt/infraflow/app`;
- domeniu/subdomeniu administrat în Cloudflare;
- spațiu extern pentru backup criptat.

Instalarea SQL Server Express urmează documentația Microsoft pentru Ubuntu.
La configurare selectați ediția `Express`, nu `Developer` sau `Evaluation`.

## Configurare aplicație

1. Extrage pachetul aplicației în `/opt/infraflow/app`.
2. Instalează dependențele de producție din acel director:

```bash
cd /opt/infraflow/app/server
npm ci --omit=dev
```

Serviciul systemd folosește explicit `/usr/local/bin/node`; păstrează această
cale când instalezi runtime-ul Node din arhiva oficială. Node.js 20 este
cerința curentă de compatibilitate a aplicației, chiar dacă seria a ajuns la
sfârșitul mentenanței upstream; actualizarea la o serie Node suportată se face
separat, după validare completă a aplicației.

3. Rulează o dată `scripts/linux/install-service.sh` ca root. Scriptul creează
   utilizatorul tehnic `infraflow` și fișierul `/etc/infraflow/infraflow.env`.
4. Editează acel fișier, pune o parolă SQL unică și o valoare `APP_KEY` aleatoare
   lungă, apoi rulează din nou scriptul.
5. Verifică local:

```bash
systemctl status infraflow
curl --fail http://127.0.0.1:4180/api/health
```

## Backup

Activează timerul numai după ce `backup-mssql.sh` a rulat cu succes manual:

```bash
systemctl enable --now infraflow-backup.timer
systemctl list-timers infraflow-backup.timer
```

Fișierul `.bak` local este doar prima copie. Trimite-l criptat într-un storage
extern și testează restaurarea înainte de lansare.

## Update din Setări (după bootstrap)

După ce `install-service.sh` a fost rulat cu succes, acesta pornește și
`infraflow-update.path`. Pentru următoarele versiuni nu mai este necesar SSH:

1. generează pachetul cu `scripts/windows/build-linux-update-archive.ps1`;
2. în aplicație, deschide **Setări → Actualizare manuală** și încarcă
   `InfraFlow-update-vX.Y.Z-linux.tar.gz`;
3. verifică versiunea și apasă explicit **Aplică update-ul**;
4. workerul systemd creează backup în `/var/backups/infraflow`, oprește serviciul,
   aplică pachetul și execută `npm ci --omit=dev`;
5. dacă orice pas eșuează, acesta restaurează automat backupul și pornește din nou
   versiunea anterioară.

La primul bootstrap al acestei funcții, administratorul rulează o singură dată
`sudo bash /opt/infraflow/app/scripts/linux/install-service.sh`. Nu încărca
arhive primite din surse necunoscute și nu întrerupe serverul cât timp statusul
update-ului este în curs.

## Ce nu rulează pe serverul Linux

- importul direct PIUSI prin MDB/ADODB/COM;
- conectori care citesc fișiere sau baze locale de pe PC-ul clientului;
- validatoare care depind de executabile Windows locale.

Acestea vor deveni conectori opționali cu agent local Windows. Ele nu blochează
CRM, documentele, emailul, stocurile, achizițiile sau contabilitatea de bază.

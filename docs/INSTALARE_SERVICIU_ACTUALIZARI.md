# Instalare serviciu central de actualizări

Acest serviciu este separat de orice instanță ERP client. El publică numai catalogul semnat și arhivele de update. Nu conține baze de date ale clienților, sesiuni sau chei private de semnare.

## Topologie inițială

`updates.infraflow.ro → Cloudflare Tunnel → http://127.0.0.1:4182 → infraflow-updates.service`

Serviciul ascultă exclusiv local. Cloudflare Tunnel publică hostname-ul; nu se deschide port în firewall. Cloudflare documentează publicarea ca mapare între hostname și serviciul local, inclusiv pentru mai multe aplicații pe același Tunnel. [Cloudflare Tunnel routing](https://developers.cloudflare.com/tunnel/concepts/routing/)

## 1. Construiește pachetul serviciului

Din workspace-ul InfraFlow, pe calculatorul de dezvoltare:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/build-updates-service-archive.ps1
```

Rezultatul este `installer/output/InfraFlow-updates-service-vX.Y.Z.tar.gz`.

## 2. Instalează pe VPS

Se copiază arhiva în `/tmp`, apoi pe VPS se rulează:

```bash
mkdir -p /tmp/infraflow-updates-install
tar -xzf /tmp/InfraFlow-updates-service-vX.Y.Z.tar.gz -C /tmp/infraflow-updates-install
sudo bash /tmp/infraflow-updates-install/scripts/linux/install-updates-service.sh /tmp/infraflow-updates-install/app
curl --fail http://127.0.0.1:4182/health
```

Scriptul creează utilizatorul de sistem fără login `infraflow-updates`, instalează unitatea systemd și directoarele de distribuție:

```text
/var/lib/infraflow-updates/catalog/stable.json
/var/lib/infraflow-updates/packages/<versiune>/...
```

## 3. Configurează Tunnel-ul existent

În Cloudflare Dashboard → Networking → Tunnels → tunnel-ul VPS-ului → Routes, adaugă Published application:

| Câmp | Valoare |
| --- | --- |
| Hostname | `updates.infraflow.ro` |
| Service URL | `http://127.0.0.1:4182` |

Nu folosi `updates.infraflow.ro` ca Service URL local. Cloudflare recomandă explicit ca serviciul origin să fie adresa locală, nu hostname-ul public care indică tot către Tunnel. [Ghid Cloudflare pentru origin HTTPS](https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/)

Verificări:

```bash
sudo systemctl is-active infraflow-updates
curl --fail http://127.0.0.1:4182/health
```

Din browser: `https://updates.infraflow.ro/health` trebuie să răspundă JSON.

## 4. Protejează pachetele înainte de prima publicare

Catalogul poate fi citit public și este semnat. Pachetele nu trebuie publicate fără protecție.

Începând cu v2.12.616, pachetele se descarcă numai cu un ticket temporar emis pentru o instalație licențiată. Nu configura un token global partajat.

Registrul este separat de catalog și păstrează numai hash-uri de credențiale:

```text
/etc/infraflow-updates/licenses.json
```

Secretul HMAC al ticket-urilor se adaugă o singură dată, numai pe VPS, în `/etc/infraflow-updates/infraflow-updates.env`:

```bash
sudo sh -c 'umask 077; printf "INFRAFLOW_UPDATES_TICKET_SECRET=%s\n" "$(openssl rand -hex 32)" >> /etc/infraflow-updates/infraflow-updates.env'
sudo systemctl restart infraflow-updates
```

Pentru un client nou, registry-ul se creează local cu `scripts/create-update-license.js`; tokenul creat se transmite o singură dată clientului prin canal sigur. Nu îl trimite în URL, catalog, email obișnuit sau jurnal.

## 5. Cheia de semnare

Cheia privată Ed25519 se păstrează în afara VPS-ului și a arhivelor client. Doar cheia publică ajunge în configurația instanțelor InfraFlow. Creează o singură dată cheia locală cu:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/initialize-update-signing.ps1
```

După ce pachetele Windows și Linux sunt generate, pregătește payload-ul catalogului și semnează-l local cu:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/prepare-update-catalog-release.ps1
node scripts/sign-release-catalog.js --input release-catalog/stable.payload.json --output stable.json --private-key-file "$HOME\.infraflow\updates\catalog-ed25519-private.pem"
```

Cheia publică va fi configurată ulterior pe fiecare instanță InfraFlow. Catalogul se semnează local cu:

```powershell
node scripts/sign-release-catalog.js --input release-catalog/stable.payload.json --output stable.json --private-key-file <cale-cheie-privată>
```

Urmează apoi publicarea controlată a `stable.json` și a arhivei verificată prin SHA-256.

## Stare în această versiune

- serviciul izolat, catalogul semnat și ticket-urile per licență sunt pregătite;
- catalogul semnat și filtrarea Core/module sunt pregătite în aplicația client;
- conectarea automată a instanței client la endpoint-ul de ticket nu este încă activată;
- update-ul manual actual rămâne metoda operațională până la testarea end-to-end.

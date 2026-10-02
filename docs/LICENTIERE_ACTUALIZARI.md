# Licențierea pachetelor InfraFlow

## Modelul inițial

Fiecare instalație client are un identificator stabil și o credențială unică. Serverul central păstrează doar hash-ul SHA-256 al acelei credențiale în registrul root-only `/etc/infraflow-updates/licenses.json`.

La solicitarea unei actualizări, instalația transmite credențiala numai în header-ul HTTPS `Authorization: Bearer ...`. Dacă licența este activă și include componenta cerută, endpoint-ul `POST /tickets` emite un ticket HMAC cu valabilitate scurtă. Arhiva se poate descărca numai prin header-ul `Authorization: UpdateTicket ...`.

Ticket-ul este legat de:

- clientul licențiat;
- versiunea și numele exact al arhivei;
- platforma serverului (Windows/Linux);
- componenta Core sau modul;
- expirare, implicit zece minute.

Catalogul rămâne public și semnat. El nu conține credențiale sau ticket-uri.

## Creează licența unui client

Pe stația de administrare, într-un director privat care nu este versionat în Git:

```powershell
node E:\CODEX 1\InfraFlow-workspace-2.10.5-clean\scripts\create-update-license.js `
  --registry E:\InfraFlow-Licente\licenses.json `
  --client-id exemplu-srl-prod `
  --token-file E:\InfraFlow-Licente\exemplu-srl-prod.token.txt `
  --modules crm,hr,inventory `
  --updates-until 2027-10-02
```

`--modules all` este permis pentru pachetele complete. Scriptul nu pune tokenul în `licenses.json`; creează separat un fișier local care trebuie transmis o singură dată printr-un canal sigur.

## Publică registrul pe server

Fișierul `licenses.json` se copiază pe VPS în `/tmp`, apoi:

```bash
sudo install -o root -g infraflow-updates -m 0640 /tmp/licenses.json /etc/infraflow-updates/licenses.json
sudo systemctl restart infraflow-updates
curl --fail http://127.0.0.1:4182/health
```

Nu se editează registrul direct în browser și nu se pune în `/var/lib/infraflow-updates`, unde sunt doar catalogul și arhivele.

## Stare de implementare

Distribuția cu ticket și descărcarea Core server-side sunt implementate. Pentru fiecare instanță se configurează în serviciul aplicației, nu în browser:

```text
INFRAFLOW_UPDATE_CATALOG_URL=https://updates.infraflow.ro/catalog/stable.json
INFRAFLOW_UPDATE_CATALOG_PUBLIC_KEY_FILE=/etc/infraflow/updates/catalog-ed25519-public.pem
INFRAFLOW_UPDATE_CLIENT_TOKEN_FILE=/etc/infraflow/updates/client-token
```

După configurare, administratorul poate porni update-ul central din aplicație. Actualizarea manuală rămâne disponibilă ca fallback controlat.

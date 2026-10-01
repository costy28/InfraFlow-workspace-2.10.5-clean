# UPDATE 624 — Actualizare Hosted Linux controlată

Versiune: `v2.12.604`  
Data: `2026-10-01`

## Scop

Actualizările instalării InfraFlow pe Ubuntu nu mai cer copiere și comenzi SSH
pentru fiecare versiune, după bootstrapul inițial al serviciilor systemd.

## Implementare

- Setări acceptă pachetul Linux cu numele strict
  `InfraFlow-update-vX.Y.Z-linux.tar.gz`; încărcarea nu aplică nimic.
- Doar apăsarea explicită **Aplică update-ul** mută pachetul în inbox-ul urmărit
  de `infraflow-update.path`.
- Workerul root-owned validează conținutul, creează backup, aplică pachetul,
  instalează dependențele de producție și repornește `infraflow.service`.
- Un eșec după oprirea serviciului restaurează backupul și pornește versiunea
  anterioară. Ultimul rezultat se scrie în `runtime/update-last.log`.
- `build-linux-update-archive.ps1` creează arhiva curată, fără fișiere demo,
  date locale sau dependențe instalate.

## Bootstrap o singură dată

După instalarea acestei versiuni pe server, rulează o singură dată:

```bash
sudo apt-get install -y rsync
sudo bash /opt/infraflow/app/scripts/linux/install-service.sh
```

Actualizările ulterioare se fac din **Setări → Actualizare manuală**.

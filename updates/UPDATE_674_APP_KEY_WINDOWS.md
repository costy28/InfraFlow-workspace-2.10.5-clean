# UPDATE 674 — APP_KEY locală Windows și migrare controlată (v2.12.654)

## Ce schimbă

- Criptarea pentru setări de sistem, AI, Oblio, SMTP/IMAP, GPS, WhatsApp, ANAF/SPV și 2FA folosește un singur helper compatibil.
- La pornire, aplicația poate citi `runtime/app.key`; cheia nu este inclusă în pachetele de update.
- Un instrument server-side recriptează explicit numai câmpurile secrete cunoscute. Nu tipărește valori secrete și nu modifică date operaționale.

## Aplicare pe o instalare Windows care a rulat fără APP_KEY

1. Aplică update-ul și așteaptă ca serviciul să revină online cu comportamentul anterior.
2. Deschide PowerShell ca Administrator și oprește complet task-ul `InfraFlow ERP`.
3. Din directorul instalării rulează o verificare fără modificări:

```powershell
node .\server\tools\rotate-app-key.js --old-default --create-key-file
```

4. Dacă rezultatul arată numai numărul de secrete pregătite, rulează aplicarea explicită:

```powershell
node .\server\tools\rotate-app-key.js --old-default --create-key-file --apply
```

5. Pornește din nou task-ul `InfraFlow ERP` și verifică `http://127.0.0.1:4180/api/health`.

## Limite intenționate

- Nu se generează și nu se activează nicio cheie fără `--apply`.
- Dacă `runtime/app.key` există deja, instrumentul se oprește fără a suprascrie cheia.
- Dacă un secret nu poate fi decriptat cu cheia veche implicită, întreaga migrare este anulată înainte de scriere.
- Pentru instalări care au avut deja o APP_KEY personalizată, nu se folosește acest instrument cu `--old-default`; se verifică separat cheia existentă.

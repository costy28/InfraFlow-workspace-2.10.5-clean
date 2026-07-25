# UPDATE 401 — Hotfix configurare SMTP

Versiune: `2.12.381`  
Data: `2026-07-25`

## Problemă

La testarea configurării SMTP, serverul putea răspunde cu eroarea tehnică `Invalid key length`.

Cauza era în modulul `server/modules/messaging/email.js`: acesta avea o funcție locală de decriptare care deriva cheia AES diferit față de helperul central folosit la salvarea setărilor.

## Implementat

- Modulul de email folosește acum `core/settings-crypto`.
- Parola SMTP este decriptată cu aceeași logică folosită la salvare.
- Dacă parola salvată nu poate fi citită, utilizatorul primește mesaj clar să reintroducă parola SMTP în setări.

## Fișiere modificate

- `server/modules/messaging/email.js`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

## Pașii recomandați după update

1. Intră în `Setări → Integrări → Email notificări`.
2. Completează/reintrodu parola SMTP.
3. Salvează setările.
4. Apasă `Testează configurarea`.

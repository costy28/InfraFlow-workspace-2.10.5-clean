# UPDATE 398 — CC/BCC și atașamente la email

Versiune: `2.12.378`  
Data: `2026-07-24`

## Scop

Extinde compunerea emailurilor din `Mesaje → Inbox ERP` cu câmpuri uzuale de email și atașamente mici trimise prin SMTP.

## Implementat

- Modalul `Email nou` permite completarea câmpurilor `CC` și `BCC`.
- Atașamentele selectate în browser sunt transmise către server în format Base64 și apoi trimise prin SMTP.
- UI-ul limitează atașamentele la 5 fișiere, 2 MB/fișier și 5 MB total/email, ca să rămână sub limita JSON existentă a serverului.
- Copia emailului trimis se salvează în registrul ERP cu metadatele atașamentelor, fără conținutul fișierelor.
- `BCC` este mascat în răspunsurile publice ale API-ului.
- Căutarea din Inbox ERP include și câmpul `CC`.

## Fișiere modificate

- `server/modules/messaging/email.js`
- `server/modules/messaging/routes.js`
- `client/src/pages/modules/MessagingPage.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

## Note

Pentru atașamente mari, direcția corectă rămâne un endpoint multipart dedicat, cu stocare controlată în `storage/`, antivirus/politici tenant și link intern către email. Acest update acoperă trimiterea rapidă de documente mici fără să schimbe schema DB.

# UPDATE 405 — Primire email prin IMAP

Versiune: `2.12.385`  
Data: `2026-07-26`

## Context

Inbox ERP afișa emailuri înregistrate intern, trimise sau drafturi, dar nu prelua încă emailuri reale din căsuța poștală. SMTP este doar pentru trimitere; pentru primire este necesar IMAP/OAuth/webhook.

## Implementat

- `server/modules/messaging/imap.js`
  - client IMAP minimal fără dependențe noi, bazat pe `tls`/`net`;
  - derivare host IMAP din configurarea SMTP:
    - Gmail → `imap.gmail.com:993`;
    - Microsoft 365/Outlook → `outlook.office365.com:993`;
    - Yahoo → `imap.mail.yahoo.com:993`;
    - fallback `smtp.*` → `imap.*`;
  - autentificare cu utilizatorul și parola salvată pentru email;
  - citire ultimele mesaje din `INBOX`;
  - parsare minimală header/body, MIME words, quoted-printable/base64 și HTML → text;
  - diagnostic prietenos pentru IMAP.
- `server/modules/messaging/routes.js`
  - endpoint nou `POST /messaging/email/sync`;
  - deduplicare după `Message-ID`/UID IMAP;
  - import emailuri ca `direction=inbound`, `status=unread`;
  - clasificare minimală pe categorii ERP;
  - audit `messaging_email_imap_sync`.
- `client/src/pages/modules/MessagingPage.jsx`
  - buton `Sincronizează inbox`;
  - mesaj de rezultat: emailuri scanate/importate;
  - afișare multiline pentru pașii recomandați la erori IMAP.

## Note de utilizare

- Gmail necesită IMAP activ în setările contului și App Password.
- Microsoft 365 poate bloca Basic Auth IMAP în unele tenanturi; pentru comercial va fi necesară integrare OAuth.
- SMTP2GO rămâne provider de trimitere, nu de primire.

## Verificare

- `node --check server/modules/messaging/imap.js`
- `node --check server/modules/messaging/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`

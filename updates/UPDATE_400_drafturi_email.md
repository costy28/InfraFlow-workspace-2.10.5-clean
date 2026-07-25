# UPDATE 400 — Drafturi email în Inbox ERP

Versiune: `2.12.380`  
Data: `2026-07-25`

## Scop

Adaugă flux de lucru natural pentru emailurile începute și neterminate: utilizatorul poate salva un email ca draft, îl poate redeschide ulterior și îl poate trimite fără să reia complet compunerea.

## Implementat

- Endpoint nou `POST /api/messaging/email/drafts` pentru creare și actualizare draft.
- Drafturile folosesc structura existentă `messaging.emailMessages`, cu `direction=draft` și `status=draft`.
- Lista Inbox ERP acceptă filtrul `direction=draft`.
- Drafturile finalizate prin trimitere sunt marcate intern și nu mai apar în listă.
- Modalul `Email nou` are buton `Salvează draft`.
- Cutia `Drafturi` este disponibilă în filtrul `Cutie`.
- Un draft poate fi redeschis pentru editare și trimitere.
- Trimiterea unui draft creează copia normală în `Trimise` și ascunde draftul original.

## Fișiere modificate

- `server/modules/messaging/routes.js`
- `client/src/pages/modules/MessagingPage.jsx`
- `scripts/smoke-modules-readonly.js`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

## Note

Nu s-a introdus schemă DB nouă. Drafturile păstrează metadatele atașamentelor, dar fișierele trebuie reatașate la trimitere; pentru păstrarea conținutului atașamentelor în drafturi va fi necesar un flux multipart dedicat cu stocare controlată.
